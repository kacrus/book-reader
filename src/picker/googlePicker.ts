import { GOOGLE_APP_ID } from '../config'
import { getValidToken } from '../auth/googleAuth'
import type { PickerDocument } from '../google-identity'

let pickerApiLoaded: Promise<void> | null = null

function loadPickerApi(): Promise<void> {
  if (!pickerApiLoaded) {
    pickerApiLoaded = new Promise((resolve, reject) => {
      const start = () => window.gapi!.load('picker', () => resolve())
      if (window.gapi?.load) {
        start()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      script.onload = start
      script.onerror = () => reject(new Error('Failed to load Google API script'))
      document.body.appendChild(script)
    })
  }
  return pickerApiLoaded
}

type PickerKind = 'folder' | 'spreadsheet'

async function openPicker(kind: PickerKind): Promise<PickerDocument | null> {
  await loadPickerApi()
  const token = await getValidToken()
  const picker = window.google!.picker!

  const view =
    kind === 'folder'
      ? new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true)
      : new picker.DocsView(picker.ViewId.SPREADSHEETS)

  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setAppId(GOOGLE_APP_ID)
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) resolve(response.docs[0] ?? null)
        else if (response.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}

export const pickFolder = (): Promise<PickerDocument | null> => openPicker('folder')
export const pickSpreadsheet = (): Promise<PickerDocument | null> => openPicker('spreadsheet')
