import { useEffect, useState } from 'react'
import { getValidToken, isSignedIn, signInInteractive } from './auth/googleAuth'
import { clearConfig, loadConfig } from './localConfig'
import { SheetsStore } from './sheets/sheetsClient'
import { FirstRunSetup } from './settings/FirstRunSetup'
import { FolderTree } from './library/FolderTree'
import { EpubReader } from './reader/EpubReader'
import { DEFAULT_PREFERENCES } from './types'
import type { AppConfig, DriveFile, Preferences, View } from './types'

function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    signInInteractive()
      .then(onSignedIn)
      .catch((err) => setError(err instanceof Error ? err.message : 'Sign-in failed'))
  }

  return (
    <div className="centered-screen">
      <div className="card signin-card">
        <span className="app-logo">📚</span>
        <h1>Book Reader</h1>
        <p className="muted">Read your EPUBs straight from Google Drive.</p>
        <button className="primary" onClick={handleClick}>
          Sign in with Google
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>(isSignedIn() ? 'loading' : 'signin')
  const [config, setConfig] = useState<AppConfig | null>(loadConfig())
  const [sheetsStore, setSheetsStore] = useState<SheetsStore | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [activeBook, setActiveBook] = useState<DriveFile | null>(null)

  // Cold start with an already-valid token (e.g. reopening the tab): route
  // through the same enterLibrary() init as a fresh sign-in, so sheetsStore
  // actually gets constructed before the library view renders. Previously
  // this jumped straight to 'library' and only built sheetsStore from the
  // interactive sign-in/setup handlers — folder browsing worked anyway (it
  // doesn't need sheetsStore), but opening a book then failed its render
  // condition and fell through to the sign-in screen, which looked exactly
  // like being logged out even though the token was still valid.
  useEffect(() => {
    if (!isSignedIn()) return
    const cfg = loadConfig()
    if (cfg) enterLibrary(cfg)
    else setView('setup')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enterLibrary(cfg: AppConfig) {
    setConfig(cfg)
    const store = new SheetsStore(cfg.spreadsheetId, getValidToken)
    const prefs = await store.load()
    setSheetsStore(store)
    setPreferences(prefs)
    setView('library')
  }

  async function handleSignedIn() {
    const cfg = loadConfig()
    if (cfg) await enterLibrary(cfg)
    else setView('setup')
  }

  function handleChangeLibrary() {
    clearConfig()
    setConfig(null)
    setSheetsStore(null)
    setView('setup')
  }

  function handlePreferencesChange(prefs: Preferences) {
    setPreferences(prefs)
    sheetsStore?.savePreferences(prefs).catch(() => {})
  }

  if (view === 'signin') {
    return <SignInScreen onSignedIn={handleSignedIn} />
  }

  if (view === 'loading') {
    return (
      <div className="centered-screen">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (view === 'setup') {
    return <FirstRunSetup onComplete={enterLibrary} />
  }

  if (view === 'reading' && activeBook && sheetsStore) {
    return (
      <EpubReader
        file={activeBook}
        sheetsStore={sheetsStore}
        preferences={preferences}
        onChangePreferences={handlePreferencesChange}
        onClose={() => setView('library')}
      />
    )
  }

  if (view === 'library' && config && sheetsStore) {
    return (
      <div className="library-page">
        <div className="library-header">
          <h1>Library</h1>
          <button className="secondary" onClick={handleChangeLibrary}>
            Change library
          </button>
        </div>
        <div className="library-content">
          <FolderTree
            rootFolderId={config.rootFolderId}
            sheetsStore={sheetsStore}
            onOpenBook={(file) => {
              setActiveBook(file)
              setView('reading')
            }}
          />
        </div>
      </div>
    )
  }

  // Reachable only for a transient render where e.g. 'reading' is set but
  // activeBook/sheetsStore haven't landed yet — never means "logged out",
  // so show a neutral loading state rather than bouncing to sign-in.
  return (
    <div className="centered-screen">
      <p className="muted">Loading…</p>
    </div>
  )
}
