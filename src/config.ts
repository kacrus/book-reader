export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

// The Google Cloud project number, used to authorize the Picker widget.
// It's the leading numeric segment of the OAuth Client ID itself, so no
// separate credential is needed.
export const GOOGLE_APP_ID = GOOGLE_CLIENT_ID.split('-')[0] ?? ''

export const SCOPES =
  'https://www.googleapis.com/auth/drive.readonly ' +
  'https://www.googleapis.com/auth/drive.file ' +
  'https://www.googleapis.com/auth/spreadsheets'

export const LOCAL_STORAGE_CONFIG_KEY = 'book-reader:config'
export const SESSION_STORAGE_TOKEN_KEY = 'book-reader:token'
