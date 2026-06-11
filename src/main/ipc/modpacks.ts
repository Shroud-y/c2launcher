import { BrowserWindow, ipcMain, shell, type WebContents } from 'electron'
import { mkdir } from 'fs/promises'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  CreateModpackParams,
  GameLogLine,
  GameState,
  InstalledMod,
  InstallModParams,
  InstallProgress,
  Modpack,
  ModpackSettings
} from '@shared/types'
import {
  adoptUnknownInstances,
  applySettings,
  createModpack,
  deleteModpack,
  getModpack,
  instanceDirFor,
  listModpacks,
  migrateInstanceDirs,
  minecraftRoot,
  updateModpack
} from '../modpacks/store'
import { installModrinthPack } from '../modpacks/modrinthInstall'
import { installModFromModrinth, listMods, removeModFile, setModEnabled } from '../modpacks/mods'
import { listReleaseVersionIds } from '../minecraft/manifest'
import { ensureVersionInstalled } from '../minecraft/install'
import { applyLoader } from '../minecraft/loader'
import { applyForgeLoader } from '../minecraft/forge'
import { launchGame } from '../minecraft/launch'
import { findJava } from '../minecraft/java'
import { getMinecraftSession } from '../auth/microsoftAuth'
import { loadRefreshToken, saveRefreshToken } from '../auth/tokenStore'

import type { ChildProcess } from 'child_process'

const busy = new Set<string>() // installing or running
const runningProcesses = new Map<string, ChildProcess>()

function broadcast(channel: IpcChannel, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function sendProgress(progress: InstallProgress): void {
  broadcast(IpcChannel.ModpackInstallProgress, progress)
}

function sendState(state: GameState): void {
  broadcast(IpcChannel.ModpackGameState, state)
}

function sendLog(log: GameLogLine): void {
  broadcast(IpcChannel.ModpackGameLog, log)
}

async function runLaunch(modpack: Modpack, _sender: WebContents): Promise<void> {
  const modpackId = modpack.id
  if (modpack.gameVersion === null) {
    throw new Error('This modpack has no game version assigned')
  }

  const javaPath = await findJava()
  if (javaPath === null) {
    throw new Error('Java not found. Install Java 21+ or set JAVA_HOME.')
  }

  const session = await getMinecraftSession(loadRefreshToken, saveRefreshToken)

  sendLog({ modpackId, stream: 'system', line: `Installing Minecraft ${modpack.gameVersion}…` })
  let meta = await ensureVersionInstalled(
    minecraftRoot(),
    modpack.gameVersion,
    (phase, percent, message) => {
      sendProgress({ modpackId, phase, percent: Math.round(percent), message })
    }
  )

  const loader = modpack.loader
  if (loader !== null && loader !== 'vanilla') {
    sendLog({ modpackId, stream: 'system', line: `Installing ${loader} loader…` })
    const reportLoader = (percent: number, message: string): void => {
      sendProgress({ modpackId, phase: 'loader', percent: Math.round(percent), message })
    }
    meta =
      loader === 'fabric' || loader === 'quilt'
        ? await applyLoader(
            minecraftRoot(),
            meta,
            loader,
            modpack.gameVersion,
            modpack.loaderVersion ?? null,
            reportLoader
          )
        : await applyForgeLoader(
            minecraftRoot(),
            meta,
            loader,
            modpack.gameVersion,
            modpack.loaderVersion ?? null,
            javaPath,
            reportLoader
          )
    sendProgress({ modpackId, phase: 'done', percent: 100, message: 'Ready' })
  }

  if (meta.javaVersion !== undefined) {
    sendLog({
      modpackId,
      stream: 'system',
      line: `Required Java major version: ${meta.javaVersion.majorVersion} (using ${javaPath})`
    })
  }

  sendState({ modpackId, state: 'launching' })
  sendLog({ modpackId, stream: 'system', line: 'Starting game…' })

  const child = await launchGame({
    meta,
    javaPath,
    minecraftRoot: minecraftRoot(),
    gameDir: instanceDirFor(modpack),
    memoryMb: modpack.memoryMb,
    extraJavaArgs: modpack.javaArgs,
    session
  })

  runningProcesses.set(modpackId, child)
  updateModpack(modpackId, { lastPlayedAt: Date.now() })

  let sawRunning = false
  function onLine(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim() === '') continue
      if (!sawRunning) {
        sawRunning = true
        sendState({ modpackId, state: 'running' })
      }
      sendLog({ modpackId, stream, line })
    }
  }

  child.stdout?.on('data', (c: Buffer) => onLine('stdout', c))
  child.stderr?.on('data', (c: Buffer) => onLine('stderr', c))

  child.on('error', (err) => {
    busy.delete(modpackId)
    runningProcesses.delete(modpackId)
    sendState({ modpackId, state: 'error', message: err.message })
  })

  child.on('close', (code) => {
    busy.delete(modpackId)
    runningProcesses.delete(modpackId)
    sendLog({ modpackId, stream: 'system', line: `Game exited with code ${code ?? 0}` })
    sendState({ modpackId, state: 'exited', exitCode: code ?? 0 })
  })
}

export function registerModpackIpc(): void {
  void migrateInstanceDirs()

  ipcMain.handle(IpcChannel.ModpackList, async (): Promise<Modpack[]> => {
    // Awaited here (not just at startup) so the renderer never sees
    // pre-migration records without dirName.
    await migrateInstanceDirs()
    await adoptUnknownInstances()
    return listModpacks()
  })

  ipcMain.handle(
    IpcChannel.ModpackCreate,
    (_e, params: CreateModpackParams): Promise<Modpack> => createModpack(params)
  )

  ipcMain.handle(
    IpcChannel.ModpackUpdateSettings,
    async (_e, id: string, settings: ModpackSettings): Promise<Modpack | null> => {
      const current = getModpack(id)
      if (current !== null && settings.name.trim() !== current.name && busy.has(id)) {
        throw new Error('Stop the game before renaming the modpack')
      }
      return applySettings(id, settings)
    }
  )

  ipcMain.handle(IpcChannel.ModpackDelete, async (_e, id: string): Promise<void> => {
    if (busy.has(id)) {
      throw new Error('Stop the game and wait for installs to finish before deleting')
    }
    await deleteModpack(id)
  })

  ipcMain.handle(IpcChannel.ModpackOpenFolder, async (_e, id: string): Promise<void> => {
    const modpack = getModpack(id)
    if (modpack === null) throw new Error('Modpack not found')
    const dir = instanceDirFor(modpack)
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IpcChannel.MinecraftVersions, (): Promise<string[]> => listReleaseVersionIds())

  ipcMain.handle(
    IpcChannel.ModpackInstallModrinth,
    async (_e, projectId: string): Promise<Modpack> => {
      let packId: string | null = null
      try {
        const pack = await installModrinthPack(projectId, (p, percent, message) => {
          if (packId === null) {
            packId = p.id
            busy.add(p.id)
          }
          sendProgress({ modpackId: p.id, phase: 'pack', percent: Math.round(percent), message })
        })
        sendProgress({ modpackId: pack.id, phase: 'done', percent: 100, message: 'Installed' })
        return pack
      } catch (err) {
        if (packId !== null) {
          const message = err instanceof Error ? err.message : 'Install failed'
          sendProgress({ modpackId: packId, phase: 'error', percent: 0, message })
        }
        throw err
      } finally {
        if (packId !== null) busy.delete(packId)
      }
    }
  )

  ipcMain.handle(
    IpcChannel.ModpackInstallMod,
    (_e, params: InstallModParams): Promise<InstalledMod> => installModFromModrinth(params)
  )

  ipcMain.handle(
    IpcChannel.ModpackMods,
    (_e, id: string): Promise<InstalledMod[]> => listMods(id)
  )

  ipcMain.handle(
    IpcChannel.ModpackToggleMod,
    (_e, id: string, fileName: string, enabled: boolean): Promise<InstalledMod> =>
      setModEnabled(id, fileName, enabled)
  )

  ipcMain.handle(IpcChannel.ModpackRemoveMod, async (_e, id: string, fileName: string): Promise<void> => {
    if (busy.has(id)) {
      throw new Error('Stop the game before removing mods')
    }
    await removeModFile(id, fileName)
  })

  ipcMain.handle(IpcChannel.ModpackStop, (_e, id: string): void => {
    const child = runningProcesses.get(id)
    if (child === undefined) return
    sendLog({ modpackId: id, stream: 'system', line: 'Stopping game…' })
    child.kill()
  })

  ipcMain.handle(IpcChannel.ModpackLaunch, async (event, id: string): Promise<void> => {
    const modpack = getModpack(id)
    if (modpack === null) throw new Error('Modpack not found')
    if (busy.has(id)) throw new Error('This modpack is already installing or running')

    busy.add(id)
    try {
      await runLaunch(modpack, event.sender)
    } catch (err) {
      busy.delete(id)
      const message = err instanceof Error ? err.message : 'Launch failed'
      sendProgress({ modpackId: id, phase: 'error', percent: 0, message })
      sendState({ modpackId: id, state: 'error', message })
      throw err
    }
  })
}
