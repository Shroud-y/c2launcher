import { readFile } from 'fs/promises'
import { AuthError } from './microsoftAuth'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Skins over this size are not real 64×64 textures; Mojang caps uploads too. */
const MAX_SKIN_BYTES = 256 * 1024

/**
 * Reads a skin PNG and checks it is a texture Minecraft accepts: 64×64, or
 * the legacy 64×32 layout. Dimensions come straight from the IHDR chunk,
 * which the PNG spec requires to be first.
 */
export async function readSkinFile(path: string): Promise<Buffer> {
  const png = await readFile(path)
  if (png.length > MAX_SKIN_BYTES) throw new AuthError('Skin file is too large')
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new AuthError('Skin must be a PNG image')
  }
  if (png.toString('ascii', 12, 16) !== 'IHDR') throw new AuthError('Skin PNG is corrupted')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new AuthError(`Skin must be 64×64 or 64×32 pixels (this one is ${width}×${height})`)
  }
  return png
}
