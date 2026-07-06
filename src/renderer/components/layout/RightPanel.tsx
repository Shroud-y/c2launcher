import { useLocation } from 'react-router-dom'
import Avatar from '../common/Avatar'
import FilterSidebar from '../discover/FilterSidebar'
import { CompassIcon, GitHubIcon, MonitorIcon } from '../common/Icons'
import { useAuthStore } from '../../store/authStore'
import { useDiscoverStore } from '../../store/discoverStore'
import styles from './RightPanel.module.css'

// Edit to your repository URL.
const GITHUB_URL = 'https://github.com/Shroud-y/c2launcher'

function AccountSection(): JSX.Element {
  const { profile, status, error, login } = useAuthStore()

  if (status === 'initializing') {
    return <div className={`${styles.accountSlot} ${styles.accountHint}`}>Checking account…</div>
  }

  if (profile !== null) {
    return (
      <div className={`${styles.accountSlot} ${styles.account}`}>
        <Avatar size={40} skinBase64={profile.skinBase64} />
        <div className={styles.accountText}>
          <span className={styles.username}>{profile.username}</span>
          <span className={styles.accountType}>License account</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.accountSlot} ${styles.loggedOut}`}>
      <span className={styles.accountHint}>Not logged in</span>
      <button
        type="button"
        className={styles.loginButton}
        disabled={status === 'authenticating'}
        onClick={() => void login()}
      >
        {status === 'authenticating' ? 'Signing in…' : 'Log in'}
      </button>
      {error !== null && <span className={styles.error}>{error}</span>}
    </div>
  )
}

// Server/Client environment toggle, pinned in the corner between the account
// block and the FilterSidebar separator. No "All" option — deactivating the
// active side (clicking it again) clears the filter. Absolutely positioned so
// it never shifts the account, sidebar, or GitHub button.
function EnvFilter(): JSX.Element {
  const environment = useDiscoverStore((s) => s.environment)
  const setEnvironment = useDiscoverStore((s) => s.setEnvironment)

  return (
    <div className={styles.envFilter}>
      <button
        type="button"
        className={environment === 'server' ? styles.envButtonActive : styles.envButton}
        onClick={() => setEnvironment(environment === 'server' ? null : 'server')}
      >
        <MonitorIcon size={14} className={styles.envIcon} />
        Server
      </button>
      <button
        type="button"
        className={environment === 'client' ? styles.envButtonActive : styles.envButton}
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
