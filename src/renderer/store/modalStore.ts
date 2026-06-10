import { create } from 'zustand'

interface ModalState {
  openModpackId: string | null
  openModpack: (id: string) => void
  closeModpack: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  openModpackId: null,
  openModpack: (id): void => set({ openModpackId: id }),
  closeModpack: (): void => set({ openModpackId: null })
}))
