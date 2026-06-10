import { useEffect, useRef } from 'react'
import styles from './Avatar.module.css'

/**
 * Player head avatar. With a real skin texture it draws the face (8,8)
 * plus the hat overlay (40,8) onto a pixel canvas; without one it falls
 * back to a static pixel-art Steve.
 */

// 8×8 colour map of the classic Steve face.
const H = '#3a2a1a' // hair
const S = '#b4836d' // skin
const W = '#ffffff' // eye white
const P = '#523d8a' // eye pupil
const N = '#8d6b53' // nose shadow
const M = '#6f4f3a' // mouth

const FACE: string[][] = [
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, S, S, S, S, S, S, H],
  [S, S, S, S, S, S, S, S],
  [S, W, P, S, S, P, W, S],
  [S, S, S, N, N, S, S, S],
  [S, S, N, M, M, N, S, S],
  [S, S, S, S, S, S, S, S]
]

interface AvatarProps {
  size?: number
  skinBase64?: string | null
}

function SteveFace({ size }: { size: number }): JSX.Element {
  return (
    <svg
      className={styles.avatar}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Player avatar"
    >
      {FACE.map((row, y) =>
        row.map((color, x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />
        ))
      )}
    </svg>
  )
}

function SkinFace({ size, skinBase64 }: { size: number; skinBase64: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const img = new Image()
    img.onload = (): void => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 8, 8)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8) // face
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8) // hat overlay
    }
    img.src = `data:image/png;base64,${skinBase64}`
  }, [skinBase64])

  return (
    <canvas
      ref={canvasRef}
      className={styles.avatar}
      width={8}
      height={8}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Player avatar"
    />
  )
}

export default function Avatar({ size = 40, skinBase64 = null }: AvatarProps): JSX.Element {
  if (skinBase64 !== null) {
    return <SkinFace size={size} skinBase64={skinBase64} />
  }
  return <SteveFace size={size} />
}
