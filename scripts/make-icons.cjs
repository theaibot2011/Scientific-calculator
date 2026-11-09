// Renders build/icon.svg to PNGs with headless Chromium and packs a multi-size Windows .ico.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'build');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const files = [];
  for (const s of sizes) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    const f = path.join(dir, `icon-${s}.png`);
    await page.screenshot({ path: f, omitBackground: true });
    files.push(f);
  }
  await browser.close();
  fs.copyFileSync(path.join(dir, 'icon-512.png'), path.join(dir, 'icon.png'));
  const pngToIco = (await import('png-to-ico')).default;
  const ico = await pngToIco(files.filter((f) => !f.endsWith('-512.png')));
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico);
  console.log('icons written');
})().catch((e) => { console.error(e); process.exit(1); });
