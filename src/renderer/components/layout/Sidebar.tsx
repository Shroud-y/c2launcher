import { useLocation, useNavigate } from 'react-router-dom'
import IconButton from '../common/IconButton'
import { CompassIcon, GearIcon, HomeIcon, LogoutIcon, PlusIcon, WindIcon } from '../common/Icons'
import { useAuthStore } from '../../store/authStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { IconTint } from '@shared/types'
import styles from './Sidebar.module.css'

const TINT_CLASS: Record<IconTint, string> = {
  teal: 'tintTeal',
  mint: 'tintMint',
  light: 'tintLight'
}

export default function Sidebar(): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const openModpack = useModalStore((s) => s.openModpack)
  const openCreate = useModalStore((s) => s.openCreate)
  const openSettings = useModalStore((s) => s.openSettings)
  const modpacks = useModpackStore((s) => s.modpacks)

  const recent = [...modpacks]
    .filter((m) => m.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 3)

  return (
    <nav className={styles.sidebar}>
      <IconButton label="Home" active={pathname === '/'} onClick={() => navigate('/')}>
        <HomeIcon />
      </IconButton>
      <IconButton label="Discover" active={pathname === '/discover'} onClick={() => navigate('/discover')}>
        <CompassIcon />
      </IconButton>

      <div className={styles.separator} />

      {recent.map((pack) => (
        <button
          key={pack.id}
          type="button"
          className={`${styles.recentSlot} ${styles[TINT_CLASS[pack.iconTint]]}`}
          title={pack.name}
          aria-label={pack.name}
          onClick={() => openModpack(pack.id)}
        >
          <WindIcon />
        </button>
      ))}

      <IconButton label="Add modpack" onClick={openCreate}>
        <PlusIcon />
      </IconButton>

      <div className={styles.spacer} />

      <IconButton label="Settings" onClick={openSettings}>
        <GearIcon />
      </IconButton>
      <IconButton label="Log out" danger onClick={() => void logout()}>
        <LogoutIcon />
      </IconButton>
    </nav>
  )
}
