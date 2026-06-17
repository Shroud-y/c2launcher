import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from './Icons'
import styles from './Dropdown.module.css'

export interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  /** Extra class on the trigger button (e.g. to match form-input styling). */
  className?: string
}

/**
 * Custom select replacement with an animated popup menu. Used everywhere a
 * native <select> would otherwise render an un-animatable OS popup.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select…',
  disabled = false,
  className
}: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected === undefined ? styles.placeholder : undefined}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={o.value === value ? styles.itemActive : styles.item}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
