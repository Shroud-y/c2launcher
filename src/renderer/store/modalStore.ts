import { create } from 'zustand'
import type { SearchResult } from '@shared/types'

interface ModalState {
  openModpackId: string | null
  isCreateOpen: boolean
  isSettingsOpen: boolean
  /** Custom-theme color editor (opened from the Settings color scheme card). */
  isCustomThemeOpen: boolean
  /** Discover result whose detail modal is open. */
  discoverResult: SearchResult | null
  /** Modpack whose manual-download dialog is open (CurseForge blocked files). */
  manualDownloadsFor: string | null
  openModpack: (id: string) => void
  closeModpack: () => void
  openCreate: () => void
  closeCreate: () => void
  openSettings: () => void
  closeSettings: () => void
  /** Opens the custom-theme editor, hiding Settings behind it. */
  openCustomTheme: () => void
  /** Closes the editor and restores the Settings modal. */
  closeCustomTheme: () => void
  openDiscoverProject: (result: SearchResult) => void
  closeDiscoverProject: () => void
  openManualDownloads: (modpackId: string) => void
  closeManualDownloads: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  openModpackId: null,
  isCreateOpen: false,
  isSettingsOpen: false,
  isCustomThemeOpen: false,
  discoverResult: null,
  manualDownloadsFor: null,
  openModpack: (id): void => set({ openModpackId: id }),
  closeModpack: (): void => set({ openModpackId: null }),
  openCreate: (): void => set({ isCreateOpen: true }),
  closeCreate: (): void => set({ isCreateOpen: false }),
  openSettings: (): void => set({ isSettingsOpen: true }),
  closeSettings: (): void => set({ isSettingsOpen: false }),
  openCustomTheme: (): void => set({ isCustomThemeOpen: true, isSettingsOpen: false }),
  closeCustomTheme: (): void => set({ isCustomThemeOpen: false, isSettingsOpen: true }),
  openDiscoverProject: (result): void => set({ discoverResult: result }),
  closeDiscoverProject: (): void => set({ discoverResult: null }),
  openManualDownloads: (modpackId): void => set({ manualDownloadsFor: modpackId }),
  closeManualDownloads: (): void => set({ manualDownloadsFor: null })
}))
