/**
 * generate-icons.mjs — PWA icon generator
 *
 * Generates icon-192.png and icon-512.png with a warm orange gradient
 * background and a fork/plate emoji, placed in frontend/public/icons/.
 *
 * Usage:
 *   node frontend/scripts/generate-icons.mjs
 *
 * Requires: sharp (npm install --save-dev sharp)
 */

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '../public/icons')

// Ensure the output directory exists
mkdirSync(iconsDir, { recursive: true })

/**
 * generateIcon — Creates a PNG icon at the given size.
 * Uses an SVG with a warm gradient background and a plate emoji.
 *
 * @param {number} size - Icon dimension in pixels (e.g. 192, 512)
 */
async function generateIcon(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#c2410c"/>
        <stop offset="100%" style="stop-color:#f59e0b"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="url(#g)"/>
    <text
      x="50%"
      y="58%"
      font-size="${Math.round(size * 0.55)}"
      text-anchor="middle"
      dominant-baseline="middle"
    >🍽️</text>
  </svg>`

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(iconsDir, `icon-${size}.png`))

  console.log(`✓ Generated icon-${size}.png`)
}

// Generate both required PWA icon sizes
await generateIcon(192)
await generateIcon(512)

console.log('All icons generated successfully.')
