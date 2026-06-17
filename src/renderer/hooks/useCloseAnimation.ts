import { useCallback, useEffect, useState } from 'react'

interface CloseAnimation {
  /** True while the exit animation plays, before the real unmount. */
  closing: boolean
  /** Start the exit animation; `close` fires after `duration`. */
  requestClose: () => void
}

/**
 * Delays a modal's unmount so an exit animation can play. Wire the overlay
 * click, close button, and Esc through `requestClose`; apply the `closing`
 * flag as a CSS class to trigger the out keyframes. Escape is handled here.
 */
export function useCloseAnimation(close: () => void, duration = 180): CloseAnimation {
  const [closing, setClosing] = useState(false)
  const requestClose = useCallback(() => setClosing(true), [])

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(close, duration)
    return () => clearTimeout(t)
  }, [closing, close, duration])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  return { closing, requestClose }
}
