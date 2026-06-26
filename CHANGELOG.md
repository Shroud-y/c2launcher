# Changelog

All notable changes to C² Launcher are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3]

### Added
- Import a modpack from a plain `.zip` of a C² instance folder (alongside
  Modrinth `.mrpack`), so instances can be shared between launchers.
- Import mods, resource packs, shaders and data packs from local files via the
  download button in the instance window.
- Color scheme selection in Settings — Midnight, Ember, Amethyst and Teal —
  with live preview cards; the choice persists across restarts.
- Packaging via electron-builder: Windows NSIS installer, Linux AppImage and
  `.deb` (`pnpm dist`).
- Launcher self-updating through GitHub Releases (electron-updater).
- Project README and changelog.

## [0.1.0]

### Added
- Permanent three-zone shell: left sidebar, main content, right panel.
- Home page with the instance grid; Discover page browsing Modrinth content.
- Microsoft → Xbox Live → XSTS → Minecraft authentication with player-head
  avatar.
- Local modpack management: create, rename, configure memory and Java args,
  launch, and delete instances.
- Automatic per-version Java runtime download, with a user override in Settings.
- Fabric, Forge, Quilt and NeoForge loader support.
- Modrinth `.mrpack` modpack install, and per-instance content install,
  enable/disable, update and removal.
- Configurable data folder.
