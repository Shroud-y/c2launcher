import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import type { AppSettings } from '@shared/types'
import styles from './SettingsModal.module.css'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

/**
 * Color-scheme options. Step 1 — placeholder palettes for the preview cards
 * only; selecting one does not yet repaint the launcher (wired in step 2).
 * `colors` drives the mini-interface mockup; real schemes replace these.
 */
interface ThemeOption {
  id: string
  label: string
  colors: { bg: string; panel: string; accent: string; border: string }
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'midnight', label: 'Midnight', colors: { bg: '#0a0a0a', panel: '#0f0f0f', accent: '#2f9c95', border: '#21262d' } },
  { id: 'amethyst', label: 'Amethyst', colors: { bg: '#0d0a14', panel: '#14101f', accent: '#8b5cf6', border: '#2a2540' } },
  { id: 'ember', label: 'Ember', colors: { bg: '#140a0a', panel: '#1c1010', accent: '#f97316', border: '#3a2420' } },
  { id: 'slate', label: 'Slate', colors: { bg: '#0b0e12', panel: '#11161d', accent: '#3b82f6', border: '#1e2733' } }
]

export default function SettingsModal(): JSX.Element {
  const closeSettings = useModalStore((s) => s.closeSettings)
  const { closing, requestClose } = useCloseAnimation(closeSettings)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [javaError, setJavaError] = useState<string | null>(null)
  // Placeholder selection — preview only, not persisted yet (step 2).
  const [theme, setTheme] = useState('midnight')

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  async function chooseJava(): Promise<void> {
    setJavaError(null)
    try {
      setSettings(await window.api.settings.chooseJava())
    } catch (err) {
      setJavaError(err instanceof Error ? stripIpcPrefix(err.message) : 'Could not set Java')
    }
  }

  async function clearJava(): Promise<void> {
    setJavaError(null)
    setSettings(await window.api.settings.clearJava())
  }

  async function toggleGpuPref(): Promise<void> {
    if (settings === null) return
    setSettings(await window.api.settings.setGpuPref(!settings.preferDedicatedGpu))
  }

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} onClick={requestClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={requestClose}>
          <CloseIcon />
        </button>
        <h2 className={styles.title}>Settings</h2>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Color scheme</span>
          <span className={styles.hint}>Choose the launcher&apos;s color palette.</span>
          <div className={styles.themeGrid}>
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? `${styles.themeCard} ${styles.themeCardActive}` : styles.themeCard}
                aria-pressed={theme === t.id}
                aria-label={t.label}
                onClick={() => setTheme(t.id)}
              >
                <span className={styles.themePreview} style={{ background: t.colors.bg }}>
                  <span className={styles.themeTopbar} style={{ background: t.colors.panel }}>
                    <span className={styles.themeLogo} style={{ background: t.colors.accent }} />
                  </span>
                  <span className={styles.themeRow}>
                    <span className={styles.themeRail} style={{ background: t.colors.panel }}>
                      <span className={styles.themeRailIcon} style={{ background: t.colors.accent }} />
                      <span className={styles.themeRailIcon} style={{ background: t.colors.accent }} />
                    </span>
                    <span className={styles.themeContent}>
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={styles.themeCardRow} style={{ background: t.colors.panel }}>
                          <span className={styles.themeCardIcon} style={{ background: t.colors.accent }} />
                          <span className={styles.themeCardLines}>
                            <span className={styles.themeLineAccent} style={{ background: t.colors.accent }} />
                            <span className={styles.themeLine} style={{ background: t.colors.border }} />
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className={styles.themePanel} style={{ background: t.colors.panel }}>
                      <span className={styles.themeAvatar} style={{ background: t.colors.accent }} />
                      <span className={styles.themeLine} style={{ background: t.colors.border }} />
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Java</span>
          <span className={styles.hint}>
            By default the matching Java runtime is downloaded automatically. Point to your own
            executable to override it for every instance.
          </span>
          <code className={styles.path}>{settings?.javaPath ?? 'Automatic (bundled / system Java)'}</code>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryButton} onClick={() => void chooseJava()}>
              Choose Java…
            </button>
            {settings?.javaPath != null && (
              <button type="button" className={styles.secondaryButton} onClick={() => void clearJava()}>
                Use automatic
              </button>
            )}
          </div>
          {javaError !== null && <span className={styles.error}>{javaError}</span>}
        </div>

        <div className={styles.field}>
          <div className={styles.toggleHeader}>
            <span className={styles.fieldLabel}>Prefer dedicated GPU</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.preferDedicatedGpu ?? true}
              aria-label="Prefer dedicated GPU"
              className={
                settings?.preferDedicatedGpu !== false
                  ? `${styles.switch} ${styles.switchOn}`
                  : styles.switch
              }
              disabled={settings === null}
              onClick={() => void toggleGpuPref()}
            />
          </div>
          <span className={styles.hint}>
            On hybrid-graphics laptops, tells Windows to run the game on the high-performance GPU
            instead of the integrated one. Applied on next launch.
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Data folder</span>
          <span className={styles.hint}>
            Where modpack instances, game files and launcher config live. Changing it restarts the
            launcher; existing instances stay in the old folder.
          </span>
          <code className={styles.path}>{settings?.dataDir ?? '…'}</code>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void window.api.settings.openDataDir()}
            >
              Open folder
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void window.api.settings.chooseDataDir()}
            >
              Change…
            </button>
            {settings?.dataDirIsDefault === false && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void window.api.settings.resetDataDir()}
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
