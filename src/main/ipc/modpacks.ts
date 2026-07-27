import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { mkdir, readFile, rm, stat } from 'fs/promises'
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
  ModpackSettings,
  RunningGame
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
import { exportModpack } from '../modpacks/export'
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
import { readTailLines, tailFile } from '../minecraft/logTail'
import {
  gameLogPath,
  isProcessAlive,
  listRunningGames,
  registerRunningGame,
  unregisterRunningGame,
  verifyGameProcess
} from '../minecraft/runningGames'
import { ensureMojangRuntime, findJava } from '../minecraft/java'
import { getMinecraftSession } from '../auth/microsoftAuth'
import { loadRefreshToken, saveRefreshToken } from '../auth/tokenStore'
import { getJavaOverride, getMinimizeToTrayOnLaunch } from '../settings/store'
import { getMainWindow, revealWindow } from '../index'

import type { ChildProcess } from 'child_process'

const busy = new Set<string>() // installing or running

/** How much of a log file is replayed into the viewer for an adopted game. */
const ADOPTED_LOG_BYTES = 256 * 1024
const ADOPTED_LOG_LINES = 500

/** How often an adopted game (no child handle to listen to) is probed. */
const ADOPTED_POLL_MS = 1000

/**
 * A game the launcher is currently following.
 *
 * `child` is null for adopted games — ones spawned by a previous launcher run,
 * which this process can only observe by PID.
 */
interface ActiveGame {
  pid: number
  startedAt: number
  logFile: string
  child: ChildProcess | null
  /** Mirrors the last state broadcast, so a late-joining renderer can ask. */
  state: 'launching' | 'running'
  stopTail: () => void
  flushTail: () => Promise<void>
  poll: ReturnType<typeof setInterval> | null
  hideTimer: ReturnType<typeof setTimeout> | null
  /** Guards against finishing twice (child 'exit' racing the adoption poll). */
  finished: boolean
}

const active = new Map<string, ActiveGame>()

/**
 * True while any modpack is installing or running. Other subsystems (e.g.
 * the data-folder migration) use this to refuse operations that would move
 * or delete files out from under a live game.
 */
export function hasRunningGames(): boolean {
  return busy.size > 0
}

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

/**
 * Start following a running game: tail its log file, watch for its exit, and
 * mark the modpack busy.
 *
 * Shared by a fresh launch (`child` is the process we spawned) and by adoption
 * at startup (`child` is null — the game belongs to a previous launcher run and
 * can only be observed by PID).
 */
function attachGame(params: {
  modpackId: string
  pid: number
  startedAt: number
  logFile: string
  child: ChildProcess | null
}): void {
  const { modpackId, pid, startedAt, logFile, child } = params
  const adopted = child === null

  const game: ActiveGame = {
    pid,
    startedAt,
    logFile,
    child,
    state: adopted ? 'running' : 'launching',
    stopTail: () => undefined,
    flushTail: () => Promise.resolve(),
    poll: null,
    hideTimer: null,
    finished: false
  }
  active.set(modpackId, game)
  busy.add(modpackId)

  // An adopted game is by definition past the launching phase, and its existing
  // log is replayed separately (see the ModpackRunning handler) — so its tail
  // starts at the end of the file rather than replaying it line by line.
  if (adopted) sendState({ modpackId, state: 'running' })

  const tail = tailFile(logFile, {
    fromEnd: adopted,
    onLines: (lines) => {
      if (game.state === 'launching') {
        game.state = 'running'
        sendState({ modpackId, state: 'running' })
        // Delay hiding the launcher to the tray. A fast (e.g. vanilla) launch
        // prints its first line almost instantly, so hiding on that line made
        // the window vanish before the game window appeared — and a launch that
        // crashes in the first moments would hide the launcher for no reason.
        // Hide (not close) it, so the app stays alive and window-all-closed
        // does not fire.
        if (getMinimizeToTrayOnLaunch()) {
          game.hideTimer = setTimeout(() => {
            game.hideTimer = null
            if (active.has(modpackId)) getMainWindow()?.hide()
          }, 2000)
        }
      }
      // stdout and stderr share one file, so the streams can no longer be told
      // apart; the renderer only ever displayed the text.
      for (const line of lines) sendLog({ modpackId, stream: 'stdout', line })
    }
  })
  game.stopTail = tail.stop
  game.flushTail = tail.flush

  if (child !== null) {
    child.on('error', (err) => {
      void finishGame(modpackId, { message: err.message })
    })
    child.on('exit', (code) => {
      void finishGame(modpackId, { exitCode: code ?? 0 })
    })
  } else {
    // No child handle to get an exit event from — poll the PID instead. The
    // exit code is unknowable this way; 0 keeps the UI from claiming a crash.
    game.poll = setInterval(() => {
      if (!isProcessAlive(pid)) void finishGame(modpackId, { exitCode: 0 })
    }, ADOPTED_POLL_MS)
  }
}

/**
 * The single exit path for a running game: tears down the timers and the tail,
 * clears the busy/running bookkeeping and reports the result.
 *
 * Reachable twice for the same game (a child's 'exit' can race an adoption
 * poll), hence the `finished` latch.
 */
async function finishGame(
  modpackId: string,
  result: { exitCode?: number; message?: string }
): Promise<void> {
  const game = active.get(modpackId)
  if (game === undefined || game.finished) return
  game.finished = true

  if (game.hideTimer !== null) clearTimeout(game.hideTimer)
  if (game.poll !== null) clearInterval(game.poll)
  // Drain anything written between the last poll and the exit — for a crash
  // that is precisely the interesting part of the log.
  await game.flushTail().catch(() => undefined)
  game.stopTail()

  active.delete(modpackId)
  busy.delete(modpackId)
  await unregisterRunningGame(modpackId)

  if (result.message !== undefined) {
    sendState({ modpackId, state: 'error', message: result.message })
  } else {
    const code = result.exitCode ?? 0
    sendLog({ modpackId, stream: 'system', line: `Game exited with code ${code}` })
    sendState({ modpackId, state: 'exited', exitCode: code })
  }

  // If we hid the launcher to the tray on launch, bring it back when the game
  // exits. Only act on a still-hidden window so we don't steal focus if the
  // user already reopened it from the tray. revealWindow re-activates it
  // properly so Play is clickable immediately (see its note on Windows).
  const win = getMainWindow()
  if (win !== null && !win.isVisible()) revealWindow(win)
}

/**
 * Re-adopt games left running by a previous launcher run.
 *
 * Must complete before the renderer is told what is running and before any
 * launch is allowed, or the user gets a "Play" button for a live game and a
 * second Java process writing into the same instance folder.
 */
async function reconcileRunningGames(): Promise<void> {
  for (const record of await listRunningGames()) {
    if (active.has(record.modpackId)) continue
    const stillOurs =
      getModpack(record.modpackId) !== null && (await verifyGameProcess(record.pid))
    if (!stillOurs) {
      await unregisterRunningGame(record.modpackId)
      continue
    }
    attachGame({
      modpackId: record.modpackId,
      pid: record.pid,
      startedAt: record.startedAt,
      logFile: record.logFile,
      child: null
    })
  }
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

  const logFile = gameLogPath(modpackId)

  const child = await launchGame({
    meta,
    javaPath,
    minecraftRoot: minecraftRoot(),
    gameDir: instanceDirFor(modpack),
    memoryMb: modpack.memoryMb,
    extraJavaArgs: modpack.javaArgs,
    session,
    logFile
  })

  // No pid means the spawn failed outright; the 'error' event carries the
  // reason, but there is nothing to follow or to record on disk.
  const pid = child.pid
  if (pid === undefined) {
    child.once('error', (err) => {
      sendState({ modpackId, state: 'error', message: err.message })
    })
    throw new Error('Failed to start the game process')
  }

  const startedAt = Date.now()
  // Record before attaching: if the launcher dies in the next millisecond, the
  // game is already running and this file is the only way back to it.
  await registerRunningGame({ modpackId, pid, startedAt, logFile })
  updateModpack(modpackId, { lastPlayedAt: startedAt })

  // Last, and nothing may throw after it: the caller's error path clears the
  // busy flag, which from here on belongs to the attached game.
  attachGame({ modpackId, pid, startedAt, logFile, child })
}

export function registerModpackIpc(): void {
  // Reconcile the registry at startup as well as on the first renderer
  // request, so manually deleted instances disappear immediately. Adopting
  // still-running games comes last: it looks modpacks up by id, so the registry
  // has to be settled first.
  const startupReconcile = migrateInstanceDirs()
    .then(() => adoptUnknownInstances())
    .then(() => reconcileRunningGames())
    .catch((err: unknown) => console.error('Modpack reconciliation failed:', err))

  ipcMain.handle(IpcChannel.ModpackList, async (): Promise<Modpack[]> => {
    // Awaited here (not just at startup) so the renderer never sees
    // pre-migration records without dirName.
    await migrateInstanceDirs()
    await adoptUnknownInstances()
    return listModpacks()
  })

  ipcMain.handle(IpcChannel.ModpackRunning, async (): Promise<RunningGame[]> => {
    // Adoption has to finish first, or a launcher that has just started reports
    // nothing running and offers Play for a live game.
    await startupReconcile
    return Promise.all(
      [...active.entries()].map(async ([modpackId, game]) => ({
        modpackId,
        startedAt: game.startedAt,
        state: game.state,
        // Only adopted games (no child handle) need their log replayed. For a
        // game this launcher started, the tail already streams every line as an
        // event, and seeding from the file too would duplicate them.
        recentLogs:
          game.child === null
            ? await readTailLines(game.logFile, ADOPTED_LOG_BYTES, ADOPTED_LOG_LINES)
            : []
      }))
    )
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

  ipcMain.handle(IpcChannel.ModpackExport, async (event, id: string): Promise<boolean> => {
    const modpack = getModpack(id)
    if (modpack === null) throw new Error('Modpack not found')
    if (busy.has(id)) {
      throw new Error('Stop the game and wait for installs to finish before exporting')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Export modpack',
      defaultPath: `${modpack.dirName ?? modpack.name}.mrpack`,
      filters: [
        { name: 'Modrinth modpack', extensions: ['mrpack'] },
        { name: 'Instance zip', extensions: ['zip'] }
      ]
    }
    const { canceled, filePath } =
      win !== null ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (canceled || filePath === undefined || filePath === '') return false

    // Mark busy so rename/delete/launch can't move files out from under the zip.
    busy.add(id)
    try {
      await exportModpack(modpack, filePath)
      return true
    } catch (err) {
      // Don't leave a half-written archive at the user's chosen path.
      await rm(filePath, { force: true }).catch(() => undefined)
      throw err
    } finally {
      busy.delete(id)
    }
  })

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
    const game = active.get(id)
    if (game === undefined) return
    sendLog({ modpackId: id, stream: 'system', line: 'Stopping game…' })
    if (game.child !== null) {
      game.child.kill()
      return
    }
    // Adopted game: no child handle, only a PID.
    try {
      process.kill(game.pid)
    } catch {
      // Already gone — the liveness poll will notice and finish it.
    }
  })

  ipcMain.handle(IpcChannel.ModpackLaunch, async (event, id: string): Promise<void> => {
    // A game adopted from a previous run must be visible in `busy` before the
    // check below, or the same instance folder gets a second Java process.
    await startupReconcile

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
