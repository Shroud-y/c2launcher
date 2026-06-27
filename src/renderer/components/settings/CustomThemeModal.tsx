import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import { useCloseAnimation } from '../../hooks/useCloseAnimation'
import {
  type CustomSwatches,
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_SWATCHES,
  applyTheme,
  buildCustomTheme,
  getStoredCustomSwatches,
  getStoredThemeId,
  previewCustomSwatches,
  setStoredCustomSwatches
} from '../../theme'
import styles from './CustomThemeModal.module.css'

const FIELDS: { key: keyof CustomSwatches; label: string; hint: string }[] = [
  { key: 'bg', label: 'Background', hint: 'Main app background' },
  { key: 'panel', label: 'Panel', hint: 'Cards, top bar and sidebar' },
  { key: 'accent', label: 'Accent', hint: 'Highlights, buttons, logo' },
  { key: 'border', label: 'Border', hint: 'Dividers and outlines' }
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export default function CustomThemeModal(): JSX.Element {
  const closeCustomTheme = useModalStore((s) => s.closeCustomTheme)

  // Restore this theme if the user cancels (gear click doesn't change it).
  const previousId = useRef(getStoredThemeId())
  const outcome = useRef<'cancel' | 'save'>('cancel')

  const [swatches, setSwatches] = useState<CustomSwatches>(getStoredCustomSwatches)
  const [texts, setTexts] = useState<CustomSwatches>(getStoredCustomSwatches)

  function finish(): void {
    if (outcome.current === 'save') {
      setStoredCustomSwatches(swatches)
      applyTheme(CUSTOM_THEME_ID)
    } else {
      applyTheme(previousId.current)
    }
    closeCustomTheme()
  }

  const { closing, requestClose } = useCloseAnimation(finish)

  // Live-preview the in-progress colors on the whole app while editing.
  useEffect(() => {
    previewCustomSwatches(swatches)
  }, [swatches])

  function setColor(key: keyof CustomSwatches, value: string): void {
    setTexts((t) => ({ ...t, [key]: value }))
    setSwatches((s) => ({ ...s, [key]: value }))
  }

  function setText(key: keyof CustomSwatches, value: string): void {
    setTexts((t) => ({ ...t, [key]: value }))
    if (HEX_RE.test(value)) setSwatches((s) => ({ ...s, [key]: value }))
  }

  function resetDefaults(): void {
    setSwatches({ ...DEFAULT_CUSTOM_SWATCHES })
    setTexts({ ...DEFAULT_CUSTOM_SWATCHES })
  }

  function save(): void {
    outcome.current = 'save'
    requestClose()
  }

  const preview = buildCustomTheme(swatches).colors

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ''}`} onClick={requestClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Custom colors"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={requestClose}>
          <CloseIcon />
        </button>
        <h2 className={styles.title}>Custom colors</h2>
        <span className={styles.hint}>
          Pick the four core colors. Text and other shades are derived automatically. Changes
          preview live; close or save to keep them.
        </span>

        <div
          className={styles.preview}
          style={{ background: preview.bg, borderColor: preview.border }}
        >
          <span className={styles.previewBar} style={{ background: preview.panel }}>
            <span className={styles.previewDot} style={{ background: preview.accent }} />
          </span>
          <span className={styles.previewCard} style={{ background: preview.panel }}>
            <span className={styles.previewChip} style={{ background: preview.accent }} />
            <span className={styles.previewLine} style={{ background: preview.border }} />
          </span>
        </div>

        <div className={styles.fields}>
          {FIELDS.map((f) => {
            const value = texts[f.key] ?? ''
            const invalid = !HEX_RE.test(value)
            return (
              <div key={f.key} className={styles.row}>
                <label className={styles.swatch} style={{ borderColor: swatches[f.key] }}>
                  <input
                    type="color"
                    value={swatches[f.key]}
                    aria-label={f.label}
                    onChange={(e) => setColor(f.key, e.target.value)}
                  />
                </label>
                <div className={styles.rowText}>
                  <span className={styles.rowLabel}>{f.label}</span>
                  <span className={styles.rowHint}>{f.hint}</span>
                </div>
                <input
                  type="text"
                  className={invalid ? `${styles.hex} ${styles.hexInvalid}` : styles.hex}
                  value={value}
                  spellCheck={false}
                  maxLength={7}
                  aria-label={`${f.label} hex`}
                  onChange={(e) => setText(f.key, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={resetDefaults}>
            Reset
          </button>
          <div className={styles.actionsRight}>
            <button type="button" className={styles.secondaryButton} onClick={requestClose}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={save}>
              Save &amp; apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
