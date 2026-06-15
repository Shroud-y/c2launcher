import { create } from 'zustand'
import type { MinecraftProfile } from '@shared/types'

type AuthStatus = 'initializing' | 'idle' | 'authenticating'

interface AuthState {
  profile: MinecraftProfile | null
  status: AuthStatus
  error: string | null
  init: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
}

function toMessage(err: unknown): string {
  if (err instanceof Error) {
    // Strip electron's "Error invoking remote method 'auth:login': AuthError:" prefix.
    return err.message.replace(/^Error invoking remote method '[^']+': \w*Error: /, '')
  }
  return 'Login failed'
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  status: 'initializing',
  error: null,

  init: async (): Promise<void> => {
    try {
      const profile = await window.api.auth.getProfile()
      set({ profile, status: 'idle' })
    } catch {
      set({ profile: null, status: 'idle' })
    }
  },

  login: async (): Promise<void> => {
    set({ status: 'authenticating', error: null })
    try {
      const profile = await window.api.auth.login()
      set({ profile, status: 'idle' })
    } catch (err) {
      const message = toMessage(err)
      // Closing the login window is a user cancel, not an error worth showing.
      set({ status: 'idle', error: message === 'Login window was closed' ? null : message })
    }
  },

  logout: async (): Promise<void> => {
    await window.api.auth.logout()
    set({ profile: null, error: null })
  }
}))
