import { execFile } from 'child_process'
import { promisify } from 'util'
import { access, chmod, symlink } from 'fs/promises'
import { join } from 'path'
import { downloadAll, type DownloadTask } from './install'

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
 * Mojang's bundled Java runtimes (the same ones the vanilla launcher
 * ships). The index maps platform → component → manifest; the manifest
 * lists every file of the runtime.
 */
const RUNTIME_INDEX_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

interface RuntimeIndexEntry {
  manifest: { url: string; sha1: string }
  version: { name: string }
}

type RuntimeIndex = Record<string, Record<string, RuntimeIndexEntry[]>>

interface RuntimeFileEntry {
  type: 'file' | 'directory' | 'link'
  executable?: boolean
  target?: string
  downloads?: { raw?: { url: string; sha1: string; size: number } }
}

interface RuntimeManifest {
  files: Record<string, RuntimeFileEntry>
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Java runtime request failed (${res.status}): ${url}`)
  return (await res.json()) as T
}

function runtimePlatformKey(): string {
  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return 'windows-arm64'
    return process.arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  }
  return process.arch === 'ia32' ? 'linux-i386' : 'linux'
}

/**
 * Downloads (or verifies) Mojang's runtime for the given component into
 * <root>/runtimes/<component> and returns the path of its java
 * executable. Existing files are skipped by size, so re-runs are cheap.
 */
export async function ensureMojangRuntime(
  root: string,
  component: string,
  report: (percent: number, message: string) => void
): Promise<string> {
  report(0, `Resolving Java runtime (${component})`)
  const index = await fetchJson<RuntimeIndex>(RUNTIME_INDEX_URL)
  const entries = index[runtimePlatformKey()]?.[component]
  if (entries === undefined || entries.length === 0) {
    throw new Error(`Mojang ships no "${component}" Java runtime for this platform`)
  }

  const manifest = await fetchJson<RuntimeManifest>(entries[0].manifest.url)
  const dir = join(root, 'runtimes', component)

  const tasks: DownloadTask[] = []
  const executables: string[] = []
  const links: { dest: string; target: string }[] = []
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const dest = join(dir, ...rel.split('/'))
    if (entry.type === 'link') {
      if (entry.target !== undefined) links.push({ dest, target: entry.target })
      continue
    }
    const raw = entry.downloads?.raw
    if (entry.type !== 'file' || raw === undefined) continue // directories are implicit
    tasks.push({ url: raw.url, dest, size: raw.size, sha1: raw.sha1 })
    if (entry.executable === true) executables.push(dest)
  }

  await downloadAll(tasks, (done, total) => {
    if (done % 20 === 0 || done === total) {
      report((done / Math.max(total, 1)) * 100, `Java runtime ${done}/${total}`)
    }
  })

  if (!isWindows) {
    for (const file of executables) await chmod(file, 0o755)
    for (const link of links) {
      try {
        await symlink(link.target, link.dest)
      } catch {
        // Already present from a previous run.
      }
    }
  }

  const candidates = [
    join(dir, 'bin', 'javaw.exe'),
    join(dir, 'bin', 'java'),
    join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java')
  ]
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate
  }
  throw new Error('Downloaded Java runtime is missing its executable')
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
