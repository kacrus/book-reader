import { LOCAL_STORAGE_CONFIG_KEY } from './config'
import type { AppConfig } from './types'

export function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY)
    return raw ? (JSON.parse(raw) as AppConfig) : null
  } catch {
    return null
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(LOCAL_STORAGE_CONFIG_KEY)
}
