import { useState } from 'react'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModpackStore } from '../../store/modpackStore'
import type { SearchResult } from '@shared/types'
import styles from './InstallAction.module.css'

/**
 * Install button shared by result cards and the project modal.
 * Modpacks install directly; mods first ask which local pack to
 * install into. Other content types render nothing (no target yet).
 */

interface InstallActionProps {
  result: SearchResult
}

export default function InstallAction({ result }: InstallActionProps): JSX.Element | null {
  const category = useDiscoverStore((s) => s.category)
  const installing = useDiscoverStore((s) => s.installing[result.id] === true)
  const installed = useDiscoverStore((s) => s.installed[result.id] === true)
  const installPack = useDiscoverStore((s) => s.installPack)
  const installMod = useDiscoverStore((s) => s.installMod)
  const modpacks = useModpackStore((s) => s.modpacks)

  const [pickingTarget, setPickingTarget] = useState(false)

  if (category !== 'modpacks' && category !== 'mods') return null

  // Mods need a loader-bearing local pack to land in.
  const targets = modpacks.filter((m) => m.loader !== null && m.loader !== 'vanilla')

  function onInstallClick(): void {
    if (category === 'modpacks') {
      void installPack(result.id)
    } else {
      setPickingTarget(true)
    }
  }

  function onTargetPicked(modpackId: string): void {
    setPickingTarget(false)
    if (modpackId !== '') void installMod(result.id, modpackId)
  }

  if (pickingTarget) {
    return (
      <select
        className={styles.targetSelect}
        autoFocus
        defaultValue=""
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onTargetPicked(e.target.value)}
        onBlur={() => setPickingTarget(false)}
      >
        <option value="" disabled>
          {targets.length === 0 ? 'No compatible modpack' : 'Install into…'}
        </option>
        {targets.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <button
      type="button"
      className={installed ? styles.installedButton : styles.installButton}
      disabled={installing || installed}
      onClick={(e) => {
        e.stopPropagation()
        onInstallClick()
      }}
    >
      {installing ? 'Installing…' : installed ? 'Installed ✓' : 'Install'}
    </button>
  )
}
