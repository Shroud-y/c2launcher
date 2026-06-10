import { execFile } from 'child_process'
import { promisify } from 'util'
import { access } from 'fs/promises'
import { join } from 'path'

const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Locates a Java executable: JAVA_HOME first, then PATH.
 * Returns null when none is found — the caller surfaces the error.
 */
export async function findJava(): Promise<string | null> {
  const exe = isWindows ? 'javaw.exe' : 'java'

  const javaHome = process.env['JAVA_HOME']
  if (javaHome !== undefined && javaHome !== '') {
    const candidate = join(javaHome, 'bin', exe)
    if (await exists(candidate)) return candidate
  }

  try {
    const lookup = isWindows ? ['where', [exe]] : ['which', ['java']]
    const { stdout } = await execFileAsync(lookup[0] as string, lookup[1] as string[])
    const first = stdout.split(/\r?\n/).find((l) => l.trim() !== '')
    if (first !== undefined) return first.trim()
  } catch {
    // not on PATH
  }
  return null
}
