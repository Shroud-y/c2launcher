// electron-builder afterPack hook: put the native splash stub in front of the
// Electron binary.
//
//   C² Launcher.exe      →  C² Launcher.bin.exe   (the real Electron binary)
//   build/bin/splash.exe →  C² Launcher.exe       (the stub the user launches)
//
// Why swap rather than add a second exe: the NSIS Start Menu / desktop
// shortcuts, the uninstaller, and electron-updater's --force-run relaunch all
// reference ${PRODUCT_FILENAME}.exe. Taking over that filename means every one
// of those paths gets the splash for free, with zero NSIS changes.
//
// This runs before NSIS packs the app and before the blockmap is computed, so
// the stub ships in the installer and in differential update payloads.
// build/installer.nsh's customRemoveFiles already does Delete "$INSTDIR\*.exe",
// which covers both binaries on uninstall.
//
// Do NOT set `executableName` in electron-builder.yml to achieve this — that
// changes what the shortcuts point at, which defeats the whole trick.

const { existsSync, copyFileSync, renameSync, statSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  // Windows-only: the stub is a Win32 PE. Other platforms pack unchanged.
  if (context.electronPlatformName !== 'win32') return

  const productFilename = context.packager.appInfo.productFilename // "C² Launcher"
  const outDir = context.appOutDir

  const realExe = join(outDir, `${productFilename}.exe`)
  const renamedExe = join(outDir, `${productFilename}.bin.exe`)
  const stub = join(__dirname, '..', 'build', 'bin', 'splash.exe')

  if (!existsSync(stub)) {
    throw new Error(
      `afterPack: splash stub missing at ${stub}\n` +
        'Build it with `pnpm splash:build` (requires Zig) and commit build/bin/splash.exe.'
    )
  }

  if (!existsSync(realExe)) {
    throw new Error(`afterPack: expected Electron binary not found at ${realExe}`)
  }

  // Guard against a rerun over an already-swapped directory: if .bin.exe
  // exists, the current .exe is already the stub and renaming again would
  // bury the real binary.
  if (existsSync(renamedExe)) {
    throw new Error(
      `afterPack: ${renamedExe} already exists — the output dir looks already swapped. ` +
        'Delete dist/ and repack.'
    )
  }

  renameSync(realExe, renamedExe)
  copyFileSync(stub, realExe)

  const stubKb = (statSync(realExe).size / 1024).toFixed(1)
  console.log(
    `  • splash stub installed  ${productFilename}.exe (${stubKb} KB) → spawns ${productFilename}.bin.exe`
  )
}
