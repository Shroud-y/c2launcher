import { create } from 'zustand'
import type { UpdateDownloadProgress } from '@shared/types'

/** Lifecycle of the launcher self-update, drives the blocking overlay. */
type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error'

interface UpdateState {
  /** A newer release exists (set from the main-process launch check). */
  available: boolean
  version: string | null
  phase: UpdatePhase
  percent: number
  /** Current download speed in bytes/sec; 0 until the first progress event. */
  bytesPerSecond: number
  /** Human-readable failure message when phase is 'error'. */
  error: string | null
  /** True while the overlay should block the UI (downloading or installing). */
  active: boolean
  setAvailable: (version: string) => void
  setProgress: (progress: UpdateDownloadProgress) => void
  setInstalling: () => void
  setError: (message: string) => void
  dismissError: () => void
  install: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: false,
  version: null,
  phase: 'idle',
  percent: 0,
  bytesPerSecond: 0,
  error: null,
  active: false,
  setAvailable: (version): void => set({ available: true, version }),
  setProgress: (progress): void =>
    set({
      phase: 'downloading',
      active: true,
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond
    }),
  setInstalling: (): void => set({ phase: 'installing', active: true, percent: 100 }),
  setError: (message): void => set({ phase: 'error', active: false, error: message }),
  dismissError: (): void => set({ phase: 'idle', error: null }),
  install: (): void => {
    if (get().active) return
    // Show the overlay immediately on click — don't wait for the first
    // progress event, or the launcher looks frozen while the download starts.
    set({ phase: 'downloading', active: true, percent: 0, bytesPerSecond: 0, error: null })
    void window.api.updater.install()
  }
}))
