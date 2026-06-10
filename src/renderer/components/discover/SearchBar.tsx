import { SearchIcon } from '../common/Icons'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  placeholder: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, placeholder, onChange }: SearchBarProps): JSX.Element {
  return (
    <div className={styles.searchBar}>
      <SearchIcon className={styles.icon} />
      <input
        className={styles.input}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
