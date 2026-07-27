// Follow a growing log file.
//
// The game's stdout/stderr goes to a file rather than a pipe (see launch.ts),
// so this is how the launcher gets the lines it shows in the log viewer. It has
// to work for a file the launcher did not open — after a restart we adopt a
// game that some previous launcher run spawned.
//
// Polling rather than fs.watch: on Windows fs.watch reports changes for a file
// being appended to unreliably (the directory entry's size is not refreshed on
// every write), and a missed event would silently freeze the log viewer.

import { open, stat } from 'fs/promises'

const POLL_MS = 500

export interface TailOptions {
  /** Start at the current end of the file, skipping existing content. */
  fromEnd: boolean
  onLines: (lines: string[]) => void
}

export interface Tail {
  stop: () => void
  /**
   * Read once, right now. Called when the game exits: the process can write its
   * last lines and die inside a single poll interval, and stopping the tail on
   * the exit event would drop exactly the crash output the user needs.
   */
  flush: () => Promise<void>
}

/** Follow `path`, calling `onLines` with complete lines. */
export function tailFile(path: string, options: TailOptions): Tail {
  let offset = 0
  let carry = ''
  let stopped = false
  let started = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function poll(): Promise<void> {
    let size: number
    try {
      ;({ size } = await stat(path))
    } catch {
      // Not created yet, or deleted underneath us. Keep polling: the game may
      // still be starting, and a deleted file is not a reason to stop showing
      // whatever it writes next.
      return
    }

    if (!started) {
      started = true
      if (options.fromEnd) offset = size
    }

    // Truncated (a relaunch reopened it with 'w') — start over from the top.
    if (size < offset) {
      offset = 0
      carry = ''
    }
    if (size === offset) return

    const handle = await open(path, 'r')
    try {
      const length = size - offset
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      offset += bytesRead
      // A multi-byte character can straddle the read boundary; decoding the
      // carry together with the new bytes on the next pass is not possible once
      // it is a string, so accept the rare replacement char rather than hold a
      // decoder here — game logs are overwhelmingly ASCII.
      const text = carry + buffer.subarray(0, bytesRead).toString('utf8')
      const parts = text.split(/\r?\n/)
      // The last element is whatever comes before the next newline — hold it
      // back so half a line is never shown.
      carry = parts.pop() ?? ''
      const lines = parts.filter((line) => line.trim() !== '')
      if (lines.length > 0 && !stopped) options.onLines(lines)
    } finally {
      await handle.close()
    }
  }

  // Serialise every read. flush() can land on top of a scheduled poll, and two
  // concurrent passes would each read from the same offset and emit the same
  // lines twice.
  let inFlight: Promise<void> = Promise.resolve()
  function runPoll(): Promise<void> {
    inFlight = inFlight.then(poll).catch(() => undefined)
    return inFlight
  }

  function schedule(): void {
    timer = setTimeout(() => {
      void runPoll().finally(() => {
        if (!stopped) schedule()
      })
    }, POLL_MS)
  }

  // First pass immediately, so a fresh launch does not sit silent for the first
  // poll interval.
  void runPoll().finally(() => {
    if (!stopped) schedule()
  })

  return {
    stop: () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
    flush: () => runPoll()
  }
}

/**
 * The last lines of a file, for seeding the log viewer when a running game is
 * adopted after a launcher restart — its tail starts at the end of the file, so
 * without this the viewer would be empty until the game printed something new.
 */
export async function readTailLines(
  path: string,
  maxBytes: number,
  maxLines: number
): Promise<string[]> {
  try {
    const { size } = await stat(path)
    const start = Math.max(0, size - maxBytes)
    const handle = await open(path, 'r')
    try {
      const length = size - start
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buffer, 0, length, start)
      const text = buffer.subarray(0, bytesRead).toString('utf8')
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
      // Drop the first line when we cut into the middle of one.
      if (start > 0) lines.shift()
      return lines.slice(-maxLines)
    } finally {
      await handle.close()
    }
  } catch {
    return []
  }
}
