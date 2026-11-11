// Renders public/icons/icon.svg into the PNG sizes iOS and Android need.
// Run: npm run icons   (uses Playwright's Chromium; only needed if you change the icon)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, file, { padding = 0, square = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable/apple icons: full-bleed square background so no corners show.
  const bg = square ? 'background:linear-gradient(135deg,#7B5CFF,#4335E6);' : '';
  await page.setContent(`<html><body style="margin:0;${bg}width:${size}px;height:${size}px;display:grid;place-items:center">
    <div style="width:${size - padding * 2}px;height:${size - padding * 2}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body></html>`);
  await page.screenshot({ path: join(dir, file), omitBackground: !square });
  console.log('wrote', file);
}

await render(180, 'apple-touch-icon.png', { square: true });
await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { square: true, padding: 56 });
await browser.close();
