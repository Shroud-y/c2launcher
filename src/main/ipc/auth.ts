import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type { MinecraftProfile } from '@shared/types'
import { AuthError, clearAuthSession, loginInteractive, loginSilent } from '../auth/microsoftAuth'
import {
  clearAuthData,
  loadProfile,
  loadRefreshToken,
  saveProfile,
  saveRefreshToken
} from '../auth/tokenStore'

let loginInFlight = false

export function registerAuthIpc(): void {
  ipcMain.handle(IpcChannel.AuthLogin, async (event): Promise<MinecraftProfile> => {
    if (loginInFlight) throw new AuthError('A login is already in progress')
    loginInFlight = true
    try {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { profile, refreshToken } = await loginInteractive(parent)
      saveRefreshToken(refreshToken)
      saveProfile(profile)
      return profile
    } finally {
      loginInFlight = false
    }
  })

  ipcMain.handle(IpcChannel.AuthLogout, async (): Promise<void> => {
    clearAuthData()
    await clearAuthSession()
  })

  ipcMain.handle(IpcChannel.AuthGetProfile, async (): Promise<MinecraftProfile | null> => {
    const refreshToken = loadRefreshToken()
    if (refreshToken === null) return null

    try {
      const result = await loginSilent(refreshToken)
      saveRefreshToken(result.refreshToken)
      saveProfile(result.profile)
      return result.profile
    } catch (err) {
      if (err instanceof AuthError) {
        // Token rejected — account state is gone for real.
        clearAuthData()
        return null
      }
      // Network failure: fall back to the cached profile so the UI
      // still shows the account while offline.
      return loadProfile()
    }
  })
}
