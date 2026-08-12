import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

const svg = await fs.readFile(path.join(publicDir, 'favicon.svg'));

for (const { name, size } of sizes) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, name));
  console.log(`✓ ${name} (${size}x${size})`);
}
