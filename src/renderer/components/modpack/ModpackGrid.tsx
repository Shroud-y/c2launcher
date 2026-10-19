import { Fragment, useMemo, useState } from 'react'
import ModpackCard, { EmptyCard } from './ModpackCard'
import { GroupPanel, GroupTile } from './ModpackGroup'
import { addToGroup, dissolveGroup, groupWith, renameGroup, ungroupPack } from '../../data/groups'
import { useModpackStore } from '../../store/modpackStore'
import { useSelectionStore } from '../../store/selectionStore'
import type { IconTint, Modpack, ModpackGroup } from '@shared/types'
import styles from './ModpackGrid.module.css'

interface ModpackGridProps {
  modpacks: Modpack[]
  /** Cells to fill with placeholders when there are fewer tiles. */
  minSlots?: number
}

// Tint derived from grid position so colors stay consistent (and recompute
// when an instance is deleted) instead of sticking to a stored value.
const TINT_CYCLE: IconTint[] = ['teal', 'mint', 'light']
const COLS = 2

const tintAt = (i: number): IconTint => TINT_CYCLE[Math.floor(i / COLS) % TINT_CYCLE.length]

type GridItem =
  { kind: 'pack'; pack: Modpack } | { kind: 'group'; group: ModpackGroup; members: Modpack[] }

/**
 * Packs in registry order, with each group collapsed into one tile at the
 * position of its earliest member.
 */
function buildItems(modpacks: Modpack[], groups: ModpackGroup[]): GridItem[] {
  const byId = new Map(modpacks.map((m) => [m.id, m]))
  const groupOf = new Map<string, ModpackGroup>()
  for (const g of groups) for (const id of g.memberIds) groupOf.set(id, g)

  const items: GridItem[] = []
  const emitted = new Set<string>()
  for (const pack of modpacks) {
    const group = groupOf.get(pack.id)
    if (group === undefined) {
      items.push({ kind: 'pack', pack })
    } else if (!emitted.has(group.id)) {
      emitted.add(group.id)
      const members = group.memberIds.flatMap((id) => byId.get(id) ?? [])
      items.push({ kind: 'group', group, members })
    }
  }
  return items
}

export default function ModpackGrid({ modpacks, minSlots = 0 }: ModpackGridProps): JSX.Element {
  const groups = useModpackStore((s) => s.groups)
  const saveGroups = useModpackStore((s) => s.saveGroups)
  const selected = useSelectionStore((s) => s.selected)
  const toggle = useSelectionStore((s) => s.toggle)
  const addSelection = useSelectionStore((s) => s.add)

  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  // The pack being dragged (dataTransfer can't be read during dragover) and
  // the key of the drop target under the cursor, for highlighting.
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const items = useMemo(() => buildItems(modpacks, groups), [modpacks, groups])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const groupOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) for (const id of g.memberIds) map.set(id, g.id)
    return map
  }, [groups])

  // On-screen order of every pack (group members in place), for Shift ranges.
  const flatOrder = useMemo(
    () => items.flatMap((it) => (it.kind === 'pack' ? [it.pack.id] : it.members.map((m) => m.id))),
    [items]
  )

  /** Ctrl+click toggles `ids`; Shift+click adds the range from the anchor. */
  const select = (ids: string[], e: React.MouseEvent): void => {
    const anchor = useSelectionStore.getState().anchor
    const from = anchor === null ? -1 : flatOrder.indexOf(anchor)
    if (e.shiftKey && from !== -1) {
      const at = ids.map((id) => flatOrder.indexOf(id))
      const lo = Math.min(from, ...at)
      const hi = Math.max(from, ...at)
      addSelection(flatOrder.slice(lo, hi + 1))
    } else {
      toggle(ids)
    }
  }

  const endDrag = (): void => {
    setDragId(null)
    setOver(null)
  }

  const dragSource = (id: string): React.HTMLAttributes<HTMLElement> => ({
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      setDragId(id)
    },
    onDragEnd: endDrag
  })

  /** Drop-target handlers; events a target rejects bubble to its parent. */
  const dropTarget = <T extends HTMLElement>(
    key: string,
    canDrop: (dragged: string) => boolean,
    onDrop: (dragged: string) => ModpackGroup[]
  ): React.HTMLAttributes<T> => ({
    onDragOver: (e) => {
      if (dragId === null || !canDrop(dragId)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setOver(key)
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setOver((o) => (o === key ? null : o))
    },
    onDrop: (e) => {
      if (dragId === null || !canDrop(dragId)) return
      e.preventDefault()
      e.stopPropagation()
      const next = onDrop(dragId)
      endDrag()
      if (next !== groups) void saveGroups(next)
    }
  })

  const renderCard = (pack: Modpack, tint: IconTint): JSX.Element => {
    const key = `pack:${pack.id}`
    return (
      <ModpackCard
        key={pack.id}
        modpack={pack}
        tint={tint}
        selected={selectedSet.has(pack.id)}
        dropTarget={over === key}
        onModifierClick={(e) => select([pack.id], e)}
        dragProps={{
          ...dragSource(pack.id),
          ...dropTarget<HTMLButtonElement>(
            key,
            // Same-group drops fall through to the panel (a no-op there).
            (dragged) =>
              dragged !== pack.id &&
              (groupOf.get(pack.id) === undefined || groupOf.get(dragged) !== groupOf.get(pack.id)),
            (dragged) => groupWith(groups, pack.id, dragged)
          )
        }}
      />
    )
  }

  // The open group's panel spans a full row right below the tile's row.
  const openIndex = items.findIndex((it) => it.kind === 'group' && it.group.id === openGroupId)
  const panelAfter =
    openIndex === -1 ? -1 : Math.min(items.length - 1, openIndex - (openIndex % COLS) + COLS - 1)
  const openItem = openIndex === -1 ? null : items[openIndex]

  const emptySlots = Math.max(0, minSlots - items.length)
  // When the tile sits in the last row, finish that row with placeholders
  // before the panel so the cells beside the tile don't go blank.
  const panelAtEnd = panelAfter !== -1 && panelAfter === items.length - 1
  const fillBefore = panelAtEnd ? Math.min(emptySlots, (COLS - (items.length % COLS)) % COLS) : 0

  const panel =
    openItem !== null && openItem.kind === 'group' ? (
      <GroupPanel
        key={`panel-${openItem.group.id}`}
        group={openItem.group}
        dropTarget={
          over === `panel:${openItem.group.id}` &&
          dragId !== null &&
          groupOf.get(dragId) !== openItem.group.id
        }
        onRename={(name) => void saveGroups(renameGroup(groups, openItem.group.id, name))}
        onDissolve={() => {
          setOpenGroupId(null)
          void saveGroups(dissolveGroup(groups, openItem.group.id))
        }}
        onClose={() => setOpenGroupId(null)}
        dropProps={dropTarget<HTMLDivElement>(
          `panel:${openItem.group.id}`,
          () => true,
          (dragged) => addToGroup(groups, openItem.group.id, dragged)
        )}
      >
        <div className={styles.grid}>
          {openItem.members.map((m, j) => renderCard(m, tintAt(j)))}
        </div>
      </GroupPanel>
    ) : null

  return (
    <div
      className={styles.grid}
      // Dropping a member anywhere outside its group takes it out.
      {...dropTarget<HTMLDivElement>(
        'grid',
        (dragged) => groupOf.has(dragged),
        (dragged) => ungroupPack(groups, dragged)
      )}
    >
      {items.map((item, i) => (
        <Fragment key={item.kind === 'pack' ? item.pack.id : item.group.id}>
          {item.kind === 'pack' ? (
            renderCard(item.pack, tintAt(i))
          ) : (
            <GroupTile
              group={item.group}
              members={item.members}
              tint={tintAt(i)}
              open={item.group.id === openGroupId}
              selected={item.members.length > 0 && item.members.every((m) => selectedSet.has(m.id))}
              dropTarget={over === `group:${item.group.id}`}
              onToggleOpen={() =>
                setOpenGroupId((id) => (id === item.group.id ? null : item.group.id))
              }
              onModifierClick={(e) =>
                select(
                  item.members.map((m) => m.id),
                  e
                )
              }
              dropProps={dropTarget<HTMLButtonElement>(
                `group:${item.group.id}`,
                (dragged) => groupOf.get(dragged) !== item.group.id,
                (dragged) => addToGroup(groups, item.group.id, dragged)
              )}
            />
          )}
          {i === panelAfter && !panelAtEnd && panel}
        </Fragment>
      ))}
      {Array.from({ length: fillBefore }, (_, i) => (
        <EmptyCard key={`empty-${i}`} />
      ))}
      {panelAtEnd && panel}
      {Array.from({ length: emptySlots - fillBefore }, (_, i) => (
        <EmptyCard key={`empty-${i + fillBefore}`} />
      ))}
    </div>
  )
}
