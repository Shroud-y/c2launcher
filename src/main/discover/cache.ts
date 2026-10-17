/**
 * Small in-memory TTL cache shared by the content providers. Both APIs
 * rate-limit, so read calls (search, project, versions) are cached for
 * 5 minutes; the oldest entry is evicted once the cap is reached.
 */

const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 200

export interface TtlCache<T> {
  get(key: string): T | null
  set(key: string, value: T): void
}

export function makeCache<T>(): TtlCache<T> {
  const entries = new Map<string, { expiresAt: number; value: T }>()
  return {
    get(key: string): T | null {
      const entry = entries.get(key)
      if (entry === undefined) return null
      if (Date.now() > entry.expiresAt) {
        entries.delete(key)
        return null
      }
      return entry.value
    },
    set(key: string, value: T): void {
      if (entries.size >= CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
    }
  }
}
