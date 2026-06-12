import { svgProps, type IconProps } from '../common/Icons'

/**
 * One glyph per Modrinth category slug (all project types), drawn in the
 * same 24×24 stroke style as common/Icons.tsx. Unknown slugs fall back
 * to a generic grid glyph.
 */
const GLYPHS: Record<string, JSX.Element> = {
  adventure: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5-4.8 2 2.2-5z" />
    </>
  ),
  cursed: (
    <>
      <path d="M5 11a7 7 0 1 1 14 0c0 2.4-1.4 4.3-3 5.4V20H8v-3.6c-1.6-1.1-3-3-3-5.4z" />
      <path d="M9.5 11h.01M14.5 11h.01" />
    </>
  ),
  decoration: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  economy: (
    <>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  equipment: (
    <>
      <path d="M14.5 14.5 3 3v3l9.5 9.5" />
      <path d="M9.5 14.5 21 3v3l-9.5 9.5" />
      <path d="m5 14 5 5-3 3-2-2" />
      <path d="m19 14-5 5 3 3 2-2" />
    </>
  ),
  food: (
    <>
      <path d="M5 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M20 15V2a5 5 0 0 0-4 5v6a2 2 0 0 0 2 2h2zm0 0v7" />
    </>
  ),
  'game-mechanics': (
    <>
      <path d="M8 3v18M16 3v18" />
      <path d="M5 9h6M13 15h6" />
    </>
  ),
  library: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  magic: (
    <>
      <path d="m3 21 12.5-12.5 3-3" />
      <path d="m13 6 5 5" />
      <path d="M19 2v4M21 4h-4M6 4v3M7.5 5.5h-3" />
    </>
  ),
  management: (
    <>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01M6 17.5h.01" />
    </>
  ),
  minigame: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="m15 12 1.5 9L12 18.5 7.5 21 9 12" />
    </>
  ),
  mobs: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8.5h3M14 8.5h3" />
      <path d="M10 13h4v4M10 13v4" />
    </>
  ),
  optimization: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  social: <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 21l2-5.5a8.5 8.5 0 1 1 16-4z" />,
  storage: (
    <>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v11h16V9" />
      <path d="M10 13h4" />
    </>
  ),
  technology: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  transportation: (
    <>
      <path d="M19 17h2v-5l-2-5H5l-2 5v5h2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </>
  ),
  utility: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </>
  ),
  worldgen: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18z" />
    </>
  ),
  challenging: <path d="m8 3 4 8 5-5 5 15H2L8 3z" />,
  combat: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
    </>
  ),
  'kitchen-sink': (
    <>
      <path d="m12 2 10 6-10 6L2 8z" />
      <path d="m2 14 10 6 10-6" />
    </>
  ),
  lightweight: (
    <>
      <path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </>
  ),
  multiplayer: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  quests: (
    <>
      <path d="M8 21h11a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    </>
  ),
  modded: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  realistic: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  simplistic: <rect x="5" y="5" width="14" height="14" rx="3" />,
  themed: (
    <>
      <path d="M12 2a10 10 0 1 0 0 20c1 0 1.6-.75 1.6-1.7 0-.44-.17-.84-.43-1.13-.26-.29-.42-.66-.42-1.12A1.65 1.65 0 0 1 14.4 16.4h2c3.05 0 5.6-2.5 5.6-5.55C22 6 17.5 2 12 2z" />
      <path d="M7.5 11h.01M10.5 7h.01M14.5 7h.01M17.5 11h.01" />
    </>
  ),
  tweaks: (
    <>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </>
  ),
  'vanilla-like': (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.5 12 13 13 12" />
    </>
  ),
  cartoon: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01M15 9h.01" />
    </>
  ),
  fantasy: (
    <>
      <path d="m2 5 4 10h12l4-10-5.5 5L12 4 7.5 10z" />
      <path d="M6 19h12" />
    </>
  ),
  'semi-realistic': (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  )
}

const FALLBACK = (
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>
)

interface CategoryIconProps extends IconProps {
  slug: string
}

export default function CategoryIcon({ slug, size = 14, className }: CategoryIconProps): JSX.Element {
  return <svg {...svgProps(size, className)}>{GLYPHS[slug] ?? FALLBACK}</svg>
}
