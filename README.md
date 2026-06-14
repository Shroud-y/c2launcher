# C² Launcher

An open-source, MIT-licensed Minecraft launcher — a replacement for GDLauncher
after it went closed-source and ad-supported. Browse and install modpacks from
**Modrinth**, manage local instances, and launch the game with the right Java
runtime fetched automatically. Runs on **Windows** and **Linux**.

> Dark theme, teal/mint accent. Built with Electron + React + TypeScript.

## Features

- **Discover** — search Modrinth for modpacks, mods, resource packs, data packs
  and shaders, with category / game-version / loader filters.
- **Instances** — create, rename, configure (memory, Java args) and launch
  modpacks, each in its own isolated game folder.
- **Mod management** — install, enable/disable, update and remove content per
  instance; versions and icons are resolved from Modrinth by file hash.
- **Modpack install** — one-click install of Modrinth `.mrpack` modpacks.
- **Microsoft auth** — full Microsoft → Xbox Live → XSTS → Minecraft login;
  your player head renders in the right panel.
- **Auto Java** — the matching Java runtime is downloaded per Minecraft version;
  override it with your own executable in Settings.
- **Loaders** — Fabric, Forge, Quilt and NeoForge.
- **Self-updating** — the launcher updates itself via GitHub Releases.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Frontend | React 18 + TypeScript |
| Build tooling | electron-vite + electron-builder |
| State | Zustand |
| Storage | electron-store |
| Content API | Modrinth API v2 |
| Auth | Microsoft OAuth2 (Xbox Live → Minecraft) |

## Getting started

Requires [Node.js](https://nodejs.org) 18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev          # start Electron in dev mode with HMR
```

## Building

```bash
pnpm build        # compile main, preload and renderer into out/
pnpm dist         # package installers into dist/ (current platform)
pnpm typecheck    # type-check without emitting
```

`pnpm dist` produces an NSIS installer on Windows and AppImage + `.deb`
packages on Linux. Packaging is configured in
[`electron-builder.yml`](./electron-builder.yml).

## Project layout

```
src/
├── main/        Electron main process (auth, launch, install, IPC handlers)
├── preload/     contextBridge API exposed to the renderer
├── renderer/    React UI (pages, components, Zustand stores)
└── shared/      types and IPC channel names used by both sides
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, design system and
development roadmap.

## License

[MIT](./LICENSE) © C² contributors.
