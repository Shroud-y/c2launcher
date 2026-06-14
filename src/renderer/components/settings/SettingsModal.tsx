import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import type { AppSettings } from '@shared/types'
import styles from './SettingsModal.module.css'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export default function SettingsModal(): JSX.Element {
  const closeSettings = useModalStore((s) => s.closeSettings)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [javaError, setJavaError] = useState<string | null>(null)

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
    <div className={styles.overlay} onClick={closeSettings}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={closeSettings}>
          <CloseIcon />
        </button>
        <h2 className={styles.title}>Settings</h2>

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
