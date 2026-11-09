// Natural Display renderer: editor rows and result display objects -> DOM.
import { CONST_BY_ID, CONVERSIONS } from '../engine/constants.js';
import { STAT_VAR } from '../engine/stats.js';

const h = (tag, cls, ...kids) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
export { h };

const RADICAL_SVG = '<svg class="radsym" viewBox="0 0 12 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0.6 13.2 L3 12 L6.4 22.6 L11.4 0.9 L12 0.9" fill="none" stroke="currentColor" stroke-width="1.35" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>';
function radical(contentEl, indexEl) {
  const wrap = h('span', 'sqrt');
  if (indexEl) wrap.append(h('span', 'rindex', indexEl));
  const sym = h('span', 'radwrap');
  sym.innerHTML = RADICAL_SVG;
  wrap.append(sym, h('span', 'radicand', contentEl));
  return wrap;
}

const TOK_TEXT = {
  '×': '×', '÷': '÷', '−': '−', '+': '+', neg: '−', '⁻¹': '⁻¹', 'ᵈ': '°', '°': '°', 'ʳ': 'ʳ', 'ᵍ': 'ᵍ',
  nPr: 'P', nCr: 'C', and: ' and ', or: ' or ', xor: ' xor ', xnor: ' xnor ', '÷R': '÷R', '·': '·', '→': '→', '=': '=', ',': ',',
  '▸r∠θ': '▸r∠θ', '▸a+bi': '▸a+bi', 'x̂₁': 'x̂₁', 'x̂₂': 'x̂₂', '→t': '▸t', 'Ran#': 'Ran#', PreAns: 'PreAns',
};
const VAR_RE = /^[A-FXYM]$/;

export function tokenText(v, base = false) {
  if (v.startsWith('k:')) return CONST_BY_ID[v.slice(2)]?.sym ?? v;
  if (v.startsWith('st:')) return STAT_VAR[v.slice(3)]?.label ?? v;
  if (v.startsWith('cv:')) return CONVERSIONS[parseInt(v.slice(3), 10) - 1]?.label ?? v;
  if (v.startsWith('bp:')) return v.slice(3);
  if (base && /^[A-F]$/.test(v)) return v;
  return TOK_TEXT[v] ?? v;
}
function tokClass(v, base) {
  if (/^[0-9.]$/.test(v)) return 'tk num';
  if (base && /^[A-F]$/.test(v)) return 'tk num';
  if (VAR_RE.test(v) || v === 'i' || v === 'e') return 'tk var';
  if (v.startsWith('k:')) return 'tk const';
  if (v.startsWith('st:')) return 'tk stat';
  if (v.startsWith('cv:')) return 'tk conv';
  if (v.startsWith('bp:')) return 'tk bp';
  if (v.startsWith('Mat') || v.startsWith('Vct') || v === 'Ans' || v === 'PreAns' || v === 'Ran#') return 'tk word';
  if (['+', '−', '×', '÷', '=', '·', '÷R', '∠'].includes(v)) return 'tk op';
  if (['and', 'or', 'xor', 'xnor', 'nPr', 'nCr'].includes(v)) return 'tk opw';
  if (['⁻¹', 'ʳ', 'ᵍ'].includes(v)) return 'tk post';
  if (v === 'neg') return 'tk neg';
  if (v === '(' || v === ')') return 'tk paren';
  return 'tk';
}

/**
 * Render an editor row.
 * opts: {cursor: {path, pos} | null, linear: bool, base: bool, onPlace: (path,pos)=>void}
 */
export function renderRow(row, opts = {}, path = [], depth = 0) {
  const el = h('span', depth ? 'row' : 'row root');
  const cur = opts.cursor;
  const here = cur && samePath(cur.path, path);
  const items = [];
  let superRun = false; // digits after ×10ˣ are rendered as an exponent in natural display
  row.forEach((it, i) => {
    if (here && cur.pos === i) items.push(cursorEl());
    let node;
    if (it.t === 'c') {
      if (it.v === 'ᴇ') {
        node = opts.linear ? h('span', 'tk exp10', 'ᴇ') : h('span', 'tk exp10', '×10');
        superRun = !opts.linear;
      } else {
        node = h('span', tokClass(it.v, opts.base), tokenText(it.v, opts.base));
        if (superRun && (/^[0-9]$/.test(it.v) || ((it.v === '−' || it.v === 'neg') && row[i - 1]?.v === 'ᴇ'))) node.classList.add('sup-run');
        else superRun = false;
      }
    } else if (it.t === 'f') {
      superRun = false;
      node = h('span', 'tk fn', fnLabel(it.v), h('span', 'paren', '('));
    } else {
      superRun = false;
      node = renderTemplate(it, opts, path, i, depth);
    }
    node.dataset.p = JSON.stringify(path);
    node.dataset.i = String(i);
    items.push(node);
  });
  if (here && cur.pos === row.length) items.push(cursorEl());
  if (!row.length && depth > 0) {
    const slot = h('span', 'slot');
    slot.dataset.p = JSON.stringify(path); slot.dataset.i = '0'; slot.dataset.slot = '1';
    items.unshift(slot);
    if (here) { items.length = 0; items.push(slot); slot.classList.add('active'); slot.append(cursorEl()); }
  }
  el.append(...items);
  return el;
}
function fnLabel(v) { return v.replace('⁻¹', '⁻¹'); }
function samePath(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i].i !== b[i].i || a[i].s !== b[i].s) return false; return true; }
function cursorEl() { return h('span', 'cursor'); }

function renderTemplate(it, opts, path, i, depth) {
  const slot = (k) => renderRow(it.s[k], opts, [...path, { i, s: k }], depth + 1);
  if (opts.linear) return renderLinearTemplate(it, slot);
  switch (it.t) {
    case 'frac': return h('span', 'frac', h('span', 'fnum', slot(0)), h('span', 'fbar'), h('span', 'fden', slot(1)));
    case 'mixed': return h('span', 'mixed', slot(0), h('span', 'frac small', h('span', 'fnum', slot(1)), h('span', 'fbar'), h('span', 'fden', slot(2))));
    case 'sqrt': return radical(slot(0));
    case 'cbrt': return radical(slot(0), h('span', 'tk num', '3'));
    case 'root': return radical(slot(1), slot(0));
    case 'pow': return h('span', 'sup', slot(0));
    case 'pow10': return h('span', 'powbase', h('span', 'tk num', '10'), h('span', 'sup', slot(0)));
    case 'exp': return h('span', 'powbase', h('span', 'tk var', 'e'), h('span', 'sup', slot(0)));
    case 'logb': return h('span', 'logb', h('span', 'tk fn', 'log'), h('span', 'sub', slot(0)), h('span', 'paren', '('), slot(1), h('span', 'paren', ')'));
    case 'abs': return h('span', 'abs', slot(0));
    case 'integ': return h('span', 'bigop integ', h('span', 'opsym', '∫'), h('span', 'limits', h('span', 'lhi', slot(2)), h('span', 'llo', slot(1))), h('span', 'body', slot(0)), h('span', 'dx', h('span', 'tk', 'd'), h('span', 'tk var', 'x')));
    case 'deriv': return h('span', 'deriv', h('span', 'frac dd', h('span', 'fnum', h('span', 'tk', 'd')), h('span', 'fbar'), h('span', 'fden', h('span', 'tk', 'd'), h('span', 'tk var', 'x'))), h('span', 'paren', '('), slot(0), h('span', 'paren', ')'), h('span', 'evalbar', h('span', 'sub', h('span', 'tk var', 'x'), h('span', 'tk op', '='), slot(1))));
    case 'sum': case 'prod': return h('span', 'bigop stack', h('span', 'stackop', h('span', 'shi', slot(2)), h('span', 'opsym', it.t === 'sum' ? 'Σ' : 'Π'), h('span', 'slo', h('span', 'tk var', 'x'), h('span', 'tk op', '='), slot(1))), h('span', 'paren', '('), slot(0), h('span', 'paren', ')'));
    default: return h('span', 'tk', '?');
  }
}
function renderLinearTemplate(it, slot) {
  const t = (s) => h('span', 'tk lin', s);
  switch (it.t) {
    case 'frac': return h('span', 'lt', slot(0), t('⌟'), slot(1));
    case 'mixed': return h('span', 'lt', slot(0), t('⌟'), slot(1), t('⌟'), slot(2));
    case 'sqrt': return h('span', 'lt', t('√('), slot(0), t(')'));
    case 'cbrt': return h('span', 'lt', t('³√('), slot(0), t(')'));
    case 'root': return h('span', 'lt', slot(0), t('ˣ√('), slot(1), t(')'));
    case 'pow': return h('span', 'lt', t('^('), slot(0), t(')'));
    case 'pow10': return h('span', 'lt', t('10^('), slot(0), t(')'));
    case 'exp': return h('span', 'lt', t('e^('), slot(0), t(')'));
    case 'logb': return h('span', 'lt', t('log('), slot(0), t(','), slot(1), t(')'));
    case 'abs': return h('span', 'lt', t('Abs('), slot(0), t(')'));
    case 'integ': return h('span', 'lt', t('∫('), slot(0), t(','), slot(1), t(','), slot(2), t(')'));
    case 'deriv': return h('span', 'lt', t('d/dx('), slot(0), t(','), slot(1), t(')'));
    case 'sum': return h('span', 'lt', t('Σ('), slot(0), t(','), slot(1), t(','), slot(2), t(')'));
    case 'prod': return h('span', 'lt', t('Π('), slot(0), t(','), slot(1), t(','), slot(2), t(')'));
    default: return t('?');
  }
}

// ---------------------------------------------------------------- results
const minus = (s) => String(s).replace(/-/g, '−');
const sup = (x) => h('span', 'sup', h('span', 'row', minus(x)));
function num(s) { return h('span', 'tk num', minus(s)); }
function fracEl(n, d) { return h('span', 'frac', h('span', 'fnum', n), h('span', 'fbar'), h('span', 'fden', d)); }

/** Render a display object (from format.js) as natural (or linear) output. */
export function renderDisplay(d, opts = {}) {
  if (!d) return h('span', 'out', '');
  const lin = opts.linear;
  switch (d.type) {
    case 'dec': {
      const el = h('span', 'out dec', num(d.mant));
      if (d.sym !== undefined) el.append(h('span', 'engsym', d.sym));
      if (d.exp !== null && d.exp !== undefined) el.append(h('span', 'tk times', '×10'), sup(d.exp));
      return el;
    }
    case 'frac':
      if (lin) return h('span', 'out', num(`${d.neg ? '-' : ''}${d.n}⌟${d.d}`));
      return h('span', 'out', d.neg ? h('span', 'tk neg', '−') : null, fracEl(num(d.n), num(d.d)));
    case 'mixed':
      if (lin) return h('span', 'out', num(`${d.neg ? '-' : ''}${d.w}⌟${d.n}⌟${d.d}`));
      return h('span', 'out', d.neg ? h('span', 'tk neg', '−') : null, num(d.w), h('span', 'frac small', h('span', 'fnum', num(d.n)), h('span', 'fbar'), h('span', 'fden', num(d.d))));
    case 'surd': {
      const surd = () => h('span', 'surd', d.q ? num(d.q) : null, radical(num(d.b)));
      let numer;
      if (d.p !== null && d.p !== undefined) numer = h('span', 'row', num(d.p), h('span', 'tk op', d.qneg ? '−' : '+'), surd());
      else numer = surd();
      if (lin) return h('span', 'out', h('span', 'tk', d.text));
      const body = d.s ? fracEl(numer, num(d.s)) : numer;
      return h('span', 'out', d.neg ? h('span', 'tk neg', '−') : null, body);
    }
    case 'pi': {
      const numer = h('span', 'row', d.n ? num(d.n) : null, h('span', 'tk pi', 'π'));
      if (lin) return h('span', 'out', h('span', 'tk', d.text));
      return h('span', 'out', d.neg ? h('span', 'tk neg', '−') : null, d.d ? fracEl(numer, num(d.d)) : numer);
    }
    case 'complex': {
      const el = h('span', 'out cplx');
      if (d.re) el.append(renderDisplay(d.re, opts));
      if (d.re || d.imNeg) el.append(h('span', 'tk op', d.imNeg ? '−' : '+'));
      const imOnes = d.im && d.im.type === 'dec' && d.im.mant === '1' && (d.im.exp === null || d.im.exp === undefined);
      if (!imOnes) el.append(renderDisplay(d.im, opts));
      el.append(h('span', 'tk var imag', 'i'));
      return el;
    }
    case 'polar': return h('span', 'out cplx', renderDisplay(d.r, opts), h('span', 'tk op', '∠'), renderDisplay(d.theta, opts));
    case 'matrix': {
      const grid = h('span', 'mat');
      grid.style.gridTemplateColumns = `repeat(${d.rows[0].length}, auto)`;
      for (const r of d.rows) for (const c of r) grid.append(h('span', 'mcell', renderDisplay(c, { ...opts, small: true })));
      return h('span', 'out matwrap', h('span', 'mbr l'), grid, h('span', 'mbr r'));
    }
    case 'vector': {
      const el = h('span', 'vec');
      d.items.forEach((x, i) => { if (i) el.append(h('span', 'tk vsep', '  ')); el.append(renderDisplay(x, opts)); });
      return h('span', 'out matwrap', h('span', 'mbr l'), el, h('span', 'mbr r'));
    }
    case 'multi': {
      const el = h('span', 'out multi');
      for (const it of d.items) el.append(h('span', 'mline', h('span', 'mlabel', `${it.label}=`), renderDisplay(it.value, opts)));
      return el;
    }
    case 'base': return h('span', 'out base', num(d.value));
    case 'dms': return h('span', 'out', num(d.text));
    case 'fact': {
      const el = h('span', 'out fact');
      if (!d.factors.length) el.append(num('1'));
      d.factors.forEach((f, i) => { if (i) el.append(h('span', 'tk op', '×')); el.append(num(f.p)); if (f.e > 1) el.append(sup(f.e)); });
      return el;
    }
    default: return h('span', 'out', d.text ?? '');
  }
}
