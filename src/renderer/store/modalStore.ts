import { create } from 'zustand'
import type { SearchResult } from '@shared/types'

interface ModalState {
  openModpackId: string | null
  isCreateOpen: boolean
  isSettingsOpen: boolean
  /** Discover result whose detail modal is open. */
  discoverResult: SearchResult | null
  openModpack: (id: string) => void
  closeModpack: () => void
  openCreate: () => void
  closeCreate: () => void
  openSettings: () => void
  closeSettings: () => void
  openDiscoverProject: (result: SearchResult) => void
  closeDiscoverProject: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  openModpackId: null,
  isCreateOpen: false,
  isSettingsOpen: false,
  discoverResult: null,
  openModpack: (id): void => set({ openModpackId: id }),
  closeModpack: (): void => set({ openModpackId: null }),
  openCreate: (): void => set({ isCreateOpen: true }),
  closeCreate: (): void => set({ isCreateOpen: false }),
  openSettings: (): void => set({ isSettingsOpen: true }),
  closeSettings: (): void => set({ isSettingsOpen: false }),
  openDiscoverProject: (result): void => set({ discoverResult: result }),
  closeDiscoverProject: (): void => set({ discoverResult: null })
}))
