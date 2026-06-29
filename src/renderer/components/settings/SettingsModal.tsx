import { useEffect, useState } from 'react'
import { CloseIcon, GearIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import type { AppSettings, DataMigrateProgress } from '@shared/types'
import {
  THEMES,
  applyTheme,
  getStoredThemeId,
  getStoredCustomSwatches,
  buildCustomTheme
} from '../../theme'
import styles from './SettingsModal.module.css'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export default function SettingsModal(): JSX.Element {
  const closeSettings = useModalStore((s) => s.closeSettings)
  const openCustomTheme = useModalStore((s) => s.openCustomTheme)
  const { closing, requestClose } = useCloseAnimation(closeSettings)

  // Presets plus the user's editable Custom theme in the fourth slot. Rebuilt
  // from storage on each mount so edits made in the editor show up here.
  const themes = [...THEMES, buildCustomTheme(getStoredCustomSwatches())]

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [javaError, setJavaError] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateProgress, setMigrateProgress] = useState<DataMigrateProgress | null>(null)
  const [theme, setTheme] = useState(getStoredThemeId)

  function selectTheme(id: string): void {
    setTheme(id)
    applyTheme(id)
  }

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  // Live copy progress while data is moved to a new folder.
  useEffect(() => window.api.settings.onDataMigrateProgress(setMigrateProgress), [])

  async function changeDataDir(): Promise<void> {
    setDataError(null)
    setMigrating(true)
    try {
      const result = await window.api.settings.chooseDataDir()
      // 'ok' relaunches the app; 'canceled' just closes the dialogs.
      if (result.status === 'error') {
        setDataError(result.message ?? 'Could not change the data folder')
      }
    } catch (err) {
      setDataError(err instanceof Error ? stripIpcPrefix(err.message) : 'Could not change the data folder')
    } finally {
      setMigrating(false)
      setMigrateProgress(null)
    }
  }

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

  async function toggleMinimizeToTray(): Promise<void> {
    if (settings === null) return
    setSettings(await window.api.settings.setMinimizeToTray(!settings.minimizeToTrayOnLaunch))
  }

  const migratePct =
    migrateProgress !== null && migrateProgress.totalBytes > 0
      ? Math.min(100, Math.round((migrateProgress.copiedBytes / migrateProgress.totalBytes) * 100))
      : 0

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
            {themes.map((t) => (
              <div key={t.id} className={styles.themeCardWrap}>
              {t.custom === true && (
                <button
                  type="button"
                  className={styles.themeEditButton}
                  aria-label="Edit custom colors"
                  title="Edit colors"
                  onClick={openCustomTheme}
                >
                  <GearIcon size={14} />
                </button>
              )}
              <button
                type="button"
                className={theme === t.id ? `${styles.themeCard} ${styles.themeCardActive}` : styles.themeCard}
                aria-pressed={theme === t.id}
                aria-label={t.label}
                onClick={() => selectTheme(t.id)}
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
              </div>
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
          <div className={styles.toggleHeader}>
            <span className={styles.fieldLabel}>Minimize to tray on launch</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.minimizeToTrayOnLaunch ?? true}
              aria-label="Minimize to tray on launch"
              className={
                settings?.minimizeToTrayOnLaunch !== false
                  ? `${styles.switch} ${styles.switchOn}`
                  : styles.switch
              }
              disabled={settings === null}
              onClick={() => void toggleMinimizeToTray()}
            />
          </div>
          <span className={styles.hint}>
            Hides the launcher window to the system tray when the game starts. Reopen it from the
            tray icon.
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Data folder</span>
          <span className={styles.hint}>
            Where modpack instances and game files live. When you change it, the launcher offers to
            move or copy your instances to the new folder, then restarts.
          </span>
          <code className={styles.path}>{settings?.dataDir ?? '…'}</code>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={migrating}
              onClick={() => void window.api.settings.openDataDir()}
            >
              Open folder
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={migrating}
              onClick={() => void changeDataDir()}
            >
              Change…
            </button>
            {settings?.dataDirIsDefault === false && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={migrating}
                onClick={() => void window.api.settings.resetDataDir()}
              >
                Reset to default
              </button>
            )}
          </div>
          {migrateProgress !== null && (
            <div className={styles.progress}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${migratePct}%` }} />
              </div>
              <div className={styles.progressText}>
                <span className={styles.progressFile}>
                  {migrateProgress.currentFile === ''
                    ? 'Preparing…'
                    : `Copying ${migrateProgress.currentFile}`}
                </span>
                <span>{`${migratePct}%`}</span>
              </div>
            </div>
          )}
          {dataError !== null && <span className={styles.error}>{dataError}</span>}
        </div>
      </div>
    </div>
  )
}
