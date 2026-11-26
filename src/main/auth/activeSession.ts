import { AuthError, getMinecraftSession, type MinecraftSession } from './microsoftAuth'
import { createOfflineSession } from './offlineAuth'
import { ensureAuthlibInjector } from './authlibInjector'
import { ensureYggdrasilServer } from './yggdrasil'
import { getAccountsState, getActiveAccount, loadRefreshToken, saveRefreshToken } from './tokenStore'

export interface LaunchAuth {
  session: MinecraftSession
  /** Extra JVM arguments (the authlib-injector agent for offline skins). */
  jvmArgs: string[]
  /** Non-fatal problem worth showing in the game log. */
  warning: string | null
}

/**
 * Session for launching the game with the active account. A Microsoft account
 * goes through the refresh chain. An offline account needs no network — unless
 * it has a custom skin, in which case authlib-injector is attached and pointed
 * at the launcher's local skin server. If that setup fails the game still
 * launches, just with the default skin.
 */
export async function getLaunchAuth(): Promise<LaunchAuth> {
  const profile = getActiveAccount()
  if (profile === null) throw new AuthError('You must log in before launching the game')

  if (profile.type === 'microsoft') {
    const session = await getMinecraftSession(
      profile.uuid,
      () => loadRefreshToken(profile.uuid),
      (token) => saveRefreshToken(profile.uuid, token)
    )
    return { session, jvmArgs: [], warning: null }
  }

  const session = createOfflineSession(profile)
  if (profile.skinBase64 === null) return { session, jvmArgs: [], warning: null }

  try {
    const [jar, server] = await Promise.all([
      ensureAuthlibInjector(),
      ensureYggdrasilServer(() => getAccountsState().accounts)
    ])
    const prefetched = Buffer.from(JSON.stringify(server.metadata)).toString('base64')
    return {
      // authlib-injector expects a Yggdrasil account, not a legacy one.
      session: { ...session, userType: 'mojang' },
      jvmArgs: [
        `-javaagent:${jar}=${server.baseUrl}`,
        `-Dauthlibinjector.yggdrasil.prefetched=${prefetched}`,
        '-Dauthlibinjector.noShowServerName'
      ],
      warning: null
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { session, jvmArgs: [], warning: `Custom skin disabled for this launch: ${reason}` }
  }
}
