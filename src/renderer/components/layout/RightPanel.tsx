import { useLocation } from 'react-router-dom'
import Avatar from '../common/Avatar'
import FilterSidebar from '../discover/FilterSidebar'
import styles from './RightPanel.module.css'

export default function RightPanel(): JSX.Element {
  const { pathname } = useLocation()

  return (
    <aside className={styles.panel}>
      <div className={styles.account}>
        <Avatar size={40} />
        <div className={styles.accountText}>
          <span className={styles.username}>Steve</span>
          <span className={styles.accountType}>License account</span>
        </div>
      </div>
      {pathname === '/discover' && <FilterSidebar />}
    </aside>
  )
}
