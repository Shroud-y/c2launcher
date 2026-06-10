import { create } from 'zustand'

interface ModalState {
  openModpackId: string | null
  isCreateOpen: boolean
  openModpack: (id: string) => void
  closeModpack: () => void
  openCreate: () => void
  closeCreate: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  openModpackId: null,
  isCreateOpen: false,
  openModpack: (id): void => set({ openModpackId: id }),
  closeModpack: (): void => set({ openModpackId: null }),
  openCreate: (): void => set({ isCreateOpen: true }),
  closeCreate: (): void => set({ isCreateOpen: false })
}))
