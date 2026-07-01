import { useLocation, useNavigate } from 'react-router-dom'
import IconButton from '../common/IconButton'
import {
  CompassIcon,
  DownloadIcon,
  GearIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  WindIcon
} from '../common/Icons'
import { useAuthStore } from '../../store/authStore'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import { useUpdateStore } from '../../store/updateStore'
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
  const gameStates = useModpackStore((s) => s.gameStates)
  const setInstallTarget = useDiscoverStore((s) => s.setInstallTarget)
  const updateAvailable = useUpdateStore((s) => s.available)
  const updateVersion = useUpdateStore((s) => s.version)
  const updating = useUpdateStore((s) => s.active)
  const percent = useUpdateStore((s) => s.percent)
  const installUpdate = useUpdateStore((s) => s.install)

  const recent = [...modpacks]
    .filter((m) => m.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 3)

  return (
    <nav className={styles.sidebar}>
      <IconButton label="Home" active={pathname === '/'} onClick={() => navigate('/')}>
        <HomeIcon size={28} />
      </IconButton>
      <IconButton
        label="Discover"
        active={pathname === '/discover'}
        onClick={() => {
          // Entering Discover via the sidebar is a fresh browse — drop
          // any instance lock set by an instance's + button.
          setInstallTarget(null)
          navigate('/discover')
        }}
      >
        <CompassIcon size={28} />
      </IconButton>

      <div className={styles.separator} />

      {recent.map((pack) => {
        const isRunning =
          gameStates[pack.id] === 'running' || gameStates[pack.id] === 'launching'
        return (
          <div key={pack.id} className={styles.recentWrap}>
            <button
              type="button"
              className={`${styles.recentSlot} ${styles[TINT_CLASS[pack.iconTint]]}`}
              title={pack.name}
              aria-label={pack.name}
              onClick={() => openModpack(pack.id)}
            >
              {(pack.icon ?? null) !== null ? (
                <img className={styles.recentIcon} src={pack.icon ?? ''} alt="" />
              ) : (
                <WindIcon />
              )}
            </button>
            {isRunning && <span className={styles.runningDot} aria-hidden="true" />}
          </div>
        )
      })}

      <IconButton label="Add modpack" onClick={openCreate}>
        <PlusIcon size={28} />
      </IconButton>

      <div className={styles.spacer} />

      {updateAvailable && (
        <button
          type="button"
          className={styles.updateButton}
          title={
            updating
              ? `Updating… ${percent}%`
              : `Update available${updateVersion !== null ? ` (v${updateVersion})` : ''} — click to install`
          }
          aria-label="Install update"
          onClick={installUpdate}
          disabled={updating}
        >
          <DownloadIcon size={28} />
          {updating && <span className={styles.updateProgress}>{percent}%</span>}
        </button>
      )}

      <IconButton label="Settings" onClick={openSettings}>
        <GearIcon size={26} />
      </IconButton>
      <IconButton label="Log out" danger onClick={() => void logout()}>
        <LogoutIcon size={28} />
      </IconButton>
    </nav>
  )
}
