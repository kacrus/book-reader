import { DEFAULT_PREFERENCES } from '../types'
import type { FontFamily, Preferences, ProgressRow, ReadingLogEntry } from '../types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

const PROGRESS_HEADER = ['fileId', 'title', 'cfi', 'lastReadAt']
const PREFS_HEADER = ['key', 'value']
const READING_LOG_HEADER = ['fileId', 'date', 'seconds']

const FONT_FAMILIES: FontFamily[] = ['original', 'georgia', 'times', 'verdana', 'arial', 'monospace']

function isFontFamily(value: string | undefined): value is FontFamily {
  return !!value && (FONT_FAMILIES as string[]).includes(value)
}

export type SaveProgressResult = { status: 'saved' } | { status: 'conflict'; current: ProgressRow }

async function sheetsFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`Sheets request failed (${res.status}): ${await res.text()}`)
  }
  return res
}

export async function createSpreadsheet(token: string, title: string): Promise<string> {
  const res = await sheetsFetch('', token, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Progress' }, data: [{ rowData: [headerRow(PROGRESS_HEADER)] }] },
        { properties: { title: 'Preferences' }, data: [{ rowData: [headerRow(PREFS_HEADER)] }] },
        { properties: { title: 'ReadingLog' }, data: [{ rowData: [headerRow(READING_LOG_HEADER)] }] },
      ],
    }),
  })
  const data = (await res.json()) as { spreadsheetId: string }
  return data.spreadsheetId
}

function headerRow(values: string[]) {
  return { values: values.map((v) => ({ userEnteredValue: { stringValue: v } })) }
}

function parseRowNumber(updatedRange: string): number {
  // e.g. "Progress!A5:D5" -> 5
  const match = updatedRange.match(/![A-Z]+(\d+)/)
  if (!match) throw new Error(`Could not parse row number from range: ${updatedRange}`)
  return Number(match[1])
}

export class SheetsStore {
  private progressIndex = new Map<string, number>()
  private prefsIndex = new Map<string, number>()
  // Keyed by "fileId|date" (both the sheet row index and the cached value),
  // populated from load()'s batchGet and kept current as we write.
  private readingLogIndex = new Map<string, number>()
  private readingLogCache = new Map<string, number>()
  private cachedPrefs: Preferences = { ...DEFAULT_PREFERENCES }
  private spreadsheetId: string
  private getToken: () => Promise<string>

  constructor(spreadsheetId: string, getToken: () => Promise<string>) {
    this.spreadsheetId = spreadsheetId
    this.getToken = getToken
  }

  async load(): Promise<Preferences> {
    const token = await this.getToken()
    // Spreadsheets created before reading-time tracking existed won't have
    // this tab yet — batchGet below would fail outright referencing it.
    await this.ensureReadingLogSheet(token)

    const params = new URLSearchParams()
    params.append('ranges', 'Progress!A2:D')
    params.append('ranges', 'Preferences!A2:B')
    params.append('ranges', 'ReadingLog!A2:C')
    const res = await sheetsFetch(`/${this.spreadsheetId}/values:batchGet?${params}`, token)
    const data = (await res.json()) as {
      valueRanges: { values?: string[][] }[]
    }

    const progressValues = data.valueRanges[0]?.values ?? []
    progressValues.forEach((row, i) => {
      if (row[0]) this.progressIndex.set(row[0], i + 2)
    })

    const prefsValues = data.valueRanges[1]?.values ?? []
    const prefs: Record<string, string> = {}
    prefsValues.forEach((row, i) => {
      if (row[0]) {
        this.prefsIndex.set(row[0], i + 2)
        prefs[row[0]] = row[1]
      }
    })
    this.cachedPrefs = {
      theme: prefs.theme === 'dark' ? 'dark' : DEFAULT_PREFERENCES.theme,
      fontSize: prefs.fontSize ? Number(prefs.fontSize) : DEFAULT_PREFERENCES.fontSize,
      lineSpacing: prefs.lineSpacing ? Number(prefs.lineSpacing) : DEFAULT_PREFERENCES.lineSpacing,
      fontFamily: isFontFamily(prefs.fontFamily) ? prefs.fontFamily : DEFAULT_PREFERENCES.fontFamily,
    }

    const readingLogValues = data.valueRanges[2]?.values ?? []
    readingLogValues.forEach((row, i) => {
      if (row[0] && row[1]) {
        const key = `${row[0]}|${row[1]}`
        this.readingLogIndex.set(key, i + 2)
        this.readingLogCache.set(key, Number(row[2] ?? 0))
      }
    })

    return this.cachedPrefs
  }

  private async ensureReadingLogSheet(token: string): Promise<void> {
    const res = await sheetsFetch(`/${this.spreadsheetId}?fields=sheets.properties.title`, token)
    const data = (await res.json()) as { sheets: { properties: { title: string } }[] }
    if (data.sheets.some((s) => s.properties.title === 'ReadingLog')) return

    await sheetsFetch(`/${this.spreadsheetId}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'ReadingLog' } } }] }),
    })
    await sheetsFetch(`/${this.spreadsheetId}/values/ReadingLog!A1:C1?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ values: [READING_LOG_HEADER] }),
    })
  }

  /** Reading time logged for one book, one row per calendar day — from the
   * snapshot loaded at load() time plus anything written since. */
  getReadingLog(fileId: string): ReadingLogEntry[] {
    const entries: ReadingLogEntry[] = []
    this.readingLogCache.forEach((seconds, key) => {
      const [fid, date] = key.split('|')
      if (fid === fileId) entries.push({ date, seconds })
    })
    return entries.sort((a, b) => a.date.localeCompare(b.date))
  }

  getTotalReadingSeconds(fileId: string): number {
    return this.getReadingLog(fileId).reduce((sum, e) => sum + e.seconds, 0)
  }

  /** Adds deltaSeconds to today's (or any given date's) logged time for a
   * book. A plain increment rather than an absolute write, so two devices
   * logging time on the *same* day both still count — each does a small
   * read-modify-write of just that one day's cell, which is good enough for
   * a personal tool (not perfectly atomic, but nothing is lost on failure:
   * the caller re-queues the delta and retries on the next flush). */
  async addReadingTime(fileId: string, date: string, deltaSeconds: number): Promise<void> {
    const delta = Math.round(deltaSeconds)
    if (delta <= 0) return
    const token = await this.getToken()
    const key = `${fileId}|${date}`
    const rowNum = this.readingLogIndex.get(key)

    if (rowNum) {
      const res = await sheetsFetch(`/${this.spreadsheetId}/values/ReadingLog!C${rowNum}`, token)
      const data = (await res.json()) as { values?: string[][] }
      const current = Number(data.values?.[0]?.[0] ?? 0)
      const next = current + delta
      await sheetsFetch(`/${this.spreadsheetId}/values/ReadingLog!C${rowNum}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({ values: [[next]] }),
      })
      this.readingLogCache.set(key, next)
    } else {
      const values = [[fileId, date, delta]]
      const res = await sheetsFetch(
        `/${this.spreadsheetId}/values/ReadingLog!A:C:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        token,
        { method: 'POST', body: JSON.stringify({ values }) },
      )
      const data = (await res.json()) as { updates: { updatedRange: string } }
      this.readingLogIndex.set(key, parseRowNumber(data.updates.updatedRange))
      this.readingLogCache.set(key, delta)
    }
  }

  async getProgress(fileId: string): Promise<ProgressRow | null> {
    const token = await this.getToken()
    let rowNum = this.progressIndex.get(fileId)
    if (!rowNum) {
      // Not in our locally-cached index — could be a row another device
      // created after we last loaded. Fall back to a real lookup.
      const found = await this.findProgressRow(fileId, token)
      if (!found) return null
      rowNum = found
      this.progressIndex.set(fileId, rowNum)
    }
    const res = await sheetsFetch(`/${this.spreadsheetId}/values/Progress!A${rowNum}:D${rowNum}`, token)
    const data = (await res.json()) as { values?: string[][] }
    const row = data.values?.[0]
    if (!row) return null
    return { fileId: row[0], title: row[1], cfi: row[2], lastReadAt: row[3] }
  }

  private async findProgressRow(fileId: string, token: string): Promise<number | null> {
    const res = await sheetsFetch(`/${this.spreadsheetId}/values/Progress!A2:A`, token)
    const data = (await res.json()) as { values?: string[][] }
    const idx = (data.values ?? []).findIndex((r) => r[0] === fileId)
    return idx === -1 ? null : idx + 2
  }

  /**
   * Writes progress only if the sheet's current value still matches what the
   * caller last knew (baselineCfi) — otherwise another device/tab has since
   * saved a different position, and the caller should resolve that instead
   * of silently clobbering it.
   */
  async trySaveProgress(row: ProgressRow, baselineCfi: string | null): Promise<SaveProgressResult> {
    const current = await this.getProgress(row.fileId)
    if (!current || current.cfi === baselineCfi) {
      await this.saveProgress(row)
      return { status: 'saved' }
    }
    return { status: 'conflict', current }
  }

  async saveProgress(row: ProgressRow): Promise<void> {
    const token = await this.getToken()
    const values = [[row.fileId, row.title, row.cfi, row.lastReadAt]]
    const rowNum = this.progressIndex.get(row.fileId)

    if (rowNum) {
      await sheetsFetch(`/${this.spreadsheetId}/values/Progress!A${rowNum}:D${rowNum}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({ values }),
      })
    } else {
      const res = await sheetsFetch(
        `/${this.spreadsheetId}/values/Progress!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        token,
        { method: 'POST', body: JSON.stringify({ values }) },
      )
      const data = (await res.json()) as { updates: { updatedRange: string } }
      this.progressIndex.set(row.fileId, parseRowNumber(data.updates.updatedRange))
    }
  }

  async savePreferences(prefs: Preferences): Promise<void> {
    this.cachedPrefs = prefs
    await this.saveKeyValue('theme', prefs.theme)
    await this.saveKeyValue('fontSize', String(prefs.fontSize))
    await this.saveKeyValue('lineSpacing', String(prefs.lineSpacing))
    await this.saveKeyValue('fontFamily', prefs.fontFamily)
  }

  private async saveKeyValue(key: string, value: string): Promise<void> {
    const token = await this.getToken()
    const rowNum = this.prefsIndex.get(key)
    const values = [[key, value]]

    if (rowNum) {
      await sheetsFetch(`/${this.spreadsheetId}/values/Preferences!A${rowNum}:B${rowNum}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({ values }),
      })
    } else {
      const res = await sheetsFetch(
        `/${this.spreadsheetId}/values/Preferences!A:B:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        token,
        { method: 'POST', body: JSON.stringify({ values }) },
      )
      const data = (await res.json()) as { updates: { updatedRange: string } }
      this.prefsIndex.set(key, parseRowNumber(data.updates.updatedRange))
    }
  }
}
