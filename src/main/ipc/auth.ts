import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type { AccountsState, MinecraftProfile, SkinModel } from '@shared/types'
import {
  AuthError,
  clearAuthSession,
  clearCachedSession,
  getMinecraftSession,
  loginInteractive,
  loginSilent,
  resetSkin,
  uploadSkin,
  type MinecraftSession
} from '../auth/microsoftAuth'
import { createOfflineProfile, validateOfflineName } from '../auth/offlineAuth'
import { readSkinFile } from '../auth/skins'
import {
  getAccount,
  getAccountsState,
  getActiveAccount,
  loadRefreshToken,
  removeAccount,
  saveRefreshToken,
  setActiveAccount,
  updateProfile,
  upsertAccount
} from '../auth/tokenStore'

let loginInFlight = false

function requireAccount(uuid: unknown): MinecraftProfile {
  const account = typeof uuid === 'string' ? getAccount(uuid) : null
  if (account === null) throw new AuthError('Account not found')
  return account
}

function msSession(profile: MinecraftProfile): Promise<MinecraftSession> {
  return getMinecraftSession(
    profile.uuid,
    () => loadRefreshToken(profile.uuid),
    (token) => saveRefreshToken(profile.uuid, token)
  )
}

function parseModel(raw: unknown): SkinModel {
  return raw === 'slim' ? 'slim' : 'classic'
}

async function pickSkinFile(event: Electron.IpcMainInvokeEvent): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options = {
    title: 'Select skin',
    properties: ['openFile' as const],
    filters: [{ name: 'Minecraft skin', extensions: ['png'] }]
  }
  const { canceled, filePaths } =
    win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return canceled ? null : (filePaths[0] ?? null)
}

export function registerAuthIpc(): void {
  ipcMain.handle(IpcChannel.AuthLogin, async (event): Promise<AccountsState> => {
    if (loginInFlight) throw new AuthError('A login is already in progress')
    loginInFlight = true
    try {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { profile, refreshToken } = await loginInteractive(parent)
      upsertAccount(profile, refreshToken)
      setActiveAccount(profile.uuid)
      return getAccountsState()
    } finally {
      loginInFlight = false
    }
  })

  ipcMain.handle(
    IpcChannel.AuthLoginOffline,
    async (_event, rawName: unknown): Promise<AccountsState> => {
      const profile = createOfflineProfile(validateOfflineName(rawName))
      upsertAccount(profile)
      setActiveAccount(profile.uuid)
      return getAccountsState()
    }
  )

  /** Signs the active account out (removes it); the next saved one takes over. */
  ipcMain.handle(IpcChannel.AuthLogout, async (): Promise<AccountsState> => {
    const active = getActiveAccount()
    if (active !== null) {
      removeAccount(active.uuid)
      clearCachedSession(active.uuid)
      if (active.type === 'microsoft') await clearAuthSession()
    }
    return getAccountsState()
  })

  ipcMain.handle(IpcChannel.AuthGetAccounts, async (): Promise<AccountsState> => {
    const active = getActiveAccount()
    if (active?.type !== 'microsoft') return getAccountsState()

    // Refresh the active Microsoft account so name/skin changes made
    // elsewhere show up. Failures keep the saved profile: offline network
    // is common, and a dead token surfaces when launching.
    const refreshToken = loadRefreshToken(active.uuid)
    if (refreshToken !== null) {
      try {
        const result = await loginSilent(refreshToken)
        upsertAccount(result.profile, result.refreshToken)
      } catch {
        // Keep the cached profile.
      }
    }
    return getAccountsState()
  })

  ipcMain.handle(IpcChannel.AuthSwitchAccount, async (_event, uuid: unknown): Promise<AccountsState> => {
    setActiveAccount(requireAccount(uuid).uuid)
    return getAccountsState()
  })

  ipcMain.handle(IpcChannel.AuthRemoveAccount, async (_event, uuid: unknown): Promise<AccountsState> => {
    const account = requireAccount(uuid)
    removeAccount(account.uuid)
    clearCachedSession(account.uuid)
    return getAccountsState()
  })

  /**
   * Imports a PNG skin. Microsoft accounts upload it to Mojang (visible
   * everywhere); offline accounts keep it locally and serve it to the game
   * through authlib-injector. Resolves null if the picker was cancelled.
   */
  ipcMain.handle(
    IpcChannel.AuthImportSkin,
    async (event, uuid: unknown, rawModel: unknown): Promise<AccountsState | null> => {
      const account = requireAccount(uuid)
      const path = await pickSkinFile(event)
      if (path === null) return null
      const png = await readSkinFile(path)
      const model = parseModel(rawModel)

      if (account.type === 'microsoft') {
        const profile = await uploadSkin(await msSession(account), png, model)
        upsertAccount(profile)
      } else {
        updateProfile(account.uuid, { skinBase64: png.toString('base64'), skinModel: model })
      }
      return getAccountsState()
    }
  )

  ipcMain.handle(
    IpcChannel.AuthSetSkinModel,
    async (_event, uuid: unknown, rawModel: unknown): Promise<AccountsState> => {
      const account = requireAccount(uuid)
      const model = parseModel(rawModel)
      if (account.type === 'microsoft') {
        // Mojang only changes the arm model together with a skin upload.
        if (account.skinBase64 === null) throw new AuthError('Import a skin first')
        const profile = await uploadSkin(
          await msSession(account),
          Buffer.from(account.skinBase64, 'base64'),
          model
        )
        upsertAccount(profile)
      } else {
        updateProfile(account.uuid, { skinModel: model })
      }
      return getAccountsState()
    }
  )

  ipcMain.handle(IpcChannel.AuthResetSkin, async (_event, uuid: unknown): Promise<AccountsState> => {
    const account = requireAccount(uuid)
    if (account.type === 'microsoft') {
      upsertAccount(await resetSkin(await msSession(account)))
    } else {
      updateProfile(account.uuid, { skinBase64: null, skinModel: 'classic' })
    }
    return getAccountsState()
  })
}
