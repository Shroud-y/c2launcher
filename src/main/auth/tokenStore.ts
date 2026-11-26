import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { AccountsState, MinecraftProfile } from '@shared/types'

/**
 * Persists every saved account (Microsoft and offline) and which one is
 * active. A Microsoft account's refresh token is encrypted with the OS
 * keychain via safeStorage before it touches disk; electron-store only ever
 * sees ciphertext.
 */

interface StoredAccount {
  profile: MinecraftProfile
  /** Microsoft accounts only. */
  refreshTokenEncrypted?: string
}

interface AuthStoreSchema {
  accounts?: StoredAccount[]
  activeUuid?: string | null
  /** Pre-multi-account layout: one Microsoft token + profile. Migrated on load. */
  refreshTokenEncrypted?: string
  profile?: Partial<MinecraftProfile> & Pick<MinecraftProfile, 'uuid' | 'username'>
}

let store: Store<AuthStoreSchema> | null = null

function getStore(): Store<AuthStoreSchema> {
  if (store === null) {
    store = new Store<AuthStoreSchema>({ name: 'auth' })
    migrateSingleAccount(store)
  }
  return store
}

/** Fills fields added after a profile was first saved. */
function normalizeProfile(
  profile: Partial<MinecraftProfile> & Pick<MinecraftProfile, 'uuid' | 'username'>
): MinecraftProfile {
  return {
    uuid: profile.uuid,
    username: profile.username,
    skinBase64: profile.skinBase64 ?? null,
    skinModel: profile.skinModel ?? 'classic',
    // Profiles saved before offline accounts existed were always Microsoft.
    type: profile.type ?? 'microsoft'
  }
}

function migrateSingleAccount(s: Store<AuthStoreSchema>): void {
  const legacy = s.get('profile')
  if (legacy === undefined) return
  if (s.get('accounts') === undefined) {
    const account: StoredAccount = { profile: normalizeProfile(legacy) }
    const token = s.get('refreshTokenEncrypted')
    if (token !== undefined) account.refreshTokenEncrypted = token
    s.set('accounts', [account])
    s.set('activeUuid', account.profile.uuid)
  }
  s.delete('profile')
  s.delete('refreshTokenEncrypted')
}

function readAccounts(): StoredAccount[] {
  return (getStore().get('accounts') ?? []).map((a) => ({
    ...a,
    profile: normalizeProfile(a.profile)
  }))
}

function writeAccounts(accounts: StoredAccount[]): void {
  getStore().set('accounts', accounts)
}

export function getAccountsState(): AccountsState {
  const accounts = readAccounts().map((a) => a.profile)
  const activeUuid = getStore().get('activeUuid') ?? null
  const active = accounts.some((a) => a.uuid === activeUuid) ? activeUuid : null
  return { accounts, activeUuid: active }
}

export function getAccount(uuid: string): MinecraftProfile | null {
  return readAccounts().find((a) => a.profile.uuid === uuid)?.profile ?? null
}

export function getActiveAccount(): MinecraftProfile | null {
  const { activeUuid } = getAccountsState()
  return activeUuid === null ? null : getAccount(activeUuid)
}

export function setActiveAccount(uuid: string | null): void {
  getStore().set('activeUuid', uuid)
}

/**
 * Inserts or replaces the account with this profile's uuid. Keeps the stored
 * refresh token unless a new one is given. Existing skin data survives a
 * re-login of an offline account (its profile carries no skin of its own).
 */
export function upsertAccount(profile: MinecraftProfile, refreshToken?: string): void {
  const accounts = readAccounts()
  const index = accounts.findIndex((a) => a.profile.uuid === profile.uuid)
  const previous = index === -1 ? undefined : accounts[index]
  const next: StoredAccount = {
    profile:
      profile.type === 'offline' && previous !== undefined && profile.skinBase64 === null
        ? { ...profile, skinBase64: previous.profile.skinBase64, skinModel: previous.profile.skinModel }
        : profile,
    refreshTokenEncrypted:
      refreshToken !== undefined ? encrypt(refreshToken) : previous?.refreshTokenEncrypted
  }
  if (index === -1) accounts.push(next)
  else accounts[index] = next
  writeAccounts(accounts)
}

export function updateProfile(uuid: string, patch: Partial<MinecraftProfile>): MinecraftProfile {
  const accounts = readAccounts()
  const account = accounts.find((a) => a.profile.uuid === uuid)
  if (account === undefined) throw new Error('Account not found')
  account.profile = { ...account.profile, ...patch, uuid }
  writeAccounts(accounts)
  return account.profile
}

/** Removes the account; if it was active, the first remaining one takes over. */
export function removeAccount(uuid: string): void {
  const accounts = readAccounts().filter((a) => a.profile.uuid !== uuid)
  writeAccounts(accounts)
  if (getStore().get('activeUuid') === uuid) {
    setActiveAccount(accounts[0]?.profile.uuid ?? null)
  }
}

function encrypt(refreshToken: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is unavailable; refusing to store the refresh token')
  }
  return safeStorage.encryptString(refreshToken).toString('base64')
}

export function saveRefreshToken(uuid: string, refreshToken: string): void {
  const accounts = readAccounts()
  const account = accounts.find((a) => a.profile.uuid === uuid)
  if (account === undefined) return
  account.refreshTokenEncrypted = encrypt(refreshToken)
  writeAccounts(accounts)
}

export function loadRefreshToken(uuid: string): string | null {
  const accounts = readAccounts()
  const account = accounts.find((a) => a.profile.uuid === uuid)
  const encrypted = account?.refreshTokenEncrypted
  if (account === undefined || encrypted === undefined) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // Key changed (OS reinstall, user profile change) — token unrecoverable.
    delete account.refreshTokenEncrypted
    writeAccounts(accounts)
    return null
  }
}
