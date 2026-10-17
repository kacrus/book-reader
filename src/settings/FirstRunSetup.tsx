import { useState } from 'react'
import { NeedsInteractiveAuth, getValidToken } from '../auth/googleAuth'
import { ReconnectButton } from '../auth/ReconnectButton'
import { createSpreadsheet } from '../sheets/sheetsClient'
import { moveFileToFolder } from '../drive/driveClient'
import { pickFolder, pickSpreadsheet } from '../picker/googlePicker'
import { saveConfig } from '../localConfig'
import type { PickerDocument } from '../google-identity'
import type { AppConfig } from '../types'

export function FirstRunSetup({ onComplete }: { onComplete: (config: AppConfig) => void }) {
  const [folder, setFolder] = useState<PickerDocument | null>(null)
  const [spreadsheetMode, setSpreadsheetMode] = useState<'create' | 'existing'>('create')
  const [spreadsheet, setSpreadsheet] = useState<PickerDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function runGuarded(task: () => Promise<void>) {
    setError(null)
    setNeedsAuth(false)
    setBusy(true)
    task()
      .catch((err) => {
        if (err instanceof NeedsInteractiveAuth) setNeedsAuth(true)
        else setError(err instanceof Error ? err.message : 'Something went wrong.')
      })
      .finally(() => setBusy(false))
  }

  function handleChooseFolder() {
    runGuarded(async () => {
      const doc = await pickFolder()
      if (doc) setFolder(doc)
    })
  }

  function handleChooseSpreadsheet() {
    runGuarded(async () => {
      const doc = await pickSpreadsheet()
      if (doc) setSpreadsheet(doc)
    })
  }

  function handleContinue() {
    if (!folder) return
    runGuarded(async () => {
      let spreadsheetId: string
      if (spreadsheetMode === 'create') {
        const token = await getValidToken()
        spreadsheetId = await createSpreadsheet(token, 'Book Reader Data')
        await moveFileToFolder(spreadsheetId, folder.id, token)
      } else {
        if (!spreadsheet) return
        spreadsheetId = spreadsheet.id
      }
      const config: AppConfig = { rootFolderId: folder.id, spreadsheetId }
      saveConfig(config)
      onComplete(config)
    })
  }

  const canContinue = Boolean(folder) && (spreadsheetMode === 'create' || Boolean(spreadsheet))

  return (
    <div className="centered-screen">
      <div className="card setup-card">
        <h1>Set up your library</h1>
        <p className="muted">Pick a Drive folder with your books, and where progress gets saved.</p>

        <section className="setup-section">
          <span className="setup-label">Books folder</span>
          <div className="picker-row">
            <button className="secondary" onClick={handleChooseFolder} disabled={busy}>
              {folder ? 'Change folder' : 'Choose folder'}
            </button>
            {folder && <span className="picked-name">📁 {folder.name}</span>}
          </div>
        </section>

        <section className="setup-section">
          <span className="setup-label">Progress &amp; preferences</span>
          <label className="radio-row">
            <input
              type="radio"
              checked={spreadsheetMode === 'create'}
              onChange={() => setSpreadsheetMode('create')}
            />
            Create a new spreadsheet for me
          </label>
          <label className="radio-row">
            <input
              type="radio"
              checked={spreadsheetMode === 'existing'}
              onChange={() => setSpreadsheetMode('existing')}
            />
            Use an existing spreadsheet
          </label>
          {spreadsheetMode === 'existing' && (
            <div className="picker-row">
              <button className="secondary" onClick={handleChooseSpreadsheet} disabled={busy}>
                {spreadsheet ? 'Change spreadsheet' : 'Choose spreadsheet'}
              </button>
              {spreadsheet && <span className="picked-name">📊 {spreadsheet.name}</span>}
            </div>
          )}
        </section>

        {needsAuth && <ReconnectButton onReconnected={handleContinue} />}
        {error && <p className="error">{error}</p>}

        <button className="primary" onClick={handleContinue} disabled={!canContinue || busy}>
          {busy ? 'Setting up…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
