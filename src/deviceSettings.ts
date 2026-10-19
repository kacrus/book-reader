const KEY = 'book-reader:device-settings'

/** Unlike Preferences (synced via the spreadsheet), these are deliberately
 * per-device: the right page width and margin on a phone and a desktop
 * monitor aren't the same values, so there's nothing useful to sync. */
export interface DeviceSettings {
  pageWidth: number // max-width of the reading column, px
  sideMargin: number // px of padding inside that column, on each side
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { pageWidth: 720, sideMargin: 0 }

export function loadDeviceSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_DEVICE_SETTINGS
    return { ...DEFAULT_DEVICE_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_DEVICE_SETTINGS
  }
}

export function saveDeviceSettings(settings: DeviceSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
