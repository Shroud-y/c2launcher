// Persistent registry of games that are currently running.
//
// The game is spawned detached (see launch.ts), so it deliberately outlives the
// launcher. That means the in-memory Map in ipc/modpacks.ts is no longer the
// whole truth: after a launcher crash or a plain quit, a live Java process can
// still own an instance folder while nothing in the process knows about it.
// Without a record on disk the next start would show "Play", and a second
// launch would write into the same instance directory as the running game —
// corrupted worlds.
//
// So every launch leaves a record here, and startup re-adopts whatever is still
// alive.

import { app } from 'electron'
import { execFile } from 'child_process'
import { readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface RunningGameRecord {
  modpackId: string
  /** PID of the spawned Java process. */
  pid: number
  startedAt: number
  /** Absolute path of the file the game's stdout/stderr is redirected to. */
  logFile: string
}

type Registry = Record<string, RunningGameRecord>

function registryPath(): string {
  return join(app.getPath('userData'), 'running-games.json')
}

/**
 * Where a modpack's game output goes. One file per modpack, truncated on each
 * launch, so the logs cannot grow without bound.
 *
 * Deliberately under userData and not the data dir: the data dir is
 * user-movable, and a log file open by a live game would block the move.
 */
export function gameLogPath(modpackId: string): string {
  return join(app.getPath('userData'), 'gamelogs', `${modpackId}.log`)
}

async function readRegistry(): Promise<Registry> {
  try {
    const raw = await readFile(registryPath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Registry = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue
      const rec = value as Partial<RunningGameRecord>
      if (typeof rec.pid !== 'number' || typeof rec.logFile !== 'string') continue
      out[id] = {
        modpackId: id,
        pid: rec.pid,
        startedAt: typeof rec.startedAt === 'number' ? rec.startedAt : Date.now(),
        logFile: rec.logFile
      }
    }
    return out
  } catch {
    // Missing file is the normal "nothing running" state; a corrupt one is
    // recoverable by starting over, which is strictly better than refusing to
    // launch anything.
    return {}
  }
}

// All writers go through this queue. Two games exiting at the same moment would
// otherwise read the same registry and each write back a copy missing the
// other's change.
let writeQueue: Promise<void> = Promise.resolve()

function enqueue(mutate: (registry: Registry) => void): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const registry = await readRegistry()
    mutate(registry)
    // Write-then-rename: startup reads this without locking, and a torn read
    // would drop live games back to "not running" — the exact bug this file
    // exists to prevent.
    const dest = registryPath()
    const tmp = `${dest}.tmp`
    await writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8')
    await rename(tmp, dest)
  })
  // Keep the chain alive after a failure, and never let a write reject into an
  // unhandled rejection — a lost record is not worth taking the app down.
  const current = writeQueue.catch((err: unknown) => {
    console.error('running-games registry write failed:', err)
  })
  writeQueue = current
  return current
}

export function registerRunningGame(record: RunningGameRecord): Promise<void> {
  return enqueue((registry) => {
    registry[record.modpackId] = record
  })
}

export function unregisterRunningGame(modpackId: string): Promise<void> {
  return enqueue((registry) => {
    delete registry[modpackId]
  })
}

export async function listRunningGames(): Promise<RunningGameRecord[]> {
  return Object.values(await readRegistry())
}

/**
 * Cheap liveness check, safe to call on a timer: signal 0 only probes for the
 * process's existence. Says nothing about *which* process it is — see
 * verifyGameProcess for that.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means it exists but belongs to someone else — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Liveness check plus an identity check, for adopting a record written by a
 * previous launcher run. PIDs are recycled: a record left behind by a game that
 * exited while the launcher was closed could point at an unrelated process, and
 * adopting it would show a phantom running game whose Stop button kills
 * something else. Confirming the image is a Java runtime makes that
 * vanishingly unlikely.
 */
export async function verifyGameProcess(pid: number): Promise<boolean> {
  if (!isProcessAlive(pid)) return false
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/NH', '/FO', 'CSV', '/FI', `PID eq ${pid}`],
        { windowsHide: true }
      )
      // tasklist prints an "INFO: No tasks..." line (not CSV) when nothing matches.
      const name = /^"([^"]+)"/.exec(stdout.trim())?.[1]?.toLowerCase()
      return name === 'javaw.exe' || name === 'java.exe'
    }
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='])
    return /(^|\/)java$/.test(stdout.trim())
  } catch {
    // The process vanished between the two checks, or the tool is unavailable.
    // Refusing to adopt is the safe direction: worst case the user sees "Play"
    // for a game that is actually running, instead of a Stop button aimed at an
    // unknown process.
    return false
  }
}
