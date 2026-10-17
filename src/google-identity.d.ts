export interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
  error_description?: string
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
}

export interface TokenClient {
  callback: (response: TokenResponse) => void
  requestAccessToken: (overrides?: { prompt?: '' | 'consent' | 'select_account' }) => void
}

export interface PickerDocument {
  id: string
  name: string
}

export interface PickerResponse {
  action: string
  docs: PickerDocument[]
}

export interface DocsView {
  setIncludeFolders: (include: boolean) => DocsView
  setSelectFolderEnabled: (enabled: boolean) => DocsView
}

export interface PickerInstance {
  setVisible: (visible: boolean) => void
}

export interface PickerBuilder {
  addView: (view: DocsView | string) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder
  build: () => PickerInstance
}

export interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: string) => DocsView
  ViewId: { FOLDERS: string; SPREADSHEETS: string }
  Action: { PICKED: string; CANCEL: string }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient
          revoke: (token: string, callback?: () => void) => void
        }
      }
      picker?: PickerApi
    }
    gapi?: {
      load: (libraries: string, callback: () => void) => void
    }
  }
}
