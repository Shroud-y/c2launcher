import { useState } from 'react'
import InstancePicker from './InstancePicker'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModpackStore } from '../../store/modpackStore'
import type { InstallableCategory, Modpack, SearchResult } from '@shared/types'
import styles from './InstallAction.module.css'

interface Compatibility {
  gameVersions: string[]
  loaders: string[]
}

/**
 * Install button shared by result cards and the project modal.
 * Modpacks install directly; everything else first asks which local
 * instance to install into via a popup listing all instances.
 */

export const PICKER_TITLES: Record<InstallableCategory, string> = {
  mods: 'Install mod into…',
  resourcepacks: 'Install resource pack into…',
  datapacks: 'Install data pack into…',
  shaders: 'Install shader into…'
}

/**
 * Instances the content can actually land in: mods need a loader-bearing
 * instance, everything needs a matching game version. When `compat`
 * (the project's or version's supported loaders/game versions) is known,
 * unsuitable instances are hidden entirely.
 */
export function installTargets(
  category: InstallableCategory,
  modpacks: Modpack[],
  compat?: Compatibility
): Modpack[] {
  return modpacks.filter((m) => {
    if (category === 'mods' && (m.loader === null || m.loader === 'vanilla')) return false
    if (m.gameVersion === null) return false
    if (compat === undefined) return true
    if (!compat.gameVersions.includes(m.gameVersion)) return false
    if (category === 'mods' && m.loader !== null && !compat.loaders.includes(m.loader)) return false
    return true
  })
}

export function pickerEmptyMessage(category: InstallableCategory): string {
  return category === 'mods'
    ? 'No compatible instance — needs a matching loader and game version.'
    : 'No compatible instance — needs a matching game version.'
}

interface InstallActionProps {
  result: SearchResult
}

export default function InstallAction({ result }: InstallActionProps): JSX.Element {
  const category = useDiscoverStore((s) => s.category)
  const installing = useDiscoverStore((s) => s.installing[result.id] === true)
  // Modpacks lock after install (they spawn an instance). Other content
  // may go into several instances, so it only locks in the + button flow
  // where a single target instance is fixed and already has this project.
  const installedInTarget = useDiscoverStore(
    (s) => s.installTarget !== null && s.installedInTarget[result.id] !== undefined
  )
  const installed =
    (useDiscoverStore((s) => s.installed[result.id] === true) && category === 'modpacks') ||
    (installedInTarget && category !== 'modpacks')
  const installPack = useDiscoverStore((s) => s.installPack)
  const installContent = useDiscoverStore((s) => s.installContent)
  const installTarget = useDiscoverStore((s) => s.installTarget)
  const modpacks = useModpackStore((s) => s.modpacks)

  const [pickingTarget, setPickingTarget] = useState(false)
  const [loadingCompat, setLoadingCompat] = useState(false)
  const [compat, setCompat] = useState<Compatibility | null>(null)

  const targets =
    category === 'modpacks' ? [] : installTargets(category, modpacks, compat ?? undefined)

  async function openPicker(): Promise<void> {
    if (category === 'modpacks') return
    setLoadingCompat(true)
    try {
      // Project detail lists supported loaders/game versions — used to
      // hide unsuitable instances. Cached main-side, so this is cheap.
      const detail = await window.api.discover.project(result.id)
      setCompat({ gameVersions: detail.gameVersions, loaders: detail.loaders })
    } catch {
      setCompat(null) // Offline — show all candidate instances.
    } finally {
      setLoadingCompat(false)
      setPickingTarget(true)
    }
  }

  function onInstallClick(): void {
    if (category === 'modpacks') {
      void installPack(result.id)
    } else if (installTarget !== null) {
      // Locked to one instance (+ button flow) — install there directly.
      void installContent(result.id, installTarget)
    } else {
      void openPicker()
    }
  }

  function onTargetPicked(modpackId: string): void {
    setPickingTarget(false)
    void installContent(result.id, modpackId)
  }

  return (
    <>
      <button
        type="button"
        className={installed ? styles.installedButton : styles.installButton}
        disabled={installing || installed || loadingCompat}
        onClick={(e) => {
          e.stopPropagation()
          onInstallClick()
        }}
      >
        {installing ? 'Installing…' : installed ? 'Installed ✓' : 'Install'}
      </button>
      {pickingTarget && category !== 'modpacks' && (
        <InstancePicker
          title={PICKER_TITLES[category]}
          targets={targets}
          emptyMessage={pickerEmptyMessage(category)}
          onPick={onTargetPicked}
          onClose={() => setPickingTarget(false)}
        />
      )}
    </>
  )
}
