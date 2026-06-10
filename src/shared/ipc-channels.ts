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
  AuthLogin = 'auth:login',
  AuthLogout = 'auth:logout',
  DiscoverSearch = 'discover:search',
  WindowMinimize = 'window:minimize',
  WindowMaximize = 'window:maximize',
  WindowClose = 'window:close'
}
