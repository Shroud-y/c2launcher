import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Windows hybrid-graphics laptops assign a GPU per executable, and an
 * unknown javaw.exe defaults to the power-saving (integrated) GPU — so
 * Minecraft never touches the dedicated card. Windows stores per-exe
 * choices under this registry key; the Graphics settings UI writes the
 * exact same values. We mirror that so the preference follows whatever
 * Java the launcher actually spawns (bundled runtime paths change between
 * versions, so a one-time manual setting would silently stop applying).
 *
 *   value name = full path to the exe
 *   value data = "GpuPreference=2;"   (0 = let Windows decide,
 *                                       1 = power saving,
 *                                       2 = high performance)
 *
 * Best-effort and Windows-only: any failure is swallowed so it can never
 * block a launch. HKCU needs no elevation.
 */
const GPU_PREF_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'

export async function setHighPerformanceGpu(exePath: string): Promise<void> {
  if (process.platform !== 'win32' || exePath === '') return
  try {
    await execFileAsync('reg', [
      'add',
      GPU_PREF_KEY,
      '/v',
      exePath,
      '/t',
      'REG_SZ',
      '/d',
      'GpuPreference=2;',
      '/f'
    ])
  } catch {
    // Registry unavailable / locked down — fall back to whatever GPU
    // Windows would pick on its own.
  }
}
