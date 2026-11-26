import { create } from 'zustand'
import type { AccountsState, MinecraftProfile, SkinModel } from '@shared/types'

type AuthStatus = 'initializing' | 'idle' | 'authenticating'

interface AuthState {
  accounts: MinecraftProfile[]
  activeUuid: string | null
  /** The active account, derived from `accounts` + `activeUuid`. */
  profile: MinecraftProfile | null
  status: AuthStatus
  error: string | null
  /** Account whose skin is being uploaded/changed, for per-row spinners. */
  skinBusyUuid: string | null
  init: () => Promise<void>
  login: () => Promise<void>
  /** Resolves true on success so the form knows whether to close. */
  loginOffline: (username: string) => Promise<boolean>
  switchAccount: (uuid: string) => Promise<void>
  removeAccount: (uuid: string) => Promise<void>
  importSkin: (uuid: string, model: SkinModel) => Promise<void>
  setSkinModel: (uuid: string, model: SkinModel) => Promise<void>
  resetSkin: (uuid: string) => Promise<void>
  clearError: () => void
  logout: () => Promise<void>
}

function toMessage(err: unknown): string {
  if (err instanceof Error) {
    // Strip electron's "Error invoking remote method 'auth:login': AuthError:" prefix.
    return err.message.replace(/^Error invoking remote method '[^']+': \w*Error: /, '')
  }
  return 'Login failed'
}

function fromState(state: AccountsState): Pick<AuthState, 'accounts' | 'activeUuid' | 'profile'> {
  return {
    accounts: state.accounts,
    activeUuid: state.activeUuid,
    profile: state.accounts.find((a) => a.uuid === state.activeUuid) ?? null
  }
}

export const useAuthStore = create<AuthState>((set) => {
  /** Runs a per-account skin call with its row marked busy. */
  async function skinCall(uuid: string, call: () => Promise<AccountsState | null>): Promise<void> {
    set({ skinBusyUuid: uuid, error: null })
    try {
      const state = await call()
      if (state !== null) set(fromState(state))
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set({ skinBusyUuid: null })
    }
  }

  return {
    accounts: [],
    activeUuid: null,
    profile: null,
    status: 'initializing',
    error: null,
    skinBusyUuid: null,

    init: async (): Promise<void> => {
      try {
        set({ ...fromState(await window.api.auth.getAccounts()), status: 'idle' })
      } catch {
        set({ accounts: [], activeUuid: null, profile: null, status: 'idle' })
      }
    },

    login: async (): Promise<void> => {
      set({ status: 'authenticating', error: null })
      try {
        set({ ...fromState(await window.api.auth.login()), status: 'idle' })
      } catch (err) {
        const message = toMessage(err)
        // Closing the login window is a user cancel, not an error worth showing.
        set({ status: 'idle', error: message === 'Login window was closed' ? null : message })
      }
    },

    loginOffline: async (username: string): Promise<boolean> => {
      set({ status: 'authenticating', error: null })
      try {
        set({ ...fromState(await window.api.auth.loginOffline(username)), status: 'idle' })
        return true
      } catch (err) {
        set({ status: 'idle', error: toMessage(err) })
        return false
      }
    },

    switchAccount: async (uuid: string): Promise<void> => {
      try {
        set({ ...fromState(await window.api.auth.switchAccount(uuid)), error: null })
      } catch (err) {
        set({ error: toMessage(err) })
      }
    },

    removeAccount: async (uuid: string): Promise<void> => {
      try {
        set({ ...fromState(await window.api.auth.removeAccount(uuid)), error: null })
      } catch (err) {
        set({ error: toMessage(err) })
      }
    },

    importSkin: (uuid, model) => skinCall(uuid, () => window.api.auth.importSkin(uuid, model)),
    setSkinModel: (uuid, model) => skinCall(uuid, () => window.api.auth.setSkinModel(uuid, model)),
    resetSkin: (uuid) => skinCall(uuid, () => window.api.auth.resetSkin(uuid)),

    clearError: (): void => set({ error: null }),

    logout: async (): Promise<void> => {
      set({ ...fromState(await window.api.auth.logout()), error: null })
    }
  }
})
