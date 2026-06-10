import styles from './Avatar.module.css'

/**
 * Player head avatar. Phase 1 renders a static pixel-art Steve head;
 * Phase 2 swaps the pixel grid for the real skin fetched after login.
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
}

export default function Avatar({ size = 40 }: AvatarProps): JSX.Element {
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
