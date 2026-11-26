import { createHash } from 'crypto'
import type { MinecraftProfile } from '@shared/types'
import { AuthError, type MinecraftSession } from './microsoftAuth'

/**
 * Offline (nickname-only) accounts. Nothing is authenticated: the game gets a
 * placeholder access token and `user_type=legacy`, which is what vanilla
 * expects for an unauthenticated player. Such a player can join singleplayer
 * worlds and servers running with online-mode=false.
 */

/** Same rule vanilla enforces for player names. */
const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

export function validateOfflineName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!NAME_PATTERN.test(name)) {
    throw new AuthError('Nickname must be 3–16 characters: letters, digits or _')
  }
  return name
}

/**
 * Java's UUID.nameUUIDFromBytes("OfflinePlayer:" + name) — the UUID an
 * offline-mode server assigns to this name, so inventories and player data
 * stay attached to the nickname across launchers.
 */
export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // IETF variant
  return hash.toString('hex')
}

export function createOfflineProfile(name: string): MinecraftProfile {
  return {
    uuid: offlineUuid(name),
    username: name,
    skinBase64: null,
    skinModel: 'classic',
    type: 'offline'
  }
}

export function createOfflineSession(profile: MinecraftProfile): MinecraftSession {
  return {
    profile,
    mcAccessToken: '0',
    userType: 'legacy',
    expiresAt: Number.POSITIVE_INFINITY
  }
}
