// Graphite Scientific — renderer: keypad, LCD screens, keyboard, side panel.
import { Calculator, MODES, valueToJSON } from '../engine/calculator.js';
import { KEYS, MODE_OVERRIDES, KEYBOARD, KEYBOARD_ALT } from '../engine/keys.js';
import { renderRow, renderDisplay, h } from './mathrender.js';
import { CONSTANTS, CONVERSIONS } from '../engine/constants.js';
import { UNIT_CATEGORIES, convertUnit } from '../engine/units.js';
import { plainValue, displayValue } from '../engine/format.js';
import { REFERENCE, SHORTCUTS } from './reference.js';

const native = window.native || null;
if (!native) document.body.classList.add('no-native');

// ---------------------------------------------------------------- state & persistence
const STORE_KEY = 'graphite-scientific-state';
function loadSaved() {
  try {
    const raw = native ? native.loadState() : localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
const saved = loadSaved();
const ui = { theme: 'graphite', panel: true, tab: 'history', sound: false, onTop: false, ...(saved?.ui || {}) };
const calc = new Calculator(saved?.calc);
window.calc = calc; // handy for automated UI tests

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = JSON.stringify({ ui, calc: calc.save() });
    try { if (native) native.saveState(data); else localStorage.setItem(STORE_KEY, data); } catch { /* ignore */ }
  }, 400);
}
window.addEventListener('beforeunload', () => {
  const data = JSON.stringify({ ui, calc: calc.save() });
  try { if (native) native.saveState(data); else localStorage.setItem(STORE_KEY, data); } catch { /* ignore */ }
});

// ---------------------------------------------------------------- keypad
const LAYOUT = {
  top: [['shift', 'alpha', null, 'mode', 'func'], ['calc', 'integ', null, 'inv', 'logb']],
  fn: [['frac', 'sqrt', 'sq', 'pow', 'log', 'ln'], ['neg', 'dms', 'hyp', 'sin', 'cos', 'tan'], ['rcl', 'eng', 'lp', 'rp', 'sd', 'mplus']],
  main: [['7', '8', '9', 'del', 'ac'], ['4', '5', '6', 'mul', 'div'], ['1', '2', '3', 'add', 'sub'], ['0', 'dot', 'exp10', 'ans', 'eq']],
};
const KEY_TITLES = {
  frac: 'Fraction (Ctrl+/ or \\)', sqrt: 'Square root (r)', sq: 'Square (q)', pow: 'Power (^)', log: 'log₁₀ (L)', ln: 'Natural log (l)',
  neg: 'Negative (n or ~)', sin: 'sine (s)', cos: 'cosine (c)', tan: 'tangent (t)', calc: 'CALC (F6) · SHIFT: SOLVE (F7)', eq: 'Equals (Enter)',
  del: 'Delete (Backspace)', ac: 'All clear (Esc)', ans: 'Answer (a)', shift: 'SHIFT (F2)', alpha: 'ALPHA (F3)', mode: 'MODE (F4) · SHIFT: SETUP (F5)',
  func: 'Function catalogue (enhancement)', inv: 'Reciprocal (v) · SHIFT: factorial (!)', sd: 'Standard ⇔ Decimal (F8)', eng: 'Engineering notation (F9)',
};

function parseLabel(s) {
  const frag = document.createDocumentFragment();
  if (s === 'frac') { const f = h('span', 'fracicon', h('i'), h('hr'), h('i')); frag.append(f); return frag; }
  let i = 0;
  const pushText = (t) => { if (!t) return; if (t === 'x' || t === 'e') frag.append(h('span', 'itl', t)); else frag.append(document.createTextNode(t)); };
  let buf = '';
  while (i < s.length) {
    const ch = s[i];
    if ((ch === '^' || ch === '_') && s[i + 1] === '{') {
      pushText(buf); buf = '';
      const end = s.indexOf('}', i);
      const inner = s.slice(i + 2, end);
      const el = document.createElement(ch === '^' ? 'sup' : 'sub');
      el.append(parseLabel(inner));
      frag.append(el);
      i = end + 1; continue;
    }
    if (ch === '▫' || ch === '▭') { pushText(buf); buf = ''; frag.append(h('span', 'box')); i++; continue; }
    if (ch === 'x' && (s[i + 1] === '^' || s[i + 1] === '³' || s[i + 1] === '!')) { pushText(buf); buf = ''; frag.append(h('span', 'itl', 'x')); i++; continue; }
    buf += ch; i++;
  }
  pushText(buf);
  return frag;
}

const keyEls = {};
function makeKey(id) {
  const def = KEYS[id];
  const wrap = h('div', `key ${def.cls || 'fn'}`);
  wrap.dataset.key = id;
  const lbls = h('div', 'lbls');
  const ls = h('span', 'ls'); const la = h('span', 'la');
  lbls.append(ls, la);
  const cap = h('button', 'cap');
  cap.type = 'button';
  cap.tabIndex = -1;
  cap.title = KEY_TITLES[id] || '';
  const main = h('span', 'main');
  cap.append(main);
  wrap.append(lbls, cap);
  cap.addEventListener('pointerdown', (e) => { e.preventDefault(); pressKey(id, true); });
  keyEls[id] = { wrap, ls, la, main, cap };
  return wrap;
}
function navPad() {
  const pad = h('div', 'navpad');
  pad.append(h('div', 'ring'));
  const arrow = { up: 'M2 8 L6 4 L10 8', down: 'M2 4 L6 8 L10 4', left: 'M8 2 L4 6 L8 10', right: 'M4 2 L8 6 L4 10' };
  for (const d of ['up', 'down', 'left', 'right']) {
    const b = h('button', `nb ${d}`);
    b.type = 'button'; b.tabIndex = -1;
    b.innerHTML = `<svg viewBox="0 0 12 12"><path d="${arrow[d]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressKey(d, true); });
    keyEls[d] = { cap: b };
    pad.append(b);
  }
  pad.append(h('span', 'rlabel', 'REPLAY'));
  return pad;
}
function buildKeypad() {
  const kp = document.getElementById('keypad');
  kp.innerHTML = '';
  const top = h('div', 'krow top');
  LAYOUT.top.forEach((row, r) => row.forEach((id, c) => {
    if (id === null) { if (r === 0) top.append(navPad()); return; }
    const k = makeKey(id);
    k.style.gridRow = String(r + 1);
    k.style.gridColumn = String(c + 1);
    top.append(k);
  }));
  kp.append(top);
  for (const row of LAYOUT.fn) { const el = h('div', 'krow fn'); row.forEach((id) => el.append(makeKey(id))); kp.append(el); }
  for (const row of LAYOUT.main) { const el = h('div', 'krow main'); row.forEach((id) => el.append(makeKey(id))); kp.append(el); }
  updateKeyLabels();
}
let labelMode = null;
function updateKeyLabels() {
  if (labelMode === calc.mode) return;
  labelMode = calc.mode;
  for (const [id, el] of Object.entries(keyEls)) {
    if (!el.main) continue;
    const def = KEYS[id];
    const ov = MODE_OVERRIDES[calc.mode]?.[id];
    el.main.replaceChildren(parseLabel(ov?.label ?? def.label ?? id));
    el.ls.replaceChildren(def.s ? parseLabel(def.s) : '');
    el.la.textContent = def.a ?? '';
    if (calc.mode === 'BASE' && ov?.label && /^[A-F]$/.test(ov.label)) el.la.textContent = '';
  }
}

// ---------------------------------------------------------------- sound (optional)
let audioCtx = null;
function click() {
  if (!ui.sound) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.06);
  } catch { /* ignore */ }
}

function flash(id) {
  const el = keyEls[id]?.cap;
  if (!el) return;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 110);
}
function pressKey(id, fromPointer = false) {
  if (!fromPointer) flash(id);
  click();
  calc.press(id);
}

// ---------------------------------------------------------------- LCD rendering
const lcd = document.getElementById('lcd');

function statusBar(v) {
  const i = v.ind;
  const ind = (cls, text, on) => h('span', `ind ${cls}${on ? ' on' : ''}`, text);
  const modeLabel = MODES.find((m) => m.id === v.mode)?.label || v.mode;
  return h('div', 'status',
    ind('S', 'S', i.S), ind('A', 'A', i.A), ind('M', 'M', i.M), ind('STO', 'STO', i.STO), ind('RCL', 'RCL', i.RCL),
    ind('hyp', 'hyp', i.hyp),
    h('span', 'grow'),
    i.base ? ind('base', i.base, true) : null,
    v.mode !== 'COMP' ? h('span', 'modechip', modeLabel) : null,
    i.fmt ? ind('fmt', i.fmt, true) : null,
    i.disp ? ind('eng', 'ENG', true) : null,
    ind('io', i.mathIO ? 'Math' : 'Line', true),
    h('span', 'angle', i.angle));
}

function renderLCD() {
  const v = calc.view();
  document.body.classList.toggle('shift-on', v.ind.S);
  document.body.classList.toggle('alpha-on', v.ind.A);
  keyEls.shift?.wrap.classList.toggle('active', v.ind.S);
  keyEls.alpha?.wrap.classList.toggle('active', v.ind.A);
  document.getElementById('tbMode').textContent = MODES.find((m) => m.id === v.mode)?.label || v.mode;
  updateKeyLabels();
  const body = h('div', 'lcd-body');
  const linear = !v.settings.mathIO;
  const base = v.mode === 'BASE';
  switch (v.screen) {
    case 'calc': renderCalcScreen(body, v, linear, base); break;
    case 'menu': renderMenu(body, v.menu); break;
    case 'prompt': renderPrompt(body, v.prompt, linear); break;
    case 'grid': renderGrid(body, v.grid, linear); break;
    case 'eqnResult': renderEqn(body, v.eqn, linear); break;
    case 'table': renderTable(body, v.tableView); break;
    case 'statResults': renderStats(body, v.stats); break;
    case 'error': body.append(h('div', 'error-scr', h('div', 'etitle', v.error.title), v.error.detail ? h('div', 'edetail', v.error.detail) : null, h('div', 'ehint', '[AC] Cancel     [◀][▶] Goto'))); break;
    case 'confirm': body.append(h('div', 'confirm', v.confirm.label, h('small', '', '[=] : Yes      [AC] : Cancel'))); break;
    default: break;
  }
  lcd.replaceChildren(statusBar(v), body);
  requestAnimationFrame(() => fitLCD(v));
}

function lastHistory(mode, skipCurrent) {
  const list = calc.history.filter((x) => x.mode === mode);
  return list[list.length - 1 - (skipCurrent ? 1 : 0)];
}

function renderCalcScreen(body, v, linear, base) {
  if (v.mode === 'TABLE' && v.table) {
    const t = v.table;
    const fn = h('div', 'table-fn');
    const row = (label, root, focus) => h('div', `tf${focus ? ' active' : ''}`, h('span', 'tfl', label), renderRow(root, { cursor: focus ? t.cursor : null, linear }));
    fn.append(row('f(X)=', t.f, t.focus !== 'g'));
    if (t.hasG) fn.append(row('g(X)=', t.g, t.focus === 'g'));
    body.append(h('div', 'scr-title', h('span', '', 'TABLE'), h('span', '', '[=] set range')), fn);
    if (v.message) body.append(h('div', 'message', v.message));
    return;
  }
  const c = v.calc;
  const prev = lastHistory(v.mode, c.showing);
  body.append(h('div', 'ctx', prev ? `${prev.exprText}  =  ${prev.resultText}` : ''));
  const wrap = h('div', 'expr-wrap');
  const expr = h('div', 'expr', renderRow(c.root, { cursor: c.cursor, linear, base }));
  expr.addEventListener('pointerdown', onExprClick);
  wrap.append(expr);
  body.append(wrap);
  if (c.baseAll) {
    const alt = h('div', 'basealt');
    for (const b of ['DEC', 'HEX', 'BIN', 'OCT']) if (b !== v.ind.base) alt.append(h('div', '', h('b', '', b), c.baseAll[b]));
    body.append(alt);
  }
  const res = h('div', 'result');
  if (c.result) res.append(renderDisplay(c.result, { linear }));
  body.append(res);
  if (!c.baseAll && v.message) body.append(h('div', 'message', v.message));
}

function onExprClick(e) {
  const t = e.target.closest('[data-p]');
  if (!t) return;
  e.preventDefault();
  const path = JSON.parse(t.dataset.p);
  let idx = parseInt(t.dataset.i, 10);
  if (!t.dataset.slot) {
    const r = t.getBoundingClientRect();
    if (e.clientX > r.left + r.width / 2) idx++;
  }
  calc.placeCursor(path, idx);
}

function renderMenu(body, m) {
  body.append(h('div', 'scr-title', h('span', '', m.title), m.pages > 1 ? h('span', '', `${m.page + 1}/${m.pages}  ▲▼`) : h('span', '')));
  if (m.digitPrompt) { body.append(h('div', 'digit-prompt', m.title)); return; }
  const long = m.items.some((it) => it.label.length > 13);
  const grid = h('div', `menu${long ? ' one' : ''}`);
  for (const it of m.items) {
    const el = h('div', 'menu-item', h('b', '', `${it.n === 10 ? 0 : it.n}:`), h('span', '', it.label));
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); calc.menuSelect(it.index); });
    grid.append(el);
  }
  body.append(grid);
}

function renderPrompt(body, p, linear) {
  body.append(h('div', 'scr-title', h('span', '', p.title), h('span', '', '[=] next   [AC] exit')));
  if (p.expr && p.expr.length) body.append(h('div', 'prompt-ctx', renderRow(p.expr, { linear })));
  const list = h('div', 'prompt-list');
  p.fields.forEach((f, i) => {
    const active = i === p.idx;
    const row = h('div', `prompt-field${active ? ' active' : ''}`, h('span', 'plabel', f.label));
    if (active && f.root.length) row.append(renderRow(f.root, { cursor: f.cursor, linear }));
    else if (active) row.append(renderRow([], { cursor: f.cursor, linear }));
    if (f.current) row.append(h('span', 'pcur', renderDisplay(f.current, { linear: true })));
    list.append(row);
  });
  body.append(list);
}

function renderGrid(body, g, linear) {
  const hint = g.kind === 'eqn' ? '[=] on empty cell: solve' : g.kind === 'stat' ? '[AC] done   [DEL] delete row' : '[AC] done';
  body.append(h('div', 'scr-title', h('span', '', g.title), h('span', '', hint)));
  const visible = g.kind === 'stat' ? 5 : 4;
  const start = Math.max(0, Math.min(g.r - Math.floor(visible / 2), g.rows - visible));
  const tbl = h('table', 'gtable');
  const showRowLabels = g.kind === 'stat' || g.kind === 'matrix' || (g.rowLabels && g.rowLabels.length);
  if (g.colLabels || g.kind === 'matrix') {
    const tr = h('tr');
    if (showRowLabels) tr.append(h('th', 'rl', ''));
    for (let j = 0; j < g.cols; j++) tr.append(h('th', '', g.colLabels ? g.colLabels[j] : String(j + 1)));
    tbl.append(tr);
  }
  for (let i = start; i < Math.min(g.rows, start + visible); i++) {
    const tr = h('tr');
    if (showRowLabels) tr.append(h('td', 'rl', g.rowLabels ? g.rowLabels[i] : String(i + 1)));
    g.cells[i].forEach((c, j) => {
      const td = h('td', i === g.r && j === g.c ? 'sel' : '');
      if (c.display) td.append(renderDisplay(c.display, { linear: true }));
      td.addEventListener('pointerdown', (e) => { e.preventDefault(); calc.gridClick(i, j); });
      tr.append(td);
    });
    tbl.append(tr);
  }
  const sc = h('div', 'gscroll', tbl);
  body.append(sc);
  const cur = g.cells[g.r][g.c];
  const label = `${g.colLabels ? g.colLabels[g.c] : 'C' + (g.c + 1)}${g.kind === 'eqn' && g.rows === 1 ? '' : g.kind === 'vector' ? '' : (g.rowLabels ? g.rowLabels[g.r] : g.r + 1)}`;
  const ed = h('div', 'gedit', h('span', 'glabel', label.toUpperCase()));
  if (cur.root && cur.root.length) ed.append(renderRow(cur.root, { cursor: cur.cursor, linear }));
  else { ed.append(renderRow([], { cursor: { path: [], pos: 0 }, linear })); if (cur.display) ed.append(h('span', 'gval', renderDisplay(cur.display, { linear }))); }
  body.append(ed);
}

function renderEqn(body, e, linear) {
  body.append(h('div', 'scr-title', h('span', '', e.type.label), h('span', '', '[S⇔D] decimal   [AC] edit')));
  if (e.message) { body.append(h('div', 'eqn-msg', e.message)); return; }
  const list = h('div', 'eqn-list');
  const all = [...e.items, ...(e.extra || []).map((x) => ({ ...x, isExtra: true }))];
  const n = all.length;
  const visible = 3;
  const start = Math.max(0, Math.min(e.idx - 1, n - visible));
  all.slice(start, start + visible).forEach((it, k) => {
    const idx = start + k;
    list.append(h('div', `eqn-item${idx === e.idx ? ' sel' : ''}${it.isExtra ? ' extra' : ''}`, h('span', 'elabel', `${it.label} =`), renderDisplay(it.display, { linear })));
  });
  body.append(list);
}

function renderTable(body, t) {
  body.append(h('div', 'scr-title', h('span', '', 'TABLE'), h('span', '', `${t.sel + 1}/${t.rows.length}   [AC] f(x)`)));
  const tbl = h('table', 'gtable');
  tbl.append(h('tr', '', h('th', 'rl', ''), h('th', '', 'X'), h('th', '', 'F(X)'), t.hasG ? h('th', '', 'G(X)') : null));
  const visible = 5;
  const start = Math.max(0, Math.min(t.sel - 2, t.rows.length - visible));
  t.rows.slice(start, start + visible).forEach((r, k) => {
    const i = start + k;
    const cellOf = (x) => (x.err ? h('td', 'err', x.err) : h('td', '', renderDisplay(x.d, { linear: true })));
    const tr = h('tr', '', h('td', 'rl', String(i + 1)), h('td', i === t.sel ? 'sel' : '', renderDisplay(r.xd, { linear: true })), cellOf(r.f), r.g ? cellOf(r.g) : null);
    if (i === t.sel) [...tr.children].slice(1).forEach((td) => td.classList.add('sel'));
    tbl.append(tr);
  });
  body.append(h('div', 'gscroll', tbl));
  const sel = t.rows[t.sel];
  body.append(h('div', 'gedit', h('span', 'glabel', 'F(X)'), h('span', 'gval', sel.f.err ? sel.f.err : renderDisplay(sel.f.d, {}))));
}

const STAT_ROWS = [['n', 'n'], ['x̄', 'mean'], ['σx', 'popsdx'], ['sx', 'sampsdx'], ['σx²', 'popvarx'], ['sx²', 'sampvarx'], ['Σx', 'sumx'], ['Σx²', 'sumx2'], ['minX', 'minX'], ['maxX', 'maxX'], ['Q₁', 'q1'], ['med', 'median'], ['Q₃', 'q3'],
  ['ȳ', 'meany'], ['σy', 'popsdy'], ['sy', 'sampsdy'], ['Σy', 'sumy'], ['Σy²', 'sumy2'], ['Σxy', 'sumxy'], ['minY', 'minY'], ['maxY', 'maxY'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['r', 'r'], ['R²', 'R2']];
function statRows(s) { return STAT_ROWS.filter(([, k]) => s[k] !== undefined && !Number.isNaN(s[k])); }
function renderStats(body, st) {
  const rows = statRows(st.data);
  const per = 14;
  const start = Math.min(st.scroll * 2, Math.max(0, rows.length - per));
  body.append(h('div', 'scr-title', h('span', '', `STATISTICS · ${st.type.label}`), h('span', '', '▲▼  [AC]')));
  const grid = h('div', 'stats-grid');
  for (const [lab, k] of rows.slice(start, start + per)) grid.append(h('div', '', h('span', '', lab), h('span', '', fmtNum(st.data[k]))));
  body.append(grid);
}
function fmtNum(x) { return displayValue({ k: 'r', v: x }, calc.settings, { exact: false }).text; }

function fitLCD(v) {
  const res = lcd.querySelector('.result');
  if (res) {
    res.classList.remove('small', 'tiny', 'micro');
    for (const cls of ['small', 'tiny', 'micro']) {
      const out = res.firstElementChild;
      if (!out || (out.getBoundingClientRect().width <= res.clientWidth * (window.__lcdScale || 1) + 1 && out.getBoundingClientRect().height <= 150 * (window.__lcdScale || 1))) break;
      res.classList.add(cls);
    }
  }
  const wrap = lcd.querySelector('.expr-wrap');
  const expr = lcd.querySelector('.expr');
  if (wrap && expr) {
    const cur = expr.querySelector('.cursor');
    const W = wrap.clientWidth;
    let dx = 0;
    if (cur) {
      const cx = cur.offsetLeft + offsetWithin(cur, expr);
      if (cx > W - 18) dx = cx - W + 18;
    } else if (expr.scrollWidth > W && v.calc?.showing) {
      // fit a long finished expression by scaling it down a little
      const k = Math.max(0.55, W / expr.scrollWidth);
      expr.style.transformOrigin = 'left top';
      expr.style.transform = `scale(${k})`;
      return;
    }
    expr.style.transform = dx ? `translateX(${-dx}px)` : '';
  }
}
function offsetWithin(el, ancestor) {
  let x = 0; let n = el.offsetParent;
  while (n && n !== ancestor && ancestor.contains(n)) { x += n.offsetLeft; n = n.offsetParent; }
  return x;
}

// ---------------------------------------------------------------- keyboard
function isTypingTarget(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) return;
  const k = e.key;
  if (e.ctrlKey || e.metaKey) {
    const lk = k.toLowerCase();
    if (lk === 'c') { e.preventDefault(); return e.shiftKey ? copyExpression() : copyResult(); }
    if (lk === 'v') { e.preventDefault(); return pasteClipboard(); }
    if (lk === 'h') { e.preventDefault(); return togglePanel(); }
    if (k === ',') { e.preventDefault(); return openTab('settings'); }
    if (k === '/') { e.preventDefault(); return pressKey('frac'); }
    if (lk === 'i') { e.preventDefault(); return openTab('inspect'); }
    return;
  }
  if (k === 'F1') { e.preventDefault(); return openTab('reference'); }
  if (e.altKey) {
    const id = KEYBOARD_ALT[k.toLowerCase()];
    if (id) { e.preventDefault(); pressKey('alpha'); pressKey(id); }
    return;
  }
  const m = KEYBOARD[k];
  if (!m) return;
  e.preventDefault();
  if (Array.isArray(m)) m.forEach((id) => pressKey(id)); else pressKey(m);
});

// ---------------------------------------------------------------- clipboard
async function writeClip(text) {
  try { if (native) native.copy(text); else await navigator.clipboard.writeText(text); toast(`Copied  ${text.length > 40 ? text.slice(0, 40) + '…' : text}`); } catch { toast('Copy failed'); }
}
async function readClip() {
  try { return native ? native.paste() : await navigator.clipboard.readText(); } catch { return ''; }
}
function copyResult() {
  const r = calc.result && calc.showing ? calc.result : null;
  if (!r) { if (calc.history.length) return writeClip(calc.history[calc.history.length - 1].plain); return toast('Nothing to copy yet'); }
  writeClip(plainValue(r.value));
}
function copyExpression() { writeClip(calc.editor.toText() || calc.history[calc.history.length - 1]?.exprText || ''); }
async function pasteClipboard() { const t = await readClip(); if (t) { calc.pasteText(t); toast('Pasted'); } }

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------------------------------------------------------------- scaling
const device = document.getElementById('device');
const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
function layout() {
  const W = window.innerWidth;
  const autoHide = W < 760;
  panel.classList.toggle('hidden', !ui.panel || autoHide);
  requestAnimationFrame(() => {
    const r = stage.getBoundingClientRect();
    const s = Math.max(0.4, Math.min((r.width - 8) / 440, (r.height - 8) / 944, 1.5));
    device.style.setProperty('--scale', s.toFixed(4));
    window.__lcdScale = s;
  });
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe(stage);
function togglePanel() { ui.panel = !ui.panel; layout(); scheduleSave(); if (ui.panel) renderPanel(); }

// ---------------------------------------------------------------- title bar
document.getElementById('btnPanel').addEventListener('click', togglePanel);
document.getElementById('btnMin').addEventListener('click', () => native?.minimize());
document.getElementById('btnMax').addEventListener('click', () => native?.maximize());
document.getElementById('btnClose').addEventListener('click', () => { scheduleSave(); native?.close(); });
const btnPin = document.getElementById('btnPin');
btnPin.addEventListener('click', () => { ui.onTop = !ui.onTop; native?.setOnTop(ui.onTop); btnPin.classList.toggle('on', ui.onTop); scheduleSave(); });

// ---------------------------------------------------------------- side panel
const ICONS = {
  history: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 4.5V8h3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  constants: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9" ry="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  convert: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  inspect: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  reference: '<svg viewBox="0 0 24 24"><path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 17a3 3 0 0 1 3-3h9.5M9 8.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  insert: '<svg viewBox="0 0 24 24"><path d="M5 12h12M13 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4v14l-3-3M17 20V6l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const TABS = [['history', 'History'], ['constants', 'Constants'], ['convert', 'Convert'], ['inspect', 'Inspect'], ['reference', 'Guide'], ['settings', 'Settings']];
const tabsEl = document.getElementById('tabs');
const panelBody = document.getElementById('panelBody');
function buildTabs() {
  tabsEl.innerHTML = '';
  for (const [id, label] of TABS) {
    const b = h('button', `tab${ui.tab === id ? ' active' : ''}`);
    b.innerHTML = ICONS[id];
    b.append(h('span', '', label));
    b.addEventListener('click', () => openTab(id));
    tabsEl.append(b);
  }
}
function openTab(id) {
  ui.tab = id;
  if (!ui.panel) { ui.panel = true; layout(); }
  buildTabs(); renderPanel(); scheduleSave();
}
function iconBtn(icon, title, fn) {
  const b = h('button', 'icon-btn'); b.innerHTML = ICONS[icon]; b.title = title;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
function btn(label, fn, cls = '') { const b = h('button', `btn ${cls}`, label); b.addEventListener('click', fn); return b; }

function renderPanel() {
  if (!ui.panel) return;
  const scroll = panelBody.scrollTop;
  const keepScroll = panelBody.dataset.tab === ui.tab;
  panelBody.dataset.tab = ui.tab;
  const fns = { history: panelHistory, constants: panelConstants, convert: panelConvert, inspect: panelInspect, reference: panelReference, settings: panelSettings };
  const content = fns[ui.tab]();
  panelBody.replaceChildren(content);
  if (keepScroll) panelBody.scrollTop = scroll;
}

let histFilter = '';
function panelHistory() {
  const root = h('div');
  const head = h('div', 'ph', h('div', '', h('h2', '', 'History'), h('div', 'sub', `${calc.history.length} calculation${calc.history.length === 1 ? '' : 's'} · click to reuse`)));
  const acts = h('div', '', btn('Clear', () => { if (confirm('Clear the whole calculation history?')) { calc.history = []; calc.changed(); renderPanel(); scheduleSave(); } }));
  head.append(acts);
  root.append(head);
  const search = h('input', 'search'); search.type = 'text'; search.placeholder = 'Search expressions and results'; search.value = histFilter;
  search.addEventListener('input', () => { histFilter = search.value; renderList(); });
  root.append(search);
  const list = h('div');
  root.append(list);
  function renderList() {
    list.innerHTML = '';
    const q = histFilter.trim().toLowerCase();
    const items = calc.history.map((x, i) => [x, i]).filter(([x]) => !q || x.exprText.toLowerCase().includes(q) || x.resultText.toLowerCase().includes(q)).reverse();
    if (!items.length) {
      const e = h('div', 'empty'); e.innerHTML = ICONS.history; e.append(calc.history.length ? 'No matches' : 'Your calculations will appear here.\nThey are saved between sessions.'); list.append(e); return;
    }
    for (const [x, i] of items.slice(0, 150)) {
      const item = h('div', 'hist-item');
      const mode = MODES.find((m) => m.id === x.mode)?.label || x.mode;
      item.append(h('div', 'hmeta', h('span', '', mode), h('span', 'htime', timeAgo(x.time))));
      let exprEl;
      try { exprEl = renderRow(x.expr, { linear: !calc.settings.mathIO, base: x.mode === 'BASE' }); } catch { exprEl = document.createTextNode(x.exprText); }
      item.append(h('div', 'hexpr', exprEl));
      let resEl;
      try { resEl = renderDisplay(x.display, { linear: !calc.settings.mathIO }); } catch { resEl = document.createTextNode(x.resultText); }
      item.append(h('div', 'hres', resEl));
      const acts2 = h('div', 'hacts',
        iconBtn('insert', 'Insert result into the calculator', () => { calc.pasteText(x.plain.includes('=') || x.plain.startsWith('[') ? '' : x.plain); }),
        iconBtn('copy', 'Copy result', () => writeClip(x.plain)),
        iconBtn('trash', 'Remove', () => { calc.history.splice(i, 1); calc.changed(); renderList(); scheduleSave(); }));
      item.append(acts2);
      item.addEventListener('click', () => {
        if (x.mode !== calc.mode && MODES.some((m) => m.id === x.mode) && x.mode !== 'EQN' && x.mode !== 'TABLE') { calc.enterMode(x.mode); if (x.base) calc.base = x.base; }
        calc.loadExpression(x.expr, false);
      });
      list.append(item);
    }
  }
  renderList();
  return root;
}
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

let constFilter = '';
function panelConstants() {
  const root = h('div');
  root.append(h('div', 'ph', h('div', '', h('h2', '', 'Scientific constants'), h('div', 'sub', 'CODATA 2018 values · click to insert'))));
  const search = h('input', 'search'); search.type = 'text'; search.placeholder = 'Search constants'; search.value = constFilter;
  const list = h('div');
  const render = () => {
    list.innerHTML = '';
    const q = constFilter.toLowerCase();
    for (const c of CONSTANTS.filter((c) => !q || c.name.toLowerCase().includes(q) || c.sym.toLowerCase().includes(q) || c.unit.toLowerCase().includes(q))) {
      const it = h('div', 'const-item', h('span', 'csym', c.sym), h('span', 'cname', c.name), h('span', 'cno', `CONST ${String(c.no).padStart(2, '0')}`), h('span', 'cval', `${c.value.replace('E', ' × 10^')} ${c.unit}`));
      it.addEventListener('click', () => { calc.insertAct(`char:k:${c.id}`); calc.changed(); });
      list.append(it);
    }
  };
  search.addEventListener('input', () => { constFilter = search.value; render(); });
  root.append(search, list);
  render();
  return root;
}

const convState = { cat: 'Length', from: 'm', to: 'ft', value: '1' };
function panelConvert() {
  const root = h('div');
  root.append(h('div', 'ph', h('div', '', h('h2', '', 'Unit converter'), h('div', 'sub', `${Object.keys(UNIT_CATEGORIES).length} categories · enhancement`))));
  const cat = h('select');
  for (const k of Object.keys(UNIT_CATEGORIES)) { const o = h('option', '', k); o.value = k; if (k === convState.cat) o.selected = true; cat.append(o); }
  const mkSel = (val) => { const s = h('select'); for (const u of UNIT_CATEGORIES[convState.cat].units) { const o = h('option', '', `${u[0]} — ${u[1]}`); o.value = u[0]; if (u[0] === val) o.selected = true; s.append(o); } return s; };
  const units = UNIT_CATEGORIES[convState.cat].units.map((u) => u[0]);
  if (!units.includes(convState.from)) convState.from = units[0];
  if (!units.includes(convState.to)) convState.to = units[1] || units[0];
  const from = mkSel(convState.from), to = mkSel(convState.to);
  const input = h('input'); input.type = 'text'; input.value = convState.value; input.inputMode = 'decimal';
  const out = h('div', 'conv-out');
  const useAns = btn('Use Ans', () => { input.value = plainValue(calc.ans); compute(); });
  const swap = iconBtn('swap', 'Swap units', () => { [convState.from, convState.to] = [convState.to, convState.from]; renderPanel(); });
  const insert = btn('Insert result', () => { if (lastConv !== null) calc.pasteText(String(lastConv).replace('e', 'E')); }, 'primary');
  let lastConv = null;
  function compute() {
    convState.value = input.value; convState.from = from.value; convState.to = to.value;
    const x = Number(input.value.replace(/,/g, '').replace('×10^', 'e').replace('E', 'e'));
    if (!Number.isFinite(x)) { out.replaceChildren('—', h('small', '', 'Enter a number')); lastConv = null; return; }
    const y = convertUnit(convState.cat, x, from.value, to.value);
    lastConv = Number(y.toPrecision(12));
    out.replaceChildren(document.createTextNode(`${fmtConv(y)} ${to.value}`), h('small', '', `${fmtConv(x)} ${from.value} = ${fmtConv(y)} ${to.value}`));
  }
  cat.addEventListener('change', () => { convState.cat = cat.value; renderPanel(); });
  [from, to].forEach((s) => s.addEventListener('change', compute));
  input.addEventListener('input', compute);
  root.append(h('div', 'field', h('label', '', 'Quantity'), cat));
  root.append(h('div', 'field', h('label', '', 'Value'), input));
  root.append(h('div', 'conv-grid', h('div', 'field', h('label', '', 'From'), from), h('div', 'field', swap), h('div', 'field', h('label', '', 'To'), to)));
  root.append(out, h('div', '', useAns, ' ', insert));
  root.append(h('div', 'section-title', 'Calculator CONV presets (SHIFT 8)'));
  const list = h('div');
  for (const c of CONVERSIONS) {
    const row = h('div', 'ref-row', h('span', 'rk', String(c.id).padStart(2, '0')), h('span', 'rd', c.label));
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => { calc.insertAct(`char:cv:${c.id}`); calc.changed(); });
    list.append(row);
  }
  root.append(list);
  compute();
  return root;
}
function fmtConv(x) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e12 || a < 1e-6) return x.toExponential(8).replace(/\.?0+e/, 'e').replace('e', ' × 10^');
  return Number(x.toPrecision(12)).toLocaleString('en-US', { maximumSignificantDigits: 12 });
}

function panelInspect() {
  const root = h('div');
  root.append(h('div', 'ph', h('div', '', h('h2', '', 'Result inspector'), h('div', 'sub', 'Every form of the current answer'))));
  const forms = calc.inspect();
  if (forms) {
    const kv = h('div', 'kv');
    for (const [k, v] of forms) kv.append(h('span', 'k', k), h('span', 'v', v), iconBtn('copy', 'Copy', () => writeClip(v)));
    root.append(kv);
  } else if (calc.screen === 'eqnResult' && calc.eqnResult?.items) {
    const kv = h('div', 'kv');
    for (const it of calc.eqnResult.items) kv.append(h('span', 'k', it.label), h('span', 'v', it.plain), iconBtn('copy', 'Copy', () => writeClip(it.plain)));
    root.append(kv);
  } else root.append(h('div', 'empty', 'Calculate something and press = to see it as a fraction, decimal, scientific and engineering notation, hex, binary and prime factors.'));
  if (calc.lastExplain && calc.lastExplain.length) {
    root.append(h('div', 'section-title', 'Step-by-step'));
    const ol = h('ol', 'steps');
    for (const s of calc.lastExplain) ol.append(h('li', '', s));
    root.append(ol);
  }
  const tbl = calc.table || calc.lastTable;
  if (tbl && tbl.rows.length > 1) {
    root.append(h('div', 'section-title', 'Graph of the current table'));
    const cv = h('canvas', 'plot');
    root.append(cv);
    requestAnimationFrame(() => drawPlot(cv, tbl));
  }
  root.append(h('div', 'section-title', 'Memory'));
  const mem = h('div', 'kv');
  for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M']) {
    const t = displayValue(calc.vars[k], calc.settings, { exact: true }).text;
    mem.append(h('span', 'k', k), h('span', 'v', t), iconBtn('insert', `Insert ${k}`, () => { calc.insertAct(`char:${k}`); calc.changed(); }));
  }
  mem.append(h('span', 'k', 'Ans'), h('span', 'v', displayValue(calc.ans, calc.settings, { exact: true }).text), iconBtn('insert', 'Insert Ans', () => { calc.insertAct('char:Ans'); calc.changed(); }));
  root.append(mem);
  return root;
}
function drawPlot(cv, table) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const series = [table.rows.map((r) => [Number(plainValue(r.x)), r.f.v ? Number(plainValue(r.f.v)) : NaN])];
  if (table.hasG) series.push(table.rows.map((r) => [Number(plainValue(r.x)), r.g?.v ? Number(plainValue(r.g.v)) : NaN]));
  const pts = series.flat().filter(([, y]) => Number.isFinite(y));
  if (!pts.length) return;
  let [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  let [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  const pad = 22;
  const X = (x) => pad + (x - x0) / (x1 - x0) * (W - 2 * pad), Y = (y) => H - pad - (y - y0) / (y1 - y0) * (H - 2 * pad);
  g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pad + i * (H - 2 * pad) / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); }
  g.strokeStyle = css.getPropertyValue('--text-dim');
  if (y0 < 0 && y1 > 0) { g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(W - pad, Y(0)); g.stroke(); }
  if (x0 < 0 && x1 > 0) { g.beginPath(); g.moveTo(X(0), pad); g.lineTo(X(0), H - pad); g.stroke(); }
  const colors = [css.getPropertyValue('--accent'), css.getPropertyValue('--alpha-ink')];
  series.forEach((s, k) => {
    g.strokeStyle = colors[k]; g.fillStyle = colors[k]; g.lineWidth = 1.8;
    g.beginPath(); let started = false;
    for (const [x, y] of s) { if (!Number.isFinite(y)) { started = false; continue; } if (!started) { g.moveTo(X(x), Y(y)); started = true; } else g.lineTo(X(x), Y(y)); }
    g.stroke();
    for (const [x, y] of s) if (Number.isFinite(y)) { g.beginPath(); g.arc(X(x), Y(y), 2.2, 0, 7); g.fill(); }
  });
  g.fillStyle = css.getPropertyValue('--text-dim'); g.font = '10px Inter';
  g.fillText(`${fmtConv(y1)}`, 4, pad - 6); g.fillText(`${fmtConv(y0)}`, 4, H - 6);
  g.textAlign = 'right'; g.fillText(`x: ${fmtConv(x0)} … ${fmtConv(x1)}`, W - 6, H - 6);
}

function panelReference() {
  const root = h('div');
  root.append(h('div', 'ph', h('div', '', h('h2', '', 'Guide & function reference'),
    h('div', 'sub legend', h('span', 'tag casio', 'fx-991ES'), ' on the original fx-991ES', h('br'), h('span', 'tag plus', 'LATER'), ' on later Casio models (ES PLUS / EX), not the original', h('br'), h('span', 'tag enh', 'EXTRA'), ' added by this app'))));
  root.append(h('div', 'section-title', 'Keyboard'));
  for (const [k, d] of SHORTCUTS) {
    const keys = h('span', 'rk'); k.split(' ').forEach((p, i) => { if (i) keys.append(' '); keys.append(h('span', 'kbd', p)); });
    root.append(h('div', 'ref-row', keys, h('span', 'rd', d)));
  }
  for (const grp of REFERENCE) {
    root.append(h('div', 'section-title', grp.title));
    for (const [k, d, tag] of grp.items) {
      const rd = h('span', 'rd', d);
      if (tag) rd.append(h('span', `tag ${tag}`, tag === 'casio' ? 'fx-991ES' : tag === 'plus' ? 'LATER' : 'EXTRA'));
      root.append(h('div', 'ref-row', h('span', 'rk', k), rd));
    }
  }
  return root;
}

function seg(options, value, onPick) {
  const s = h('div', 'seg');
  for (const [v, label] of options) { const b = h('button', v === value ? 'on' : '', label); b.addEventListener('click', () => onPick(v)); s.append(b); }
  return s;
}
function toggle(label, desc, on, fn) {
  const sw = h('button', `switch${on ? ' on' : ''}`); sw.addEventListener('click', () => fn(!on));
  return h('div', 'toggle', h('div', '', label, desc ? h('small', '', desc) : null), sw);
}
function setSetting(k, v) { calc.settings[k] = v; calc.refreshResult(); calc.changed(); scheduleSave(); renderPanel(); }
function panelSettings() {
  const st = calc.settings;
  const root = h('div');
  root.append(h('div', 'section-title', 'Theme'));
  const cards = h('div', 'theme-cards');
  for (const [id, label, a, b] of [['graphite', 'Graphite', '#26272b', '#0b0d0e'], ['titanium', 'Titanium', '#d6d7da', '#c9d0c3'], ['midnight', 'Midnight', '#1d2230', '#070a10']]) {
    const c = h('div', `theme-card${ui.theme === id ? ' on' : ''}`);
    const sw = h('div', 'sw'); sw.style.background = a; const i = h('i'); i.style.background = b; sw.append(i);
    c.append(sw, label);
    c.addEventListener('click', () => { ui.theme = id; document.body.dataset.theme = id; scheduleSave(); renderPanel(); });
    cards.append(c);
  }
  root.append(cards);
  root.append(h('div', 'section-title', 'Display (SETUP)'));
  root.append(h('div', 'field', h('label', '', 'Input / output'), seg([[true, 'Natural (MathIO)'], [false, 'Linear (LineIO)']], st.mathIO, (v) => setSetting('mathIO', v))));
  root.append(h('div', 'field', h('label', '', 'Angle unit'), seg([['D', 'Degrees'], ['R', 'Radians'], ['G', 'Gradians']], st.angle, (v) => setSetting('angle', v))));
  root.append(h('div', 'field', h('label', '', 'Number format'), seg([['Norm1', 'Norm 1'], ['Norm2', 'Norm 2'], ['Fix', 'Fix'], ['Sci', 'Sci']], st.fmt, (v) => { if (v === 'Fix' && (st.digits > 9)) st.digits = 4; if (v === 'Sci' && st.digits < 1) st.digits = 6; setSetting('fmt', v); })));
  if (st.fmt === 'Fix' || st.fmt === 'Sci') {
    const sel = h('select');
    const range = st.fmt === 'Fix' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const n of range) { const o = h('option', '', st.fmt === 'Fix' ? `${n} decimal places` : `${n} significant digits`); o.value = n; if (n === st.digits) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => setSetting('digits', parseInt(sel.value, 10)));
    root.append(h('div', 'field', h('label', '', st.fmt === 'Fix' ? 'Decimal places' : 'Significant digits'), sel));
  }
  root.append(h('div', 'field', h('label', '', 'Fraction results'), seg([['dc', 'Improper  d/c'], ['abc', 'Mixed  a b/c']], st.fracFormat, (v) => setSetting('fracFormat', v))));
  root.append(h('div', 'field', h('label', '', 'Complex results'), seg([['rect', 'a + bi'], ['polar', 'r∠θ']], st.cmplx, (v) => setSetting('cmplx', v))));
  root.append(toggle('Engineering symbols', 'Show results as 4.7 k, 220 μ … (Norm format)', st.engSymbols, (v) => setSetting('engSymbols', v)));
  root.append(toggle('STAT frequency column', 'Add a FREQ column to the statistics editor', st.statFreq, (v) => setSetting('statFreq', v)));
  root.append(toggle('TABLE: second function g(x)', 'Tabulate f(x) and g(x) side by side', st.tableG, (v) => setSetting('tableG', v)));
  root.append(h('div', 'section-title', 'Application'));
  root.append(toggle('Key click sound', 'A soft tick for each key press', ui.sound, (v) => { ui.sound = v; scheduleSave(); renderPanel(); }));
  if (native) root.append(toggle('Always on top', 'Keep the calculator above other windows', ui.onTop, (v) => { ui.onTop = v; native.setOnTop(v); btnPin.classList.toggle('on', v); scheduleSave(); renderPanel(); }));
  root.append(h('div', 'section-title', 'Reset'));
  root.append(h('div', '', btn('Clear memory', () => { calc.keys('shift', '9', '2', 'eq'); toast('Memory cleared'); renderPanel(); scheduleSave(); }), ' ',
    btn('Reset setup', () => { calc.keys('shift', '9', '1', 'eq'); toast('Setup reset'); renderPanel(); scheduleSave(); }), ' ',
    btn('Reset all', () => { if (confirm('Reset all settings, memories, matrices, statistics and history?')) { calc.keys('shift', '9', '3', 'eq'); toast('Calculator reset'); renderPanel(); scheduleSave(); } })));
  root.append(h('div', 'section-title', 'About'));
  root.append(h('div', 'rd', `Graphite Scientific ${native?.version ? 'v' + native.version : ''} — an offline scientific calculator modelled on the workflow of the Casio fx-991ES. Not affiliated with or endorsed by Casio Computer Co., Ltd.`));
  return root;
}

// ---------------------------------------------------------------- wiring
calc.placeCursor = function placeCursor(path, pos) {
  if (this.screen !== 'calc') return;
  if (this.showing) { this.showing = false; this.result = null; }
  try { this.activeEditor().setCursor(path, pos); } catch { /* ignore stale paths */ }
  this.changed();
};
let panelTimer = null;
calc.onChange((evt) => {
  if (evt === 'help') { openTab('reference'); return; }
  renderLCD();
  scheduleSave();
  if (evt === 'change' && ui.panel && (ui.tab === 'inspect' || ui.tab === 'history')) {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => { if (!isTypingTarget(document.activeElement)) renderPanel(); }, 60);
  }
  if (evt === 'settings' && ui.tab === 'settings') renderPanel();
});

document.body.dataset.theme = ui.theme;
btnPin.classList.toggle('on', !!ui.onTop);
if (ui.onTop) native?.setOnTop(true);
buildKeypad();
buildTabs();
renderPanel();
renderLCD();
layout();
window.__ready = true;
export { calc, valueToJSON };
