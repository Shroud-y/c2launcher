import type { ModpackGroup } from './types'

/**
 * Brings a group list into its invariant shape: members must be existing
 * packs, a pack sits in at most one group (first one wins), and groups left
 * with fewer than two members dissolve. Shared so main (on save/delete) and
 * the renderer (optimistic updates) agree on the result.
 */
export function normalizeGroups(groups: ModpackGroup[], packIds: Iterable<string>): ModpackGroup[] {
  const existing = new Set(packIds)
  const taken = new Set<string>()
  const result: ModpackGroup[] = []
  for (const group of groups) {
    const memberIds = group.memberIds.filter((id) => {
      if (!existing.has(id) || taken.has(id)) return false
      taken.add(id)
      return true
    })
    if (memberIds.length < 2) continue
    const name = group.name.trim() === '' ? 'Group' : group.name.trim()
    result.push({ id: group.id, name, memberIds })
  }
  return result
}
