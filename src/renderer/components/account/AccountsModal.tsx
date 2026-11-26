import { useState, type FormEvent } from 'react'
import type { MinecraftProfile } from '@shared/types'
import Avatar from '../common/Avatar'
import { CloseIcon, PlusIcon, UploadIcon } from '../common/Icons'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss'
import { useAuthStore } from '../../store/authStore'
import { useModalStore } from '../../store/modalStore'
import styles from './AccountsModal.module.css'

function AccountRow({ account, active }: { account: MinecraftProfile; active: boolean }): JSX.Element {
  const { skinBusyUuid, switchAccount, removeAccount, importSkin, setSkinModel, resetSkin } =
    useAuthStore()
  const busy = skinBusyUuid === account.uuid
  const otherBusy = skinBusyUuid !== null && !busy
  const [confirmRemove, setConfirmRemove] = useState(false)
  const nextModel = account.skinModel === 'slim' ? 'classic' : 'slim'

  return (
    <li className={`${styles.row} ${active ? styles.rowActive : ''}`}>
      <Avatar size={36} skinBase64={account.skinBase64} />
      <div className={styles.rowText}>
        <span className={styles.name}>{account.username}</span>
        <span className={styles.type}>
          {account.type === 'offline' ? 'Offline' : 'Microsoft'}
          {active && ' · active'}
        </span>
      </div>

      <div className={styles.skinControls}>
        {account.skinBase64 !== null && (
          <button
            type="button"
            className={styles.chip}
            disabled={busy || otherBusy}
            onClick={() => void setSkinModel(account.uuid, nextModel)}
            title={`Arm model — switch to ${nextModel === 'slim' ? 'Slim (Alex)' : 'Classic (Steve)'}`}
          >
            {account.skinModel === 'slim' ? 'Slim' : 'Classic'}
          </button>
        )}
        <button
          type="button"
          className={styles.iconButton}
          disabled={busy || otherBusy}
          onClick={() => void importSkin(account.uuid, account.skinModel)}
          title="Import skin from PNG"
          aria-label="Import skin from PNG"
        >
          {busy ? <span className={styles.spinner} /> : <UploadIcon size={16} />}
        </button>
        {account.skinBase64 !== null && (
          <button
            type="button"
            className={styles.textButton}
            disabled={busy || otherBusy}
            onClick={() => void resetSkin(account.uuid)}
            title="Back to the default skin"
          >
            Reset
          </button>
        )}
      </div>

      {active ? (
        <span className={styles.activeBadge}>In use</span>
      ) : (
        <button type="button" className={styles.useButton} onClick={() => void switchAccount(account.uuid)}>
          Use
        </button>
      )}

      {confirmRemove ? (
        <button
          type="button"
          className={styles.removeConfirm}
          onClick={() => void removeAccount(account.uuid)}
          onBlur={() => setConfirmRemove(false)}
          autoFocus
        >
          Remove?
        </button>
      ) : (
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setConfirmRemove(true)}
          title="Remove account"
          aria-label="Remove account"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </li>
  )
}

function AddOffline(): JSX.Element {
  const { status, loginOffline } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const busy = status === 'authenticating'

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (await loginOffline(name)) {
      setName('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        <PlusIcon size={16} /> Offline account
      </button>
    )
  }

  return (
    <form className={styles.addForm} onSubmit={(e) => void submit(e)}>
      <input
        className={styles.nickInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nickname"
        maxLength={16}
        autoFocus
        spellCheck={false}
        disabled={busy}
      />
      <button type="submit" className={styles.primaryButton} disabled={busy || name.trim() === ''}>
        Add
      </button>
      <button type="button" className={styles.textButton} onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
    </form>
  )
}

/** Account manager: switch between saved accounts and manage their skins. */
export default function AccountsModal(): JSX.Element {
  const closeAccounts = useModalStore((s) => s.closeAccounts)
  const { closing, requestClose } = useCloseAnimation(closeAccounts)
  const backdrop = useBackdropDismiss(requestClose)
  const { accounts, activeUuid, status, error, login } = useAuthStore()

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} {...backdrop}>
      <div className={styles.modal} role="dialog" aria-label="Accounts" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={requestClose}>
          <CloseIcon size={18} />
        </button>
        <h2 className={styles.title}>Accounts</h2>

        {accounts.length === 0 ? (
          <p className={styles.empty}>No accounts yet — add one below.</p>
        ) : (
          <ul className={styles.list}>
            {accounts.map((a) => (
              <AccountRow key={a.uuid} account={a} active={a.uuid === activeUuid} />
            ))}
          </ul>
        )}

        <p className={styles.hint}>
          Skins: 64×64 PNG. Microsoft skins are uploaded to Mojang; offline skins are shown in game
          on your side only.
        </p>

        {error !== null && <span className={styles.error}>{error}</span>}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.addButton}
            disabled={status === 'authenticating'}
            onClick={() => void login()}
          >
            <PlusIcon size={16} /> {status === 'authenticating' ? 'Signing in…' : 'Microsoft account'}
          </button>
          <AddOffline />
        </div>
      </div>
    </div>
  )
}
