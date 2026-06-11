import { useEffect, useState } from 'react'
import { CloseIcon, WindIcon } from '../common/Icons'
import InstallAction from './InstallAction'
import { formatDownloads } from './SearchResultCard'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import type { ProjectDetail, ProjectVersionInfo, SearchResult } from '@shared/types'
import styles from './ProjectModal.module.css'

type ModalTab = 'description' | 'versions'

/**
 * Crude but safe markdown-to-text: strips html tags, images and md
 * tokens so the description reads as plain prose. A real markdown
 * renderer needs a sanitizer and arrives with a later polish pass.
 */
function cleanBody(markdown: string): string {
  return markdown
    .replace(/<details[\s\S]*?<\/details>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/^\s*[-=]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

interface ProjectModalProps {
  result: SearchResult
}

export default function ProjectModal({ result }: ProjectModalProps): JSX.Element {
  const closeDiscoverProject = useModalStore((s) => s.closeDiscoverProject)
  const installError = useDiscoverStore((s) => s.installErrors[result.id] ?? '')

  const [tab, setTab] = useState<ModalTab>('description')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [versions, setVersions] = useState<ProjectVersionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.discover
      .project(result.id)
      .then(setDetail)
      .catch(() => setError('Could not load project details'))
  }, [result.id])

  useEffect(() => {
    if (tab !== 'versions' || versions !== null) return
    window.api.discover
      .projectVersions(result.id)
      .then(setVersions)
      .catch(() => setError('Could not load versions'))
  }, [tab, versions, result.id])

  const downloads = detail?.downloads ?? result.downloads
  const followers = detail?.followers

  return (
    <div className={styles.overlay} onClick={closeDiscoverProject}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label={result.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={closeDiscoverProject}
        >
          <CloseIcon />
        </button>

        <header className={styles.header}>
          {result.iconUrl !== null ? (
            <img className={styles.icon} src={result.iconUrl} alt="" />
          ) : (
            <span className={styles.iconFallback}>
              <WindIcon size={36} />
            </span>
          )}
          <div className={styles.headerText}>
            <h2 className={styles.name}>{result.name}</h2>
            <span className={styles.byline}>by {result.author}</span>
            <div className={styles.stats}>
              <span className={styles.stat}>↓ {formatDownloads(downloads)}</span>
              {followers !== undefined && (
                <span className={styles.stat}>♥ {formatDownloads(followers)}</span>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            <InstallAction result={result} />
          </div>
        </header>

        {detail !== null && detail.categories.length > 0 && (
          <div className={styles.chips}>
            {detail.categories.map((cat) => (
              <span key={cat} className={styles.chip}>
                {capitalize(cat)}
              </span>
            ))}
          </div>
        )}

        {(error !== null || installError !== '') && (
          <div className={styles.error}>{installError !== '' ? installError : error}</div>
        )}

        <nav className={styles.tabs}>
          {(['description', 'versions'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? styles.tabActive : styles.tab}
              onClick={() => setTab(t)}
            >
              {capitalize(t)}
            </button>
          ))}
        </nav>

        {tab === 'description' && (
          <div className={styles.body}>
            {detail === null ? (
              <span className={styles.muted}>Loading…</span>
            ) : (
              <p className={styles.description}>{cleanBody(detail.body)}</p>
            )}
          </div>
        )}

        {tab === 'versions' && (
          <div className={styles.body}>
            {versions === null ? (
              <span className={styles.muted}>Loading…</span>
            ) : versions.length === 0 ? (
              <span className={styles.muted}>No versions published.</span>
            ) : (
              <ul className={styles.versionList}>
                {versions.map((v) => (
                  <li key={v.id} className={styles.versionRow}>
                    <div className={styles.versionInfo}>
                      <span className={styles.versionNumber}>{v.versionNumber}</span>
                      <span className={styles.versionMeta}>
                        {[...v.loaders.map(capitalize), ...v.gameVersions.slice(0, 4)].join(' · ')}
                        {v.gameVersions.length > 4 ? ' · …' : ''}
                      </span>
                    </div>
                    <div className={styles.versionSide}>
                      <span className={styles.versionMeta}>↓ {formatDownloads(v.downloads)}</span>
                      <span className={styles.versionMeta}>
                        {new Date(v.datePublished).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
