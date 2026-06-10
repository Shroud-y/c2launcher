import { BrowserWindow, session } from 'electron'
import type { MinecraftProfile } from '@shared/types'

/**
 * Microsoft OAuth2 → Xbox Live → XSTS → Minecraft auth chain, implemented
 * directly per the community-documented launcher spec (wiki.vg flavour).
 *
 * Uses the long-standing Mojang launcher client id on the legacy
 * login.live.com endpoints, which requires no Azure app registration.
 */

const CLIENT_ID = '00000000402b5328'
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf'
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'
const AUTHORIZE_URL =
  'https://login.live.com/oauth20_authorize.srf' +
  `?client_id=${CLIENT_ID}` +
  '&response_type=code' +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf'

/** Dedicated cookie partition so logout can wipe Microsoft session state. */
export const AUTH_PARTITION = 'persist:ms-auth'

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly cancelled = false
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

interface MsTokens {
  accessToken: string
  refreshToken: string
}

interface XboxToken {
  token: string
  userHash: string
}

// ---------- Microsoft ----------

function openAuthWindow(parent: BrowserWindow | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 480,
      height: 640,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      backgroundColor: '#0f1117',
      webPreferences: {
        partition: AUTH_PARTITION,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let settled = false

    function handleUrl(url: string): void {
      if (settled || !url.startsWith(REDIRECT_URI)) return
      const parsed = new URL(url)
      const code = parsed.searchParams.get('code')
      const error = parsed.searchParams.get('error')
      settled = true
      win.close()
      if (code !== null) {
        resolve(code)
      } else {
        reject(new AuthError(`Microsoft login failed: ${error ?? 'no code returned'}`))
      }
    }

    win.webContents.on('will-redirect', (_e, url) => handleUrl(url))
    win.webContents.on('will-navigate', (_e, url) => handleUrl(url))
    win.on('closed', () => {
      if (!settled) {
        settled = true
        reject(new AuthError('Login window was closed', true))
      }
    })

    void win.loadURL(AUTHORIZE_URL)
  })
}

async function requestMsTokens(params: Record<string, string>): Promise<MsTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE, ...params }).toString()
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AuthError(`Microsoft token request failed: ${body?.error ?? res.status}`)
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string }
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

function exchangeAuthCode(code: string): Promise<MsTokens> {
  return requestMsTokens({
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI
  })
}

export function refreshMsTokens(refreshToken: string): Promise<MsTokens> {
  return requestMsTokens({
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
}

// ---------- Xbox Live / XSTS ----------

async function xboxLiveAuth(msAccessToken: string): Promise<XboxToken> {
  const res = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: msAccessToken
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  if (!res.ok) throw new AuthError(`Xbox Live authentication failed (${res.status})`)
  const data = (await res.json()) as { Token: string; DisplayClaims: { xui: { uhs: string }[] } }
  return { token: data.Token, userHash: data.DisplayClaims.xui[0].uhs }
}

const XSTS_ERRORS: Record<string, string> = {
  '2148916233': 'This Microsoft account has no Xbox profile',
  '2148916235': 'Xbox Live is not available in your region',
  '2148916238': 'This account belongs to a child and must be added to a family'
}

async function xstsAuth(xblToken: string): Promise<XboxToken> {
  const res = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  if (res.status === 401) {
    const data = (await res.json().catch(() => null)) as { XErr?: number } | null
    const xerr = data?.XErr !== undefined ? String(data.XErr) : ''
    throw new AuthError(XSTS_ERRORS[xerr] ?? `XSTS authorization denied (${xerr || 'unknown'})`)
  }
  if (!res.ok) throw new AuthError(`XSTS authorization failed (${res.status})`)
  const data = (await res.json()) as { Token: string; DisplayClaims: { xui: { uhs: string }[] } }
  return { token: data.Token, userHash: data.DisplayClaims.xui[0].uhs }
}

// ---------- Minecraft ----------

async function minecraftLogin(userHash: string, xstsToken: string): Promise<string> {
  const res = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` })
  })
  if (!res.ok) throw new AuthError(`Minecraft login failed (${res.status})`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

interface ProfileResponse {
  id: string
  name: string
  skins?: { state: string; url: string }[]
}

async function fetchMinecraftProfile(mcAccessToken: string): Promise<MinecraftProfile> {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcAccessToken}` }
  })
  if (res.status === 404) {
    throw new AuthError('This Microsoft account does not own Minecraft')
  }
  if (!res.ok) throw new AuthError(`Failed to fetch Minecraft profile (${res.status})`)
  const data = (await res.json()) as ProfileResponse

  const skinUrl = data.skins?.find((s) => s.state === 'ACTIVE')?.url ?? null
  let skinBase64: string | null = null
  if (skinUrl !== null) {
    try {
      const skinRes = await fetch(skinUrl)
      if (skinRes.ok) {
        skinBase64 = Buffer.from(await skinRes.arrayBuffer()).toString('base64')
      }
    } catch {
      // Skin is cosmetic — login still succeeds without it.
    }
  }

  return { uuid: data.id, username: data.name, skinBase64 }
}

// ---------- Full chains ----------

async function completeChain(msAccessToken: string): Promise<MinecraftProfile> {
  const xbl = await xboxLiveAuth(msAccessToken)
  const xsts = await xstsAuth(xbl.token)
  const mcToken = await minecraftLogin(xsts.userHash, xsts.token)
  return fetchMinecraftProfile(mcToken)
}

export interface AuthResult {
  profile: MinecraftProfile
  refreshToken: string
}

export async function loginInteractive(parent: BrowserWindow | null): Promise<AuthResult> {
  const code = await openAuthWindow(parent)
  const tokens = await exchangeAuthCode(code)
  const profile = await completeChain(tokens.accessToken)
  return { profile, refreshToken: tokens.refreshToken }
}

export async function loginSilent(refreshToken: string): Promise<AuthResult> {
  const tokens = await refreshMsTokens(refreshToken)
  const profile = await completeChain(tokens.accessToken)
  return { profile, refreshToken: tokens.refreshToken }
}

export async function clearAuthSession(): Promise<void> {
  await session.fromPartition(AUTH_PARTITION).clearStorageData()
}
