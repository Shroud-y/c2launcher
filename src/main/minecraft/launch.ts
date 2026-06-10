import { spawn, type ChildProcess } from 'child_process'
import { delimiter, join } from 'path'
import { mkdir } from 'fs/promises'
import { app } from 'electron'
import { clientJarPath } from './install'
import { rulesAllow, type ArgumentEntry, type VersionMeta } from './versionMeta'
import type { MinecraftSession } from '../auth/microsoftAuth'

export interface LaunchContext {
  meta: VersionMeta
  javaPath: string
  minecraftRoot: string
  gameDir: string
  memoryMb: number
  extraJavaArgs: string
  session: MinecraftSession
}

function flattenArguments(entries: ArgumentEntry[] | undefined): string[] {
  if (entries === undefined) return []
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(entry)
    } else if (rulesAllow(entry.rules)) {
      out.push(...(Array.isArray(entry.value) ? entry.value : [entry.value]))
    }
  }
  return out
}

function buildClasspath(ctx: LaunchContext): string {
  const paths: string[] = []
  for (const lib of ctx.meta.libraries) {
    const artifact = lib.downloads?.artifact
    if (artifact === undefined || !rulesAllow(lib.rules)) continue
    paths.push(join(ctx.minecraftRoot, 'libraries', ...artifact.path.split('/')))
  }
  paths.push(clientJarPath(ctx.minecraftRoot, ctx.meta.id))
  return paths.join(delimiter)
}

export function buildLaunchArgs(ctx: LaunchContext): string[] {
  const substitutions: Record<string, string> = {
    auth_player_name: ctx.session.profile.username,
    auth_uuid: ctx.session.profile.uuid,
    auth_access_token: ctx.session.mcAccessToken,
    auth_xuid: '0',
    clientid: 'c2-launcher',
    user_type: 'msa',
    version_name: ctx.meta.id,
    version_type: ctx.meta.type,
    game_directory: ctx.gameDir,
    assets_root: join(ctx.minecraftRoot, 'assets'),
    assets_index_name: ctx.meta.assets,
    natives_directory: join(ctx.minecraftRoot, 'natives', ctx.meta.id),
    launcher_name: 'c2-launcher',
    launcher_version: app.getVersion(),
    classpath: buildClasspath(ctx)
  }

  function substitute(arg: string): string {
    return arg.replace(/\$\{(\w+)\}/g, (whole, key: string) => substitutions[key] ?? whole)
  }

  // Pre-1.13 metadata has no jvm argument list — supply the classic defaults.
  const rawJvmArgs =
    ctx.meta.arguments?.jvm !== undefined
      ? flattenArguments(ctx.meta.arguments.jvm)
      : ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
  const jvmArgs = rawJvmArgs.map(substitute)
  const gameArgs =
    ctx.meta.arguments !== undefined
      ? flattenArguments(ctx.meta.arguments.game).map(substitute)
      : (ctx.meta.minecraftArguments ?? '').split(' ').filter((a) => a !== '').map(substitute)

  const memoryArgs = [`-Xms${Math.min(1024, ctx.memoryMb)}M`, `-Xmx${ctx.memoryMb}M`]
  const userArgs = ctx.extraJavaArgs.split(' ').filter((a) => a !== '')

  return [...memoryArgs, ...jvmArgs, ...userArgs, ctx.meta.mainClass, ...gameArgs]
}

export async function launchGame(ctx: LaunchContext): Promise<ChildProcess> {
  await mkdir(ctx.gameDir, { recursive: true })
  await mkdir(join(ctx.minecraftRoot, 'natives', ctx.meta.id), { recursive: true })

  const args = buildLaunchArgs(ctx)
  // Never log args: they contain the access token.
  return spawn(ctx.javaPath, args, {
    cwd: ctx.gameDir,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}
