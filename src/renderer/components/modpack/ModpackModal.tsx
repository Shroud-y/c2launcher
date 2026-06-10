import { useState } from 'react'
import { CloseIcon, WindIcon } from '../common/Icons'
import { formatSubtitle, getPlaceholderDetail } from '../../data/placeholders'
import { useModalStore } from '../../store/modalStore'
import styles from './ModpackModal.module.css'

type ModalTab = 'mods' | 'settings'

interface ModpackModalProps {
  modpackId: string
}

export default function ModpackModal({ modpackId }: ModpackModalProps): JSX.Element {
  const closeModpack = useModalStore((s) => s.closeModpack)
  const detail = getPlaceholderDetail(modpackId)

  const [tab, setTab] = useState<ModalTab>('mods')
  const [mods, setMods] = useState(detail.mods)
  const [name, setName] = useState(detail.name)
  const [memoryMb, setMemoryMb] = useState(detail.memoryMb)
  const [javaArgs, setJavaArgs] = useState(detail.javaArgs)

  const subtitle = formatSubtitle(detail)

  function toggleMod(id: string): void {
    setMods((prev) => prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)))
  }

  return (
    <div className={styles.overlay} onClick={closeModpack}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label={detail.name}
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
            <h2 className={styles.name}>{name}</h2>
            {subtitle !== null && <span className={styles.badge}>{subtitle}</span>}
          </div>
          <div className={styles.headerActions}>
            {detail.updateAvailable && (
              <button type="button" className={styles.updateButton}>
                Update
              </button>
            )}
            <button type="button" className={styles.playButton}>
              Play
            </button>
          </div>
        </header>

        <nav className={styles.tabs}>
          <button
            type="button"
            className={tab === 'mods' ? styles.tabActive : styles.tab}
            onClick={() => setTab('mods')}
          >
            Mods
          </button>
          <button
            type="button"
            className={tab === 'settings' ? styles.tabActive : styles.tab}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        </nav>

        {tab === 'mods' ? (
          <ul className={styles.modList}>
            {mods.map((mod) => (
              <li key={mod.id} className={styles.modRow}>
                <div className={styles.modInfo}>
                  <span className={styles.modName}>{mod.name}</span>
                  <span className={styles.modVersion}>{mod.version}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mod.enabled}
                  aria-label={`Toggle ${mod.name}`}
                  className={mod.enabled ? styles.toggleOn : styles.toggle}
                  onClick={() => toggleMod(mod.id)}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.settings}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Java arguments</span>
              <input
                className={styles.input}
                value={javaArgs}
                onChange={(e) => setJavaArgs(e.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
