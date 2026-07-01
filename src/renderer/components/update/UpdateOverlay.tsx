import { useUpdateStore } from '../../store/updateStore'
import styles from './UpdateOverlay.module.css'

/** Format a bytes/sec rate as a compact human-readable string. */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return ''
  const mb = bytesPerSecond / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`
  const kb = bytesPerSecond / 1024
  return `${Math.round(kb)} KB/s`
}

/**
 * Full-screen blocking overlay shown while the launcher updates itself. Appears
 * the instant the user starts an update and stays until the app quits to
 * install — so the update never reads as a freeze. It cannot be dismissed while
 * active; only the error state offers a way out.
 */
export default function UpdateOverlay(): JSX.Element | null {
  const phase = useUpdateStore((s) => s.phase)
  const percent = useUpdateStore((s) => s.percent)
  const bytesPerSecond = useUpdateStore((s) => s.bytesPerSecond)
  const error = useUpdateStore((s) => s.error)
  const dismissError = useUpdateStore((s) => s.dismissError)

  if (phase === 'idle') return null

  const speed = formatSpeed(bytesPerSecond)

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true">
      <div className={styles.panel}>
        {phase === 'downloading' && (
          <>
            <h2 className={styles.title}>Downloading update…</h2>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.meta}>
              <span>{percent}%</span>
              {speed !== '' && <span>{speed}</span>}
            </div>
          </>
        )}

        {phase === 'installing' && (
          <>
            <h2 className={styles.title}>Installing update</h2>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.note}>
              The launcher will close and restart automatically — please wait,
              don&apos;t close it manually.
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 className={styles.title}>Update failed</h2>
            <p className={styles.note}>{error ?? 'Something went wrong while updating.'}</p>
            <button type="button" className={styles.button} onClick={dismissError}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
