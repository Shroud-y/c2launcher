import Dropdown from '../common/Dropdown'
import Pagination from './Pagination'
import { useDiscoverStore } from '../../store/discoverStore'
import type { SearchQuery } from '@shared/types'
import styles from './SortFilter.module.css'

const SORT_LABELS: Record<SearchQuery['sort'], string> = {
  relevance: 'Relevance',
  downloads: 'Downloads',
  newest: 'Newest',
  updated: 'Updated'
}

const PAGE_SIZES = [10, 20, 50]

export default function SortFilter(): JSX.Element {
  const sort = useDiscoverStore((s) => s.sort)
  const pageSize = useDiscoverStore((s) => s.pageSize)
  const setSort = useDiscoverStore((s) => s.setSort)
  const setPageSize = useDiscoverStore((s) => s.setPageSize)

  return (
    <div className={styles.row}>
      <Dropdown
        pill
        ariaLabel="Sort by"
        prefix="Sort by:"
        value={sort}
        onChange={(v) => setSort(v as SearchQuery['sort'])}
        options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))}
      />

      <Dropdown
        pill
        ariaLabel="Results per page"
        prefix="View:"
        value={String(pageSize)}
        onChange={(v) => setPageSize(Number(v))}
        options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
      />

      <div className={styles.paginationSlot}>
        <Pagination />
      </div>
    </div>
  )
}
