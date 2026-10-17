import { useEffect, useRef, useState } from 'react'
import ePub, { Book, Rendition } from 'epubjs'
import type { Location } from 'epubjs'
import { getValidToken, NeedsInteractiveAuth } from '../auth/googleAuth'
import { ReconnectButton } from '../auth/ReconnectButton'
import { downloadFile } from '../drive/driveClient'
import type { SheetsStore } from '../sheets/sheetsClient'
import type { DriveFile, Preferences } from '../types'

const SAVE_DEBOUNCE_MS = 2500

export function EpubReader({
  file,
  sheetsStore,
  preferences,
  onChangePreferences,
  onClose,
}: {
  file: DriveFile
  sheetsStore: SheetsStore
  preferences: Preferences
  onChangePreferences: (p: Preferences) => void
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pendingCfiRef = useRef<string | null>(null)

  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterInfo, setChapterInfo] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    load()
    return () => {
      flushPendingSave()
      renditionRef.current?.destroy()
      bookRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  useEffect(() => {
    applyTheme(preferences)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.theme, preferences.fontSize])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyNav)
    return () => window.removeEventListener('keydown', handleKeyNav)
  }, [])

  function goPrev() {
    renditionRef.current?.prev()
  }

  function goNext() {
    renditionRef.current?.next()
  }

  // Also bound inside the book's iframe via rendition.on('keydown', ...) in
  // load() below — keydown events fired while focus is inside the iframe
  // don't bubble out to this window listener.
  function handleKeyNav(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') goPrev()
    if (e.key === 'ArrowRight') goNext()
  }

  function applyTheme(prefs: Preferences) {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.fontSize(`${prefs.fontSize}%`)
    rendition.themes.register('dark', {
      body: { background: '#1b1b1b', color: '#e6e6e6' },
    })
    rendition.themes.register('light', { body: {} })
    rendition.themes.select(prefs.theme)
  }

  async function load() {
    setError(null)
    setNeedsAuth(false)
    setLoading(true)
    try {
      const token = await getValidToken()
      const buffer = await downloadFile(file.id, token)

      const book = ePub(buffer)
      bookRef.current = book

      if (!containerRef.current) return
      const rendition = book.renderTo(containerRef.current, {
        width: '100%',
        height: '100%',
        flow: 'scrolled-doc',
      })
      renditionRef.current = rendition
      rendition.on('keydown', handleKeyNav)
      applyTheme(preferences)

      await book.ready
      const progress = await sheetsStore.getProgress(file.id)
      await rendition.display(progress?.cfi)

      const spineItems = await book.loaded.spine
      updateChapterInfo(rendition.location, spineItems.length)

      rendition.on('relocated', (location: Location) => {
        updateChapterInfo(location, spineItems.length)
        scheduleSave(location.start.cfi)
      })

      setLoading(false)
    } catch (err) {
      if (err instanceof NeedsInteractiveAuth) setNeedsAuth(true)
      else setError(err instanceof Error ? err.message : 'Failed to open book')
      setLoading(false)
    }
  }

  function updateChapterInfo(location: Location | undefined, total: number) {
    if (!location) return
    setChapterInfo({ current: location.start.index + 1, total })
  }

  function scheduleSave(cfi: string) {
    pendingCfiRef.current = cfi
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS)
  }

  function flushPendingSave() {
    const cfi = pendingCfiRef.current
    if (!cfi) return
    pendingCfiRef.current = null
    sheetsStore
      .saveProgress({ fileId: file.id, title: file.name, cfi, lastReadAt: new Date().toISOString() })
      .catch(() => {})
  }

  function toggleTheme() {
    onChangePreferences({ ...preferences, theme: preferences.theme === 'dark' ? 'light' : 'dark' })
  }

  function changeFontSize(delta: number) {
    onChangePreferences({ ...preferences, fontSize: Math.max(60, Math.min(220, preferences.fontSize + delta)) })
  }

  return (
    <div className="reader-screen">
      <div className="reader-toolbar">
        <button onClick={onClose}>← Library</button>
        <span className="book-title">{file.name}</span>
        <div className="reader-controls">
          <button onClick={() => changeFontSize(-10)}>A-</button>
          <button onClick={() => changeFontSize(10)}>A+</button>
          <button onClick={toggleTheme}>{preferences.theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>

      {needsAuth && <ReconnectButton onReconnected={load} />}
      {error && <p className="error">{error}</p>}
      {loading && !error && !needsAuth && <p className="muted">Opening book…</p>}

      <div className="reader-body">
        <button className="page-nav" onClick={goPrev} aria-label="Previous chapter">
          ‹
        </button>
        <div
          className="reader-viewport"
          ref={containerRef}
          style={{ background: preferences.theme === 'dark' ? '#1b1b1b' : '#fff' }}
        />
        <button className="page-nav" onClick={goNext} aria-label="Next chapter">
          ›
        </button>
      </div>

      {chapterInfo && (
        <div className="reader-status">
          Chapter {chapterInfo.current} of {chapterInfo.total}
        </div>
      )}
    </div>
  )
}
