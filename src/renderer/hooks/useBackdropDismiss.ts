import { useRef, type MouseEvent, type PointerEvent } from 'react'

interface BackdropHandlers {
  onPointerDown: (e: PointerEvent) => void
  onClick: (e: MouseEvent) => void
}

/**
 * Handlers for a modal backdrop that dismisses only when the press *starts*
 * on the backdrop itself. A bare onClick on the overlay also fires when a
 * press began inside the panel — e.g. selecting text and releasing the mouse
 * outside — because the resulting click dispatches on the common ancestor
 * (the overlay), closing the modal unexpectedly. Recording the pointerdown
 * target and requiring both the press and the click to land on the backdrop
 * gives the same pointer-down-outside semantics as Radix/Headless UI.
 *
 * Spread the returned props onto the overlay element. The inner panel needs
 * no handler of its own — the target checks already ignore presses inside it.
 */
export function useBackdropDismiss(onDismiss: () => void): BackdropHandlers {
  const pressedBackdrop = useRef(false)
  return {
    onPointerDown: (e) => {
      pressedBackdrop.current = e.target === e.currentTarget
    },
    onClick: (e) => {
      if (pressedBackdrop.current && e.target === e.currentTarget) onDismiss()
    }
  }
}
