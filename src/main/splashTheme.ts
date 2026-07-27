// Theme cache for the native splash stub.
//
// The stub (native/splash/splash.c) paints before Electron exists, so it can
// never be told the current theme — the choice lives in renderer localStorage,
// behind Chromium, which is precisely the thing that has not started yet. The
// only way it can be themed at all is to leave the last known colours on disk
// where a 500-line C program can read them at startup. A theme change is
// therefore visible on the *next* launch, and the very first launch after
// install always uses the stub's compiled-in defaults.
//
// PATH IS A CONTRACT: the stub hardcodes
// %APPDATA%\c2launcher\splash-theme, which is this path only because
// src/main/index.ts pins userData to <appData>/c2launcher. Moving either side
// silently drops the stub back to its defaults — there is no error to see,
// because a missing file is a legitimate first-run state.
//
// FORMAT IS A CONTRACT TOO: `key=rrggbb` lines, no `#`, no spaces. Changing it
// means rebuilding and re-committing build/bin/splash.exe. Nothing detects
// staleness here (the version guard in native/splash/build.mjs only covers
// VERSIONINFO), so a mismatch shows up as a splash that quietly stopped
// following the theme.

import { app } from 'electron'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'
import type { SplashTheme } from '@shared/types'

/** Order is irrelevant to the parser; this is just what gets written. */
const KEYS: (keyof SplashTheme)[] = ['bg', 'panel', 'accent', 'muted', 'hover', 'border']

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function splashThemePath(): string {
  return join(app.getPath('userData'), 'splash-theme')
}

/**
 * Persist the colours the splash should use next time.
 *
 * Rejects anything that is not a plain 6-digit hex colour rather than writing
 * it: the renderer derives some palette entries with `color-mix()`, and a
 * half-understood file is worse than none — the stub would fall back per-key
 * and paint a mix of the theme and its defaults.
 */
export async function writeSplashTheme(theme: SplashTheme): Promise<void> {
  const lines: string[] = []
  for (const key of KEYS) {
    const value = theme[key]
    if (typeof value !== 'string' || !HEX_RE.test(value)) {
      throw new Error(`splash theme: "${key}" is not a #rrggbb colour: ${String(value)}`)
    }
    lines.push(`${key}=${value.slice(1).toLowerCase()}`)
  }

  // Write-then-rename: the stub reads this file on its startup hot path with no
  // locking, and a torn read would leave it painting half a theme.
  const dest = splashThemePath()
  const tmp = `${dest}.tmp`
  await writeFile(tmp, `${lines.join('\n')}\n`, 'utf8')
  await rename(tmp, dest)
}
