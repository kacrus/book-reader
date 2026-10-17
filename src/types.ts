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

export interface ProgressRow {
  fileId: string
  title: string
  cfi: string
  lastReadAt: string
}

export interface Preferences {
  theme: 'light' | 'dark'
  fontSize: number // percentage, e.g. 100
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  fontSize: 100,
}

export interface AppConfig {
  rootFolderId: string
  spreadsheetId: string
}

export type View = 'signin' | 'setup' | 'library' | 'reading'
