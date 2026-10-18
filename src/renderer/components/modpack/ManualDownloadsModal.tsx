import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import styles from './ManualDownloadsModal.module.css'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface ManualDownloadsModalProps {
  modpackId: string
}

/**
 * Files whose authors forbid launcher downloads (CurseForge). The user
 * opens each page in the browser and downloads it; main polls the
 * Downloads folder while this dialog is open and places matching files
 * (by sha1), so rows tick off by themselves via the modpack state stream.
 */
export default function ManualDownloadsModal({ modpackId }: ManualDownloadsModalProps): JSX.Element {
  const closeManualDownloads = useModalStore((s) => s.closeManualDownloads)
  const { closing, requestClose } = useCloseAnimation(closeManualDownloads)
  const backdrop = useBackdropDismiss(requestClose)
  const pack = useModpackStore((s) => s.modpacks.find((m) => m.id === modpackId) ?? null)
  const pending = pack?.pendingDownloads ?? []

  const [picking, setPicking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  /** How many files were pending when the dialog opened — for the progress line. */
  const [initialCount] = useState(pending.length)

  useEffect(() => {
    void window.api.modpack.manualWatch(modpackId, true)
    return () => {
      void window.api.modpack.manualWatch(modpackId, false)
    }
  }, [modpackId])

  async function pickFiles(): Promise<void> {
    setPicking(true)
    setNote(null)
    try {
      const result = await window.api.modpack.manualPick(modpackId)
      if (result !== null && result.unmatched.length > 0) {
        setNote(`Not part of this list: ${result.unmatched.join(', ')}`)
      }
    } catch (err) {
      setNote(err instanceof Error ? stripIpcPrefix(err.message) : 'Could not add the files')
    } finally {
      setPicking(false)
    }
  }

  async function skip(fileName: string): Promise<void> {
    try {
      await window.api.modpack.manualSkip(modpackId, fileName)
    } catch (err) {
      setNote(err instanceof Error ? stripIpcPrefix(err.message) : 'Could not skip the file')
    }
  }

  const done = pending.length === 0

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} {...backdrop}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Manual downloads"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={requestClose}>
          <CloseIcon />
        </button>

        <h2 className={styles.title}>Manual download needed</h2>
        {done ? (
          <p className={styles.text}>All files are in place — {pack?.name ?? 'the modpack'} is ready.</p>
        ) : (
          <>
            <p className={styles.text}>
              The authors of these files don&apos;t allow launchers to download them. Open each page
              and download the file — C² picks it up from your Downloads folder automatically.
            </p>
            {initialCount > 1 && (
              <span className={styles.progress}>
                {initialCount - pending.length} of {initialCount} done
              </span>
            )}
            <ul className={styles.list}>
              {pending.map((d) => (
                <li key={`${d.dir}/${d.fileName}`} className={styles.row}>
                  <div className={styles.rowText}>
                    <span className={styles.rowName}>{d.name}</span>
                    <span className={styles.rowFile}>
                      {d.fileName} · {formatSize(d.size)}
                    </span>
                  </div>
                  {d.pageUrl !== null && (
                    <a
                      className={styles.openButton}
                      href={d.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open page
                    </a>
                  )}
                  <button
                    type="button"
                    className={styles.skipButton}
                    title="Remove from the list without installing"
                    onClick={() => void skip(d.fileName)}
                  >
                    Skip
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {note !== null && <div className={styles.note}>{note}</div>}

        <div className={styles.actions}>
          {!done && (
            <>
              <span className={styles.watching}>Watching Downloads…</span>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={picking}
                onClick={() => void pickFiles()}
              >
                {picking ? 'Adding…' : 'Select files…'}
              </button>
            </>
          )}
          <button type="button" className={styles.primaryButton} onClick={requestClose}>
            {done ? 'Done' : 'Later'}
          </button>
        </div>
      </div>
    </div>
  )
}
