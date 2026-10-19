import { useEffect, useMemo, useState } from 'react'
import { formatBytes } from '../../data/format'
import { useModpackStore } from '../../store/modpackStore'
import { useSelectionStore } from '../../store/selectionStore'
import styles from './SelectionBar.module.css'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

/**
 * Bottom bar shown while instances are multi-selected: count, disk usage of
 * their folders, and bulk delete. Installing/running packs are skipped —
 * main refuses to delete those anyway.
 */
export default function SelectionBar(): JSX.Element | null {
  const modpacks = useModpackStore((s) => s.modpacks)
  const installProgress = useModpackStore((s) => s.installProgress)
  const gameStates = useModpackStore((s) => s.gameStates)
  const remove = useModpackStore((s) => s.remove)
  const selected = useSelectionStore((s) => s.selected)
  const clear = useSelectionStore((s) => s.clear)
  const unselect = useSelectionStore((s) => s.remove)

  // Only ids still in the registry (a pack may vanish while selected).
  const ids = useMemo(() => {
    const existing = new Set(modpacks.map((m) => m.id))
    return selected.filter((id) => existing.has(id))
  }, [modpacks, selected])

  const busyIds = ids.filter((id) => {
    const state = gameStates[id]
    return installProgress[id] !== undefined || state === 'running' || state === 'launching'
  })
  const deletable = ids.filter((id) => !busyIds.includes(id))

  const [size, setSize] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = ids.join(',')
  useEffect(() => {
    if (idsKey === '') return
    let stale = false
    setSize(null)
    window.api.modpack
      .diskUsage(idsKey.split(','))
      .then((bytes) => {
        if (!stale) setSize(bytes)
      })
      .catch(() => {
        if (!stale) setSize(null)
      })
    return () => {
      stale = true
    }
  }, [idsKey])

  // A changed selection invalidates a pending confirmation.
  useEffect(() => {
    setConfirming(false)
    setError(null)
  }, [idsKey])

  if (ids.length === 0) return null

  const runDelete = async (): Promise<void> => {
    setDeleting(true)
    const failed: string[] = []
    for (const id of deletable) {
      try {
        await remove(id)
        unselect([id])
      } catch (err) {
        const name = modpacks.find((m) => m.id === id)?.name ?? id
        const message = err instanceof Error ? stripIpcPrefix(err.message) : 'failed'
        failed.push(`${name}: ${message}`)
      }
    }
    setDeleting(false)
    setConfirming(false)
    if (failed.length > 0) setError(`Couldn't delete ${failed.join('; ')}`)
  }

  const plural = (n: number): string => `${n} instance${n === 1 ? '' : 's'}`

  return (
    <div className={styles.anchor}>
      <div className={styles.bar} role="region" aria-label="Selected instances">
        {confirming ? (
          <>
            <span className={styles.text}>
              Delete {plural(deletable.length)}? Their folders (worlds included) will be permanently
              removed.
            </span>
            <button
              type="button"
              className={styles.button}
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={() => void runDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        ) : (
          <>
            <span className={styles.count}>{ids.length} selected</span>
            <span className={styles.sep} aria-hidden="true" />
            <span className={styles.text}>{size === null ? '…' : formatBytes(size)}</span>
            {busyIds.length > 0 && (
              <span className={styles.note}>
                {busyIds.length} busy — will be skipped
              </span>
            )}
            {error !== null && <span className={styles.error}>{error}</span>}
            <button type="button" className={styles.button} onClick={clear}>
              Clear
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={() => setConfirming(true)}
              disabled={deletable.length === 0}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}
