import { useEffect, useRef, useState } from 'react'
import ePub, { Book, Rendition } from 'epubjs'
import type { Contents, Location } from 'epubjs'
import type Navigation from 'epubjs/types/navigation'
import { getValidToken, NeedsInteractiveAuth } from '../auth/googleAuth'
import { ReconnectButton } from '../auth/ReconnectButton'
import { downloadFile } from '../drive/driveClient'
import { ReaderSettings } from './ReaderSettings'
import { ConflictDialog } from './ConflictDialog'
import type { SheetsStore } from '../sheets/sheetsClient'
import { FONT_OPTIONS, formatBookTitle, localDateString } from '../types'
import type { DriveFile, Preferences, ProgressRow } from '../types'

const READING_TIME_FLUSH_MS = 60_000

const SAVE_DEBOUNCE_MS = 2500

// line-height and font-family are inherited: a !important rule on <body>
// only affects elements that have no rule of their own, which doesn't help
// when the book's CSS sets them directly on <p>/<div>/etc. Target the same
// elements explicitly, via a stylesheet we fully replace on each change
// (addStylesheetCss) rather than epub.js's own override()/font() helpers,
// which only touch <body> and accumulate rather than replace.
const TYPOGRAPHY_SELECTOR = 'body, p, div, li, span, blockquote, h1, h2, h3, h4, h5, h6, td'
const TYPOGRAPHY_STYLE_KEY = 'book-reader-typography'

export const DARK_BG = '#1b1b1b'
export const DARK_TEXT = '#e6e6e6'
export const LIGHT_BG = '#ffffff'
export const LIGHT_TEXT = '#111111'

function buildTypographyCss(prefs: Preferences): string {
  let css = `${TYPOGRAPHY_SELECTOR} { line-height: ${prefs.lineSpacing} !important; }`
  const cssStack = FONT_OPTIONS.find((f) => f.value === prefs.fontFamily)?.cssStack
  if (cssStack) {
    css += `\n${TYPOGRAPHY_SELECTOR} { font-family: ${cssStack} !important; }`
  }
  // Theme colors go through this same mechanism rather than epub.js's own
  // themes.register()/select(): that system never clears a previously
  // selected theme's injected <style> tag, so a later theme with an empty
  // rule object (our old 'light' override) doesn't actually override the
  // previous (dark) background/color — they just both stay injected and
  // whichever one sets a given property keeps winning.
  const [bg, text] = prefs.theme === 'dark' ? [DARK_BG, DARK_TEXT] : [LIGHT_BG, LIGHT_TEXT]
  css += `\nbody { background: ${bg} !important; }`
  css += `\n${TYPOGRAPHY_SELECTOR} { color: ${text} !important; }`
  return css
}

function applyTypography(contents: Contents, prefs: Preferences) {
  contents.addStylesheetCss(buildTypographyCss(prefs), TYPOGRAPHY_STYLE_KEY)
}

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
  const baselineCfiRef = useRef<string | null>(null)
  const conflictPendingRef = useRef(false)
  const preferencesRef = useRef(preferences)
  const navigationRef = useRef<Navigation | null>(null)
  // Active-reading-time tracking: activeSinceRef is the timestamp the tab
  // last became visible (null while hidden/backgrounded), and
  // sessionUnflushedMsRef accumulates completed active stretches not yet
  // written to the sheet.
  const activeSinceRef = useRef<number | null>(null)
  const sessionUnflushedMsRef = useRef(0)

  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterTitle, setChapterTitle] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [conflict, setConflict] = useState<{ local: string; remote: ProgressRow } | null>(null)
  // Only the setter is used — bumping it forces a re-render so the reading
  // log (read fresh from sheetsStore on each render, not memoized) reflects
  // a just-completed flush.
  const [, setLogVersion] = useState(0)

  useEffect(() => {
    load()
    activeSinceRef.current = document.visibilityState === 'visible' ? Date.now() : null
    sessionUnflushedMsRef.current = 0
    return () => {
      flushPendingSave()
      flushReadingTime()
      renditionRef.current?.destroy()
      bookRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushActiveStretchToBuffer()
      } else {
        activeSinceRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      flushReadingTime()
    }, READING_TIME_FLUSH_MS)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  useEffect(() => {
    applyTheme(preferences)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.theme, preferences.fontSize, preferences.lineSpacing, preferences.fontFamily])

  function applyTheme(prefs: Preferences) {
    const rendition = renditionRef.current
    if (!rendition) return
    preferencesRef.current = prefs

    // Changing font size/spacing/family reflows the content, so the same
    // scroll pixel offset no longer points at the same text. Capture the
    // actual reading position first and re-anchor to it after reflowing.
    const anchorCfi = rendition.location?.start?.cfi

    rendition.themes.fontSize(`${prefs.fontSize}%`)
    // Reapply to whatever's already rendered — the hook registered in load()
    // only fires for content rendered after this point (e.g. later chapters).
    const contents = rendition.getContents() as unknown as Contents[]
    contents.forEach((c) => applyTypography(c, prefs))

    if (anchorCfi) {
      rendition.display(anchorCfi)
    }
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
      rendition.hooks.content.register((contents: Contents) => {
        applyTypography(contents, preferencesRef.current)
      })
      applyTheme(preferences)

      navigationRef.current = await book.loaded.navigation

      await book.ready
      const progress = await sheetsStore.getProgress(file.id)
      baselineCfiRef.current = progress?.cfi ?? null
      await rendition.display(progress?.cfi)
      updateChapterTitle(rendition.location)

      rendition.on('relocated', (location: Location) => {
        updateChapterTitle(location)
        scheduleSave(location.start.cfi)
      })

      setLoading(false)
    } catch (err) {
      if (err instanceof NeedsInteractiveAuth) setNeedsAuth(true)
      else setError(err instanceof Error ? err.message : 'Failed to open book')
      setLoading(false)
    }
  }

  function updateChapterTitle(location: Location | undefined) {
    if (!location) return
    const navItem = navigationRef.current?.get(location.start.href)
    setChapterTitle(navItem?.label?.trim() || null)
  }

  function scheduleSave(cfi: string) {
    pendingCfiRef.current = cfi
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      flushPendingSave()
      flushReadingTime()
    }, SAVE_DEBOUNCE_MS)
  }

  function flushActiveStretchToBuffer() {
    if (activeSinceRef.current !== null) {
      sessionUnflushedMsRef.current += Date.now() - activeSinceRef.current
      activeSinceRef.current = null
    }
  }

  async function flushReadingTime() {
    flushActiveStretchToBuffer()
    if (document.visibilityState === 'visible') activeSinceRef.current = Date.now()

    const ms = sessionUnflushedMsRef.current
    if (ms < 1000) return
    sessionUnflushedMsRef.current = 0
    try {
      await sheetsStore.addReadingTime(file.id, localDateString(), ms / 1000)
      setLogVersion((v) => v + 1)
    } catch {
      sessionUnflushedMsRef.current += ms // best-effort — retry on the next flush
    }
  }

  async function flushPendingSave() {
    const cfi = pendingCfiRef.current
    if (!cfi || conflictPendingRef.current) return
    pendingCfiRef.current = null
    const row: ProgressRow = { fileId: file.id, title: file.name, cfi, lastReadAt: new Date().toISOString() }
    try {
      const result = await sheetsStore.trySaveProgress(row, baselineCfiRef.current)
      if (result.status === 'saved') {
        baselineCfiRef.current = cfi
      } else {
        conflictPendingRef.current = true
        setConflict({ local: cfi, remote: result.current })
      }
    } catch {
      // best-effort — a transient network error just means this save is lost
    }
  }

  function resolveConflictKeepMine() {
    if (!conflict) return
    const { local } = conflict
    conflictPendingRef.current = false
    setConflict(null)
    sheetsStore
      .saveProgress({ fileId: file.id, title: file.name, cfi: local, lastReadAt: new Date().toISOString() })
      .then(() => {
        baselineCfiRef.current = local
      })
      .catch(() => {})
  }

  function resolveConflictUseTheirs() {
    if (!conflict) return
    const { remote } = conflict
    conflictPendingRef.current = false
    pendingCfiRef.current = null
    baselineCfiRef.current = remote.cfi
    setConflict(null)
    renditionRef.current?.display(remote.cfi)
  }

  function toggleSettings() {
    const opening = !showSettings
    setShowSettings(opening)
    if (opening) flushReadingTime() // so the reading-history list shown is current
  }

  return (
    <div className="reader-screen">
      <div className="reader-toolbar">
        <button onClick={onClose}>← Library</button>
        <div className="toolbar-title">
          <span className="book-title">{formatBookTitle(file.name)}</span>
          {chapterTitle && <span className="chapter-title">{chapterTitle}</span>}
        </div>
        <div className="reader-controls">
          <button onClick={toggleSettings} aria-label="Reader settings">
            ⚙️
          </button>
          {showSettings && (
            <ReaderSettings
              preferences={preferences}
              onChange={onChangePreferences}
              onClose={() => setShowSettings(false)}
              readingLog={sheetsStore.getReadingLog(file.id)}
            />
          )}
        </div>
      </div>

      {needsAuth && <ReconnectButton onReconnected={load} />}
      {error && <p className="error">{error}</p>}
      {loading && !error && !needsAuth && <p className="muted">Opening book…</p>}

      <div
        className="reader-viewport"
        ref={containerRef}
        style={{ background: preferences.theme === 'dark' ? DARK_BG : LIGHT_BG }}
      />

      {conflict && (
        <ConflictDialog
          remote={conflict.remote}
          onKeepMine={resolveConflictKeepMine}
          onUseTheirs={resolveConflictUseTheirs}
        />
      )}
    </div>
  )
}
