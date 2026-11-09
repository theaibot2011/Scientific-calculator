// Matrices and vectors whose entries are scalar values (exact rationals or reals).
// Using the generic scalar ops keeps results exact (e.g. inverse of an integer matrix shows fractions).
import { mathErr, dimErr } from './errors.js';
import { Q, R, ZERO, ONE, sAdd, sSub, sMul, sDiv, sNeg, toF, isZero, sSqrt, isReal } from './num.js';

export const isM = (v) => v && v.k === 'm';
export const isV = (v) => v && v.k === 'v';

export function M(a) { return { k: 'm', r: a.length, c: a[0].length, a }; }
export function V(a) { return { k: 'v', a }; }
export function zeroMatrix(r, c) { return M(Array.from({ length: r }, () => Array.from({ length: c }, () => ZERO))); }
export function identity(n) { return M(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)))); }

function needSame(a, b, what) {
  if (a.r !== b.r || a.c !== b.c) throw dimErr(`${what} needs matrices of the same size (${a.r}×${a.c} vs ${b.r}×${b.c})`);
}
function checkScalar(s) { if (!isReal(s)) throw mathErr('Matrix and vector entries must be real numbers'); }

export function mAdd(a, b) { needSame(a, b, 'Addition'); return M(a.a.map((row, i) => row.map((x, j) => sAdd(x, b.a[i][j])))); }
export function mSub(a, b) { needSame(a, b, 'Subtraction'); return M(a.a.map((row, i) => row.map((x, j) => sSub(x, b.a[i][j])))); }
export function mNeg(a) { return M(a.a.map((row) => row.map(sNeg))); }
export function mScale(a, s) { checkScalar(s); return M(a.a.map((row) => row.map((x) => sMul(x, s)))); }
export function mMul(a, b) {
  if (a.c !== b.r) throw dimErr(`Cannot multiply a ${a.r}×${a.c} matrix by a ${b.r}×${b.c} matrix (columns of the first must equal rows of the second)`);
  const out = [];
  for (let i = 0; i < a.r; i++) {
    const row = [];
    for (let j = 0; j < b.c; j++) {
      let s = ZERO;
      for (let k = 0; k < a.c; k++) s = sAdd(s, sMul(a.a[i][k], b.a[k][j]));
      row.push(s);
    }
    out.push(row);
  }
  return M(out);
}
export function mTrn(a) { return M(Array.from({ length: a.c }, (_, j) => Array.from({ length: a.r }, (_, i) => a.a[i][j]))); }
export function mAbs(a) { return M(a.a.map((row) => row.map((x) => (toF(x) < 0 ? sNeg(x) : x)))); }

function exactAll(rows) { return rows.every((r) => r.every((x) => x.k === 'q')); }
function chooseRow(rows, col, start, exact) {
  let best = -1, bestAbs = 0;
  for (let i = start; i < rows.length; i++) {
    const v = rows[i][col];
    if (exact) { if (!isZero(v)) return i; continue; }
    const av = Math.abs(toF(v));
    if (av > bestAbs) { bestAbs = av; best = i; }
  }
  return best;
}
function scaleOf(rows) { let m = 0; for (const r of rows) for (const x of r) m = Math.max(m, Math.abs(toF(x))); return m || 1; }

export function mDet(a) {
  if (a.r !== a.c) throw dimErr(`Determinant requires a square matrix (this one is ${a.r}×${a.c})`);
  const n = a.r, rows = a.a.map((r) => r.slice()), exact = exactAll(rows), tol = 1e-12 * scaleOf(rows);
  let det = ONE;
  for (let col = 0; col < n; col++) {
    const p = chooseRow(rows, col, col, exact);
    if (p < 0 || (!exact && Math.abs(toF(rows[p][col])) <= tol)) return exact ? ZERO : R(0);
    if (p !== col) { [rows[p], rows[col]] = [rows[col], rows[p]]; det = sNeg(det); }
    const piv = rows[col][col];
    det = sMul(det, piv);
    for (let i = col + 1; i < n; i++) {
      if (isZero(rows[i][col])) continue;
      const f = sDiv(rows[i][col], piv);
      for (let j = col; j < n; j++) rows[i][j] = sSub(rows[i][j], sMul(f, rows[col][j]));
    }
  }
  return det;
}

export function mInv(a) {
  if (a.r !== a.c) throw dimErr(`Only square matrices have an inverse (this one is ${a.r}×${a.c})`);
  const n = a.r, exact = exactAll(a.a);
  const rows = a.a.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO))]);
  const tol = 1e-12 * scaleOf(a.a);
  for (let col = 0; col < n; col++) {
    const p = chooseRow(rows, col, col, exact);
    if (p < 0 || (!exact && Math.abs(toF(rows[p][col])) <= tol)) throw mathErr('The matrix is singular (determinant is 0) so it has no inverse');
    if (p !== col) [rows[p], rows[col]] = [rows[col], rows[p]];
    const piv = rows[col][col];
    rows[col] = rows[col].map((x) => sDiv(x, piv));
    for (let i = 0; i < n; i++) {
      if (i === col || isZero(rows[i][col])) continue;
      const f = rows[i][col];
      rows[i] = rows[i].map((x, j) => sSub(x, sMul(f, rows[col][j])));
    }
  }
  return M(rows.map((r) => r.slice(n)));
}

export function mPowInt(a, e) {
  if (a.r !== a.c) throw dimErr('Only square matrices can be raised to a power');
  if (!Number.isInteger(e)) throw mathErr('Matrix powers must be integers');
  let base = e < 0 ? mInv(a) : a, res = identity(a.r);
  e = Math.abs(e);
  if (e > 1e6) throw mathErr('Matrix exponent too large');
  while (e > 0) { if (e & 1) res = mMul(res, base); base = mMul(base, base); e = Math.floor(e / 2); }
  return res;
}

export function mRank(a) {
  const rows = a.a.map((r) => r.slice()), exact = exactAll(rows), tol = 1e-10 * scaleOf(rows);
  let rank = 0;
  for (let col = 0; col < a.c && rank < a.r; col++) {
    const p = chooseRow(rows, col, rank, exact);
    if (p < 0 || (!exact && Math.abs(toF(rows[p][col])) <= tol)) continue;
    [rows[p], rows[rank]] = [rows[rank], rows[p]];
    for (let i = rank + 1; i < a.r; i++) {
      if (isZero(rows[i][col])) continue;
      const f = sDiv(rows[i][col], rows[rank][col]);
      rows[i] = rows[i].map((x, j) => sSub(x, sMul(f, rows[rank][j])));
    }
    rank++;
  }
  return rank;
}

export function mTrace(a) {
  if (a.r !== a.c) throw dimErr('Trace requires a square matrix');
  let s = ZERO; for (let i = 0; i < a.r; i++) s = sAdd(s, a.a[i][i]); return s;
}

// ---------------------------------------------------------------- vectors
function needSameV(a, b, what) { if (a.a.length !== b.a.length) throw dimErr(`${what} needs vectors of the same dimension (${a.a.length} vs ${b.a.length})`); }
export function vAdd(a, b) { needSameV(a, b, 'Addition'); return V(a.a.map((x, i) => sAdd(x, b.a[i]))); }
export function vSub(a, b) { needSameV(a, b, 'Subtraction'); return V(a.a.map((x, i) => sSub(x, b.a[i]))); }
export function vNeg(a) { return V(a.a.map(sNeg)); }
export function vScale(a, s) { checkScalar(s); return V(a.a.map((x) => sMul(x, s))); }
export function vDot(a, b) { needSameV(a, b, 'Dot product'); let s = ZERO; a.a.forEach((x, i) => { s = sAdd(s, sMul(x, b.a[i])); }); return s; }
export function vCross(a, b) {
  const pad = (v) => (v.a.length === 2 ? [...v.a, ZERO] : v.a);
  if (a.a.length < 2 || b.a.length < 2 || a.a.length > 3 || b.a.length > 3) throw dimErr('Cross product requires 2- or 3-dimensional vectors');
  const [a1, a2, a3] = pad(a), [b1, b2, b3] = pad(b);
  return V([sSub(sMul(a2, b3), sMul(a3, b2)), sSub(sMul(a3, b1), sMul(a1, b3)), sSub(sMul(a1, b2), sMul(a2, b1))]);
}
export function vNorm(a) { return sSqrt(vDot(a, a)); }
export function vUnit(a) {
  const n = vNorm(a);
  if (isZero(n)) throw mathErr('The zero vector has no direction');
  return V(a.a.map((x) => sDiv(x, n)));
}
/** Angle between vectors in radians (float). */
export function vAngleRad(a, b) {
  const na = toF(vNorm(a)), nb = toF(vNorm(b));
  if (na === 0 || nb === 0) throw mathErr('The angle with a zero vector is undefined');
  let c = toF(vDot(a, b)) / (na * nb);
  c = Math.max(-1, Math.min(1, c));
  return Math.acos(c);
}
export function mvMul(m, v) {
  if (m.c !== v.a.length) throw dimErr(`Cannot multiply a ${m.r}×${m.c} matrix by a ${v.a.length}-dimensional vector`);
  return V(m.a.map((row) => row.reduce((s, x, j) => sAdd(s, sMul(x, v.a[j])), ZERO)));
}
export { Q };
