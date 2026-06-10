/**
 * Single source of truth for IPC channel names.
 * Imported by both main and renderer so the two sides never drift.
 *
 * Note: a plain (non-const) enum is used because `const enum` members
 * cannot be accessed across modules when `isolatedModules` is enabled,
 * which esbuild/Vite require.
 */
export enum IpcChannel {
  ModpackList = 'modpack:list',
  ModpackCreate = 'modpack:create',
  ModpackLaunch = 'modpack:launch',
  ModpackInstallMod = 'modpack:install-mod',
  ModpackUpdateSettings = 'modpack:update-settings',
  ModpackStop = 'modpack:stop',
  ModpackOpenFolder = 'modpack:open-folder',
  ModpackDelete = 'modpack:delete',
  MinecraftVersions = 'minecraft:versions',
  SettingsGet = 'settings:get',
  SettingsChooseDataDir = 'settings:choose-data-dir',
  SettingsOpenDataDir = 'settings:open-data-dir',
  AuthLogin = 'auth:login',
  AuthLogout = 'auth:logout',
  AuthGetProfile = 'auth:get-profile',
  DiscoverSearch = 'discover:search',
  WindowMinimize = 'window:minimize',
  WindowMaximize = 'window:maximize',
  WindowClose = 'window:close',

  // Main → renderer events
  ModpackInstallProgress = 'modpack:install-progress',
  ModpackGameLog = 'modpack:game-log',
  ModpackGameState = 'modpack:game-state'
}
