import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import LoaderIcon from '../common/LoaderIcons'
import Dropdown from '../common/Dropdown'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { ModLoader } from '@shared/types'
import styles from './CreateModpackModal.module.css'

const LOADERS: { id: ModLoader; label: string }[] = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' }
]

export default function CreateModpackModal(): JSX.Element {
  const closeCreate = useModalStore((s) => s.closeCreate)
  const { closing, requestClose } = useCloseAnimation(closeCreate)
  const openModpack = useModalStore((s) => s.openModpack)
  const create = useModpackStore((s) => s.create)
  const importModpack = useModpackStore((s) => s.importModpack)

  const [name, setName] = useState('')
  const [loader, setLoader] = useState<ModLoader>('vanilla')
  const [versions, setVersions] = useState<string[]>([])
  const [gameVersion, setGameVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  /** Per non-vanilla loader: false = confirmed no build for the version. */
  const [avail, setAvail] = useState<Partial<Record<ModLoader, boolean>>>({})

  useEffect(() => {
    let cancelled = false
    window.api.minecraft
      .versions()
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        if (list.length > 0) setGameVersion(list[0])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load version list — check your connection')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Check every loader against the chosen version so unsupported ones can
  // be grayed out — never create an instance that can't launch. Network
  // failures are treated as "available" so offline users can still create.
  useEffect(() => {
    if (gameVersion === '') return
    let cancelled = false
    setChecking(true)
    setAvail({})
    const targets: ModLoader[] = ['fabric', 'forge', 'neoforge', 'quilt']
    void Promise.all(
      targets.map((l) =>
        window.api.loader
          .check(l, gameVersion)
          .then((ok) => [l, ok] as const)
          .catch(() => [l, true] as const)
      )
    ).then((results) => {
      if (cancelled) return
      const map: Partial<Record<ModLoader, boolean>> = {}
      for (const [l, ok] of results) map[l] = ok
      setAvail(map)
      setChecking(false)
      // If the selected loader just became unavailable, fall back to Vanilla.
      setLoader((cur) => (cur !== 'vanilla' && map[cur] === false ? 'vanilla' : cur))
    })
    return () => {
      cancelled = true
    }
  }, [gameVersion])

  async function importPack(): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const pack = await importModpack()
      if (pack === null) {
        // Dialog cancelled — leave the form as-is.
        setSubmitting(false)
        return
      }
      closeCreate()
      openModpack(pack.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import modpack')
      setSubmitting(false)
    }
  }

  async function submit(): Promise<void> {
    if (gameVersion === '' || submitting || checking) return
    setSubmitting(true)
    setError(null)
    try {
      const pack = await create({ name, loader, gameVersion })
      closeCreate()
      openModpack(pack.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create modpack')
      setSubmitting(false)
    }
  }

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} onClick={requestClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Create modpack"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={requestClose}>
          <CloseIcon />
        </button>
        <h2 className={styles.title}>New modpack</h2>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <div className={styles.nameRow}>
            <input
              className={styles.input}
              value={name}
              placeholder="Unnamed modpack"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={styles.importButton}
              disabled={submitting}
              title="Import"
              onClick={() => void importPack()}
            >
              Import
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Loader</span>
          <div className={styles.loaderRow}>
            {LOADERS.map((l) => {
              const unavailable = l.id !== 'vanilla' && avail[l.id] === false
              return (
                <button
                  key={l.id}
                  type="button"
                  className={loader === l.id ? styles.loaderActive : styles.loader}
                  disabled={unavailable}
                  title={unavailable ? `No ${l.label} build for Minecraft ${gameVersion}` : undefined}
                  onClick={() => setLoader(l.id)}
                >
                  <LoaderIcon loader={l.id} size={14} />
                  {l.label}
                </button>
              )
            })}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Game version</span>
          <Dropdown
            ariaLabel="Game version"
            value={gameVersion}
            onChange={setGameVersion}
            disabled={versions.length === 0}
            placeholder="Select version…"
            options={versions.map((v) => ({ value: v, label: v }))}
          />
        </label>

        {error !== null && <span className={styles.error}>{error}</span>}

        <button
          type="button"
          className={styles.createButton}
          disabled={gameVersion === '' || submitting || checking}
          onClick={() => void submit()}
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}
