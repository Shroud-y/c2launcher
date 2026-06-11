import { useEffect, useRef, useState } from 'react'
import { CloseIcon, FolderIcon, WindIcon } from '../common/Icons'
import { formatSubtitle } from '../../data/format'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { InstalledMod } from '@shared/types'
import styles from './ModpackModal.module.css'

type ModalTab = 'mods' | 'settings' | 'logs'

interface ModpackModalProps {
  modpackId: string
}

export default function ModpackModal({ modpackId }: ModpackModalProps): JSX.Element {
  const closeModpack = useModalStore((s) => s.closeModpack)
  const {
    modpacks,
    installProgress,
    gameStates,
    logs,
    launchError,
    launch,
    stop,
    remove,
    updateSettings
  } = useModpackStore()

  const localPack = modpacks.find((m) => m.id === modpackId) ?? null
  const pack = localPack

  const [tab, setTab] = useState<ModalTab>('mods')
  const [name, setName] = useState(pack?.name ?? '')
  const [memoryMb, setMemoryMb] = useState(pack?.memoryMb ?? 4096)
  const [javaArgs, setJavaArgs] = useState(pack?.javaArgs ?? '')
  const [gameVersion, setGameVersion] = useState(pack?.gameVersion ?? '')
  const [versions, setVersions] = useState<string[]>([])
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mods, setMods] = useState<InstalledMod[] | null>(null)
  const [modsError, setModsError] = useState<string | null>(null)

  useEffect(() => {
    if (tab !== 'mods' || mods !== null) return
    window.api.modpack
      .mods(modpackId)
      .then(setMods)
      .catch(() => setModsError('Could not read the mods folder'))
  }, [tab, mods, modpackId])

  useEffect(() => {
    if (tab !== 'settings' || versions.length > 0) return
    window.api.minecraft
      .versions()
      .then(setVersions)
      .catch(() => {
        // Offline — dropdown just shows the current version.
      })
  }, [tab, versions.length])

  const logRef = useRef<HTMLPreElement>(null)
  const packLogs = logs[modpackId] ?? []

  useEffect(() => {
    if (tab === 'logs' && logRef.current !== null) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [tab, packLogs.length])

  if (pack === null) return <></>

  const progress = installProgress[modpackId]
  const gameState = gameStates[modpackId]
  const isInstalling = progress !== undefined
  const isRunning = gameState === 'launching' || gameState === 'running'

  const subtitle = formatSubtitle(pack)
  const statusText =
    progress !== undefined
      ? `${progress.message} (${progress.percent}%)`
      : gameState === 'launching'
        ? 'Starting…'
        : gameState === 'running'
          ? 'Running'
          : null

  function play(): void {
    setTab('logs')
    void launch(modpackId)
  }

  async function confirmDelete(): Promise<void> {
    setDeleting(true)
    setSettingsError(null)
    try {
      await remove(modpackId)
      closeModpack()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete modpack'
      setSettingsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  async function toggleMod(mod: InstalledMod): Promise<void> {
    setModsError(null)
    try {
      const updated = await window.api.modpack.toggleMod(modpackId, mod.fileName, !mod.enabled)
      setMods((current) =>
        current === null ? null : current.map((m) => (m.fileName === mod.fileName ? updated : m))
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not toggle the mod'
      setModsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  async function removeMod(mod: InstalledMod): Promise<void> {
    setModsError(null)
    try {
      await window.api.modpack.removeMod(modpackId, mod.fileName)
      setMods((current) =>
        current === null ? null : current.filter((m) => m.fileName !== mod.fileName)
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the mod'
      setModsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  async function saveSettings(): Promise<void> {
    setSettingsError(null)
    try {
      await updateSettings(modpackId, {
        name,
        memoryMb,
        javaArgs,
        gameVersion: gameVersion === '' ? null : gameVersion
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings'
      setSettingsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  return (
    <div className={styles.overlay} onClick={closeModpack}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label={pack.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={closeModpack}>
          <CloseIcon />
        </button>

        <header className={styles.header}>
          <span className={styles.icon}>
            <WindIcon size={36} />
          </span>
          <div className={styles.headerText}>
            <h2 className={styles.name}>{localPack?.name ?? pack.name}</h2>
            {subtitle !== null && <span className={styles.badge}>{subtitle}</span>}
            {statusText !== null && <span className={styles.status}>{statusText}</span>}
          </div>
          <div className={styles.headerActions}>
            {localPack !== null && (
              <button
                type="button"
                className={styles.folderButton}
                title="Open instance folder"
                aria-label="Open instance folder"
                onClick={() => void window.api.modpack.openFolder(modpackId)}
              >
                <FolderIcon />
              </button>
            )}
            {isRunning ? (
              <button type="button" className={styles.stopButton} onClick={() => void stop(modpackId)}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className={styles.playButton}
                disabled={localPack === null || isInstalling}
                title={
                  localPack === null ? 'Available after Modrinth integration (Phase 4)' : undefined
                }
                onClick={play}
              >
                Play
              </button>
            )}
          </div>
        </header>

        {launchError !== null && <div className={styles.error}>{launchError}</div>}

        <nav className={styles.tabs}>
          {(['mods', 'settings', 'logs'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? styles.tabActive : styles.tab}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        {tab === 'mods' && (
          <>
            {modsError !== null && <div className={styles.error}>{modsError}</div>}
            {mods === null ? (
              <div className={styles.placeholderNote}>Reading mods…</div>
            ) : mods.length === 0 ? (
              <div className={styles.placeholderNote}>
                No mods installed. Find some on the Discover page, or drop jars into the
                modpack&apos;s <code>mods</code> folder.
              </div>
            ) : (
              <ul className={styles.modList}>
                {mods.map((mod) => (
                  <li key={mod.fileName} className={styles.modRow}>
                    <div className={styles.modInfo}>
                      <span className={styles.modName}>{mod.name}</span>
                      {!mod.enabled && <span className={styles.modVersion}>Disabled</span>}
                    </div>
                    <div className={styles.modActions}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={mod.enabled}
                        aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`}
                        className={mod.enabled ? styles.toggleOn : styles.toggle}
                        onClick={() => void toggleMod(mod)}
                      >
                        <span className={styles.toggleKnob} />
                      </button>
                      <button
                        type="button"
                        className={styles.modRemove}
                        aria-label={`Remove ${mod.name}`}
                        title="Remove mod"
                        onClick={() => void removeMod(mod)}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'settings' && (
          <div className={styles.settings}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={localPack === null}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Memory — {(memoryMb / 1024).toFixed(1)} GB
              </span>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={memoryMb}
                onChange={(e) => setMemoryMb(Number(e.target.value))}
                className={styles.slider}
                disabled={localPack === null}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Game version</span>
              <select
                className={styles.input}
                value={gameVersion}
                onChange={(e) => setGameVersion(e.target.value)}
                disabled={localPack === null}
              >
                {gameVersion === '' && <option value="">— not assigned —</option>}
                {gameVersion !== '' && !versions.includes(gameVersion) && (
                  <option value={gameVersion}>{gameVersion}</option>
                )}
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Java arguments</span>
              <input
                className={styles.input}
                value={javaArgs}
                onChange={(e) => setJavaArgs(e.target.value)}
                spellCheck={false}
                disabled={localPack === null}
              />
            </label>
            <button
              type="button"
              className={styles.saveButton}
              disabled={localPack === null}
              onClick={() => void saveSettings()}
            >
              {settingsSaved ? 'Saved ✓' : 'Save'}
            </button>
            {settingsError !== null && <span className={styles.errorText}>{settingsError}</span>}

            {localPack !== null && (
              <div className={styles.dangerZone}>
                <span className={styles.dangerLabel}>Danger zone</span>
                {confirmingDelete ? (
                  <div className={styles.dangerConfirm}>
                    <span className={styles.dangerWarning}>
                      Permanently deletes &quot;{localPack.name}&quot; with all its worlds, mods and
                      settings. This cannot be undone.
                    </span>
                    <div className={styles.dangerButtons}>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        disabled={deleting}
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        disabled={deleting}
                        onClick={() => void confirmDelete()}
                      >
                        {deleting ? 'Deleting…' : 'Delete forever'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete instance…
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <pre ref={logRef} className={styles.logView}>
            {packLogs.length === 0 ? 'No output yet. Press Play to see logs.' : packLogs.join('\n')}
          </pre>
        )}
      </div>
    </div>
  )
}
