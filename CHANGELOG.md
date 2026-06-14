# Changelog

All notable changes to C² Launcher are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
