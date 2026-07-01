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
  ModpackInstallModrinth = 'modpack:install-mrpack',
  ModpackImportMrpack = 'modpack:import-mrpack',
  ModpackImportContent = 'modpack:import-content',
  ModpackMods = 'modpack:mods',
  ModpackContentUpdates = 'modpack:content-updates',
  ModpackToggleMod = 'modpack:toggle-mod',
  ModpackRemoveMod = 'modpack:remove-mod',
  ModpackUpdateSettings = 'modpack:update-settings',
  ModpackSetIcon = 'modpack:set-icon',
  ModpackStop = 'modpack:stop',
  ModpackOpenFolder = 'modpack:open-folder',
  ModpackDelete = 'modpack:delete',
  MinecraftVersions = 'minecraft:versions',
  LoaderCheck = 'loader:check',
  LoaderVersions = 'loader:versions',
  SettingsGet = 'settings:get',
  SettingsOpenDataDir = 'settings:open-data-dir',
  SettingsChooseJava = 'settings:choose-java',
  SettingsClearJava = 'settings:clear-java',
  SettingsChooseDataDir = 'settings:choose-data-dir',
  SettingsResetDataDir = 'settings:reset-data-dir',
  SettingsSetGpuPref = 'settings:set-gpu-pref',
  SettingsSetMinimizeToTray = 'settings:set-minimize-to-tray',
  AuthLogin = 'auth:login',
  AuthLogout = 'auth:logout',
  AuthGetProfile = 'auth:get-profile',
  DiscoverSearch = 'discover:search',
  DiscoverProject = 'discover:project',
  DiscoverProjectVersions = 'discover:project-versions',
  DiscoverModpackContents = 'discover:modpack-contents',
  WindowMinimize = 'window:minimize',
  WindowMaximize = 'window:maximize',
  WindowClose = 'window:close',
  UpdateInstall = 'update:install',
  /** Dev-only: fire a fake download→install sequence to preview the overlay. */
  UpdateSimulate = 'update:simulate',

  // Main → renderer events
  SettingsDataMigrateProgress = 'settings:data-migrate-progress',
  ModpackInstallProgress = 'modpack:install-progress',
  ModpackGameLog = 'modpack:game-log',
  ModpackGameState = 'modpack:game-state',
  UpdateAvailable = 'update:available',
  UpdateProgress = 'update:progress',
  /** Download finished; installing and about to quit/relaunch. */
  UpdateInstalling = 'update:installing',
  UpdateError = 'update:error'
}
