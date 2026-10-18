import { useState } from 'react'
import { FONT_OPTIONS, formatDuration, formatLogDate } from '../types'
import type { Preferences, ReadingLogEntry } from '../types'

const FONT_SIZE_MIN = 60
const FONT_SIZE_MAX = 220
const FONT_SIZE_STEP = 10

const LINE_SPACING_MIN = 1.0
const LINE_SPACING_MAX = 2.4
const LINE_SPACING_STEP = 0.2

export function ReaderSettings({
  preferences,
  onChange,
  onClose,
  readingLog,
}: {
  preferences: Preferences
  onChange: (p: Preferences) => void
  onClose: () => void
  readingLog: ReadingLogEntry[]
}) {
  const [showHistory, setShowHistory] = useState(false)
  const totalSeconds = readingLog.reduce((sum, e) => sum + e.seconds, 0)

  function setTheme(theme: Preferences['theme']) {
    onChange({ ...preferences, theme })
  }

  function setFontSize(delta: number) {
    onChange({
      ...preferences,
      fontSize: Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, preferences.fontSize + delta)),
    })
  }

  function setLineSpacing(delta: number) {
    const next = Math.round((preferences.lineSpacing + delta) * 10) / 10
    onChange({
      ...preferences,
      lineSpacing: Math.max(LINE_SPACING_MIN, Math.min(LINE_SPACING_MAX, next)),
    })
  }

  function setFontFamily(fontFamily: Preferences['fontFamily']) {
    onChange({ ...preferences, fontFamily })
  }

  return (
    <>
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-panel">
        <div className="settings-row">
          <span>Theme</span>
          <div className="settings-control">
            <button
              className={preferences.theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
            >
              ☀️ Light
            </button>
            <button
              className={preferences.theme === 'dark' ? 'active' : ''}
              onClick={() => setTheme('dark')}
            >
              🌙 Dark
            </button>
          </div>
        </div>

        <div className="settings-row settings-row-stack">
          <span>Font</span>
          <div className="settings-control settings-control-wrap">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.value}
                className={preferences.fontFamily === font.value ? 'active' : ''}
                style={font.cssStack ? { fontFamily: font.cssStack } : undefined}
                onClick={() => setFontFamily(font.value)}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span>Font size</span>
          <div className="settings-control">
            <button onClick={() => setFontSize(-FONT_SIZE_STEP)} disabled={preferences.fontSize <= FONT_SIZE_MIN}>
              A−
            </button>
            <span className="settings-value">{preferences.fontSize}%</span>
            <button onClick={() => setFontSize(FONT_SIZE_STEP)} disabled={preferences.fontSize >= FONT_SIZE_MAX}>
              A+
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span>Line spacing</span>
          <div className="settings-control">
            <button
              onClick={() => setLineSpacing(-LINE_SPACING_STEP)}
              disabled={preferences.lineSpacing <= LINE_SPACING_MIN}
            >
              −
            </button>
            <span className="settings-value">{preferences.lineSpacing.toFixed(1)}</span>
            <button
              onClick={() => setLineSpacing(LINE_SPACING_STEP)}
              disabled={preferences.lineSpacing >= LINE_SPACING_MAX}
            >
              +
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        <button className="settings-history-toggle" onClick={() => setShowHistory((v) => !v)}>
          <span>
            {showHistory ? '▾' : '▸'} Reading history
          </span>
          {totalSeconds > 0 && <span className="settings-value">{formatDuration(totalSeconds)}</span>}
        </button>

        {showHistory && (
          <div className="settings-history-list">
            {readingLog.length === 0 ? (
              <p className="muted settings-history-empty">No reading time logged yet.</p>
            ) : (
              [...readingLog]
                .reverse()
                .map((entry) => (
                  <div key={entry.date} className="settings-history-row">
                    <span>{formatLogDate(entry.date)}</span>
                    <span>{formatDuration(entry.seconds)}</span>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </>
  )
}
