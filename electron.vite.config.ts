import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Reads a variable from the environment, then .env.local, then .env —
 * verbatim. Vite's own env loading runs dotenv-expand, which treats every
 * `$` as a variable reference and mangles CurseForge keys (`$2a$10$…`),
 * so the key is parsed here instead and inlined with `define`.
 */
function readRawEnv(name: string): string {
  const fromProcess = process.env[name]
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const match = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match === null || match[1] !== name) continue
      return match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return ''
}

export default defineConfig({
  main: {
    define: {
      // Main process only — never add this to preload/renderer.
      __CURSEFORGE_API_KEY__: JSON.stringify(readRawEnv('CURSEFORGE_API_KEY'))
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    }
  }
})
