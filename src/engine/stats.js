// Statistics and regression (STAT mode).
import { mathErr, CalcError } from './errors.js';
import { normCdf } from './numeric.js';

export const STAT_TYPES = [
  { id: '1var', label: '1-VAR', two: false },
  { id: 'lin', label: 'A+BX', two: true, formula: 'y = A + Bx' },
  { id: 'quad', label: '_+CX²', two: true, formula: 'y = A + Bx + Cx²' },
  { id: 'log', label: 'ln X', two: true, formula: 'y = A + B·ln x' },
  { id: 'exp', label: 'e^X', two: true, formula: 'y = A·e^(Bx)' },
  { id: 'abexp', label: 'A·B^X', two: true, formula: 'y = A·B^x' },
  { id: 'pow', label: 'A·X^B', two: true, formula: 'y = A·x^B' },
  { id: 'inv', label: '1/X', two: true, formula: 'y = A + B/x' },
];

function linFit(pts) { // pts: [u, v, w]
  let n = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0;
  for (const [u, v, w] of pts) { n += w; su += w * u; sv += w * v; suu += w * u * u; svv += w * v * v; suv += w * u * v; }
  const Suu = suu - su * su / n, Svv = svv - sv * sv / n, Suv = suv - su * sv / n;
  if (Suu === 0) throw mathErr('Regression is impossible: all x values are identical');
  const B = Suv / Suu, A = (sv - B * su) / n;
  const r = Svv === 0 ? NaN : Suv / Math.sqrt(Suu * Svv);
  return { A, B, r };
}

function solve3(m, rhs) {
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let i = c + 1; i < 3; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i;
    if (Math.abs(a[p][c]) < 1e-300) throw mathErr('Quadratic regression needs at least 3 distinct x values');
    [a[c], a[p]] = [a[p], a[c]];
    for (let i = 0; i < 3; i++) if (i !== c) { const f = a[i][c] / a[c][c]; for (let j = c; j < 4; j++) a[i][j] -= f * a[c][j]; }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function quantiles(rows, useFreq) {
  const vals = [];
  for (const r of rows) {
    const f = useFreq ? r.f : 1;
    if (!Number.isInteger(f) || f < 0) return null;
    if (f > 100000) return null;
    for (let k = 0; k < f; k++) vals.push(r.x);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const med = (arr) => { const n = arr.length; if (!n) return NaN; return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2; };
  const n = vals.length;
  const lower = vals.slice(0, Math.floor(n / 2)), upper = vals.slice(Math.ceil(n / 2));
  return { med: med(vals), q1: n > 1 ? med(lower) : vals[0], q3: n > 1 ? med(upper) : vals[0] };
}

/** Compute all statistics for the data table. rows: [{x, y, f}] of JS numbers. */
export function computeStats(typeId, rows, useFreq) {
  const type = STAT_TYPES.find((t) => t.id === typeId) || STAT_TYPES[0];
  const data = rows.filter((r) => Number.isFinite(r.x) && (!type.two || Number.isFinite(r.y)));
  for (const r of data) if (useFreq && (!(r.f >= 0) || !Number.isFinite(r.f))) throw mathErr('Frequencies must be zero or positive');
  const w = (r) => (useFreq ? r.f : 1);
  let n = 0, sx = 0, sx2 = 0, sy = 0, sy2 = 0, sxy = 0, sx3 = 0, sx2y = 0, sx4 = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of data) {
    const f = w(r); if (f === 0) continue;
    n += f; sx += f * r.x; sx2 += f * r.x * r.x; sx3 += f * r.x ** 3; sx4 += f * r.x ** 4;
    minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x);
    if (type.two) {
      sy += f * r.y; sy2 += f * r.y * r.y; sxy += f * r.x * r.y; sx2y += f * r.x * r.x * r.y;
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y);
    }
  }
  if (n === 0) throw new CalcError('Math', 'There is no statistical data. Enter data in the STAT editor first');
  const out = { type: type.id, n, sumx: sx, sumx2: sx2, mean: sx / n, minX, maxX };
  const varx = Math.max(0, sx2 / n - (sx / n) ** 2);
  out.popsdx = Math.sqrt(varx);
  out.popvarx = varx;
  out.sampsdx = n > 1 ? Math.sqrt(varx * n / (n - 1)) : NaN;
  out.sampvarx = n > 1 ? varx * n / (n - 1) : NaN;
  const q = quantiles(data, useFreq);
  if (q) { out.median = q.med; out.q1 = q.q1; out.q3 = q.q3; }
  if (!type.two) return out;
  Object.assign(out, { sumy: sy, sumy2: sy2, sumxy: sxy, sumx3: sx3, sumx2y: sx2y, sumx4: sx4, meany: sy / n, minY, maxY });
  const vary = Math.max(0, sy2 / n - (sy / n) ** 2);
  out.popsdy = Math.sqrt(vary);
  out.sampsdy = n > 1 ? Math.sqrt(vary * n / (n - 1)) : NaN;
  const pts = (fu, fv) => data.filter((r) => w(r) > 0).map((r) => {
    const u = fu(r.x), v = fv(r.y);
    if (!Number.isFinite(u) || !Number.isFinite(v)) throw mathErr(`This regression type (${type.label}) cannot use the value x=${r.x}, y=${r.y}`);
    return [u, v, w(r)];
  });
  const id = (t) => t;
  switch (type.id) {
    case 'lin': { const f = linFit(pts(id, id)); Object.assign(out, f); break; }
    case 'log': { const f = linFit(pts(Math.log, id)); Object.assign(out, f); break; }
    case 'inv': { const f = linFit(pts((x) => 1 / x, id)); Object.assign(out, f); break; }
    case 'exp': { const f = linFit(pts(id, Math.log)); out.A = Math.exp(f.A); out.B = f.B; out.r = f.r; break; }
    case 'abexp': { const f = linFit(pts(id, Math.log)); out.A = Math.exp(f.A); out.B = Math.exp(f.B); out.r = f.r; break; }
    case 'pow': { const f = linFit(pts(Math.log, Math.log)); out.A = Math.exp(f.A); out.B = f.B; out.r = f.r; break; }
    case 'quad': {
      const [A, B, C] = solve3([[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]], [sy, sxy, sx2y]);
      Object.assign(out, { A, B, C });
      // coefficient of determination for information (Casio does not show r for quadratic)
      let ssr = 0; const my = sy / n; let sst = 0;
      for (const r of data) { const f = w(r); const e = r.y - (A + B * r.x + C * r.x * r.x); ssr += f * e * e; sst += f * (r.y - my) ** 2; }
      out.R2 = sst ? 1 - ssr / sst : NaN;
      break;
    }
    default: break;
  }
  return out;
}

export function estimateY(s, x) {
  switch (s.type) {
    case 'lin': return s.A + s.B * x;
    case 'quad': return s.A + s.B * x + s.C * x * x;
    case 'log': return s.A + s.B * Math.log(x);
    case 'exp': return s.A * Math.exp(s.B * x);
    case 'abexp': return s.A * Math.pow(s.B, x);
    case 'pow': return s.A * Math.pow(x, s.B);
    case 'inv': return s.A + s.B / x;
    default: throw mathErr('ŷ requires a two-variable regression type');
  }
}
/** Returns [x̂] or [x̂1, x̂2] for quadratic regression. */
export function estimateX(s, y) {
  switch (s.type) {
    case 'lin': return [(y - s.A) / s.B];
    case 'quad': {
      const D = s.B * s.B - 4 * s.C * (s.A - y);
      if (D < 0) throw mathErr('No real x gives this y for the quadratic regression');
      const sq = Math.sqrt(D);
      return [(-s.B + sq) / (2 * s.C), (-s.B - sq) / (2 * s.C)];
    }
    case 'log': return [Math.exp((y - s.A) / s.B)];
    case 'exp': return [Math.log(y / s.A) / s.B];
    case 'abexp': return [Math.log(y / s.A) / Math.log(s.B)];
    case 'pow': return [Math.pow(y / s.A, 1 / s.B)];
    case 'inv': return [s.B / (y - s.A)];
    default: throw mathErr('x̂ requires a two-variable regression type');
  }
}

/** Normal distribution functions of the fx-991ES (standardised variable t). */
export const distP = (t) => normCdf(t);
export const distQ = (t) => normCdf(Math.abs(t)) - 0.5;
export const distR = (t) => 1 - normCdf(t);

// Mapping of STAT variable tokens ("st:...") to labels and fields
export const STAT_VARS = [
  ['n', 'n', 'n'], ['xbar', 'x̄', 'mean'], ['sigx', 'σx', 'popsdx'], ['sx', 'sx', 'sampsdx'],
  ['sumx', 'Σx', 'sumx'], ['sumx2', 'Σx²', 'sumx2'], ['minX', 'minX', 'minX'], ['maxX', 'maxX', 'maxX'],
  ['med', 'med', 'median'], ['Q1', 'Q₁', 'q1'], ['Q3', 'Q₃', 'q3'],
  ['ybar', 'ȳ', 'meany'], ['sigy', 'σy', 'popsdy'], ['sy', 'sy', 'sampsdy'],
  ['sumy', 'Σy', 'sumy'], ['sumy2', 'Σy²', 'sumy2'], ['sumxy', 'Σxy', 'sumxy'], ['sumx3', 'Σx³', 'sumx3'],
  ['sumx2y', 'Σx²y', 'sumx2y'], ['sumx4', 'Σx⁴', 'sumx4'], ['minY', 'minY', 'minY'], ['maxY', 'maxY', 'maxY'],
  ['A', 'A', 'A'], ['B', 'B', 'B'], ['C', 'C', 'C'], ['r', 'r', 'r'],
].map(([id, label, field]) => ({ id, label, field }));
export const STAT_VAR = Object.fromEntries(STAT_VARS.map((v) => [v.id, v]));
