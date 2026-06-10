# C^2 Launcher — Claude Code Instructions

## Project Overview

**C^2** is an open-source, licensed Minecraft launcher built as a replacement for GDLauncher (which went closed-source and ad-supported). It supports modpacks from **Modrinth** and **CurseForge**, runs on **Windows and Linux**, and is built with Electron + React.

The design is dark-themed with a teal/mint accent (`#4ecdc4` range). All design reference screenshots are attached (/home.png; /dc.png) — treat them as the source of truth for layout, spacing, and visual language. Do not invent new UI patterns; follow the mockups faithfully.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron (latest stable) |
| Frontend | React 18 + TypeScript |
| Styling | CSS Modules or Tailwind CSS |
| Backend / main process | Node.js / TypeScript |
| Build tooling | Vite + electron-builder |
| Package manager | pnpm |
| API integrations | Modrinth API v2, CurseForge API v1 |
| Auth | Microsoft OAuth2 (Xbox Live → Minecraft) |
| State management | Zustand |
| IPC | Electron contextBridge + ipcMain/ipcRenderer |

---

## Repository Structure

```
c2-launcher/
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.ts        # App entry, window creation
│   │   ├── ipc/            # IPC handlers (launch, install, auth…)
│   │   ├── minecraft/      # Game launching, version manifests
│   │   ├── modpacks/       # Modpack install/update logic
│   │   └── auth/           # Microsoft OAuth flow
│   ├── renderer/           # React frontend
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx          # "Your modpacks" grid
│   │   │   └── Discover.tsx      # "Discover content" browse page
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx         # Left nav sidebar
│   │   │   │   ├── RightPanel.tsx      # Right panel (account / filters)
│   │   │   │   └── TopBar.tsx          # Page title bar
│   │   │   ├── modpack/
│   │   │   │   ├── ModpackCard.tsx     # Single modpack card tile
│   │   │   │   ├── ModpackGrid.tsx     # 2-column card grid
│   │   │   │   └── ModpackModal.tsx    # Click-to-open modpack detail modal
│   │   │   ├── discover/
│   │   │   │   ├── CategoryTabs.tsx    # Modpacks / Mods / Resource packs / …
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── SortFilter.tsx
│   │   │   │   └── FilterSidebar.tsx   # Category + Game version + Loader filters
│   │   │   └── common/
│   │   │       ├── Avatar.tsx          # Player skin head renderer
│   │   │       └── IconButton.tsx
│   │   ├── store/          # Zustand stores
│   │   └── styles/         # Global CSS variables, resets
│   └── preload/            # contextBridge preload script
├── public/
├── electron.vite.config.ts
├── package.json
└── CLAUDE.md               # ← this file
```

---

## Design System

Derive all visual decisions from the mockups. Key tokens:

```css
:root {
  --bg-primary:    #0f1117;   /* main window background */
  --bg-secondary:  #161b22;   /* card / panel backgrounds */
  --bg-hover:      #1e242d;   /* hover states */
  --accent:        #4ecdc4;   /* teal — primary accent, titles, selected states */
  --accent-soft:   #3db8b0;
  --text-primary:  #e6edf3;
  --text-muted:    #8b949e;
  --border:        #21262d;
  --sidebar-width: 68px;
  --right-panel-width: 200px;
  --card-radius:   12px;
  --icon-radius:   14px;
}
```

Typography: system-ui / Inter. Accent labels use `var(--accent)`, version subtitles use `var(--text-muted)`.

---

## Layout — Permanent Shell

The app window has **three fixed zones** that are always present:

```
┌─────────────────────────────────────────────────────────┐
│ TopBar: [C² logo] | [Page title]          [window btns] │
├───────┬─────────────────────────────┬───────────────────┤
│       │                             │                   │
│ Left  │        Main content         │   Right panel     │
│ Side  │                             │   (contextual)    │
│ bar   │                             │                   │
│ 68px  │          flex-1             │     200px         │
│       │                             │                   │
└───────┴─────────────────────────────┴───────────────────┘
```

### Left Sidebar icons (top to bottom)
1. **C² logo** (top, above separator) — no action, branding only
2. **Home** (house icon) — navigates to `/`
3. **Discover** (compass icon) — navigates to `/discover`
4. Separator line
5. **Recent modpack 1** (last opened, teal icon) — opens that modpack modal
6. **Recent modpack 2**
7. **Recent modpack 3**
8. **+ (Add)** — create new modpack

Bottom group:
- **Settings** (gear icon)
- **Log out** (arrow-right-from-bracket icon)

The three recent modpack slots are **placeholders for MVP** — wire up the icons but the click handlers can be no-ops until Phase 3.

### Right Panel
- On **Home**: shows account info (avatar + username + "License account" label)
- On **Discover**: shows account info + filter sidebar (Category list with trending arrows, Game version × Loader matrix)
- The teal vertical line separating it from main content is always visible

---

## Pages

### Home — `/`

- Heading: teal pill with grid icon + "Your modpacks" text
- Below heading: horizontal teal divider line
- Content: `ModpackGrid` — 2-column CSS grid, `gap: 12px`
- Each `ModpackCard` shows: teal rounded icon (wind/swirl glyph), bold teal name, muted subtitle (e.g. "Fabric 1.21.10")
- Cards without metadata (new/empty ones) show lighter icon tint and no subtitle
- **Clicking a card opens `ModpackModal`**

### Discover Content — `/discover`

- Tab bar at top (inside teal rounded container): Modpacks · Mods · Resource packs · Data packs · Shaders
  - Active tab has dark pill background; inactive tabs are plain text
- Search bar below tabs: magnifier icon + placeholder "Search modpacks…"
- Controls row: "Sort by: Relevance" dropdown · "View: 20" dropdown · pagination (1 · 2 · … · 512)
- Same 2-column `ModpackGrid` as Home for results
- Right panel gains filter sidebar:
  - **Category** section: list of tags (Adventure, Challenging ↑, Combat, Kitchen Sink, Lightweight, Magic ↑, Multiplayer ↑) — trending ones show a small green arrow icon
  - **Game version / Loader** table: versions (1.21.11, 1.21.10, 1.21.9) × loaders (Fabric, Forge, Quilt) shown as teal links

---

## ModpackModal (click on any card)

Opens as a centered overlay modal. Must contain (MVP):

- Modpack name + icon (large)
- Loader + game version badge
- **Play** button (primary teal)
- **Mods** tab — list of installed mods with enable/disable toggles
- **Settings** tab — rename modpack, change memory allocation, Java args
- **Update** button (if an update is available from Modrinth/CurseForge)
- Close button (×)

---

## IPC Architecture

All heavy work (file I/O, network, launching Java) runs in the **main process**. The renderer communicates exclusively through typed IPC channels defined in `preload/index.ts`.

```typescript
// Example channel definitions
'modpack:list'       → returns Modpack[]
'modpack:create'     → params: { name, loader, gameVersion } → Modpack
'modpack:launch'     → params: { id: string } → void
'modpack:install-mod'→ params: { modpackId, modId, source: 'modrinth'|'curseforge' }
'auth:login'         → opens Microsoft OAuth window → MinecraftProfile
'auth:logout'        → void
'discover:search'    → params: SearchQuery → SearchResult[]
```

Always define channel names as a shared `const` enum in `src/shared/ipc-channels.ts` so both sides stay in sync.

---

## Authentication

Use **Microsoft OAuth2 → Xbox Live → XSTS → Minecraft** flow (the standard community-documented chain). Store the refresh token securely with `electron-store` (encrypted). On launch, silently refresh the access token if expired.

Do **not** use any third-party auth libraries that require external servers. Implement the flow directly per the Minecraft launcher auth spec.

---

## Modrinth & CurseForge Integration

Both APIs require separate implementations behind a shared interface:

```typescript
interface ContentProvider {
  search(query: SearchQuery): Promise<SearchResult[]>
  getModpack(id: string): Promise<ModpackDetail>
  getDownloadUrl(fileId: string): Promise<string>
}
```

- **Modrinth**: public API, no key required for read operations. Base URL: `https://api.modrinth.com/v2`
- **CurseForge**: requires an API key (user must supply their own in Settings). Base URL: `https://api.curseforge.com/v1`

---

## Development Phases

### Phase 1 — Shell & Navigation (MVP foundation)
**Goal**: the app opens, navigation works, static UI matches the design mockups.

- [ ] Scaffold project with `electron-vite` + React + TypeScript
- [ ] Implement permanent shell layout (TopBar, LeftSidebar, RightPanel)
- [ ] Implement routing: Home `/` and Discover `/discover`
- [ ] Build `ModpackCard` and `ModpackGrid` with hardcoded placeholder data
- [ ] Build `CategoryTabs`, `SearchBar`, `SortFilter` (UI only, no data)
- [ ] Build `FilterSidebar` right panel (UI only)
- [ ] Apply design tokens; verify visual match against screenshots
- [ ] Window chrome: frameless window with custom title bar, min/max/close buttons

### Phase 2 — Auth & Account
**Goal**: real Microsoft login, player head rendered in right panel.

- [ ] Implement Microsoft OAuth2 → Xbox → XSTS → Minecraft auth chain
- [ ] Secure token storage with `electron-store`
- [ ] Fetch and display player skin head as avatar
- [ ] "Log out" button clears stored tokens
- [ ] Show "Not logged in" state when no account is present

### Phase 3 — Local Modpack Management
**Goal**: users can create, view, and launch modpacks.

- [ ] Define modpack data model and local storage schema (JSON via `electron-store`)
- [ ] `modpack:create` IPC — creates folder structure + metadata
- [ ] `modpack:list` IPC — reads local modpacks, populates Home grid
- [ ] Recent modpacks (last 3) shown in left sidebar as icons
- [ ] `ModpackModal` — play, settings tab (rename, memory), close
- [ ] Download Minecraft version manifests, install selected version
- [ ] `modpack:launch` IPC — assembles Java command and spawns process
- [ ] Basic log output window (modal or side panel)

### Phase 4 — Modrinth Integration
**Goal**: Discover page returns real results from Modrinth; mods can be installed.

- [ ] Implement `ModrinthProvider` behind the `ContentProvider` interface
- [ ] Wire `discover:search` IPC to Modrinth search endpoint
- [ ] Pagination, sorting, filtering by category / game version / loader
- [ ] Modpack install from Modrinth (download mrpack, parse `modrinth.index.json`, fetch files)
- [ ] Mod install into an existing modpack
- [ ] `ModpackModal` Mods tab — list installed mods, enable/disable, remove

### Phase 5 — CurseForge Integration
**Goal**: CurseForge packs/mods work alongside Modrinth.

- [ ] Settings page — CurseForge API key field
- [ ] Implement `CurseForgeProvider`
- [ ] Source badge on cards (Modrinth logo / CurseForge logo)
- [ ] Install CurseForge modpacks (parse manifest, download from CDN)

### Phase 6 — Polish & Distribution
**Goal**: shippable 1.0 build.

- [ ] Update checking for installed modpacks (compare installed vs latest version)
- [ ] Error states: failed download, invalid Java, auth expiry
- [ ] Settings page: Java path override, download directory, language
- [ ] `electron-builder` config for Windows (NSIS installer) and Linux (AppImage + deb)
- [ ] Auto-updater for the launcher itself (electron-updater)
- [ ] README, license headers, CHANGELOG

---

## Key Conventions

- **No `any` types.** Use `unknown` and narrow with guards.
- All IPC handler signatures live in `src/shared/types.ts` — import from there in both main and renderer.
- Keep renderer code free of Node.js APIs. Everything goes through IPC.
- React components: functional only, hooks for state. No class components.
- File naming: `PascalCase` for components, `camelCase` for utilities.
- CSS: use CSS custom properties (var(--…)) for all colors and spacings; never hardcode hex values outside the `:root` block.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:` …).

---

## Running Locally

```bash
pnpm install
pnpm dev          # starts Electron in dev mode with HMR
pnpm build        # production build
pnpm dist         # package for current platform
```

---

## Notes for Claude Code

- Always check `src/shared/ipc-channels.ts` before adding new IPC channels — reuse existing ones if appropriate.
- When touching the auth flow, do **not** log tokens or profile data to the console.
- The design screenshots are the canonical reference. If a UI decision isn't covered in this document, look at the screenshots first.
- Modrinth and CurseForge rate-limit aggressively — add a simple in-memory cache (5-minute TTL) for search results.
- The "C²" logo in the top-left is a custom text mark with a superscript 2. Render it as `C<sup>2</sup>` in HTML or as styled text — not an image.
