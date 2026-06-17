import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  /** Dimmed text shown before the selected label (e.g. "Sort by:"). */
  prefix?: string
  /** Compact toolbar styling: auto width, no border, secondary background. */
  pill?: boolean
  /** Extra class on the trigger button (e.g. to match form-input styling). */
  className?: string
}

interface MenuPos {
  top: number
  left: number
  width: number
  maxHeight: number
}

const MENU_GAP = 6
const MENU_MARGIN = 12 // keep off the viewport edge

/**
 * Custom select replacement with an animated popup menu. The menu renders in
 * a portal with fixed positioning so an ancestor's `overflow` can never clip
 * it (modals scroll their bodies). Fully keyboard-navigable: ↑/↓, Home/End,
 * Enter, Esc, and type-ahead. Used everywhere a native <select> would
 * otherwise render an un-animatable OS popup.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select…',
  disabled = false,
  prefix,
  pill = false,
  className
}: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const typeahead = useRef<{ buffer: string; timer: number }>({ buffer: '', timer: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)

  function openMenu(): void {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function closeMenu(focusTrigger = true): void {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }

  function commit(index: number): void {
    const o = options[index]
    if (o !== undefined) onChange(o.value)
    closeMenu()
  }

  // Position the portal menu under the trigger, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const t = triggerRef.current
      if (t === null) return
      const r = t.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - MENU_GAP - MENU_MARGIN
      setPos({
        top: r.bottom + MENU_GAP,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(240, below))
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Move DOM focus to the active item whenever it (or open) changes.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  // Escape closes the menu only — capture phase + stopImmediatePropagation so
  // an ancestor modal's document-level Esc handler doesn't also fire.
  useEffect(() => {
    if (!open) return
    const onKeyCapture = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        closeMenu()
      }
    }
    document.addEventListener('keydown', onKeyCapture, true)
    return () => document.removeEventListener('keydown', onKeyCapture, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click — the menu lives in a portal, so check both nodes.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) !== true &&
        menuRef.current?.contains(target) !== true
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function moveTo(index: number): void {
    const len = options.length
    if (len === 0) return
    setActiveIndex(((index % len) + len) % len)
  }

  function onTypeahead(char: string): void {
    window.clearTimeout(typeahead.current.timer)
    typeahead.current.buffer += char.toLowerCase()
    const buffer = typeahead.current.buffer
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(buffer))
    if (match >= 0) setActiveIndex(match)
    typeahead.current.timer = window.setTimeout(() => {
      typeahead.current.buffer = ''
    }, 600)
  }

  function onMenuKeyDown(e: React.KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveTo(activeIndex + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveTo(activeIndex - 1)
        break
      case 'Home':
        e.preventDefault()
        moveTo(0)
        break
      case 'End':
        e.preventDefault()
        moveTo(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        commit(activeIndex)
        break
      case 'Tab':
        closeMenu(false)
        break
      // Escape is handled by a capture-phase document listener (see effect).
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) onTypeahead(e.key)
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent): void {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      openMenu()
    }
  }

  const selected = options.find((o) => o.value === value)

  return (
    <div className={styles.root}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${pill ? styles.triggerPill : ''} ${className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.label}>
          {prefix !== undefined && <span className={styles.prefix}>{prefix} </span>}
          <span className={selected === undefined ? styles.placeholder : undefined}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDownIcon />
      </button>
      {open &&
        pos !== null &&
        createPortal(
          <ul
            ref={menuRef}
            className={styles.menu}
            role="listbox"
            onKeyDown={onMenuKeyDown}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {options.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  role="option"
                  aria-selected={o.value === value}
                  tabIndex={-1}
                  className={o.value === value ? styles.itemActive : styles.item}
                  onClick={() => commit(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  )
}
