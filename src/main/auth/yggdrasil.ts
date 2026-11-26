import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { createHash, createSign, generateKeyPairSync, type KeyObject } from 'crypto'
import type { AddressInfo } from 'net'
import { app } from 'electron'
import type { MinecraftProfile } from '@shared/types'

/**
 * Minimal Yggdrasil API served on 127.0.0.1, just enough for authlib-injector
 * to hand the game our offline accounts' skins. The game is pointed at it with
 * -javaagent:authlib-injector.jar=<base url>; authlib-injector then rewrites
 * Mojang's session/API hosts to these routes:
 *
 *   sessionserver.mojang.com     → /sessionserver
 *   api.mojang.com               → /api
 *   api.minecraftservices.com    → /minecraftservices
 *
 * Only offline accounts are served. Nothing here authenticates anybody — the
 * game only ever asks it "what does player X look like".
 *
 * The server lives as long as the launcher. A game that outlives the launcher
 * keeps the skins it already loaded but cannot fetch new ones.
 */

type AccountSource = () => MinecraftProfile[]

interface RunningServer {
  baseUrl: string
  metadata: object
}

let running: Promise<RunningServer> | null = null
let keys: { privateKey: KeyObject; publicKeyPem: string; publicKeyDer: string } | null = null

function getKeys(): NonNullable<typeof keys> {
  if (keys === null) {
    // Per launcher run. 2048 bits is plenty for signing local texture data
    // and generates in milliseconds rather than the second 4096 takes.
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    keys = {
      privateKey,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      publicKeyDer: publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    }
  }
  return keys
}

const stripDashes = (uuid: string): string => uuid.replace(/-/g, '').toLowerCase()

function skinHash(skinBase64: string): string {
  return createHash('sha256').update(Buffer.from(skinBase64, 'base64')).digest('hex')
}

function texturesProperty(profile: MinecraftProfile, baseUrl: string): object {
  const textures: Record<string, unknown> = {}
  if (profile.skinBase64 !== null) {
    textures.SKIN = {
      url: `${baseUrl}/textures/${skinHash(profile.skinBase64)}`,
      ...(profile.skinModel === 'slim' ? { metadata: { model: 'slim' } } : {})
    }
  }
  const value = Buffer.from(
    JSON.stringify({
      timestamp: Date.now(),
      profileId: profile.uuid,
      profileName: profile.username,
      textures
    })
  ).toString('base64')
  // Newer clients reject unsigned texture properties; authlib-injector
  // verifies against the signaturePublickey from our metadata.
  const signer = createSign('SHA1')
  signer.update(value)
  const signature = signer.sign(getKeys().privateKey).toString('base64')
  return { name: 'textures', value, signature }
}

function profileJson(profile: MinecraftProfile, baseUrl: string): object {
  return {
    id: stripDashes(profile.uuid),
    name: profile.username,
    properties: [texturesProperty(profile, baseUrl)]
  }
}

/** Every privilege on: there is no account to restrict. */
const PRIVILEGES = {
  onlineChat: { enabled: true },
  multiplayerServer: { enabled: true },
  multiplayerRealms: { enabled: false },
  telemetry: { enabled: false }
}

function send(res: ServerResponse, status: number, body?: unknown, type = 'application/json'): void {
  if (body === undefined) {
    res.writeHead(status)
    res.end()
    return
  }
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': payload.length })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function buildMetadata(): object {
  return {
    meta: {
      serverName: 'C² Launcher',
      implementationName: 'c2-launcher',
      implementationVersion: app.getVersion(),
      'feature.non_email_login': true
    },
    skinDomains: ['127.0.0.1', 'localhost'],
    signaturePublickey: getKeys().publicKeyPem
  }
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  baseUrl: string,
  accounts: AccountSource
): Promise<void> {
  const url = new URL(req.url ?? '/', baseUrl)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const offline = (): MinecraftProfile[] => accounts().filter((a) => a.type === 'offline')

  if (req.method === 'GET' && path === '/') {
    send(res, 200, buildMetadata())
    return
  }

  let m = /^\/sessionserver\/session\/minecraft\/profile\/([0-9a-fA-F-]{32,36})$/.exec(path)
  if (req.method === 'GET' && m !== null) {
    const id = stripDashes(m[1])
    const profile = offline().find((a) => stripDashes(a.uuid) === id)
    if (profile === undefined) send(res, 204)
    else send(res, 200, profileJson(profile, baseUrl))
    return
  }

  m = /^\/textures\/([0-9a-f]{64})$/.exec(path)
  if (req.method === 'GET' && m !== null) {
    const hash = m[1]
    const profile = offline().find((a) => a.skinBase64 !== null && skinHash(a.skinBase64) === hash)
    if (profile?.skinBase64 == null) send(res, 404)
    else send(res, 200, Buffer.from(profile.skinBase64, 'base64'), 'image/png')
    return
  }

  m = /^\/api\/users\/profiles\/minecraft\/([A-Za-z0-9_]{1,16})$/.exec(path)
  if (req.method === 'GET' && m !== null) {
    const name = m[1].toLowerCase()
    const profile = offline().find((a) => a.username.toLowerCase() === name)
    if (profile === undefined) send(res, 204)
    else send(res, 200, { id: stripDashes(profile.uuid), name: profile.username })
    return
  }

  if (req.method === 'POST' && path === '/api/profiles/minecraft') {
    let names: unknown
    try {
      names = JSON.parse(await readBody(req))
    } catch {
      send(res, 400, { error: 'IllegalArgumentException', errorMessage: 'Bad JSON' })
      return
    }
    const wanted = new Set(
      (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string').map((n: string) => n.toLowerCase())
    )
    send(
      res,
      200,
      offline()
        .filter((a) => wanted.has(a.username.toLowerCase()))
        .map((a) => ({ id: stripDashes(a.uuid), name: a.username }))
    )
    return
  }

  // Joining an online-mode server: nothing to verify against, accept.
  if (req.method === 'POST' && path === '/sessionserver/session/minecraft/join') {
    await readBody(req)
    send(res, 204)
    return
  }

  if (req.method === 'GET' && path === '/minecraftservices/player/attributes') {
    send(res, 200, {
      privileges: PRIVILEGES,
      profanityFilterPreferences: { profanityFilterOn: false }
    })
    return
  }

  if (req.method === 'GET' && path === '/minecraftservices/privileges') {
    send(res, 200, { privileges: PRIVILEGES })
    return
  }

  if (req.method === 'GET' && path === '/minecraftservices/publickeys') {
    const key = { publicKey: getKeys().publicKeyDer }
    send(res, 200, { profilePropertyKeys: [key], playerCertificateKeys: [key] })
    return
  }

  // Everything else (chat certificates, hasJoined, …) has no meaning for an
  // offline account; a 404 makes the game fall back to its offline paths.
  send(res, 404, { error: 'Not Found', errorMessage: 'Not supported by the local skin server' })
}

/** Starts the server once per launcher run and returns its base URL + metadata. */
export function ensureYggdrasilServer(accounts: AccountSource): Promise<RunningServer> {
  if (running === null) {
    running = new Promise<RunningServer>((resolve, reject) => {
      const server = createServer((req, res) => {
        const addr = server.address() as AddressInfo
        const baseUrl = `http://127.0.0.1:${addr.port}`
        handle(req, res, baseUrl, accounts).catch(() => {
          if (!res.headersSent) send(res, 500)
          else res.end()
        })
      })
      server.on('error', (err) => {
        running = null
        reject(err)
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo
        const baseUrl = `http://127.0.0.1:${port}`
        // Never keeps the launcher process alive on its own.
        server.unref()
        resolve({ baseUrl, metadata: buildMetadata() })
      })
    })
  }
  return running
}
