import { createReadStream } from 'fs'

/**
 * CurseForge file fingerprint: MurmurHash2 (32-bit, seed 1) over the file
 * with all whitespace bytes (tab, LF, CR, space) removed. This is what
 * POST /fingerprints matches against `fileFingerprint`.
 *
 * MurmurHash2 mixes the total length into its initial state, so the file
 * is streamed twice: once to count the normalized bytes, once to hash.
 * Streaming keeps memory flat for large jars; the second pass is served
 * from the OS cache.
 */

const SEED = 1
const M = 0x5bd1e995

function isWhitespace(b: number): boolean {
  return b === 9 || b === 10 || b === 13 || b === 32
}

async function normalizedLength(path: string): Promise<number> {
  let length = 0
  for await (const chunk of createReadStream(path)) {
    const buf = chunk as Buffer
    for (let i = 0; i < buf.length; i += 1) if (!isWhitespace(buf[i])) length += 1
  }
  return length
}

export async function cfFingerprintOfFile(path: string): Promise<number> {
  let h = (SEED ^ (await normalizedLength(path))) >>> 0
  // Little-endian 4-byte word being assembled across chunk boundaries.
  let word = 0
  let filled = 0
  for await (const chunk of createReadStream(path)) {
    const buf = chunk as Buffer
    for (let i = 0; i < buf.length; i += 1) {
      const b = buf[i]
      if (isWhitespace(b)) continue
      word |= b << (8 * filled)
      filled += 1
      if (filled === 4) {
        let k = Math.imul(word, M)
        k ^= k >>> 24
        k = Math.imul(k, M)
        h = Math.imul(h, M) ^ k
        word = 0
        filled = 0
      }
    }
  }
  // Tail: the 1–3 leftover bytes, already in little-endian order.
  if (filled > 0) {
    h ^= word
    h = Math.imul(h, M)
  }
  h ^= h >>> 13
  h = Math.imul(h, M)
  h ^= h >>> 15
  return h >>> 0
}
