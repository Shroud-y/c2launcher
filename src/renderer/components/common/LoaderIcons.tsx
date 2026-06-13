import fabricLogo from '../../assets/fabric.png'
import forgeLogo from '../../assets/forge.jpg'
import neoforgeLogo from '../../assets/neoforge.png'
import quiltLogo from '../../assets/quilt.svg'
import { svgProps, type IconProps } from './Icons'
import type { ModLoader } from '@shared/types'

/** Official logos per loader; vanilla has none, so it keeps a stroke glyph. */
const LOGOS: Partial<Record<ModLoader, string>> = {
  fabric: fabricLogo,
  forge: forgeLogo,
  neoforge: neoforgeLogo,
  quilt: quiltLogo
}

const VANILLA_GLYPH = (
  <>
    <path d="M12 2 3 7v10l9 5 9-5V7z" />
    <path d="M3 7l9 5 9-5" />
    <path d="M12 12v10" />
  </>
)

interface LoaderIconProps extends IconProps {
  loader: ModLoader
}

export default function LoaderIcon({ loader, size = 16, className }: LoaderIconProps): JSX.Element {
  const logo = LOGOS[loader]
  if (logo !== undefined) {
    return <img src={logo} width={size} height={size} alt="" className={className} />
  }
  return <svg {...svgProps(size, className)}>{VANILLA_GLYPH}</svg>
}
