import { create } from 'zustand'
import type { SearchResult } from '@shared/types'

interface ModalState {
  openModpackId: string | null
  isCreateOpen: boolean
  isSettingsOpen: boolean
  /** Account manager (gear next to the account in the right panel). */
  isAccountsOpen: boolean
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
  openAccounts: () => void
  closeAccounts: () => void
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
  isAccountsOpen: false,
  isCustomThemeOpen: false,
  discoverResult: null,
  manualDownloadsFor: null,
  openModpack: (id): void => set({ openModpackId: id }),
  closeModpack: (): void => set({ openModpackId: null }),
  openCreate: (): void => set({ isCreateOpen: true }),
  closeCreate: (): void => set({ isCreateOpen: false }),
  openSettings: (): void => set({ isSettingsOpen: true }),
  closeSettings: (): void => set({ isSettingsOpen: false }),
  openAccounts: (): void => set({ isAccountsOpen: true }),
  closeAccounts: (): void => set({ isAccountsOpen: false }),
  openCustomTheme: (): void => set({ isCustomThemeOpen: true, isSettingsOpen: false }),
  closeCustomTheme: (): void => set({ isCustomThemeOpen: false, isSettingsOpen: true }),
  openDiscoverProject: (result): void => set({ discoverResult: result }),
  closeDiscoverProject: (): void => set({ discoverResult: null }),
  openManualDownloads: (modpackId): void => set({ manualDownloadsFor: modpackId }),
  closeManualDownloads: (): void => set({ manualDownloadsFor: null })
}))
