// Numeric value types and exact/real/complex scalar arithmetic.
//
// Value kinds:
//   {k:'q', n:BigInt, d:BigInt}  exact rational (d > 0, reduced)
//   {k:'r', v:number}            real floating point (IEEE double, ~15.9 digits)
//   {k:'c', re:number, im:number} complex number (only produced in CMPLX mode)
// Matrices and vectors live in linalg.js.
import { mathErr } from './errors.js';

const MAX_BITS = 1200; // rationals larger than this degrade to floating point

export const isQ = (v) => v && v.k === 'q';
export const isR = (v) => v && v.k === 'r';
export const isC = (v) => v && v.k === 'c';
export const isReal = (v) => v && (v.k === 'q' || v.k === 'r');
export const isScalar = (v) => v && (v.k === 'q' || v.k === 'r' || v.k === 'c');

export function bigAbs(a) { return a < 0n ? -a : a; }
export function bigGcd(a, b) {
  a = bigAbs(a); b = bigAbs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}
export function bitLen(a) { a = bigAbs(a); return a === 0n ? 0 : a.toString(2).length; }

export function bigToFloat(n, d = 1n) {
  const bn = bitLen(n), bd = bitLen(d);
  if (bn < 1000 && bd < 1000) return Number(n) / Number(d);
  const s = BigInt(Math.max(bn, bd) - 1000);
  // shift both down (keeps ~300 significant bits, far more than a double needs)
  const nn = n >> s, dd = d >> s;
  if (dd === 0n) return n < 0n ? -Infinity : Infinity;
  return Number(nn) / Number(dd);
}

export function R(x) {
  if (Number.isNaN(x)) throw mathErr('The result is undefined');
  if (!Number.isFinite(x)) throw mathErr('The result is too large (overflow)');
  return { k: 'r', v: x === 0 ? 0 : x };
}

export function Q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw mathErr('Division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = bigGcd(n, d);
  if (g > 1n) { n /= g; d /= g; }
  if (bitLen(n) - bitLen(d) > 1025) throw mathErr('The result is too large (overflow)');
  if (bitLen(n) > MAX_BITS || bitLen(d) > MAX_BITS) return R(bigToFloat(n, d));
  return { k: 'q', n, d };
}

export function Cx(re, im) {
  if (Number.isNaN(re) || Number.isNaN(im)) throw mathErr('The result is undefined');
  if (!Number.isFinite(re) || !Number.isFinite(im)) throw mathErr('The result is too large (overflow)');
  if (im === 0) return R(re);
  return { k: 'c', re: re === 0 ? 0 : re, im };
}

export const ZERO = { k: 'q', n: 0n, d: 1n };
export const ONE = { k: 'q', n: 1n, d: 1n };

/** Round to 15 significant digits (the fx-991ES internal precision) to remove binary noise. */
export function round15(x) {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(15));
}

export function toF(v) {
  if (v.k === 'q') return bigToFloat(v.n, v.d);
  if (v.k === 'r') return v.v;
  if (v.k === 'c') {
    if (v.im === 0) return v.re;
    throw mathErr('A complex value cannot be used here');
  }
  throw mathErr('A number is required here');
}
export function reIm(v) {
  if (v.k === 'c') return [v.re, v.im];
  return [toF(v), 0];
}

export function isZero(v) {
  if (v.k === 'q') return v.n === 0n;
  if (v.k === 'r') return v.v === 0;
  if (v.k === 'c') return v.re === 0 && v.im === 0;
  return false;
}
export function isInt(v) {
  if (v.k === 'q') return v.d === 1n;
  if (v.k === 'r') return Number.isInteger(round15(v.v));
  return false;
}
/** Integer value as a JS number, or throws (Math ERROR) if not an integer. */
export function toInt(v, what = 'This function requires an integer') {
  if (v.k === 'q' && v.d === 1n) return Number(v.n);
  if (v.k === 'r') { const x = round15(v.v); if (Number.isInteger(x)) return x; }
  throw mathErr(what);
}
export function toBigInt(v, what) {
  if (v.k === 'q' && v.d === 1n) return v.n;
  if (v.k === 'r') { const x = round15(v.v); if (Number.isInteger(x) && Math.abs(x) < 2 ** 53) return BigInt(x); }
  throw mathErr(what || 'This function requires an integer');
}

/** Parse a decimal literal like "12.5", ".5", "3E-4" into an exact rational (or float if huge). */
export function fromDecimal(text) {
  const m = /^(\d*)(?:\.(\d*))?(?:E([+-]?\d+))?$/.exec(text);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) return null;
  const intPart = m[1] || '0', frac = m[2] || '';
  let exp = m[3] ? parseInt(m[3], 10) : 0;
  if (intPart.length + frac.length > 40 || Math.abs(exp) > 330) {
    return R(parseFloat(`${intPart}.${frac || '0'}e${exp}`));
  }
  let n = BigInt(intPart + frac);
  exp -= frac.length;
  if (exp >= 0) return Q(n * 10n ** BigInt(exp));
  return Q(n, 10n ** BigInt(-exp));
}

/** Convert a float to an exact rational when it is (to 15 digits) a short decimal or simple fraction. */
export function floatToQ(x, maxDen = 100000) {
  if (!Number.isFinite(x)) return null;
  const xr = round15(x);
  if (Number.isInteger(xr) && Math.abs(xr) < 2 ** 53) return Q(BigInt(xr));
  const cf = contFrac(xr, maxDen);
  if (cf && Math.abs(cf[0] / cf[1] - xr) <= 1e-13 * Math.max(1, Math.abs(xr))) return Q(BigInt(cf[0]), BigInt(cf[1]));
  return null;
}

/** Best rational approximation p/q with q <= maxDen (continued fractions). Returns [p,q] or null. */
export function contFrac(x, maxDen) {
  if (!Number.isFinite(x) || Math.abs(x) > 1e15) return null;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(y);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const f = y - a;
    if (f < 1e-16 * Math.max(1, y)) break;
    y = 1 / f;
    if (!Number.isFinite(y)) break;
  }
  if (k1 === 0) return null;
  return [sign * h1, k1];
}

// ---------------------------------------------------------------- scalar arithmetic
function cplx(v) { return v.k === 'c'; }

export function sAdd(a, b) {
  if (a.k === 'q' && b.k === 'q') return Q(a.n * b.d + b.n * a.d, a.d * b.d);
  if (cplx(a) || cplx(b)) { const [ar, ai] = reIm(a), [br, bi] = reIm(b); return Cx(ar + br, ai + bi); }
  return R(toF(a) + toF(b));
}
export function sNeg(a) {
  if (a.k === 'q') return { k: 'q', n: -a.n, d: a.d };
  if (a.k === 'r') return R(-a.v);
  return Cx(-a.re, -a.im);
}
export function sSub(a, b) { return sAdd(a, sNeg(b)); }
export function sMul(a, b) {
  if (a.k === 'q' && b.k === 'q') return Q(a.n * b.n, a.d * b.d);
  if (cplx(a) || cplx(b)) {
    const [ar, ai] = reIm(a), [br, bi] = reIm(b);
    return Cx(ar * br - ai * bi, ar * bi + ai * br);
  }
  return R(toF(a) * toF(b));
}
export function sDiv(a, b) {
  if (isZero(b)) throw mathErr('Division by zero');
  if (a.k === 'q' && b.k === 'q') return Q(a.n * b.d, a.d * b.n);
  if (cplx(a) || cplx(b)) {
    const [ar, ai] = reIm(a), [br, bi] = reIm(b);
    // Smith's algorithm for numerical stability
    if (Math.abs(br) >= Math.abs(bi)) {
      const r = bi / br, den = br + bi * r;
      return Cx((ar + ai * r) / den, (ai - ar * r) / den);
    }
    const r = br / bi, den = br * r + bi;
    return Cx((ar * r + ai) / den, (ai * r - ar) / den);
  }
  return R(toF(a) / toF(b));
}
export function sRecip(a) { return sDiv(ONE, a); }
export function sAbs(a) {
  if (a.k === 'q') return { k: 'q', n: bigAbs(a.n), d: a.d };
  if (a.k === 'r') return R(Math.abs(a.v));
  return R(Math.hypot(a.re, a.im));
}
export function sSign(a) {
  const x = toF(a);
  return Q(x > 0 ? 1n : x < 0 ? -1n : 0n);
}
export function sCmp(a, b) {
  if (a.k === 'q' && b.k === 'q') { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; }
  const x = toF(a), y = toF(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Exact integer k-th root of a non-negative BigInt, or null if not a perfect power. */
export function bigIRoot(n, k) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = BigInt(Math.round(Math.pow(Number(n), 1 / k)));
  if (bitLen(n) > 1000) {
    // Newton iteration for huge numbers
    x = 1n << BigInt(Math.ceil(bitLen(n) / k));
    for (let i = 0; i < 2000; i++) {
      const nx = ((BigInt(k) - 1n) * x + n / x ** BigInt(k - 1)) / BigInt(k);
      if (nx >= x) break;
      x = nx;
    }
  }
  for (const c of [x - 1n, x, x + 1n]) if (c >= 0n && c ** BigInt(k) === n) return c;
  return null;
}

/** Exact rational k-th root, or null. */
export function qRoot(a, k) {
  if (a.k !== 'q') return null;
  let neg = a.n < 0n;
  if (neg && k % 2 === 0) return null;
  const rn = bigIRoot(bigAbs(a.n), k), rd = bigIRoot(a.d, k);
  if (rn === null || rd === null) return null;
  return Q(neg ? -rn : rn, rd);
}

// complex helpers (floating point)
export function cExp(re, im) { const m = Math.exp(re); return Cx(m * Math.cos(im), m * Math.sin(im)); }
export function cLog(re, im) { return Cx(Math.log(Math.hypot(re, im)), Math.atan2(im, re)); }
export function cPowF(ar, ai, br, bi) {
  if (ar === 0 && ai === 0) {
    if (br > 0) return Cx(0, 0);
    throw mathErr('Zero cannot be raised to this power');
  }
  const lr = Math.log(Math.hypot(ar, ai)), li = Math.atan2(ai, ar);
  return cExp(lr * br - li * bi, lr * bi + li * br);
}
export function cSqrt(re, im) {
  if (im === 0) return re >= 0 ? R(Math.sqrt(re)) : Cx(0, Math.sqrt(-re));
  const m = Math.hypot(re, im);
  const r = Math.sqrt((m + re) / 2), i = Math.sign(im) * Math.sqrt((m - re) / 2);
  return Cx(r, i);
}

/**
 * Power a^b for scalars. `complexOK` enables complex results (CMPLX mode).
 */
export function sPow(a, b, complexOK = false) {
  // exact rational base and exponent
  if (a.k === 'q' && b.k === 'q') {
    if (a.n === 0n) {
      if (b.n > 0n) return ZERO;
      throw mathErr(b.n === 0n ? '0⁰ is undefined' : 'Division by zero (0 raised to a negative power)');
    }
    if (b.d === 1n) {
      const e = b.n;
      const ae = bigAbs(e);
      // estimate size before computing
      const bits = Math.max(bitLen(a.n), bitLen(a.d)) * Number(ae);
      if (bits <= MAX_BITS) {
        const r = Q(a.n ** ae, a.d ** ae);
        return e < 0n ? sRecip(r) : r;
      }
      return R(checkF(Math.pow(toF(a), Number(e))));
    }
    // rational exponent p/q: exact if base is a perfect q-th power
    if (b.d <= 64n) {
      const k = Number(b.d);
      const root = qRoot(a, k);
      if (root) return sPow(root, Q(b.n), complexOK);
      if (a.n < 0n && k % 2 === 1) {
        // odd root of a negative number is real
        const r = -Math.pow(-toF(a), 1 / k);
        return R(checkF(Math.pow(r, Number(b.n))));
      }
    }
  }
  if (a.k === 'c' || b.k === 'c') {
    const [ar, ai] = reIm(a), [br, bi] = reIm(b);
    // integer powers of complex numbers: repeated multiplication for accuracy
    if (bi === 0 && Number.isInteger(br) && Math.abs(br) <= 64) {
      let res = ONE, base = a, e = Math.abs(br);
      while (e > 0) { if (e & 1) res = sMul(res, base); base = sMul(base, base); e >>= 1; }
      return br < 0 ? sRecip(res) : res;
    }
    return cPowF(ar, ai, br, bi);
  }
  const x = toF(a), y = toF(b);
  if (x === 0) {
    if (y > 0) return R(0);
    throw mathErr(y === 0 ? '0⁰ is undefined' : 'Division by zero (0 raised to a negative power)');
  }
  if (x < 0 && !Number.isInteger(y)) {
    // allow odd-denominator rational exponents, e.g. (-8)^(1/3) = -2
    const cf = b.k === 'q' ? [Number(b.n), Number(b.d)] : contFrac(y, 1000);
    if (cf && Math.abs(cf[0] / cf[1] - y) < 1e-13 && cf[1] % 2 === 1) {
      const mag = Math.pow(-x, y);
      return R(checkF(cf[0] % 2 === 0 ? mag : -mag));
    }
    if (complexOK) return cPowF(x, 0, y, 0);
    throw mathErr('A negative number cannot be raised to a non-integer power in real mode');
  }
  return R(checkF(Math.pow(x, y)));
}

export function checkF(x) {
  if (Number.isNaN(x)) throw mathErr('The result is undefined');
  if (!Number.isFinite(x)) throw mathErr('The result is too large (overflow)');
  return x;
}

export function sSqrt(a, complexOK = false) {
  if (a.k === 'q') {
    if (a.n < 0n) {
      if (!complexOK) throw mathErr('Square root of a negative number (switch to CMPLX mode for complex results)');
      return Cx(0, toF(sSqrt(sNeg(a))));
    }
    const r = qRoot(a, 2);
    if (r) return r;
    return R(Math.sqrt(toF(a)));
  }
  if (a.k === 'r') {
    if (a.v < 0) {
      if (!complexOK) throw mathErr('Square root of a negative number (switch to CMPLX mode for complex results)');
      return Cx(0, Math.sqrt(-a.v));
    }
    return R(Math.sqrt(a.v));
  }
  return cSqrt(a.re, a.im);
}
