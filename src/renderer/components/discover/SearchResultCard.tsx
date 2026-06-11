import { WindIcon } from '../common/Icons'
import InstallAction from './InstallAction'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import type { SearchResult } from '@shared/types'
import styles from './SearchResultCard.module.css'

export function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}k`
  return String(count)
}

function formatLoaderVersion(result: SearchResult): string | null {
  if (result.loader === null && result.gameVersion === null) return null
  const loader =
    result.loader === null
      ? ''
      : result.loader.charAt(0).toUpperCase() + result.loader.slice(1)
  return [loader, result.gameVersion ?? ''].filter((p) => p !== '').join(' ')
}

interface SearchResultCardProps {
  result: SearchResult
}

export default function SearchResultCard({ result }: SearchResultCardProps): JSX.Element {
  const installError = useDiscoverStore((s) => s.installErrors[result.id] ?? '')
  const openDiscoverProject = useModalStore((s) => s.openDiscoverProject)

  const subtitle = [formatLoaderVersion(result), `↓ ${formatDownloads(result.downloads)}`]
    .filter((p) => p !== null)
    .join(' · ')

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => openDiscoverProject(result)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openDiscoverProject(result)
      }}
    >
      {result.iconUrl !== null ? (
        <img className={styles.iconImage} src={result.iconUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.iconFallback}>
          <WindIcon size={28} />
        </span>
      )}

      <div className={styles.text}>
        <span className={styles.name}>{result.name}</span>
        <span className={styles.summary}>{result.summary}</span>
        <span className={styles.subtitle}>
          {subtitle} · by {result.author}
        </span>
        {installError !== '' && <span className={styles.installError}>{installError}</span>}
      </div>

      <div className={styles.actions}>
        <InstallAction result={result} />
      </div>
    </div>
  )
}
