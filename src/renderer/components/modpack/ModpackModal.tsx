import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloseIcon, DownloadIcon, FolderIcon, PlusIcon, WindIcon } from '../common/Icons'
import { formatSubtitle } from '../../data/format'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { ContentUpdate, InstallableCategory, InstalledContent } from '@shared/types'
import styles from './ModpackModal.module.css'

const CONTENT_TABS: InstallableCategory[] = ['mods', 'resourcepacks', 'shaders', 'datapacks']

type ModalTab = InstallableCategory | 'settings' | 'logs'

const TAB_LABELS: Record<ModalTab, string> = {
  mods: 'Mods',
  resourcepacks: 'Resource packs',
  shaders: 'Shaders',
  datapacks: 'Data packs',
  settings: 'Settings',
  logs: 'Logs'
}

const EMPTY_NOTES: Record<InstallableCategory, { label: string; folder: string }> = {
  mods: { label: 'mods', folder: 'mods' },
  resourcepacks: { label: 'resource packs', folder: 'resourcepacks' },
  shaders: { label: 'shaders', folder: 'shaderpacks' },
  datapacks: { label: 'data packs', folder: 'datapacks' }
}

function isContentTab(tab: ModalTab): tab is InstallableCategory {
  return (CONTENT_TABS as string[]).includes(tab)
}

interface ModpackModalProps {
  modpackId: string
}

export default function ModpackModal({ modpackId }: ModpackModalProps): JSX.Element {
  const navigate = useNavigate()
  const closeModpack = useModalStore((s) => s.closeModpack)
  const setInstallTarget = useDiscoverStore((s) => s.setInstallTarget)
  const setDiscoverCategory = useDiscoverStore((s) => s.setCategory)
  const {
    modpacks,
    installProgress,
    gameStates,
    logs,
    launchError,
    launch,
    stop,
    remove,
    updateSettings,
    setIcon
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
  const [content, setContent] = useState<
    Partial<Record<InstallableCategory, InstalledContent[]>>
  >({})
  const [modsError, setModsError] = useState<string | null>(null)
  /** Per tab: fileName → available update. Absent tab = not checked yet. */
  const [updates, setUpdates] = useState<
    Partial<Record<InstallableCategory, Record<string, ContentUpdate>>>
  >({})
  const [updatingFile, setUpdatingFile] = useState<string | null>(null)

  useEffect(() => {
    if (!isContentTab(tab) || content[tab] !== undefined) return
    const category = tab
    window.api.modpack
      .content(modpackId, category)
      .then((items) => setContent((c) => ({ ...c, [category]: items })))
      .catch(() => setModsError(`Could not read the ${EMPTY_NOTES[category].folder} folder`))
  }, [tab, content, modpackId])

  // Once a content tab is listed, ask Modrinth (by file hash) whether
  // newer compatible versions exist. Best-effort: offline shows no badges.
  useEffect(() => {
    if (!isContentTab(tab) || content[tab] === undefined || updates[tab] !== undefined) return
    const category = tab
    window.api.modpack
      .contentUpdates(modpackId, category)
      .then((list) => {
        const map: Record<string, ContentUpdate> = {}
        for (const update of list) map[update.fileName] = update
        setUpdates((all) => ({ ...all, [category]: map }))
      })
      .catch(() => {
        setUpdates((all) => ({ ...all, [category]: {} }))
      })
  }, [tab, content, updates, modpackId])

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

  /** + button: browse Discover with installs locked to this instance. */
  function addContent(): void {
    setInstallTarget(modpackId)
    setDiscoverCategory('mods')
    closeModpack()
    navigate('/discover')
  }

  async function changeIcon(clear: boolean): Promise<void> {
    setSettingsError(null)
    try {
      await setIcon(modpackId, clear)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not set the icon'
      setSettingsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
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

  async function toggleContent(
    category: InstallableCategory,
    item: InstalledContent
  ): Promise<void> {
    setModsError(null)
    try {
      const updated = await window.api.modpack.toggleContent(
        modpackId,
        category,
        item.fileName,
        !item.enabled
      )
      setContent((c) => ({
        ...c,
        [category]: (c[category] ?? []).map((m) =>
          // The toggle response carries no Modrinth metadata — keep ours.
          m.fileName === item.fileName
            ? { ...m, fileName: updated.fileName, enabled: updated.enabled }
            : m
        )
      }))
      // Updates are keyed by file name, which the toggle just changed.
      setUpdates((all) => {
        const forTab = all[category]
        const update = forTab?.[item.fileName]
        if (forTab === undefined || update === undefined) return all
        const { [item.fileName]: _old, ...rest } = forTab
        return {
          ...all,
          [category]: { ...rest, [updated.fileName]: { ...update, fileName: updated.fileName } }
        }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not toggle the file'
      setModsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  async function applyUpdate(
    category: InstallableCategory,
    item: InstalledContent
  ): Promise<void> {
    const update = updates[category]?.[item.fileName]
    if (update === undefined) return
    setModsError(null)
    setUpdatingFile(item.fileName)
    try {
      // Same switch path as Discover: new file lands, old one is removed.
      const installed = await window.api.modpack.installContent({
        modpackId,
        projectId: update.projectId,
        source: 'modrinth',
        category,
        versionId: update.versionId,
        replaceFileName: item.fileName
      })
      setContent((c) => ({
        ...c,
        [category]: (c[category] ?? []).map((m) =>
          m.fileName === item.fileName
            ? {
                ...m,
                fileName: installed.fileName,
                enabled: installed.enabled,
                versionNumber: update.versionNumber
              }
            : m
        )
      }))
      setUpdates((all) => {
        const { [item.fileName]: _done, ...rest } = all[category] ?? {}
        return { ...all, [category]: rest }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed'
      setModsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    } finally {
      setUpdatingFile(null)
    }
  }

  async function removeContent(
    category: InstallableCategory,
    item: InstalledContent
  ): Promise<void> {
    setModsError(null)
    try {
      await window.api.modpack.removeContent(modpackId, category, item.fileName)
      setContent((c) => ({
        ...c,
        [category]: (c[category] ?? []).filter((m) => m.fileName !== item.fileName)
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the file'
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
          <button
            type="button"
            className={styles.icon}
            title="Change icon"
            aria-label="Change icon"
            onClick={() => void changeIcon(false)}
          >
            {(pack.icon ?? null) !== null ? (
              <img className={styles.iconImage} src={pack.icon ?? ''} alt="" />
            ) : (
              <WindIcon size={36} />
            )}
          </button>
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
                title="Add content from Discover"
                aria-label="Add content from Discover"
                onClick={addContent}
              >
                <PlusIcon />
              </button>
            )}
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
          {([...CONTENT_TABS, 'settings', 'logs'] as ModalTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? styles.tabActive : styles.tab}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>

        {isContentTab(tab) && (
          <>
            {modsError !== null && <div className={styles.error}>{modsError}</div>}
            {content[tab] === undefined ? (
              <div className={styles.placeholderNote}>Reading {EMPTY_NOTES[tab].label}…</div>
            ) : (content[tab] ?? []).length === 0 ? (
              <div className={styles.placeholderNote}>
                No {EMPTY_NOTES[tab].label} installed. Find some on the Discover page, or drop
                files into the modpack&apos;s <code>{EMPTY_NOTES[tab].folder}</code> folder.
              </div>
            ) : (
              <ul className={styles.modList}>
                {(content[tab] ?? []).map((item) => {
                  const update = updates[tab]?.[item.fileName]
                  return (
                  <li key={item.fileName} className={styles.modRow}>
                    {item.iconUrl !== null ? (
                      <img className={styles.modIcon} src={item.iconUrl} alt="" />
                    ) : (
                      <span className={styles.modIconFallback}>
                        <WindIcon size={18} />
                      </span>
                    )}
                    <div className={styles.modInfo}>
                      <span className={styles.modName}>{item.name}</span>
                      {(item.versionNumber !== null || !item.enabled) && (
                        <span className={styles.modVersion}>
                          {[item.versionNumber, item.enabled ? null : 'Disabled']
                            .filter((p) => p !== null)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className={styles.modActions}>
                      {update !== undefined && (
                        <button
                          type="button"
                          className={
                            updatingFile === item.fileName ? styles.modUpdateBusy : styles.modUpdate
                          }
                          disabled={updatingFile !== null}
                          title={`Update to ${update.versionNumber}`}
                          aria-label={`Update ${item.name} to ${update.versionNumber}`}
                          onClick={() => void applyUpdate(tab, item)}
                        >
                          <DownloadIcon size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.enabled}
                        aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                        className={item.enabled ? styles.toggleOn : styles.toggle}
                        onClick={() => void toggleContent(tab, item)}
                      >
                        <span className={styles.toggleKnob} />
                      </button>
                      <button
                        type="button"
                        className={styles.modRemove}
                        aria-label={`Remove ${item.name}`}
                        title="Remove file"
                        onClick={() => void removeContent(tab, item)}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  </li>
                  )
                })}
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
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Icon</span>
              <div className={styles.iconRow}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  disabled={localPack === null}
                  onClick={() => void changeIcon(false)}
                >
                  Choose image…
                </button>
                {(pack.icon ?? null) !== null && (
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => void changeIcon(true)}
                  >
                    Use default
                  </button>
                )}
              </div>
            </div>
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
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.saveButton}
                disabled={localPack === null}
                onClick={() => void saveSettings()}
              >
                {settingsSaved ? 'Saved ✓' : 'Save'}
              </button>
              {localPack !== null && !confirmingDelete && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete instance…
                </button>
              )}
            </div>
            {settingsError !== null && <span className={styles.errorText}>{settingsError}</span>}

            {localPack !== null && confirmingDelete && (
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
