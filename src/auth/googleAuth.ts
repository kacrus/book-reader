import { GOOGLE_CLIENT_ID, SCOPES, SESSION_STORAGE_TOKEN_KEY } from '../config'
import type { TokenClient, TokenResponse } from '../google-identity'

export class NeedsInteractiveAuth extends Error {
  constructor() {
    super('Sign-in required')
  }
}

interface StoredToken {
  accessToken: string
  expiresAt: number
}

let tokenClient: TokenClient | null = null
let current: StoredToken | null = loadStoredToken()

function loadStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    return parsed.expiresAt > Date.now() ? parsed : null
  } catch {
    return null
  }
}

function storeToken(token: StoredToken | null) {
  current = token
  if (token) {
    sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, JSON.stringify(token))
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_TOKEN_KEY)
  }
}

function getTokenClient(): TokenClient {
  if (!window.google) {
    throw new Error('Google Identity Services script has not loaded yet')
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: () => {},
    })
  }
  return tokenClient
}

function requestToken(prompt: '' | 'consent' | 'select_account'): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = getTokenClient()
    client.callback = (response: TokenResponse) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error_description ?? response.error ?? 'Sign-in failed'))
        return
      }
      const token: StoredToken = {
        accessToken: response.access_token,
        expiresAt: Date.now() + response.expires_in * 1000,
      }
      storeToken(token)
      resolve(token.accessToken)
    }
    client.requestAccessToken({ prompt })
  })
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))
}

/** Returns a valid access token, silently refreshing if possible. Throws
 * NeedsInteractiveAuth if the caller must show a "Reconnect" button instead
 * (the follow-up call to requestAccessToken({prompt:'consent'}) must then
 * happen synchronously inside a click handler, or popup blockers will kill it). */
export async function getValidToken(): Promise<string> {
  if (current && Date.now() < current.expiresAt - 60_000) {
    return current.accessToken
  }
  try {
    return await Promise.race([requestToken(''), timeout(4000)])
  } catch {
    throw new NeedsInteractiveAuth()
  }
}

/** Must be called synchronously from within a user click handler. */
export function signInInteractive(): Promise<string> {
  return requestToken('consent')
}

export function signOut() {
  const token = current?.accessToken
  storeToken(null)
  if (token && window.google) {
    window.google.accounts.oauth2.revoke(token)
  }
}

export function isSignedIn(): boolean {
  return current !== null && Date.now() < current.expiresAt
}
