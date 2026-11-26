import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import Avatar from '../common/Avatar'
import FilterSidebar from '../discover/FilterSidebar'
import { CompassIcon, GearIcon, GitHubIcon, MonitorIcon } from '../common/Icons'
import { useAuthStore } from '../../store/authStore'
import { useModalStore } from '../../store/modalStore'
import { useDiscoverStore } from '../../store/discoverStore'
import styles from './RightPanel.module.css'

// Edit to your repository URL.
const GITHUB_URL = 'https://github.com/Shroud-y/c2launcher'

function OfflineLoginForm({ onCancel }: { onCancel: () => void }): JSX.Element {
  const { status, error, loginOffline } = useAuthStore()
  const [name, setName] = useState('')
  const busy = status === 'authenticating'

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await loginOffline(name)
  }

  return (
    <form className={`${styles.accountSlot} ${styles.loggedOut}`} onSubmit={(e) => void submit(e)}>
      <span className={styles.accountHint}>Offline nickname</span>
      <div className={styles.loginRow}>
        <input
          className={styles.nickInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Steve"
          maxLength={16}
          autoFocus
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" className={styles.loginButton} disabled={busy || name.trim() === ''}>
          Play
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
      {error !== null && <span className={styles.error}>{error}</span>}
    </form>
  )
}

function AccountsGear(): JSX.Element {
  const openAccounts = useModalStore((s) => s.openAccounts)
  return (
    <button
      type="button"
      className={styles.gearButton}
      onClick={openAccounts}
      title="Manage accounts and skins"
      aria-label="Manage accounts and skins"
    >
      <GearIcon size={18} />
    </button>
  )
}

function AccountSection(): JSX.Element {
  const { profile, accounts, status, error, login, clearError } = useAuthStore()
  const [offlineForm, setOfflineForm] = useState(false)

  // A fresh logout should land on the account choice, not a stale form.
  useEffect(() => {
    if (profile !== null) setOfflineForm(false)
  }, [profile])

  if (status === 'initializing') {
    return <div className={`${styles.accountSlot} ${styles.accountHint}`}>Checking account…</div>
  }

  if (profile !== null) {
    return (
      <div className={`${styles.accountSlot} ${styles.account}`}>
        <Avatar size={40} skinBase64={profile.skinBase64} />
        <div className={styles.accountText}>
          <span className={styles.username}>{profile.username}</span>
          <span className={styles.accountType}>
            {profile.type === 'offline' ? 'Offline account' : 'License account'}
          </span>
        </div>
        <AccountsGear />
      </div>
    )
  }

  if (offlineForm) {
    return (
      <OfflineLoginForm
        onCancel={() => {
          clearError()
          setOfflineForm(false)
        }}
      />
    )
  }

  const busy = status === 'authenticating'

  return (
    <div className={`${styles.accountSlot} ${styles.loggedOut}`}>
      <div className={styles.hintRow}>
        <span className={styles.accountHint}>Not logged in</span>
        {accounts.length > 0 && <AccountsGear />}
      </div>
      <div className={styles.loginRow}>
        <button
          type="button"
          className={styles.loginButton}
          disabled={busy}
          onClick={() => void login()}
          title="Sign in with a licensed Microsoft account"
        >
          {busy ? 'Signing in…' : 'Microsoft'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => {
            clearError()
            setOfflineForm(true)
          }}
          title="Play with just a nickname"
        >
          Offline
        </button>
      </div>
      {error !== null && <span className={styles.error}>{error}</span>}
    </div>
  )
}

// Server/Client environment toggle, pinned in the corner between the account
// block and the FilterSidebar separator. No "All" option — deactivating the
// active side (clicking it again) clears the filter. Absolutely positioned so
// it never shifts the account, sidebar, or GitHub button.
// CurseForge has no side facet: the buttons stay (layout is fixed) but are
// disabled, and the store doesn't send the filter for that source.
function EnvFilter(): JSX.Element {
  const environment = useDiscoverStore((s) => s.environment)
  const setEnvironment = useDiscoverStore((s) => s.setEnvironment)
  const unsupported = useDiscoverStore((s) => s.source === 'curseforge')
  const title = unsupported ? 'Not available on CurseForge' : undefined

  return (
    <div className={styles.envFilter}>
      <button
        type="button"
        className={environment === 'server' && !unsupported ? styles.envButtonActive : styles.envButton}
        disabled={unsupported}
        title={title}
        onClick={() => setEnvironment(environment === 'server' ? null : 'server')}
      >
        <MonitorIcon size={14} className={styles.envIcon} />
        Server
      </button>
      <button
        type="button"
        className={environment === 'client' && !unsupported ? styles.envButtonActive : styles.envButton}
        disabled={unsupported}
        title={title}
        onClick={() => setEnvironment(environment === 'client' ? null : 'client')}
      >
        <CompassIcon size={14} className={styles.envIcon} />
        Client
      </button>
    </div>
  )
}

export default function RightPanel(): JSX.Element {
  const { pathname } = useLocation()

  return (
    <aside className={styles.panel}>
      <AccountSection />
      {pathname === '/discover' && <span className={styles.envDivider} aria-hidden="true" />}
      {pathname === '/discover' && <EnvFilter />}
      {pathname === '/discover' && <span className={styles.githubDivider} aria-hidden="true" />}
      <a
        className={styles.github}
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="View on GitHub"
        aria-label="View on GitHub"
      >
        <GitHubIcon size={22} />
      </a>
      {pathname === '/discover' ? (
        <FilterSidebar />
      ) : (
        <div className={styles.dividers}>
          <span className={styles.divider} />
          <span className={styles.divider} />
          <span className={styles.divider} />
        </div>
      )}
    </aside>
  )
}
