import { create } from 'zustand'

/** Multi-selection of instances on the Home grid (Ctrl/Shift+click). */
interface SelectionState {
  selected: string[]
  /** Last plainly toggled id — where a Shift+click range starts. */
  anchor: string | null
  /** Flips each id; selects them all unless every one is already selected. */
  toggle: (ids: string[]) => void
  /** Selects `ids` (added to the selection), keeping the anchor. */
  add: (ids: string[]) => void
  remove: (ids: string[]) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: [],
  anchor: null,

  toggle: (ids): void => {
    if (ids.length === 0) return
    const current = new Set(get().selected)
    const allSelected = ids.every((id) => current.has(id))
    for (const id of ids) {
      if (allSelected) current.delete(id)
      else current.add(id)
    }
    set({ selected: [...current], anchor: ids[ids.length - 1] })
  },

  add: (ids): void => {
    const current = new Set(get().selected)
    for (const id of ids) current.add(id)
    set({ selected: [...current] })
  },

  remove: (ids): void => {
    const drop = new Set(ids)
    set({ selected: get().selected.filter((id) => !drop.has(id)) })
  },

  clear: (): void => set({ selected: [], anchor: null })
}))
