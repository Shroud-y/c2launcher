// Compiles the native splash stub to build/bin/splash.exe.
//
//   pnpm splash:build
//
// The built exe is COMMITTED (build/bin/splash.exe) so that `pnpm dist` works
// on a machine with no compiler. Re-run this and re-commit whenever splash.c,
// splash.rc, or the manifest changes — nothing checks staleness automatically.
//
// Toolchain: Zig (which bundles clang, lld and the mingw-w64 headers, so
// nothing else needs installing). Set ZIG to override the discovered path.
//
// Deliberately `zig cc` and not `zig c++`: the stub uses the GDI+ *flat* C API,
// and `zig c++` would compile libc++ from source on first run for no benefit
// (~4.6MB of nullability warnings and a slow build).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const outDir = join(repoRoot, 'build', 'bin')
const outExe = join(outDir, 'splash.exe')
const resFile = join(here, 'splash.res')

/** Locate zig.exe: $ZIG, then PATH, then the portable extract under LOCALAPPDATA. */
function findZig() {
  if (process.env.ZIG) {
    if (!existsSync(process.env.ZIG)) throw new Error(`ZIG is set but not found: ${process.env.ZIG}`)
    return process.env.ZIG
  }

  try {
    execFileSync('zig', ['version'], { stdio: 'ignore' })
    return 'zig'
  } catch {
    // not on PATH — fall through to the portable install
  }

  const local = process.env.LOCALAPPDATA
  if (local) {
    const base = join(local, 'zig')
    if (existsSync(base)) {
      // The download extracts to a versioned subfolder; accept any of them and
      // also a flattened layout.
      const candidates = [join(base, 'zig.exe')]
      try {
        for (const entry of readdirSync(base)) candidates.push(join(base, entry, 'zig.exe'))
      } catch {
        // unreadable dir — the direct candidate above is still tried
      }
      for (const c of candidates) if (existsSync(c)) return c
    }
  }

  throw new Error(
    'zig not found. Install the portable build (no admin required):\n' +
      '  https://ziglang.org/download/ — extract to %LOCALAPPDATA%\\zig\n' +
      'or set ZIG=<path to zig.exe>.'
  )
}

/**
 * The VERSIONINFO strings in splash.rc must match package.json, or the stub and
 * the Electron binary advertise different versions — exactly the kind of
 * mismatch that makes an unsigned exe spawning another unsigned exe look
 * suspicious to AV heuristics.
 */
function checkVersion() {
  const pkgVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
  const rc = readFileSync(join(here, 'splash.rc'), 'utf8')

  const [major, minor, patch] = pkgVersion.split('.')
  const commaForm = `${major},${minor},${patch},0`
  const dotForm = `${major}.${minor}.${patch}.0`

  const problems = []
  if (!rc.includes(`FILEVERSION ${commaForm}`)) problems.push(`FILEVERSION ${commaForm}`)
  if (!rc.includes(`PRODUCTVERSION ${commaForm}`)) problems.push(`PRODUCTVERSION ${commaForm}`)
  if (!rc.includes(`"FileVersion", "${dotForm}"`)) problems.push(`VALUE "FileVersion", "${dotForm}"`)
  if (!rc.includes(`"ProductVersion", "${dotForm}"`))
    problems.push(`VALUE "ProductVersion", "${dotForm}"`)

  if (problems.length) {
    throw new Error(
      `native/splash/splash.rc is out of sync with package.json (${pkgVersion}).\n` +
        `Expected to find:\n  ${problems.join('\n  ')}`
    )
  }
}

const zig = findZig()
checkVersion()
mkdirSync(outDir, { recursive: true })

// Resource compile. Notes, both learned the hard way:
//  - the flag is /fo and the input file comes LAST; `--output x.res` makes
//    resinator infer "res" as the *input* format and fail.
//  - cwd must be the .rc's own dir or the relative RCDATA/ICON/manifest paths
//    inside it do not resolve.
console.log('splash: compiling resources')
execFileSync(zig, ['rc', '/fo', 'splash.res', 'splash.rc'], { cwd: here, stdio: 'inherit' })

// Link. -municode selects the wide (wWinMain) entry point. The GUI subsystem is
// set through the linker directly: `zig cc` accepts -mwindows but ignores it
// ("argument unused during compilation"), which would leave a console window
// flashing on every launch. -s strips symbols.
console.log('splash: compiling and linking')
execFileSync(
  zig,
  [
    'cc',
    '-O2',
    '-s',
    '-municode',
    '-Wl,--subsystem,windows',
    'splash.c',
    resFile,
    '-lgdiplus',
    '-lgdi32',
    '-luser32',
    '-lole32',
    '-lshlwapi',
    // SHGetFolderPathW (theme cache lookup) and CommandLineToArgvW.
    '-lshell32',
    '-o',
    outExe
  ],
  { cwd: here, stdio: 'inherit' }
)

const { size } = statSync(outExe)
console.log(`splash: built ${outExe} (${(size / 1024).toFixed(1)} KB)`)
console.log('splash: remember to commit build/bin/splash.exe')
