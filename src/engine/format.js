// Result formatting: number display formats (Norm/Fix/Sci/ENG) and exact-form recognition
// (fractions, mixed fractions, surds a√b/c, (p+q√b)/s and π multiples) for Natural Display output.
import { toF, isQ, bigAbs, bigGcd, contFrac, round15, Q } from './num.js';
import { formatBase, BASES } from './basen.js';

export const DEFAULT_SETTINGS = {
  mathIO: true,        // Natural (MthIO) vs Linear (LineIO) display
  angle: 'D',          // D / R / G
  fmt: 'Norm1',        // Norm1 | Norm2 | Fix | Sci
  digits: 10,          // Fix: 0-9 decimals, Sci: 1-10 significant digits
  fracFormat: 'dc',    // 'dc' improper (d/c) | 'abc' mixed (a b/c)
  cmplx: 'rect',       // rect a+bi | polar r∠θ
  statFreq: false,     // STAT frequency column
  engSymbols: false,   // enhancement: show k, M, m, μ … prefixes
  tableG: false,       // enhancement: second function g(x) in TABLE mode
  tableMax: 199,
};

const SUPER = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
export const superscript = (s) => String(s).split('').map((c) => SUPER[c] ?? c).join('');

function trimZeros(s) { return s.includes('.') ? s.replace(/\.?0+$/, '') : s; }

/** Format a real number into {mant, exp} using display settings. eng: ENG shift (null = off). */
export function formatReal(x, st = DEFAULT_SETTINGS, eng = null) {
  if (x === 0 || Object.is(x, -0)) {
    if (st.fmt === 'Fix') return { mant: (0).toFixed(st.digits), exp: null };
    if (st.fmt === 'Sci') return { mant: (0).toFixed(Math.max(0, st.digits - 1)), exp: 0 };
    return { mant: '0', exp: null };
  }
  if (eng !== null) return engFormat(x, st, eng);
  const ax = Math.abs(x);
  const sci = (sig) => {
    let [m, e] = x.toExponential(sig - 1).split('e');
    return { mant: st.fmt === 'Sci' ? m : trimZeros(m), exp: parseInt(e, 10) };
  };
  switch (st.fmt) {
    case 'Sci': return sci(st.digits || 10);
    case 'Fix': {
      if (ax >= 1e10) return sci(10);
      const s = x.toFixed(st.digits);
      return { mant: s, exp: null };
    }
    default: {
      const lo = st.fmt === 'Norm2' ? 1e-9 : 1e-2;
      const r = Number(x.toPrecision(10));
      if (Math.abs(r) >= 1e10 || Math.abs(r) < lo) return sci(10);
      let s = r.toPrecision(10);
      if (s.includes('e')) return sci(10);
      return { mant: trimZeros(s), exp: null };
    }
  }
}
const ENG_PREFIX = { '-18': 'a', '-15': 'f', '-12': 'p', '-9': 'n', '-6': 'μ', '-3': 'm', '0': '', '3': 'k', '6': 'M', '9': 'G', '12': 'T', '15': 'P', '18': 'E' };
function engFormat(x, st, shift) {
  const e0 = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(10)))));
  let e = Math.floor(e0 / 3) * 3 + 3 * shift;
  let m = x / Math.pow(10, e);
  let s = Number(m.toPrecision(10)).toString();
  if (s.includes('e')) s = m.toFixed(9);
  return { mant: trimZeros(s), exp: e, eng: true };
}

export function numText(f) {
  if (f.sym !== undefined) return f.mant + f.sym;
  return f.exp === null || f.exp === undefined ? f.mant : `${f.mant}×10${superscript(f.exp)}`;
}
export function numPlain(f) { return f.exp === null || f.exp === undefined ? f.mant : `${f.mant}E${f.exp}`; }

/** Display an ordinary real as decimal (with engineering-symbol option). */
const fixMinus = (d) => { if (d.mant) d.mant = d.mant.replace(/-/g, '−'); if (d.text) d.text = d.text.replace(/-/g, '−'); return d; };
export function decimalDisplay(x, st, eng = null) { return fixMinus(decimalDisplayRaw(x, st, eng)); }
function decimalDisplayRaw(x, st, eng = null) {
  const f = formatReal(x, st, eng);
  if (st.engSymbols && eng === null && x !== 0 && Math.abs(x) >= 1e-18 && Math.abs(x) < 1e21 && st.fmt.startsWith('Norm')) {
    const g = engFormat(x, st, 0);
    if (g.exp !== 0 && ENG_PREFIX[g.exp] !== undefined) return { type: 'dec', mant: g.mant, exp: null, sym: ENG_PREFIX[g.exp], text: g.mant + ENG_PREFIX[g.exp] };
  }
  return { type: 'dec', ...f, text: numText(f) };
}

const digitsOf = (b) => bigAbs(b).toString().length;

// ---------------------------------------------------------------- exact-form recognition
function squareFree(nBig) { // returns [a, b] with n = a²·b
  let n = nBig, a = 1n, b = 1n;
  for (let p = 2n; p * p <= n && p < 100000n; p++) {
    let cnt = 0;
    while (n % p === 0n) { n /= p; cnt++; }
    if (cnt) { a *= p ** BigInt(Math.floor(cnt / 2)); if (cnt % 2) b *= p; }
  }
  b *= n;
  return [a, b];
}
const SMALL_SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 46, 47];

function closeRel(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }

export function recognize(x, radicands = []) {
  if (!Number.isFinite(x)) return null;
  const xr = round15(x);
  if (Number.isInteger(xr) && Math.abs(xr) < 1e15) return { kind: 'int', n: BigInt(xr) };
  // simple fraction
  const cf = contFrac(x, 10000);
  if (cf && closeRel(cf[0] / cf[1], x, 1e-13)) {
    if (cf[0] === 0 || cf[1] === 1) return { kind: 'int', n: BigInt(cf[0]) };
    return { kind: 'frac', n: BigInt(cf[0]), d: BigInt(cf[1]) };
  }
  // single surd ±a√b/c from x²
  const y = x * x;
  const cf2 = contFrac(y, 10000);
  if (cf2 && closeRel(cf2[0] / cf2[1], y, 4e-14) && cf2[0] > 0) {
    const p = BigInt(cf2[0]), q = BigInt(cf2[1]);
    const [a, b] = squareFree(p * q);
    if (b > 1n && b <= 1000000n) {
      const g = bigGcd(a, q);
      const coef = a / g, den = q / g;
      if (coef <= 100000n && den <= 100000n) return { kind: 'surd', neg: x < 0, p: 0n, q: coef, b, s: den };
    }
  }
  // two-term (p + q√b)/s
  const cands = [...new Set([...radicands.filter((r) => r > 1 && r < 1e6), ...SMALL_SQUAREFREE.slice(0, 12)])];
  for (let s = 1; s <= 48; s++) {
    for (const bb of cands) {
      const rb = Math.sqrt(bb);
      for (let qq = 1; qq <= 48; qq++) {
        for (const sg of [1, -1]) {
          const t = x * s - sg * qq * rb;
          const pp = Math.round(t);
          if (pp !== 0 && Math.abs(t - pp) < 2e-12 * Math.max(1, Math.abs(x * s))) {
            // reduce
            const g = Number(bigGcd(bigGcd(BigInt(pp), BigInt(qq)), BigInt(s)));
            return { kind: 'surd', neg: false, p: BigInt(pp / g), q: BigInt(sg * qq / g), b: BigInt(bb), s: BigInt(s / g), two: true };
          }
        }
      }
    }
  }
  return null;
}
export function recognizePi(x) {
  const t = x / Math.PI;
  const cf = contFrac(t, 1000);
  if (cf && cf[0] !== 0 && closeRel(cf[0] / cf[1], t, 1e-13)) return { kind: 'pi', n: BigInt(cf[0]), d: BigInt(cf[1]) };
  return null;
}

// ---------------------------------------------------------------- scalar display
/**
 * Produce a display object for a real scalar value.
 * opts: {exact: bool (Natural/MathIO exact output allowed), symbolic: bool (surd/π recognition allowed),
 *        radicands: number[], decimal: bool (force decimal - S⇔D), eng: ENG shift or null, pi: allow π forms}
 */
export function realDisplay(v, st, opts = {}) {
  const exact = opts.exact !== false && !opts.decimal && opts.eng == null;
  if (exact && v.k === 'q') {
    if (v.d === 1n) {
      if (digitsOf(v.n) <= 10 && (st.fmt === 'Norm1' || st.fmt === 'Norm2') && !(st.engSymbols && bigAbs(v.n) >= 1000n)) return fixMinus({ type: 'dec', mant: v.n.toString(), exp: null, text: v.n.toString(), exact: true });
      return decimalDisplay(toF(v), st, opts.eng ?? null);
    }
    const f = fracDisplay(v.n, v.d, st);
    if (f) return f;
    return decimalDisplay(toF(v), st, opts.eng ?? null);
  }
  const x = toF(v);
  if (exact && opts.symbolic && v.k === 'r') {
    const r = recognize(x, opts.radicands || []);
    if (r) {
      if (r.kind === 'int') return fixMinus({ type: 'dec', mant: r.n.toString(), exp: null, text: r.n.toString() });
      if (r.kind === 'frac') { const f = fracDisplay(r.n, r.d, st); if (f) return f; }
      if (r.kind === 'surd') return surdDisplay(r);
    }
    if (opts.pi) {
      const p = recognizePi(x);
      if (p) return piDisplay(p.n, p.d);
    }
  }
  return decimalDisplay(x, st, opts.eng ?? null);
}

export function fracDisplay(n, d, st) {
  const neg = n < 0n; const an = bigAbs(n);
  if (st.fracFormat === 'abc' && an > d) {
    const w = an / d, r = an % d;
    if (digitsOf(w) + digitsOf(r) + digitsOf(d) > 10) return null;
    return { type: 'mixed', neg, w: w.toString(), n: r.toString(), d: d.toString(), text: `${neg ? '−' : ''}${w}⌟${r}⌟${d}`, exact: true };
  }
  if (digitsOf(an) + digitsOf(d) > 10) return null;
  return { type: 'frac', neg, n: an.toString(), d: d.toString(), text: `${neg ? '−' : ''}${an}/${d}`, exact: true };
}
function surdDisplay(r) {
  // value = (p + q√b)/s, or ±q√b/s
  const qa = bigAbs(r.q);
  const surdTxt = `${qa === 1n ? '' : qa}√${r.b}`;
  let numText;
  const neg = r.two ? false : r.neg;
  if (r.two) numText = `${r.p.toString().replace('-', '−')}${r.q < 0n ? '−' : '+'}${surdTxt}`;
  else numText = surdTxt;
  const text = `${neg ? '−' : ''}${r.s === 1n ? numText : (r.two ? `(${numText})` : numText) + '/' + r.s}`;
  return { type: 'surd', neg, p: r.two ? r.p.toString() : null, qneg: r.q < 0n, q: qa === 1n ? '' : qa.toString(), b: r.b.toString(), s: r.s === 1n ? null : r.s.toString(), text, exact: true };
}
function piDisplay(n, d) {
  const neg = n < 0n, an = bigAbs(n);
  const num = `${an === 1n ? '' : an}π`;
  return { type: 'pi', neg, n: an === 1n ? '' : an.toString(), d: d === 1n ? null : d.toString(), text: `${neg ? '−' : ''}${num}${d === 1n ? '' : '/' + d}`, exact: true };
}

export function dmsDisplay(x) {
  const neg = x < 0; let a = Math.abs(x);
  let d = Math.floor(a); let mf = (a - d) * 60; let m = Math.floor(mf + 1e-9); let s = (mf - m) * 60;
  s = Math.round(s * 100) / 100;
  if (s >= 60) { s -= 60; m++; }
  if (m >= 60) { m -= 60; d++; }
  const sTxt = Number.isInteger(s) ? String(s) : s.toFixed(2).replace(/0$/, '');
  return { type: 'dms', text: `${neg ? '−' : ''}${d}°${m}′${sTxt}″` };
}

// ---------------------------------------------------------------- full value display
export function displayValue(v, st, opts = {}) {
  if (!v) return { type: 'dec', mant: '0', exp: null, text: '0' };
  switch (v.k) {
    case 'q': case 'r': {
      if (opts.dms) return dmsDisplay(toF(v));
      return realDisplay(v, st, opts);
    }
    case 'c': {
      const polar = (v.fmt || opts.cmplxFmt || st.cmplx) === 'polar' || v.fmt === 'polar';
      const usePolar = v.fmt ? v.fmt === 'polar' : polar;
      if (usePolar) {
        const r = Math.hypot(v.re, v.im);
        let th = Math.atan2(v.im, v.re);
        if (st.angle === 'D') th = th * 180 / Math.PI; else if (st.angle === 'G') th = th * 200 / Math.PI;
        const rD = realDisplay({ k: 'r', v: round15(r) }, st, { ...opts, symbolic: true });
        const tD = realDisplay({ k: 'r', v: round15(th) }, st, { ...opts, symbolic: true, pi: st.angle === 'R' });
        return { type: 'polar', r: rD, theta: tD, text: `${rD.text}∠${tD.text}` };
      }
      const reD = realDisplay(v.reQ || { k: 'r', v: round15(v.re) }, st, opts);
      const imD = realDisplay(v.imQ || { k: 'r', v: round15(Math.abs(v.im)) }, st, opts);
      const hasRe = v.re !== 0;
      const imCoef = imD.text === '1' ? '' : imD.text;
      return { type: 'complex', re: hasRe ? reD : null, im: imD, imNeg: v.im < 0, text: `${hasRe ? reD.text : ''}${v.im < 0 ? '−' : hasRe ? '+' : ''}${imCoef}i` };
    }
    case 'm': {
      const rows = v.a.map((row) => row.map((x) => realDisplay(x, compact(st), { ...opts, symbolic: opts.symbolic })));
      return { type: 'matrix', rows, text: '[' + rows.map((r) => '[' + r.map((x) => x.text).join(', ') + ']').join(', ') + ']' };
    }
    case 'v': {
      const items = v.a.map((x) => realDisplay(x, compact(st), opts));
      return { type: 'vector', items, text: '[' + items.map((x) => x.text).join(', ') + ']' };
    }
    case 'multi': {
      const items = v.items.map((it) => ({ label: it.label, value: displayValue(it.v, st, opts) }));
      return { type: 'multi', items, text: items.map((i) => `${i.label}=${i.value.text}`).join(', ') };
    }
    case 'base': {
      const all = Object.fromEntries(Object.keys(BASES).map((b) => [b, formatBase(v.n, b)]));
      all.DEC = all.DEC.replace('-', '−');
      return { type: 'base', base: v.base, value: all[v.base], all, text: all[v.base] };
    }
    default: return { type: 'text', text: String(v) };
  }
}
function compact(st) { return { ...st, fmt: st.fmt === 'Norm2' ? 'Norm2' : st.fmt }; }

/** Plain decimal text (15 significant digits) for the clipboard. */
export function plainValue(v) {
  if (!v) return '0';
  switch (v.k) {
    case 'q': if (v.d === 1n) return v.n.toString(); return fmt15(toF(v));
    case 'r': return fmt15(v.v);
    case 'c': return `${v.re !== 0 ? fmt15(v.re) : ''}${v.im < 0 ? '-' : v.re !== 0 ? '+' : ''}${fmt15(Math.abs(v.im))}i`;
    case 'm': return '[' + v.a.map((r) => '[' + r.map(plainValue).join(', ') + ']').join(', ') + ']';
    case 'v': return '[' + v.a.map(plainValue).join(', ') + ']';
    case 'multi': return v.items.map((i) => `${i.label}=${plainValue(i.v)}`).join(', ');
    case 'base': return formatBase(v.n, v.base).replace(/ /g, '');
    default: return String(v);
  }
}
function fmt15(x) {
  const s = Number(x.toPrecision(15)).toString();
  return s.replace('e+', 'E').replace('e-', 'E-');
}
export { Q, isQ };
