import { useState } from 'react'
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
  const [view, setView] = useState<View>(isSignedIn() ? resolveSignedInView() : 'signin')
  const [config, setConfig] = useState<AppConfig | null>(loadConfig())
  const [sheetsStore, setSheetsStore] = useState<SheetsStore | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [activeBook, setActiveBook] = useState<DriveFile | null>(null)

  function resolveSignedInView(): View {
    return loadConfig() ? 'library' : 'setup'
  }

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

  if (view === 'library' && config) {
    return (
      <div className="library-screen">
        <div className="library-header">
          <h1>Library</h1>
          <button className="secondary" onClick={handleChangeLibrary}>
            Change library
          </button>
        </div>
        <FolderTree
          rootFolderId={config.rootFolderId}
          onOpenBook={(file) => {
            setActiveBook(file)
            setView('reading')
          }}
        />
      </div>
    )
  }

  return <SignInScreen onSignedIn={handleSignedIn} />
}
