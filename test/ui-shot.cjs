// Launches the Electron app with Playwright and captures screenshots (used during development/testing).
const { _electron: electron } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp/shots';
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
  const page = await app.firstWindow();
  page.on('console', (m) => console.log('[console]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.setViewportSize?.({ width: 1040, height: 900 });
  const seqs = (process.argv[3] || '').split('|').filter(Boolean);
  await page.screenshot({ path: `${out}/s0.png` });
  let i = 1;
  for (const s of seqs) {
    await page.evaluate((keys) => { window.calc.keys(...keys.split(',')); }, s);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/s${i++}.png` });
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
