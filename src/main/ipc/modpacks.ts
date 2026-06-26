import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { mkdir, readFile, stat } from 'fs/promises'
import { basename, extname } from 'path'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  ContentUpdate,
  CreateModpackParams,
  GameLogLine,
  GameState,
  InstallableCategory,
  InstalledContent,
  InstallContentParams,
  InstallProgress,
  ModLoader,
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
import { installModpackFromFile, installModrinthPack } from '../modpacks/modrinthInstall'
import {
  checkContentUpdates,
  importContentFiles,
  installContentFromModrinth,
  listContent,
  removeContentFile,
  setContentEnabled
} from '../modpacks/mods'
import { listReleaseVersionIds } from '../minecraft/manifest'
import { ensureVersionInstalled } from '../minecraft/install'
import { applyLoader, listLoaderVersions, resolveLoaderVersion } from '../minecraft/loader'
import { applyForgeLoader, listForgeLikeVersions, resolveForgeVersion } from '../minecraft/forge'
import { launchGame } from '../minecraft/launch'
import { ensureMojangRuntime, findJava } from '../minecraft/java'
import { getMinecraftSession } from '../auth/microsoftAuth'
import { loadRefreshToken, saveRefreshToken } from '../auth/tokenStore'
import { getJavaOverride } from '../settings/store'

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

/**
 * The Java to launch with: Mojang's bundled runtime matching the version
 * manifest when available (this is what guarantees e.g. Java 25 for
 * Minecraft 26.x), otherwise whatever findJava() locates on the system.
 */
async function resolveJava(
  modpackId: string,
  required: { component?: string; majorVersion: number } | undefined
): Promise<string> {
  // A user-set Java override wins over the bundled runtime and PATH.
  const override = getJavaOverride()
  if (override !== null && override !== '') {
    sendLog({ modpackId, stream: 'system', line: `Using Java override (${override})` })
    return override
  }

  if (required?.component !== undefined) {
    try {
      const javaPath = await ensureMojangRuntime(minecraftRoot(), required.component, (percent, message) => {
        sendProgress({ modpackId, phase: 'java', percent: Math.round(percent), message })
      })
      sendLog({
        modpackId,
        stream: 'system',
        line: `Using bundled Java ${required.majorVersion} (${javaPath})`
      })
      return javaPath
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'download failed'
      sendLog({
        modpackId,
        stream: 'system',
        line: `Bundled Java unavailable (${reason}) — falling back to system Java`
      })
    }
  }

  const javaPath = await findJava()
  if (javaPath === null) {
    const wanted = required !== undefined ? ` ${required.majorVersion}+` : ' 21+'
    throw new Error(`Java not found. Install Java${wanted} or set JAVA_HOME.`)
  }
  return javaPath
}

async function runLaunch(modpack: Modpack, _sender: WebContents): Promise<void> {
  const modpackId = modpack.id
  if (modpack.gameVersion === null) {
    throw new Error('This modpack has no game version assigned')
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

  const javaPath = await resolveJava(modpackId, meta.javaVersion)

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

  ipcMain.handle(
    IpcChannel.ModpackSetIcon,
    async (event, id: string, clear: boolean): Promise<Modpack | null> => {
      const modpack = getModpack(id)
      if (modpack === null) throw new Error('Modpack not found')

      if (clear) return updateModpack(id, { icon: null })

      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: 'Choose instance icon',
        properties: ['openFile' as const],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      }
      const { canceled, filePaths } =
        win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const filePath = filePaths[0]
      if (canceled || filePath === undefined) return null

      // Icons live as data URLs in the registry JSON — keep them small.
      const { size } = await stat(filePath)
      if (size > 1024 * 1024) throw new Error('Icon too large — pick an image under 1 MB')

      const mime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
      }
      const type = mime[extname(filePath).toLowerCase()]
      if (type === undefined) throw new Error('Unsupported image type')

      const data = await readFile(filePath)
      return updateModpack(id, { icon: `data:${type};base64,${data.toString('base64')}` })
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

  // Whether the loader has any build for the given Minecraft version.
  // A definitive "no builds" answer returns false; transient/network
  // errors are rethrown so the renderer can fall back to allowing it.
  ipcMain.handle(
    IpcChannel.LoaderCheck,
    async (_e, loader: ModLoader, gameVersion: string): Promise<boolean> => {
      if (loader === 'vanilla' || gameVersion === '') return true
      try {
        if (loader === 'fabric' || loader === 'quilt') {
          await resolveLoaderVersion(loader, gameVersion)
        } else {
          await resolveForgeVersion(loader, gameVersion)
        }
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/has no builds|only supported/i.test(message)) return false
        throw err
      }
    }
  )

  // All loader builds for a game version, newest first (empty for vanilla).
  ipcMain.handle(
    IpcChannel.LoaderVersions,
    (_e, loader: ModLoader, gameVersion: string): Promise<string[]> => {
      if (loader === 'vanilla' || gameVersion === '') return Promise.resolve([])
      if (loader === 'fabric' || loader === 'quilt') {
        return listLoaderVersions(loader, gameVersion)
      }
      return listForgeLikeVersions(loader, gameVersion)
    }
  )

  ipcMain.handle(
    IpcChannel.ModpackInstallModrinth,
    async (_e, projectId: string, versionId?: string): Promise<Modpack> => {
      let packId: string | null = null
      try {
        const pack = await installModrinthPack(projectId, (p, percent, message) => {
          if (packId === null) {
            packId = p.id
            busy.add(p.id)
          }
          sendProgress({ modpackId: p.id, phase: 'pack', percent: Math.round(percent), message })
        }, versionId)
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
    IpcChannel.ModpackImportMrpack,
    async (event): Promise<Modpack | null> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: 'Import modpack',
        properties: ['openFile' as const],
        filters: [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }]
      }
      const { canceled, filePaths } =
        win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const filePath = filePaths[0]
      if (canceled || filePath === undefined) return null

      const buffer = await readFile(filePath)
      // Strip the extension off the file name — used as the instance name
      // when a plain instance zip carries no name of its own.
      const fallbackName = basename(filePath).replace(/\.[^.]+$/, '')
      let packId: string | null = null
      try {
        const pack = await installModpackFromFile(buffer, fallbackName, (p, percent, message) => {
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
          const message = err instanceof Error ? err.message : 'Import failed'
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
    (_e, params: InstallContentParams): Promise<InstalledContent> =>
      installContentFromModrinth(params)
  )

  // Accepted file extensions per category for the "Choose files" dialog.
  const CONTENT_FILTERS: Record<InstallableCategory, { name: string; extensions: string[] }> = {
    mods: { name: 'Mods', extensions: ['jar'] },
    resourcepacks: { name: 'Resource packs', extensions: ['zip'] },
    shaders: { name: 'Shaders', extensions: ['zip'] },
    datapacks: { name: 'Data packs', extensions: ['zip'] }
  }

  ipcMain.handle(
    IpcChannel.ModpackImportContent,
    async (
      event,
      id: string,
      category: InstallableCategory
    ): Promise<InstalledContent[]> => {
      if (getModpack(id) === null) throw new Error('Modpack not found')
      if (busy.has(id)) throw new Error('Stop the game before importing files')

      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: `Add ${CONTENT_FILTERS[category].name.toLowerCase()}`,
        properties: ['openFile' as const, 'multiSelections' as const],
        filters: [CONTENT_FILTERS[category]]
      }
      const { canceled, filePaths } =
        win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (canceled || filePaths.length === 0) return []
      return importContentFiles(id, category, filePaths)
    }
  )

  ipcMain.handle(
    IpcChannel.ModpackMods,
    (_e, id: string, category: InstallableCategory): Promise<InstalledContent[]> =>
      listContent(id, category)
  )

  ipcMain.handle(
    IpcChannel.ModpackContentUpdates,
    (_e, id: string, category: InstallableCategory): Promise<ContentUpdate[]> =>
      checkContentUpdates(id, category)
  )

  ipcMain.handle(
    IpcChannel.ModpackToggleMod,
    (
      _e,
      id: string,
      category: InstallableCategory,
      fileName: string,
      enabled: boolean
    ): Promise<InstalledContent> => setContentEnabled(id, category, fileName, enabled)
  )

  ipcMain.handle(
    IpcChannel.ModpackRemoveMod,
    async (_e, id: string, category: InstallableCategory, fileName: string): Promise<void> => {
      if (busy.has(id)) {
        throw new Error('Stop the game before removing files')
      }
      await removeContentFile(id, category, fileName)
    }
  )

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
