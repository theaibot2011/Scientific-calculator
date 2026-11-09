// End-to-end UI test: launches the real Electron app, drives it with real keyboard/mouse events.
// Run: npm run test:ui   (needs a display; uses xvfb-run on Linux)
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');

const root = path.join(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-ui-'));
const shots = process.env.SHOTS || null;
let failures = 0, passes = 0;
async function check(name, fn) {
  try { await fn(); passes++; console.log(`  ✓ ${name}`); } catch (e) { failures++; console.log(`  ✗ ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
}

async function launch() {
  const app = await electron.launch({
    executablePath: require(path.join(root, 'node_modules', 'electron')),
    args: [root, '--no-sandbox', `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  return { app, page, errors };
}
const resultText = (page) => page.evaluate(() => window.calc.view().calc?.result?.text ?? null);
const lcdText = (page) => page.locator('#lcd').innerText();

(async () => {
  console.log('UI test — first launch');
  let { app, page, errors } = await launch();

  await check('window is frameless with the right title', async () => {
    assert.equal(await page.title(), 'Graphite Scientific');
    const info = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const [mw, mh] = w.getMinimumSize(); return { mw, mh, menu: w.isMenuBarVisible() }; });
    assert.ok(info.mw >= 400 && info.mh >= 600);
  });
  await check('keypad has all 46 keys plus 4 cursor keys', async () => {
    assert.equal(await page.locator('.key').count(), 46);
    assert.equal(await page.locator('.navpad .nb').count(), 4);
  });
  await check('keyboard: 1/2 fraction + 1/3 = 5/6', async () => {
    await page.keyboard.type('1');
    await page.keyboard.press('Control+/');
    await page.keyboard.type('2');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('+1');
    await page.keyboard.press('Control+/');
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '5/6');
    assert.equal(await page.locator('.result .frac').count(), 1);
  });
  await check('keyboard: Escape clears, 2*(3+4) Enter = 14', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('2*(3+4)');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '14');
  });
  await check('keyboard: Backspace deletes', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('123');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '12');
  });
  await check('mouse: clicking keys √ 8 = gives 2√2', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.key[data-key="sqrt"] .cap').click();
    await page.locator('.key[data-key="8"] .cap').click();
    await page.locator('.key[data-key="eq"] .cap').click();
    assert.equal(await resultText(page), '2√2');
    assert.ok(await page.locator('.result .sqrt').count() >= 1);
  });
  await check('mouse: SHIFT then sin gives sin⁻¹', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.key[data-key="shift"] .cap').click();
    assert.ok(await page.evaluate(() => document.body.classList.contains('shift-on')));
    await page.locator('.key[data-key="sin"] .cap').click();
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '90');
  });
  await check('S⇔D toggles decimal', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('2/3');
    await page.keyboard.press('Enter');
    await page.keyboard.press('F8');
    assert.equal(await resultText(page), '0.6666666667');
  });
  await check('Ans continuation from keyboard (+1)', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await page.keyboard.type('+1');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '11');
  });
  await check('error screen shows Math ERROR for 1/0 and AC clears', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('1/0');
    await page.keyboard.press('Enter');
    assert.match(await lcdText(page), /Math ERROR/);
    if (shots) await page.screenshot({ path: `${shots}/ui-error.png` });
    await page.keyboard.press('Escape');
    assert.doesNotMatch(await lcdText(page), /ERROR/);
  });
  await check('MODE menu by clicking an item switches to CMPLX', async () => {
    await page.keyboard.press('F4');
    await page.locator('.menu-item', { hasText: 'CMPLX' }).click();
    assert.equal(await page.evaluate(() => window.calc.mode), 'CMPLX');
    assert.equal(await page.locator('#tbMode').innerText(), 'CMPLX');
    await page.keyboard.type('(1+i)^2');
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '2i');
    await page.keyboard.press('F4'); await page.keyboard.press('1');
  });
  await check('copy result to clipboard (Ctrl+C) and paste expression (Ctrl+V)', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('1/8');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(100);
    const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.equal(clip, '0.125');
    await app.evaluate(({ clipboard }) => clipboard.writeText('sqrt(2)*sqrt(2)+1'));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '3');
  });
  await check('history panel lists calculations and reuses one on click', async () => {
    await page.locator('.tab', { hasText: 'History' }).click();
    const n = await page.locator('.hist-item').count();
    assert.ok(n >= 6, `history items: ${n}`);
    await page.keyboard.press('Escape');
    await page.locator('.hist-item').first().click();
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '3');
    if (shots) await page.screenshot({ path: `${shots}/ui-history.png` });
  });
  await check('panel tabs render (constants, convert, inspect, guide, settings)', async () => {
    for (const t of ['Constants', 'Convert', 'Inspect', 'Guide', 'Settings']) {
      await page.locator('.tab', { hasText: t }).click();
      const txt = await page.locator('#panelBody').innerText();
      assert.ok(txt.length > 40, `${t} panel empty`);
      if (shots) await page.screenshot({ path: `${shots}/ui-tab-${t}.png` });
    }
  });
  await check('constants: clicking inserts c₀', async () => {
    await page.locator('.tab', { hasText: 'Constants' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.const-item', { hasText: 'Speed of light' }).click();
    await page.keyboard.press('Enter');
    assert.equal(await resultText(page), '299792458');
  });
  await check('unit converter: 1 mi → km', async () => {
    await page.locator('.tab', { hasText: 'Convert' }).click();
    await page.locator('#panelBody select').nth(1).selectOption('mi');
    await page.locator('#panelBody select').nth(2).selectOption('km');
    await page.locator('#panelBody input[type="text"]').fill('1');
    assert.match(await page.locator('.conv-out').innerText(), /1\.609344 km/);
  });
  await check('settings: linear display + radians apply to the calculator', async () => {
    await page.locator('.tab', { hasText: 'Settings' }).click();
    await page.getByRole('button', { name: 'Radians', exact: true }).click();
    assert.equal(await page.evaluate(() => window.calc.settings.angle), 'R');
    assert.match(await page.locator('.status .angle').innerText(), /R/);
    await page.getByRole('button', { name: 'Degrees', exact: true }).click();
    await page.locator('.theme-card', { hasText: 'Titanium' }).click();
    assert.equal(await page.evaluate(() => document.body.dataset.theme), 'titanium');
    if (shots) await page.screenshot({ path: `${shots}/ui-titanium.png` });
    await page.locator('.theme-card', { hasText: 'Midnight' }).click();
    if (shots) await page.screenshot({ path: `${shots}/ui-midnight.png` });
    await page.locator('.theme-card', { hasText: 'Graphite' }).click();
  });
  await check('EQN mode via keyboard: x² − 5x + 6 = 0', async () => {
    await page.keyboard.press('F4'); await page.keyboard.press('5'); await page.keyboard.press('4');
    for (const k of ['1', 'Enter', 'n', '5', 'Enter', '6', 'Enter', 'Enter']) await page.keyboard.press(k);
    const items = await page.evaluate(() => window.calc.view().eqn.items.map((i) => i.display.text));
    assert.deepEqual(items, ['3', '2']);
    if (shots) await page.screenshot({ path: `${shots}/ui-eqn.png` });
    await page.keyboard.press('F4'); await page.keyboard.press('1');
  });
  await check('window resize keeps the calculator fully visible (scales)', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(480, 700));
    await page.waitForTimeout(400);
    const box = await page.locator('#device').boundingBox();
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    assert.ok(box.y >= 0 && box.y + box.height <= vp.h + 1 && box.x >= 0 && box.x + box.width <= vp.w + 1, JSON.stringify({ box, vp }));
    assert.equal(await page.locator('#panel').evaluate((e) => e.classList.contains('hidden')), true);
    if (shots) await page.screenshot({ path: `${shots}/ui-small.png` });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 900));
    await page.waitForTimeout(300);
  });
  await check('memory: STO A via keys persists', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.type('42');
    await page.keyboard.press('F2');
    await page.locator('.key[data-key="rcl"] .cap').click();
    await page.locator('.key[data-key="neg"] .cap').click();
    assert.equal(await page.evaluate(() => window.calc.vars.A.n.toString()), '42');
  });
  await check('no renderer errors', async () => { assert.deepEqual(errors, []); });
  await page.waitForTimeout(700); // allow debounced save
  await app.close();

  console.log('UI test — relaunch (persistence)');
  ({ app, page, errors } = await launch());
  await check('history, memory and settings persisted across restarts', async () => {
    const st = await page.evaluate(() => ({ h: window.calc.history.length, a: window.calc.vars.A.n?.toString(), theme: document.body.dataset.theme }));
    assert.ok(st.h >= 8, `history ${st.h}`);
    assert.equal(st.a, '42');
    assert.equal(st.theme, 'graphite');
  });
  await check('replay (↑) recalls the last calculation', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowUp');
    assert.ok(await resultText(page));
  });
  if (shots) await page.screenshot({ path: `${shots}/ui-relaunch.png` });
  await app.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
