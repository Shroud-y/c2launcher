/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** CurseForge API key from .env.local, inlined at build time. Absent = CurseForge disabled. */
  readonly MAIN_VITE_CURSEFORGE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
