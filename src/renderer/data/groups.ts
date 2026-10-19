import type { ModpackGroup } from '@shared/types'

// Pure edits of the group list for drag & drop. Results still go through
// normalizeGroups (in the store), which prunes groups left with one member.

/** Takes `packId` out of whatever group holds it. */
export function ungroupPack(groups: ModpackGroup[], packId: string): ModpackGroup[] {
  return groups.map((g) =>
    g.memberIds.includes(packId) ? { ...g, memberIds: g.memberIds.filter((id) => id !== packId) } : g
  )
}

/** Moves `packId` into the group `groupId` (out of any other group first). */
export function addToGroup(groups: ModpackGroup[], groupId: string, packId: string): ModpackGroup[] {
  const target = groups.find((g) => g.id === groupId)
  if (target === undefined || target.memberIds.includes(packId)) return groups
  return ungroupPack(groups, packId).map((g) =>
    g.id === groupId ? { ...g, memberIds: [...g.memberIds, packId] } : g
  )
}

/**
 * Dropping `packId` onto `targetId`: joins the target's group, or forms a new
 * group of the two when the target is ungrouped.
 */
export function groupWith(groups: ModpackGroup[], targetId: string, packId: string): ModpackGroup[] {
  if (targetId === packId) return groups
  const existing = groups.find((g) => g.memberIds.includes(targetId))
  if (existing !== undefined) return addToGroup(groups, existing.id, packId)
  const group: ModpackGroup = {
    id: crypto.randomUUID(),
    name: nextGroupName(groups),
    memberIds: [targetId, packId]
  }
  return [...ungroupPack(groups, packId), group]
}

export function renameGroup(groups: ModpackGroup[], groupId: string, name: string): ModpackGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g))
}

export function dissolveGroup(groups: ModpackGroup[], groupId: string): ModpackGroup[] {
  return groups.filter((g) => g.id !== groupId)
}

function nextGroupName(groups: ModpackGroup[]): string {
  const names = new Set(groups.map((g) => g.name))
  let n = 1
  while (names.has(`Group ${n}`)) n++
  return `Group ${n}`
}
