import { useEffect } from 'react'
import { useDiscoverStore } from '../../store/discoverStore'
import type { ContentSource } from '@shared/types'
import styles from './SourceToggle.module.css'

const SOURCES: { id: ContentSource; label: string }[] = [
  { id: 'modrinth', label: 'Modrinth' },
  { id: 'curseforge', label: 'CurseForge' }
]

/** Segmented Modrinth / CurseForge switch in the Discover toolbar. */
export default function SourceToggle(): JSX.Element {
  const source = useDiscoverStore((s) => s.source)
  const setSource = useDiscoverStore((s) => s.setSource)
  const curseforgeAvailable = useDiscoverStore((s) => s.curseforgeAvailable)
  const loadSourceAvailability = useDiscoverStore((s) => s.loadSourceAvailability)

  useEffect(() => {
    void loadSourceAvailability()
  }, [loadSourceAvailability])

  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Content source">
      {SOURCES.map((s) => {
        // Until availability is known CurseForge stays clickable — a build
        // without a key just reports it on the first search.
        const disabled = s.id === 'curseforge' && curseforgeAvailable === false
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={source === s.id}
            className={source === s.id ? styles.optionActive : styles.option}
            disabled={disabled}
            title={disabled ? 'CurseForge is not available in this build' : undefined}
            onClick={() => setSource(s.id)}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
