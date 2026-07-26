// Electron side of the native splash handoff.
//
// In packaged builds the exe the user launches is a tiny native stub
// (native/splash/splash.c, swapped in by scripts/afterPack.cjs). It paints a
// loading window immediately — something Electron cannot do, because nothing
// renders until Chromium is up — then spawns this process with two flags:
//
//   --splash-ready-file=<path>   create it to make the splash close
//   --splash-status-file=<path>  write one line to show it under the wordmark
//
// The contract that matters: the ready-file MUST be written on every exit path,
// success or failure. If it never appears the user stares at a splash in front
// of nothing until the stub's 120s watchdog fires. Hence signalReady() is
// called from ready-to-show, from did-fail-load, from a startup throw, and from
// the second-instance path.

import { app } from 'electron'
import { existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

/** The prefix every flag in this protocol shares. */
const SPLASH_FLAG_PREFIX = '--splash-'

/**
 * Reads a `--flag=value` style switch out of argv, taking the LAST match.
 * A relaunch could in principle carry a stale flag ahead of the fresh one;
 * the most recent wins.
 */
function argValue(flag: string): string | null {
  const prefix = `${flag}=`
  let found: string | null = null
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      const value = arg.slice(prefix.length)
      if (value) found = value
    }
  }
  return found
}

const readyFile = argValue('--splash-ready-file')
const statusFile = argValue('--splash-status-file')

let readySignalled = false

/**
 * Tell the splash it can close. Safe to call repeatedly and from any startup
 * path; only the first call does anything.
 *
 * Never throws: a failure here must not be able to take down startup, since it
 * is called from error handlers. Worst case the splash waits out its watchdog.
 */
export function signalSplashReady(): void {
  if (readySignalled || !readyFile) return
  readySignalled = true
  try {
    writeFileSync(readyFile, '1')
  } catch {
    // Splash falls back to its own watchdog; nothing useful to do here.
  }
}

/**
 * Show a line of progress on the splash. Used for the slow startup work that
 * happens before any window exists — chiefly the data-dir migration, which can
 * copy multiple GB and is exactly when a user would otherwise assume a hang.
 *
 * No-ops once the splash has been told to close, and when not launched from the
 * stub (dev, or the Electron binary run directly).
 */
export function setSplashStatus(text: string): void {
  if (readySignalled || !statusFile) return
  try {
    writeFileSync(statusFile, `${text}\n`)
  } catch {
    // Cosmetic only.
  }
}

/** True when this process was started by the splash stub. */
export function launchedFromSplash(): boolean {
  return readyFile !== null
}

/**
 * Restart the app, going back through the splash stub when there is one.
 *
 * Two things a bare `app.relaunch()` gets wrong in a packaged build:
 *
 *  1. `process.execPath` is the renamed Electron binary
 *     ("C² Launcher.bin.exe"), so relaunching it directly skips the splash —
 *     precisely the wrong moment to skip it, since every caller here has just
 *     finished moving game data and the restart is the slow part.
 *  2. The default relaunch args are `process.argv.slice(1)`, which still carry
 *     this process's `--splash-*` flags. Those temp paths are deleted when the
 *     current stub exits, so the fresh stub's flags would be competing with
 *     dead ones.
 *
 * Falls back to a plain relaunch in dev, or if the stub is not found beside the
 * binary (e.g. the .bin.exe was launched directly).
 */
export function relaunchApp(): void {
  // Strip our own protocol flags; the new stub supplies its own.
  const args = process.argv.slice(1).filter((arg) => !arg.startsWith(SPLASH_FLAG_PREFIX))

  const exe = process.execPath
  // "C² Launcher.bin.exe" → "C² Launcher.exe"
  const stubName = basename(exe).replace(/\.bin\.exe$/i, '.exe')
  const stub = join(dirname(exe), stubName)

  if (app.isPackaged && stubName !== basename(exe) && existsSync(stub)) {
    app.relaunch({ execPath: stub, args })
    return
  }

  app.relaunch({ args })
}
