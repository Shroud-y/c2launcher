import { create } from 'zustand'

interface UpdateState {
  /** A newer release exists (set from the main-process launch check). */
  available: boolean
  version: string | null
  /** User clicked Update — the installer is being fetched. */
  downloading: boolean
  percent: number
  setAvailable: (version: string) => void
  setProgress: (percent: number) => void
  install: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: false,
  version: null,
  downloading: false,
  percent: 0,
  setAvailable: (version): void => set({ available: true, version }),
  setProgress: (percent): void => set({ downloading: true, percent }),
  install: (): void => {
    if (get().downloading) return
    set({ downloading: true })
    void window.api.updater.install()
  }
}))
