import { useLocation } from 'react-router-dom'
import Avatar from '../common/Avatar'
import FilterSidebar from '../discover/FilterSidebar'
import { useAuthStore } from '../../store/authStore'
import styles from './RightPanel.module.css'

function AccountSection(): JSX.Element {
  const { profile, status, error, login } = useAuthStore()

  if (status === 'initializing') {
    return <div className={styles.accountHint}>Checking account…</div>
  }

  if (profile !== null) {
    return (
      <div className={styles.account}>
        <Avatar size={40} skinBase64={profile.skinBase64} />
        <div className={styles.accountText}>
          <span className={styles.username}>{profile.username}</span>
          <span className={styles.accountType}>License account</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.loggedOut}>
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

export default function RightPanel(): JSX.Element {
  const { pathname } = useLocation()

  return (
    <aside className={styles.panel}>
      <AccountSection />
      {pathname === '/discover' && <FilterSidebar />}
    </aside>
  )
}
