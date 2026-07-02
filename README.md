<div align="center">
  <img src="build/icon.png" alt="C² Launcher" width="120" />

  <h1>C² Launcher</h1>

  <p><em>A clean, fast open-source Minecraft launcher - browse, install and manage modpacks and content from Modrinth, all in one place without any ads.</em></p>

  <p>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2F9C95" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-2F9C95" />
    <img alt="Built with Electron" src="https://img.shields.io/badge/built%20with-Electron-47848F" />
  </p>
</div>

---

## Overview

C² Launcher is a desktop Minecraft launcher built with Electron + React + TypeScript. It handles the full pipeline itself - Microsoft sign-in, downloading Minecraft, installing mod loaders and launching the game - no external launcher core required. Discover [Modrinth](https://modrinth.com) content and install modpacks, mods, resource packs, data packs and shaders in a couple of clicks.

<!-- Hero screenshot of the Home page -->
<div align="center">
  <img src="docs/screenshots/home.png" alt="Home page" width="800" />
</div>

---

## Features

- **Instances** - create and manage multiple isolated Minecraft installs from the Home page; each instance keeps its own saves, mods and settings.
- **Full launch pipeline** - installs vanilla Minecraft and **Fabric, Forge, Quilt and NeoForge** loaders, downloads the matching Java runtime automatically, and launches the game directly.
- **Discover** - browse Modrinth content by type (modpacks, mods, resource packs, data packs, shaders) with search, sort and filters by game version, loader and category.
- **One-click install** - install modpacks as new instances, or add content straight into an existing one. Import `.mrpack` files too.
- **Mod management** - view installed content per instance, enable/disable or remove mods, and check for content updates.
- **Rich project view** - descriptions, gallery, version history and modpack contents for any Modrinth project.
- **Microsoft account** - sign in with your Microsoft account to play; the launcher handles the full auth flow.
- **Live game output** - follow game logs and state from the launcher while an instance is running.
- **Custom data folder** - move game data (instances, versions, assets) to any drive; the launcher migrates it safely and guards against unsafe locations.
- **Auto-updates** - the launcher checks GitHub Releases and updates itself with your permission in place without touching your data.
- **Modern UI** - custom frameless window, smooth animations, dark theme, optional minimize-to-tray.
- **Theme Customization** - if you don't like any theme of the provided, you can create it by yourself.

---

## Screenshots

| Home | Discover |
| :---: | :---: |
| ![Home](docs/screenshots/home.png) | ![Discover](docs/screenshots/discover.png) |

---

## Installation

1. Go to the [**Releases**](https://github.com/Shroud-y/c2launcher/releases) page.
2. Download the latest installer for your OS:
   - **Windows** - `c2-Launcher-setup-x.y.z.exe`
   - **Linux** - `.AppImage` or `.deb`
3. Run it and follow the prompts.

ℹ️ Windows may show a SmartScreen "unknown publisher" warning because the build isn't code-signed. Click **More info → Run anyway**.

---

## Development

Built with **Electron**, **React 18**, **TypeScript**, **Zustand** and [electron-vite](https://electron-vite.org). Package manager is **pnpm**.

### Setup

```bash
# clone
git clone https://github.com/Shroud-y/c2launcher.git
cd c2launcher

# install dependencies
pnpm install

# run in development (HMR for renderer + main)
pnpm dev
```

### Other commands

```bash
pnpm typecheck   # type-check renderer and main/preload
pnpm build       # compile to out/ (no installer)
pnpm dist        # build + package installers into dist/
```

### Project layout

```
src/main/      Electron main process - downloads, auth, game launch, storage
src/preload/   context bridge exposing the typed window.api
src/renderer/  React SPA - pages, modals, Zustand stores
src/shared/    types and IPC channel names shared by all processes
```

## Credits

- Content powered by the [Modrinth API](https://docs.modrinth.com).
- Built on [Electron](https://electronjs.org) and [React](https://react.dev).

---

## License

Released under the [MIT License](LICENSE).

<div align="center">
  <sub>Made with 💚 by C² contributors</sub>
</div>
