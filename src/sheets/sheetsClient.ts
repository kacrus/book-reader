import { DEFAULT_PREFERENCES } from '../types'
import type { Preferences, ProgressRow } from '../types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

const PROGRESS_HEADER = ['fileId', 'title', 'cfi', 'lastReadAt']
const PREFS_HEADER = ['key', 'value']

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
  private cachedPrefs: Preferences = { ...DEFAULT_PREFERENCES }
  private spreadsheetId: string
  private getToken: () => Promise<string>

  constructor(spreadsheetId: string, getToken: () => Promise<string>) {
    this.spreadsheetId = spreadsheetId
    this.getToken = getToken
  }

  async load(): Promise<Preferences> {
    const token = await this.getToken()
    const params = new URLSearchParams()
    params.append('ranges', 'Progress!A2:D')
    params.append('ranges', 'Preferences!A2:B')
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
    }
    return this.cachedPrefs
  }

  async getProgress(fileId: string): Promise<ProgressRow | null> {
    const rowNum = this.progressIndex.get(fileId)
    if (!rowNum) return null
    const token = await this.getToken()
    const res = await sheetsFetch(`/${this.spreadsheetId}/values/Progress!A${rowNum}:D${rowNum}`, token)
    const data = (await res.json()) as { values?: string[][] }
    const row = data.values?.[0]
    if (!row) return null
    return { fileId: row[0], title: row[1], cfi: row[2], lastReadAt: row[3] }
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
