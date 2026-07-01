import { useLocation } from 'react-router-dom'
import { CloseIcon, LogoIcon, MaximizeIcon, MinimizeIcon } from '../common/Icons'
import { useUpdateStore } from '../../store/updateStore'
import styles from './TopBar.module.css'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/discover': 'Discover content'
}

export default function TopBar(): JSX.Element {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'C² Launcher'
  // Block closing while an update is downloading/installing so the user can't
  // kill the app mid-update.
  const updating = useUpdateStore((s) => s.active)

  return (
    <header className={styles.topBar}>
      <div className={styles.logoSlot}>
        <LogoIcon size={40} className={styles.logo} />
      </div>
      <div className={styles.separator} />
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.windowButtons}>
        <button
          type="button"
          className={styles.windowButton}
          aria-label="Minimize"
          onClick={() => window.api.window.minimize()}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className={styles.windowButton}
          aria-label="Maximize"
          onClick={() => window.api.window.maximize()}
        >
          <MaximizeIcon />
        </button>
        <button
          type="button"
          className={`${styles.windowButton} ${styles.closeButton}`}
          aria-label="Close"
          onClick={() => window.api.window.close()}
          disabled={updating}
          title={updating ? 'Update in progress — please wait' : undefined}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}
