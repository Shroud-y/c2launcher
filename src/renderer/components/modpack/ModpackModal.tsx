import { useEffect, useRef, useState } from 'react'
import { CloseIcon, WindIcon } from '../common/Icons'
import { formatSubtitle, placeholderModpacks } from '../../data/placeholders'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import styles from './ModpackModal.module.css'

type ModalTab = 'mods' | 'settings' | 'logs'

interface ModpackModalProps {
  modpackId: string
}

export default function ModpackModal({ modpackId }: ModpackModalProps): JSX.Element {
  const closeModpack = useModalStore((s) => s.closeModpack)
  const { modpacks, installProgress, gameStates, logs, launchError, launch, updateSettings } =
    useModpackStore()

  const localPack = modpacks.find((m) => m.id === modpackId) ?? null
  // Discover cards still carry placeholder data until Phase 4.
  const pack = localPack ?? placeholderModpacks.find((m) => m.id === modpackId) ?? null

  const [tab, setTab] = useState<ModalTab>('mods')
  const [name, setName] = useState(pack?.name ?? '')
  const [memoryMb, setMemoryMb] = useState(pack?.memoryMb ?? 4096)
  const [javaArgs, setJavaArgs] = useState(pack?.javaArgs ?? '')
  const [settingsSaved, setSettingsSaved] = useState(false)

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
  const isBusy = progress !== undefined || gameState === 'launching' || gameState === 'running'

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

  async function saveSettings(): Promise<void> {
    await updateSettings(modpackId, { name, memoryMb, javaArgs })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 1500)
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
            <button
              type="button"
              className={styles.playButton}
              disabled={localPack === null || isBusy}
              title={localPack === null ? 'Available after Modrinth integration (Phase 4)' : undefined}
              onClick={play}
            >
              {gameState === 'running' ? 'Running' : 'Play'}
            </button>
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
          <div className={styles.placeholderNote}>
            Mod management arrives with Modrinth integration (Phase 4). Drop jars into the
            modpack&apos;s <code>mods</code> folder meanwhile.
          </div>
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
