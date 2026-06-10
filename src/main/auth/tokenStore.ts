import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { MinecraftProfile } from '@shared/types'

/**
 * Persists the Microsoft refresh token and the last known profile.
 * The refresh token is encrypted with the OS keychain via safeStorage
 * before it touches disk; electron-store only ever sees ciphertext.
 */

interface AuthStoreSchema {
  refreshTokenEncrypted?: string
  profile?: MinecraftProfile
}

let store: Store<AuthStoreSchema> | null = null

function getStore(): Store<AuthStoreSchema> {
  if (store === null) {
    store = new Store<AuthStoreSchema>({ name: 'auth' })
  }
  return store
}

export function saveRefreshToken(refreshToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is unavailable; refusing to store the refresh token')
  }
  const encrypted = safeStorage.encryptString(refreshToken).toString('base64')
  getStore().set('refreshTokenEncrypted', encrypted)
}

export function loadRefreshToken(): string | null {
  const encrypted = getStore().get('refreshTokenEncrypted')
  if (encrypted === undefined) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // Key changed (OS reinstall, user profile change) — token unrecoverable.
    getStore().delete('refreshTokenEncrypted')
    return null
  }
}

export function saveProfile(profile: MinecraftProfile): void {
  getStore().set('profile', profile)
}

export function loadProfile(): MinecraftProfile | null {
  return getStore().get('profile') ?? null
}

export function clearAuthData(): void {
  getStore().delete('refreshTokenEncrypted')
  getStore().delete('profile')
}
