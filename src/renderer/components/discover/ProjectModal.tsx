import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { CloseIcon, WindIcon } from '../common/Icons'
import InstallAction, { installTargets, PICKER_TITLES, pickerEmptyMessage } from './InstallAction'
import InstancePicker from './InstancePicker'
import Dropdown from '../common/Dropdown'
import { formatDownloads } from './SearchResultCard'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { ProjectDetail, ProjectVersionInfo, SearchResult } from '@shared/types'
import styles from './ProjectModal.module.css'

type ModalTab = 'description' | 'gallery' | 'versions'

// External links only — the main process opens them in the system browser.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

function renderBody(markdown: string): string {
  const html = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function releaseKey(version: string): number[] | null {
  const parts = version.split('.').map(Number)
  return parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : null
}

/**
 * Newest first. Releases (dotted numbers) compare numerically and sort
 * above snapshots/pre-releases, which fall back to reverse-lexicographic.
 */
function compareGameVersionsDesc(a: string, b: string): number {
  const ka = releaseKey(a)
  const kb = releaseKey(b)
  if (ka !== null && kb !== null) {
    for (let i = 0; i < Math.max(ka.length, kb.length); i += 1) {
      const diff = (kb[i] ?? 0) - (ka[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  }
  if (ka !== null) return -1
  if (kb !== null) return 1
  return b.localeCompare(a)
}

interface ProjectModalProps {
  result: SearchResult
}

export default function ProjectModal({ result }: ProjectModalProps): JSX.Element {
  const closeDiscoverProject = useModalStore((s) => s.closeDiscoverProject)
  const installError = useDiscoverStore((s) => s.installErrors[result.id] ?? '')
  const category = useDiscoverStore((s) => s.category)
  const installing = useDiscoverStore((s) => s.installing[result.id] === true)
  const installPack = useDiscoverStore((s) => s.installPack)
  const installContent = useDiscoverStore((s) => s.installContent)
  const installTarget = useDiscoverStore((s) => s.installTarget)
  const modpacks = useModpackStore((s) => s.modpacks)
  const targetPack =
    installTarget === null ? null : modpacks.find((m) => m.id === installTarget) ?? null
  /** This project's file already in the locked target instance, if any. */
  const installedEntry = useDiscoverStore((s) =>
    s.installTarget !== null && category !== 'modpacks'
      ? s.installedInTarget[result.id] ?? null
      : null
  )

  const [tab, setTab] = useState<ModalTab>('description')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [versions, setVersions] = useState<ProjectVersionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [loaderFilter, setLoaderFilter] = useState('')
  const [gameVersionFilter, setGameVersionFilter] = useState('')
  /** + flow only: hide versions the locked target instance can't run. */
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  /** Version awaiting an instance choice in the picker popup. */
  const [pickingVersionId, setPickingVersionId] = useState<string | null>(null)
  /** Version whose install is in flight — drives the row button label. */
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null)

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
      .then((vs) =>
        // API order is not guaranteed — always newest first.
        setVersions(
          [...vs].sort((a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished))
        )
      )
      .catch(() => setError('Could not load versions'))
  }, [tab, versions, result.id])

  const bodyHtml = useMemo(
    () => (detail === null ? '' : renderBody(detail.body)),
    [detail]
  )

  const loaderOptions = useMemo(() => {
    const set = new Set<string>()
    for (const v of versions ?? []) for (const l of v.loaders) set.add(l)
    return [...set].sort()
  }, [versions])

  const gameVersionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const v of versions ?? []) for (const gv of v.gameVersions) set.add(gv)
    return [...set].sort(compareGameVersionsDesc)
  }, [versions])

  // "Show only available" applies in the + flow, where versions the
  // target instance can't run would otherwise clutter the list disabled.
  const filterToTarget = onlyAvailable && targetPack !== null && category !== 'modpacks'
  const visibleVersions = useMemo(
    () =>
      (versions ?? []).filter(
        (v) =>
          (loaderFilter === '' || v.loaders.includes(loaderFilter)) &&
          (gameVersionFilter === '' || v.gameVersions.includes(gameVersionFilter)) &&
          (!filterToTarget || targetPack === null || versionFits(v, targetPack))
      ),
    [versions, loaderFilter, gameVersionFilter, filterToTarget, targetPack, category]
  )

  /** Does this version run on the given instance? */
  function versionFits(v: ProjectVersionInfo, pack: { loader: string | null; gameVersion: string | null }): boolean {
    if (pack.gameVersion === null || !v.gameVersions.includes(pack.gameVersion)) return false
    if (category === 'mods') return pack.loader !== null && v.loaders.includes(pack.loader)
    return true
  }

  function onVersionInstallClick(versionId: string): void {
    if (category === 'modpacks') {
      setInstallingVersionId(versionId)
      void installPack(result.id, versionId).finally(() => setInstallingVersionId(null))
    } else if (installTarget !== null) {
      // Locked to one instance (+ button flow) — no picker. When another
      // version is already installed, this is a switch: the old file is
      // removed after the new one downloads.
      setInstallingVersionId(versionId)
      void installContent(
        result.id,
        installTarget,
        versionId,
        installedEntry?.fileName
      ).finally(() => setInstallingVersionId(null))
    } else {
      setPickingVersionId(versionId)
    }
  }

  function onVersionTargetPicked(modpackId: string): void {
    const versionId = pickingVersionId
    setPickingVersionId(null)
    if (versionId === null) return
    setInstallingVersionId(versionId)
    void installContent(result.id, modpackId, versionId).finally(() =>
      setInstallingVersionId(null)
    )
  }

  const gallery = detail?.gallery ?? []
  // Gallery tab only appears once the project loaded with images.
  const tabs = useMemo<ModalTab[]>(
    () => (gallery.length > 0 ? ['description', 'gallery', 'versions'] : ['description', 'versions']),
    [gallery.length]
  )

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
          {tabs.map((t) => (
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
              <div
                className={styles.markdown}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
          </div>
        )}

        {tab === 'gallery' && (
          <div className={styles.body}>
            <div className={styles.gallery}>
              {gallery.map((img) => (
                <figure key={img.url} className={styles.galleryItem}>
                  <img className={styles.galleryImage} src={img.url} alt={img.title ?? ''} loading="lazy" />
                  {(img.title !== null || img.description !== null) && (
                    <figcaption className={styles.galleryCaption}>
                      {img.title !== null && <span className={styles.galleryTitle}>{img.title}</span>}
                      {img.description !== null && (
                        <span className={styles.galleryDesc}>{img.description}</span>
                      )}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        {tab === 'versions' && (
          <div className={styles.body}>
            {versions === null ? (
              <span className={styles.muted}>Loading…</span>
            ) : versions.length === 0 ? (
              <span className={styles.muted}>No versions published.</span>
            ) : (
              <>
                <div className={styles.versionFilters}>
                  <Dropdown
                    ariaLabel="Filter by loader"
                    value={loaderFilter}
                    onChange={setLoaderFilter}
                    options={[
                      { value: '', label: 'All loaders' },
                      ...loaderOptions.map((l) => ({ value: l, label: capitalize(l) }))
                    ]}
                  />
                  <Dropdown
                    ariaLabel="Filter by game version"
                    value={gameVersionFilter}
                    onChange={setGameVersionFilter}
                    options={[
                      { value: '', label: 'All game versions' },
                      ...gameVersionOptions.map((gv) => ({ value: gv, label: gv }))
                    ]}
                  />
                  {targetPack !== null && category !== 'modpacks' && (
                    <label className={styles.filterCheckbox}>
                      <input
                        type="checkbox"
                        checked={onlyAvailable}
                        onChange={(e) => setOnlyAvailable(e.target.checked)}
                      />
                      Show only available
                    </label>
                  )}
                </div>
                {visibleVersions.length === 0 ? (
                  <span className={styles.muted}>No versions match the filters.</span>
                ) : (
                  <ul className={styles.versionList}>
                    {visibleVersions.map((v) => {
                      // Version on disk in the locked target — versionNumber
                      // is resolved by file hash, so a null means unknown.
                      const isCurrent =
                        installedEntry !== null &&
                        installedEntry.versionNumber !== null &&
                        v.versionNumber === installedEntry.versionNumber
                      const incompatible =
                        category !== 'modpacks' &&
                        targetPack !== null &&
                        !versionFits(v, targetPack)
                      return (
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
                          <button
                            type="button"
                            className={styles.downloadButton}
                            disabled={
                              installingVersionId !== null || installing || incompatible || isCurrent
                            }
                            title={
                              incompatible ? `Not compatible with ${targetPack.name}` : undefined
                            }
                            onClick={() => onVersionInstallClick(v.id)}
                          >
                            {installingVersionId === v.id
                              ? 'Installing…'
                              : isCurrent
                                ? 'Installed ✓'
                                : installedEntry !== null
                                  ? 'Switch'
                                  : 'Install'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {pickingVersionId !== null && category !== 'modpacks' && (
          <InstancePicker
            title={PICKER_TITLES[category]}
            targets={installTargets(category, modpacks).filter((m) => {
              // Only instances this exact version runs on.
              const v = (versions ?? []).find((x) => x.id === pickingVersionId)
              return v === undefined || versionFits(v, m)
            })}
            emptyMessage={pickerEmptyMessage(category)}
            onPick={onVersionTargetPicked}
            onClose={() => setPickingVersionId(null)}
          />
        )}
      </div>
    </div>
  )
}
