export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
}

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

export const isFolder = (f: DriveFile) => f.mimeType === DRIVE_FOLDER_MIME

export const isEpub = (f: DriveFile) =>
  !isFolder(f) && f.name.toLowerCase().endsWith('.epub')

/** Drive filenames are often "My_Book_Title.epub" — strip the extension and
 * underscores so the library and reader show something readable. */
export const formatBookTitle = (name: string): string =>
  name
    .replace(/\.epub$/i, '')
    .replace(/_+/g, ' ')
    .trim()

export interface ProgressRow {
  fileId: string
  title: string
  cfi: string
  lastReadAt: string
}

export interface ReadingLogEntry {
  date: string // YYYY-MM-DD, local calendar day
  seconds: number
}

/** Local YYYY-MM-DD for "today" — not UTC, so a late-night reading session
 * lands on the day the reader actually experienced it as. */
export const localDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '<1m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export const formatLogDate = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export type FontFamily = 'original' | 'georgia' | 'times' | 'verdana' | 'arial' | 'monospace'

export interface FontOption {
  value: FontFamily
  label: string
  cssStack?: string // CSS font-family value; omitted for 'original' (uses the book's own)
}

export const FONT_OPTIONS: FontOption[] = [
  { value: 'original', label: 'Default' },
  { value: 'georgia', label: 'Georgia', cssStack: "Georgia, 'Times New Roman', serif" },
  { value: 'times', label: 'Times', cssStack: "'Times New Roman', Times, serif" },
  { value: 'verdana', label: 'Verdana', cssStack: 'Verdana, Geneva, sans-serif' },
  { value: 'arial', label: 'Arial', cssStack: 'Arial, Helvetica, sans-serif' },
  { value: 'monospace', label: 'Monospace', cssStack: "'Courier New', Courier, monospace" },
]

export interface Preferences {
  theme: 'light' | 'dark'
  fontSize: number // percentage, e.g. 100
  lineSpacing: number // CSS line-height multiplier, e.g. 1.4
  fontFamily: FontFamily
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  fontSize: 100,
  lineSpacing: 1.4,
  fontFamily: 'original',
}

export interface AppConfig {
  rootFolderId: string
  spreadsheetId: string
}

export type View = 'signin' | 'loading' | 'setup' | 'library' | 'reading'
