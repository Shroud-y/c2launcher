import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDownIcon,
  DownloadIcon,
  FolderIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  StopIcon,
  TrashIcon,
  UploadIcon,
  WindIcon
} from '../common/Icons'
import Dropdown from '../common/Dropdown'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss'
import { formatSubtitle } from '../../data/format'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { ContentUpdate, InstallableCategory, InstalledContent, ModLoader } from '@shared/types'
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

const SOURCE_LABELS: Record<string, string> = { modrinth: 'Modrinth', curseforge: 'CurseForge' }

function isContentTab(tab: ModalTab): tab is InstallableCategory {
  return (CONTENT_TABS as string[]).includes(tab)
}

interface ModpackModalProps {
  modpackId: string
}

export default function ModpackModal({ modpackId }: ModpackModalProps): JSX.Element {
  const navigate = useNavigate()
  const closeModpack = useModalStore((s) => s.closeModpack)
  const { closing, requestClose } = useCloseAnimation(closeModpack)
  const confirmBackdrop = useBackdropDismiss(() => {
    if (!deleting) setConfirmingDelete(false)
  })
  const openManualDownloads = useModalStore((s) => s.openManualDownloads)
  const setInstallTarget = useDiscoverStore((s) => s.setInstallTarget)
  const setDiscoverCategory = useDiscoverStore((s) => s.setCategory)
  const {
    modpacks,
    installProgress,
    gameStates,
    gameResults,
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
  const [loader, setLoader] = useState<ModLoader>(pack?.loader ?? 'vanilla')
  /** Empty string = latest (resolved at launch). */
  const [loaderVersion, setLoaderVersion] = useState(pack?.loaderVersion ?? '')
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false)
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
  const [bulkUpdating, setBulkUpdating] = useState(false)
  /** Per-tab name filter for the installed list; reset when switching tabs. */
  const [search, setSearch] = useState('')
  const [importingFiles, setImportingFiles] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!isContentTab(tab) || content[tab] !== undefined) return
    const category = tab
    window.api.modpack
      .content(modpackId, category)
      .then((items) => setContent((c) => ({ ...c, [category]: items })))
      .catch(() => setModsError(`Could not read the ${EMPTY_NOTES[category].folder} folder`))
  }, [tab, content, modpackId])

  // Ask Modrinth (sha1) and CurseForge (fingerprint) whether newer compatible versions exist.
  // Runs in parallel with the content listing above — the main process
  // reads the folder itself and shares a hash cache, so the "Update all"
  // button no longer waits for the list to finish first. Best-effort:
  // offline shows no badges.
  useEffect(() => {
    if (!isContentTab(tab) || updates[tab] !== undefined) return
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
  }, [tab, updates, modpackId])

  useEffect(() => {
    if (tab !== 'settings' || versions.length > 0) return
    window.api.minecraft
      .versions()
      .then(setVersions)
      .catch(() => {
        // Offline — dropdown just shows the current version.
      })
  }, [tab, versions.length])

  // Loader builds for the chosen loader + version, for the picker dropdown.
  useEffect(() => {
    if (tab !== 'settings' || loader === 'vanilla' || gameVersion === '') {
      setLoaderVersions([])
      return
    }
    let cancelled = false
    setLoaderVersionsLoading(true)
    window.api.loader
      .versions(loader, gameVersion)
      .then((list) => {
        if (!cancelled) setLoaderVersions(list)
      })
      .catch(() => {
        if (!cancelled) setLoaderVersions([])
      })
      .finally(() => {
        if (!cancelled) setLoaderVersionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, loader, gameVersion])

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

  const result = gameResults[modpackId]
  const crashText =
    gameState === 'error'
      ? (result?.message ?? 'The game failed to launch.')
      : gameState === 'exited' && (result?.exitCode ?? 0) !== 0
        ? `Minecraft crashed (exit code ${result?.exitCode}). Check the Logs tab for details.`
        : null

  const subtitle = formatSubtitle(pack)
  const statusText =
    progress !== undefined
      ? `${progress.message} (${progress.percent}%)`
      : gameState === 'launching'
        ? 'Starting…'
        : gameState === 'running'
          ? 'Running'
          : null

  const tabContent = isContentTab(tab) ? (content[tab] ?? []) : []
  const visibleContent = tabContent.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )
  const tabUpdateCount = isContentTab(tab) ? Object.keys(updates[tab] ?? {}).length : 0

  function play(): void {
    setTab('logs')
    void launch(modpackId)
  }

  // The content tab the add actions apply to (settings/logs fall back to mods).
  const addCategory: InstallableCategory = isContentTab(tab) ? tab : 'mods'

  /** Browse Discover with installs locked to this instance and the active tab. */
  function addContent(): void {
    setInstallTarget(modpackId)
    setDiscoverCategory(addCategory)
    closeModpack()
    navigate('/discover')
  }

  /** Pick local files from disk and copy them into the active content folder. */
  async function importFiles(): Promise<void> {
    setModsError(null)
    setImportingFiles(true)
    try {
      const added = await window.api.modpack.importContent(modpackId, addCategory)
      if (added.length > 0) {
        // Show the new files immediately, then refresh so Modrinth/CurseForge metadata
        // (name, version, icon) fills in by hash.
        setContent((c) => ({ ...c, [addCategory]: [...(c[addCategory] ?? []), ...added] }))
        const enriched = await window.api.modpack.content(modpackId, addCategory)
        setContent((c) => ({ ...c, [addCategory]: enriched }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not import files'
      setModsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    } finally {
      setImportingFiles(false)
    }
  }

  /** Save dialog picks the format: .mrpack (Modrinth) or .zip (instance copy). */
  async function exportPack(): Promise<void> {
    setExportError(null)
    setExporting(true)
    try {
      await window.api.modpack.exportModpack(modpackId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not export the modpack'
      setExportError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    } finally {
      setExporting(false)
    }
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
          // The toggle response carries no source metadata — keep ours.
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
      const result = await window.api.modpack.installContent({
        modpackId,
        projectId: update.projectId,
        source: update.source,
        category,
        versionId: update.versionId,
        replaceFileName: item.fileName
      })
      if (result.kind === 'manual') {
        // A CurseForge update the author blocks from launchers: queued for
        // the manual dialog; the old file goes once the new one lands.
        openManualDownloads(modpackId)
        return
      }
      const installed = result.item
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

  /** Applies every available update in a tab, one after another. */
  async function updateAll(category: InstallableCategory): Promise<void> {
    const forTab = updates[category]
    if (forTab === undefined) return
    setBulkUpdating(true)
    setModsError(null)
    for (const fileName of Object.keys(forTab)) {
      const item = (content[category] ?? []).find((m) => m.fileName === fileName)
      if (item !== undefined) await applyUpdate(category, item)
    }
    setBulkUpdating(false)
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
        gameVersion: gameVersion === '' ? null : gameVersion,
        loader,
        loaderVersion: loaderVersion === '' ? null : loaderVersion
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings'
      setSettingsError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`}>
      <div className={styles.modal} role="dialog" aria-label={pack.name}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            aria-label="Back"
            title="Back (Esc)"
            onClick={requestClose}
          >
            <ChevronDownIcon size={20} className={styles.backIcon} />
          </button>
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
              <WindIcon size={34} />
            )}
          </button>
          <div className={styles.headerText}>
            <h2 className={styles.name}>{localPack?.name ?? pack.name}</h2>
            <div className={styles.meta}>
              {subtitle !== null && <span className={styles.badge}>{subtitle}</span>}
              {statusText !== null && <span className={styles.status}>{statusText}</span>}
            </div>
            {progress !== undefined && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            {isRunning ? (
              <button type="button" className={styles.stopButton} onClick={() => void stop(modpackId)}>
                <StopIcon size={18} />
                Stop
              </button>
            ) : (
              <button
                type="button"
                className={styles.playButton}
                disabled={localPack === null || isInstalling}
                onClick={play}
              >
                <PlayIcon size={18} />
                Play
              </button>
            )}
            {localPack !== null && (
              <>
                <button
                  type="button"
                  className={styles.roundButton}
                  title="Export modpack (.mrpack / .zip)"
                  aria-label="Export modpack"
                  disabled={exporting}
                  onClick={() => void exportPack()}
                >
                  <UploadIcon size={18} />
                </button>
                <button
                  type="button"
                  className={styles.roundButton}
                  title="Open instance folder"
                  aria-label="Open instance folder"
                  onClick={() => void window.api.modpack.openFolder(modpackId)}
                >
                  <FolderIcon size={18} />
                </button>
              </>
            )}
          </div>
        </header>

        {(launchError !== null ||
          exportError !== null ||
          crashText !== null ||
          (pack.pendingDownloads ?? []).length > 0) && (
          <div className={styles.banners}>
            {launchError !== null && <div className={styles.error}>{launchError}</div>}
            {exportError !== null && <div className={styles.error}>{exportError}</div>}
            {crashText !== null && <div className={styles.error}>{crashText}</div>}
            {(pack.pendingDownloads ?? []).length > 0 && (
              <div className={styles.pendingBanner}>
                <span>
                  {(pack.pendingDownloads ?? []).length} file(s) need a manual download before this
                  pack is complete.
                </span>
                <button
                  type="button"
                  className={styles.pendingButton}
                  onClick={() => openManualDownloads(modpackId)}
                >
                  Download files
                </button>
              </div>
            )}
          </div>
        )}

        <nav className={styles.tabs}>
          {([...CONTENT_TABS, 'settings', 'logs'] as ModalTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? styles.tabActive : styles.tab}
              onClick={() => {
                setSearch('')
                setTab(t)
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className={styles.body}>
        {isContentTab(tab) && (
          <>
            {localPack !== null && (
              <div className={styles.contentToolbar}>
                <label className={styles.searchBox}>
                  <SearchIcon size={16} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={`Search ${tabContent.length} ${EMPTY_NOTES[tab].label}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={styles.toolbarButton}
                  title="Import content from files"
                  disabled={importingFiles}
                  onClick={() => void importFiles()}
                >
                  <DownloadIcon size={16} />
                  Import files
                </button>
                <button
                  type="button"
                  className={styles.toolbarPrimary}
                  title="Add content from Discover"
                  onClick={addContent}
                >
                  <PlusIcon size={16} />
                  Add content
                </button>
              </div>
            )}
            {tabUpdateCount > 0 && (
              <div className={styles.subToolbar}>
                <button
                  type="button"
                  className={styles.updateAllButton}
                  disabled={bulkUpdating || updatingFile !== null}
                  onClick={() => void updateAll(tab)}
                >
                  <DownloadIcon size={15} />
                  {bulkUpdating ? 'Updating…' : `Update all (${tabUpdateCount})`}
                </button>
              </div>
            )}
            {modsError !== null && <div className={styles.error}>{modsError}</div>}
            {content[tab] === undefined ? (
              <div className={styles.placeholderNote}>Reading {EMPTY_NOTES[tab].label}…</div>
            ) : tabContent.length === 0 ? (
              <div className={styles.placeholderNote}>
                No {EMPTY_NOTES[tab].label} installed. Find some on the Discover page, or drop
                files into the modpack&apos;s <code>{EMPTY_NOTES[tab].folder}</code> folder.
              </div>
            ) : visibleContent.length === 0 ? (
              <div className={styles.placeholderNote}>No matches for “{search}”.</div>
            ) : (
              <div className={styles.table}>
                <div className={styles.tableHead}>
                  <span>Project</span>
                  <span>Version</span>
                  <span className={styles.actionsHead}>Actions</span>
                </div>
                <ul className={styles.modList}>
                  {visibleContent.map((item) => {
                    const update = updates[tab]?.[item.fileName]
                    return (
                      <li
                        key={item.fileName}
                        className={`${styles.modRow} ${item.enabled ? '' : styles.modRowDisabled}`}
                      >
                        <div className={styles.projectCell}>
                          {item.iconUrl !== null ? (
                            <img className={styles.modIcon} src={item.iconUrl} alt="" />
                          ) : (
                            <span className={styles.modIconFallback}>
                              <WindIcon size={20} />
                            </span>
                          )}
                          <div className={styles.modInfo}>
                            <span className={styles.modName}>{item.name}</span>
                            <span className={styles.modSub}>
                              {item.source !== null ? SOURCE_LABELS[item.source] : 'Local file'}
                              {!item.enabled && ' · Disabled'}
                            </span>
                          </div>
                        </div>
                        <div className={styles.versionCell}>
                          <span className={styles.modVersion}>{item.versionNumber ?? 'Unknown'}</span>
                          <span className={styles.modFile}>{item.fileName}</span>
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
                              <DownloadIcon size={16} />
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
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'settings' && (
          <div className={styles.settings}>
            <section className={styles.settingsSection}>
            <h4 className={styles.settingsHeading}>General</h4>
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
            </section>
            <section className={styles.settingsSection}>
            <h4 className={styles.settingsHeading}>Java</h4>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Memory — {(memoryMb / 1024).toFixed(1)} GB
              </span>
              <input
                type="range"
                min={1024}
                max={16384}
                step={64}
                value={memoryMb}
                onChange={(e) => setMemoryMb(Number(e.target.value))}
                className={styles.slider}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((memoryMb - 1024) / (16384 - 1024)) * 100}%, var(--border) ${((memoryMb - 1024) / (16384 - 1024)) * 100}%, var(--border) 100%)`,
                }}
                disabled={localPack === null}
              />
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
            </section>
            <section className={styles.settingsSection}>
            <h4 className={styles.settingsHeading}>Version</h4>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Game version</span>
              <Dropdown
                ariaLabel="Game version"
                value={gameVersion}
                disabled={localPack === null}
                onChange={(v) => {
                  setGameVersion(v)
                  // A pinned loader build rarely matches a different MC version.
                  setLoaderVersion('')
                }}
                options={[
                  ...(gameVersion === '' ? [{ value: '', label: '— not assigned —' }] : []),
                  ...(gameVersion !== '' && !versions.includes(gameVersion)
                    ? [{ value: gameVersion, label: gameVersion }]
                    : []),
                  ...versions.map((v) => ({ value: v, label: v }))
                ]}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Loader</span>
              <Dropdown
                ariaLabel="Loader"
                value={loader}
                disabled={localPack === null}
                onChange={(v) => {
                  setLoader(v as ModLoader)
                  setLoaderVersion('')
                }}
                options={[
                  { value: 'vanilla', label: 'Vanilla' },
                  { value: 'fabric', label: 'Fabric' },
                  { value: 'forge', label: 'Forge' },
                  { value: 'neoforge', label: 'NeoForge' },
                  { value: 'quilt', label: 'Quilt' }
                ]}
              />
            </label>
            {loader !== 'vanilla' && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Loader version</span>
                <Dropdown
                  ariaLabel="Loader version"
                  value={loaderVersion}
                  disabled={localPack === null || loaderVersionsLoading}
                  onChange={setLoaderVersion}
                  options={[
                    { value: '', label: loaderVersionsLoading ? 'Loading…' : 'LTS' },
                    ...(loaderVersion !== '' && !loaderVersions.includes(loaderVersion)
                      ? [{ value: loaderVersion, label: loaderVersion }]
                      : []),
                    ...loaderVersions.map((v) => ({ value: v, label: v }))
                  ]}
                />
              </label>
            )}
            </section>
            {localPack !== null && (
              <section className={`${styles.settingsSection} ${styles.dangerSection}`}>
                <h4 className={styles.settingsHeading}>Danger zone</h4>
                <p className={styles.dangerWarning}>
                  Deleting removes this instance with all its worlds, mods and settings.
                </p>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete instance…
                </button>
              </section>
            )}
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.saveButton}
                disabled={localPack === null}
                onClick={() => void saveSettings()}
              >
                {settingsSaved ? 'Saved ✓' : 'Save changes'}
              </button>
              {settingsError !== null && <span className={styles.errorText}>{settingsError}</span>}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <pre ref={logRef} className={styles.logView}>
            {packLogs.length === 0 ? 'No output yet. Press Play to see logs.' : packLogs.join('\n')}
          </pre>
        )}
        </div>
      </div>

      {localPack !== null && confirmingDelete && (
        <div
          className={styles.confirmOverlay}
          {...confirmBackdrop}
        >
          <div
            className={styles.confirmBox}
            role="alertdialog"
            aria-label="Delete instance"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.confirmTitle}>Delete &quot;{localPack.name}&quot;?</h3>
            <p className={styles.dangerWarning}>
              Permanently deletes this instance with all its worlds, mods and settings. This cannot
              be undone.
            </p>
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
        </div>
      )}
    </div>
  )
}
