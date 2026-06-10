import { useLocation, useNavigate } from 'react-router-dom'
import IconButton from '../common/IconButton'
import { CompassIcon, GearIcon, HomeIcon, LogoutIcon, PlusIcon, WindIcon } from '../common/Icons'
import { useAuthStore } from '../../store/authStore'
import type { IconTint } from '@shared/types'
import styles from './Sidebar.module.css'

// Recent modpack slots are placeholders until Phase 3 wires real data.
const RECENT_SLOTS: { id: string; tint: IconTint }[] = [
  { id: 'recent-1', tint: 'teal' },
  { id: 'recent-2', tint: 'mint' },
  { id: 'recent-3', tint: 'light' }
]

const TINT_CLASS: Record<IconTint, string> = {
  teal: 'tintTeal',
  mint: 'tintMint',
  light: 'tintLight'
}

export default function Sidebar(): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const logout = useAuthStore((s) => s.logout)

  return (
    <nav className={styles.sidebar}>
      <IconButton label="Home" active={pathname === '/'} onClick={() => navigate('/')}>
        <HomeIcon />
      </IconButton>
      <IconButton label="Discover" active={pathname === '/discover'} onClick={() => navigate('/discover')}>
        <CompassIcon />
      </IconButton>

      <div className={styles.separator} />

      {RECENT_SLOTS.map((slot) => (
        <button
          key={slot.id}
          type="button"
          className={`${styles.recentSlot} ${styles[TINT_CLASS[slot.tint]]}`}
          title="Recent modpack"
          aria-label="Recent modpack"
        >
          <WindIcon />
        </button>
      ))}

      <IconButton label="Add modpack">
        <PlusIcon />
      </IconButton>

      <div className={styles.spacer} />

      <IconButton label="Settings">
        <GearIcon />
      </IconButton>
      <IconButton label="Log out" danger onClick={() => void logout()}>
        <LogoutIcon />
      </IconButton>
    </nav>
  )
}
