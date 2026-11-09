// AST interpreter. Works on exact rationals where possible, otherwise IEEE doubles; complex in CMPLX mode.
import { CalcError, mathErr, syntaxErr, argErr, dimErr } from './errors.js';
import {
  Q, R, Cx, ZERO, ONE, isQ, isC, isReal, isScalar, toF, reIm, isZero, toInt, toBigInt, round15, floatToQ, fromDecimal, contFrac,
  sAdd, sSub, sMul, sDiv, sNeg, sAbs, sPow, sSqrt, sRecip, sSign, qRoot, cLog, cExp, bigAbs, bigGcd, checkF,
} from './num.js';
import * as LA from './linalg.js';
import { bigFactorial, integrate, derivative, gamma } from './numeric.js';
import { CONST_BY_ID, CONVERSIONS } from './constants.js';
import { STAT_VAR, estimateX, estimateY, distP, distQ, distR } from './stats.js';

const PI = Math.PI;

// ---------------------------------------------------------------- generic arithmetic (scalars, matrices, vectors)
const kindName = (v) => ({ q: 'number', r: 'number', c: 'complex number', m: 'matrix', v: 'vector' }[v.k] || 'value');

export function add(a, b) {
  if (isScalar(a) && isScalar(b)) return sAdd(a, b);
  if (a.k === 'm' && b.k === 'm') return LA.mAdd(a, b);
  if (a.k === 'v' && b.k === 'v') return LA.vAdd(a, b);
  throw mathErr(`Cannot add a ${kindName(a)} and a ${kindName(b)}`);
}
export function sub(a, b) {
  if (isScalar(a) && isScalar(b)) return sSub(a, b);
  if (a.k === 'm' && b.k === 'm') return LA.mSub(a, b);
  if (a.k === 'v' && b.k === 'v') return LA.vSub(a, b);
  throw mathErr(`Cannot subtract a ${kindName(b)} from a ${kindName(a)}`);
}
export function mul(a, b) {
  if (isScalar(a) && isScalar(b)) return sMul(a, b);
  if (a.k === 'm' && b.k === 'm') return LA.mMul(a, b);
  if (a.k === 'm' && isScalar(b)) return LA.mScale(a, b);
  if (isScalar(a) && b.k === 'm') return LA.mScale(b, a);
  if (a.k === 'v' && isScalar(b)) return LA.vScale(a, b);
  if (isScalar(a) && b.k === 'v') return LA.vScale(b, a);
  if (a.k === 'v' && b.k === 'v') return LA.vCross(a, b);
  if (a.k === 'm' && b.k === 'v') return LA.mvMul(a, b);
  throw mathErr(`Cannot multiply a ${kindName(a)} by a ${kindName(b)}`);
}
export function div(a, b) {
  if (isScalar(a) && isScalar(b)) return sDiv(a, b);
  if ((a.k === 'm' || a.k === 'v') && isScalar(b)) {
    if (isZero(b)) throw mathErr('Division by zero');
    return mul(a, sRecip(b));
  }
  throw mathErr(`Cannot divide a ${kindName(a)} by a ${kindName(b)}`);
}
export function neg(a) {
  if (isScalar(a)) return sNeg(a);
  if (a.k === 'm') return LA.mNeg(a);
  if (a.k === 'v') return LA.vNeg(a);
  throw mathErr('Cannot negate this value');
}

// ---------------------------------------------------------------- angle handling
const FULL = { D: 360, R: 2 * PI, G: 400 };
/** Angle value -> fraction of a full turn as an exact rational when possible (else null). */
function turnFraction(v, unit) {
  if (unit === 'D' || unit === 'G') {
    if (isQ(v)) return sDiv(v, Q(unit === 'D' ? 360n : 400n));
    const q = floatToQ(toF(v) / FULL[unit], 7200);
    return q;
  }
  const t = toF(v) / (2 * PI);
  const cf = contFrac(t, 48);
  if (cf && Math.abs(cf[0] / cf[1] - t) <= 2e-15 * Math.max(1, Math.abs(t))) return Q(BigInt(cf[0]), BigInt(cf[1]));
  return null;
}
export function toRad(v, unit) {
  const x = toF(v);
  if (unit === 'R') return x;
  // reduce first for accuracy with large angles
  const full = FULL[unit];
  const r = Math.abs(x) > full ? x % full : x;
  return r * (2 * PI) / full;
}
function fromRad(rad, unit) {
  if (unit === 'R') return R(round15(rad));
  const v = rad * FULL[unit] / (2 * PI);
  const r = round15(v);
  const q = floatToQ(r, 120);
  if (q && Math.abs(toF(q) - v) < 1e-12 * Math.max(1, Math.abs(v))) return q;
  return R(r);
}
function snapUnit(x) {
  // exact values for sin/cos at multiples of 30°
  for (const t of [0, 0.5, 1]) {
    if (Math.abs(Math.abs(x) - t) < 1e-15) return Q(BigInt(Math.sign(x) * (t === 0.5 ? 1 : t)), t === 0.5 ? 2n : 1n);
  }
  return R(round15(x));
}
function trig(fn, v, ctx) {
  if (!isReal(v)) throw mathErr('Trigonometric functions of complex numbers are not supported');
  const unit = ctx.angle;
  const x = toF(v);
  if (Math.abs(x) >= (unit === 'R' ? 1.5e8 : unit === 'D' ? 9e9 : 1e10)) throw mathErr('The angle is too large for an accurate result');
  const t = turnFraction(v, unit);
  if (t) {
    // multiples of 15° can be evaluated from an exact reduced angle
    const k24 = sMul(t, Q(24n));
    if (isQ(k24) && k24.d === 1n) {
      let k = Number(((k24.n % 24n) + 24n) % 24n); // angle = k·15°
      const rad = k * PI / 12;
      if (fn === 'tan') {
        if (k % 12 === 6) throw mathErr('tan is undefined at ±90° (+ multiples of 180°)');
        if (k % 12 === 0) return ZERO;
        if (k % 12 === 3) return ONE;
        if (k % 12 === 9) return Q(-1n);
        return R(round15(Math.tan(rad)));
      }
      const s = fn === 'sin' ? Math.sin(rad) : Math.cos(rad);
      return snapUnit(s);
    }
    // reduce exactly modulo one turn
    const frac = sSub(t, Q(t.n / t.d - (t.n < 0n && t.n % t.d !== 0n ? 1n : 0n)));
    const rad = toF(frac) * 2 * PI;
    return R(round15(fn === 'sin' ? Math.sin(rad) : fn === 'cos' ? Math.cos(rad) : Math.tan(rad)));
  }
  const rad = toRad(v, unit);
  const y = fn === 'sin' ? Math.sin(rad) : fn === 'cos' ? Math.cos(rad) : Math.tan(rad);
  return R(checkF(round15(y)));
}

function realArg(v, name) {
  if (!isReal(v)) throw mathErr(`${name} requires a real number`);
  return toF(v);
}

// ---------------------------------------------------------------- functions
function log10Exact(v) {
  if (isQ(v) && v.n > 0n) {
    // exact for powers of ten (including negative powers)
    const test = (n, d) => { const s = n.toString(); return d === 1n && /^10*$/.test(s) ? s.length - 1 : null; };
    const a = test(v.n, v.d); if (a !== null) return Q(BigInt(a));
    const b = test(v.d, v.n); if (b !== null) return Q(BigInt(-b));
  }
  return null;
}
function lnC(v, ctx) {
  if (isC(v) || (ctx.complex && toF(v) < 0)) { const [re, im] = reIm(v); if (re === 0 && im === 0) throw mathErr('ln(0) is undefined'); return cLog(re, im); }
  const x = toF(v);
  if (x <= 0) throw mathErr(x === 0 ? 'The logarithm of 0 is undefined' : 'The logarithm of a negative number is undefined in real mode');
  if (isQ(v) && v.n === 1n && v.d === 1n) return ZERO;
  return R(round15(Math.log(x)));
}
function logBase(b, a, ctx) {
  if (isC(a) || isC(b)) return sDiv(lnC(a, ctx), lnC(b, ctx));
  const x = toF(a), base = toF(b);
  if (base <= 0 || base === 1) throw mathErr('The logarithm base must be positive and not equal to 1');
  if (x <= 0) {
    if (ctx.complex && x < 0) return sDiv(lnC(a, ctx), lnC(b, ctx));
    throw mathErr(x === 0 ? 'The logarithm of 0 is undefined' : 'The logarithm of a negative number is undefined in real mode');
  }
  const r = Math.log(x) / Math.log(base);
  const ri = Math.round(r);
  if (Math.abs(r - ri) < 1e-10 && isQ(a) && isQ(b)) {
    // verify exactly: base^ri === x
    try { const p = sPow(b, Q(BigInt(ri))); if (isQ(p) && p.n === a.n && p.d === a.d) return Q(BigInt(ri)); } catch { /* ignore */ }
  }
  if (base === 10) { const e = log10Exact(a); if (e) return e; }
  return R(round15(r));
}

function nCrBig(n, r) { if (r < 0n || r > n) throw mathErr('nCr requires 0 ≤ r ≤ n'); if (r > n - r) r = n - r; let res = 1n; for (let i = 1n; i <= r; i++) res = res * (n - r + i) / i; return res; }
function nPrBig(n, r) { if (r < 0n || r > n) throw mathErr('nPr requires 0 ≤ r ≤ n'); let res = 1n; for (let i = 0n; i < r; i++) res *= n - i; return res; }
function nonNegInt(v, name) {
  if (!isReal(v)) throw mathErr(`${name} requires real integers`);
  const b = toBigInt(v, `${name} requires integers`);
  if (b < 0n) throw mathErr(`${name} requires non-negative integers`);
  if (b > 10n ** 10n) throw mathErr(`${name} argument is too large`);
  return b;
}

function factorial(v) {
  if (!isReal(v)) throw mathErr('x! requires a real number');
  const x = toF(v);
  if (!Number.isInteger(round15(x))) {
    // Enhancement: Γ(x+1) for non-integers (not available on the fx-991ES)
    if (x < 0 && Number.isInteger(x)) throw mathErr('x! is undefined for negative integers');
    return R(checkF(round15(gamma(x + 1))));
  }
  const n = Math.round(x);
  if (n < 0) throw mathErr('x! is undefined for negative integers');
  if (n > 170) throw mathErr('The factorial is too large (overflow); the limit is 170!');
  return Q(bigFactorial(n));
}

function gcdAll(args, lcm) {
  if (args.length < 2) throw argErr(`${lcm ? 'LCM' : 'GCD'} needs at least two arguments`);
  let acc = null;
  for (const a of args) {
    const b = bigAbs(toBigInt(a, `${lcm ? 'LCM' : 'GCD'} requires integers`));
    if (acc === null) acc = b;
    else if (lcm) acc = (acc === 0n || b === 0n) ? 0n : acc / bigGcd(acc, b) * b;
    else acc = bigGcd(acc, b);
  }
  return Q(acc);
}

function intPart(v) {
  if (isQ(v)) return Q(v.n / v.d); // BigInt division truncates toward zero
  return R(Math.trunc(round15(toF(v))));
}
function floorV(v) {
  if (isQ(v)) { let q = v.n / v.d; if (v.n < 0n && v.n % v.d !== 0n) q -= 1n; return Q(q); }
  return R(Math.floor(round15(toF(v))));
}

function matArg(v, name) { if (v.k !== 'm') throw mathErr(`${name} requires a matrix`); return v; }
function vecArg(v, name) { if (v.k !== 'v') throw mathErr(`${name} requires a vector`); return v; }

function callFunc(f, args, ctx, node) {
  const one = () => { if (args.length !== 1) throw argErr(`${f}( takes exactly one argument`); return args[0]; };
  const two = () => { if (args.length !== 2) throw argErr(`${f}( takes exactly two arguments`); return args; };
  switch (f) {
    case 'sin': case 'cos': case 'tan': return trig(f, one(), ctx);
    case 'sin⁻¹': case 'cos⁻¹': {
      const x = realArg(one(), f);
      if (x < -1 - 1e-15 || x > 1 + 1e-15) throw mathErr(`${f} is only defined for −1 ≤ x ≤ 1`);
      const c = Math.max(-1, Math.min(1, x));
      return fromRad(f === 'sin⁻¹' ? Math.asin(c) : Math.acos(c), ctx.angle);
    }
    case 'tan⁻¹': return fromRad(Math.atan(realArg(one(), f)), ctx.angle);
    case 'sinh': return R(round15(Math.sinh(realArg(one(), f))));
    case 'cosh': return R(checkF(round15(Math.cosh(realArg(one(), f)))));
    case 'tanh': return R(round15(Math.tanh(realArg(one(), f))));
    case 'sinh⁻¹': return R(round15(Math.asinh(realArg(one(), f))));
    case 'cosh⁻¹': { const x = realArg(one(), f); if (x < 1) throw mathErr('cosh⁻¹ is only defined for x ≥ 1'); return R(round15(Math.acosh(x))); }
    case 'tanh⁻¹': { const x = realArg(one(), f); if (x <= -1 || x >= 1) throw mathErr('tanh⁻¹ is only defined for −1 < x < 1'); return R(round15(Math.atanh(x))); }
    case 'log': {
      if (args.length === 2) return logBase(args[0], args[1], ctx);
      const a = one();
      const e = log10Exact(a); if (e) return e;
      if (isC(a) || (ctx.complex && toF(a) < 0)) return sDiv(lnC(a, ctx), R(Math.LN10));
      const x = toF(a);
      if (x <= 0) throw mathErr(x === 0 ? 'The logarithm of 0 is undefined' : 'The logarithm of a negative number is undefined in real mode');
      return R(round15(Math.log10(x)));
    }
    case 'ln': return lnC(one(), ctx);
    case 'Abs': {
      const a = one();
      if (a.k === 'm') return LA.mAbs(a);
      if (a.k === 'v') return LA.vNorm(a);
      return sAbs(a);
    }
    case 'Pol': {
      const [x, y] = two().map((v) => realArg(v, 'Pol'));
      if (x === 0 && y === 0) throw mathErr('Pol(0,0): the angle is undefined');
      const r = sSqrt(sAdd(sMul(args[0], args[0]), sMul(args[1], args[1])));
      const th = fromRad(Math.atan2(y, x), ctx.angle);
      return { k: 'multi', items: [{ label: 'r', v: r }, { label: 'θ', v: th }], store: { X: r, Y: th } };
    }
    case 'Rec': {
      const [r, th] = two();
      const x = sMul(r, trig('cos', th, ctx)), y = sMul(r, trig('sin', th, ctx));
      return { k: 'multi', items: [{ label: 'X', v: x }, { label: 'Y', v: y }], store: { X: x, Y: y } };
    }
    case 'Rnd': { const a = one(); return ctx.round ? ctx.round(a) : a; }
    case 'RanInt#': {
      const [a, b] = two().map((v) => toInt(v, 'RanInt# requires integers'));
      if (a > b) throw mathErr('RanInt#(a,b) requires a ≤ b');
      return Q(BigInt(a + Math.floor(ctx.random() * (b - a + 1))));
    }
    case 'GCD': return gcdAll(args, false);
    case 'LCM': return gcdAll(args, true);
    case 'Int': return intPart(realOnly(one(), 'Int'));
    case 'Intg': case 'Floor': return floorV(realOnly(one(), f));
    case 'Ceil': return neg(floorV(neg(realOnly(one(), f))));
    case 'Sign': return sSign(realOnly(one(), f));
    case 'Frac': { const a = realOnly(one(), f); return sSub(a, intPart(a)); }
    case 'det': return LA.mDet(matArg(one(), 'det'));
    case 'Trn': return LA.mTrn(matArg(one(), 'Trn'));
    case 'Rank': return Q(BigInt(LA.mRank(matArg(one(), 'Rank'))));
    case 'Tr': return LA.mTrace(matArg(one(), 'Tr'));
    case 'UnitV': return LA.vUnit(vecArg(one(), 'UnitV'));
    case 'Angle': { const [a, b] = two(); return fromRad(LA.vAngleRad(vecArg(a, 'Angle'), vecArg(b, 'Angle')), ctx.angle); }
    case 'Conjg': { const a = one(); return isC(a) ? Cx(a.re, -a.im) : a; }
    case 'ReP': { const a = one(); return isC(a) ? R(a.re) : a; }
    case 'ImP': { const a = one(); return isC(a) ? R(a.im) : ZERO; }
    case 'arg': {
      const a = one(); const [re, im] = reIm(a);
      if (re === 0 && im === 0) throw mathErr('The argument of 0 is undefined');
      return fromRad(Math.atan2(im, re), ctx.angle);
    }
    case 'P': return R(round15(distP(realArg(one(), 'P'))));
    case 'Q': return R(round15(distQ(realArg(one(), 'Q'))));
    case 'R': return R(round15(distR(realArg(one(), 'R'))));
    case 'Not': case 'Neg': throw syntaxErr(`${f}( is only available in BASE-N mode`);
    default: throw syntaxErr(`Unknown function ${f}`);
  }
}
function realOnly(v, name) { if (!isReal(v)) throw mathErr(`${name} requires a real number`); return v; }

// ---------------------------------------------------------------- atoms
function atomValue(name, ctx) {
  switch (name) {
    case 'π': return R(PI);
    case 'e': return R(Math.E);
    case 'i':
      if (!ctx.complex) throw mathErr('The imaginary unit i is only available in CMPLX mode');
      return Cx(0, 1);
    case 'Ans': return ctx.ans ?? ZERO;
    case 'PreAns': return ctx.preAns ?? ZERO;
    case 'Ran#': return Q(BigInt(Math.floor(ctx.random() * 1000)), 1000n);
    default: break;
  }
  if (/^[A-FXYM]$/.test(name)) return ctx.vars[name] ?? ZERO;
  if (name.startsWith('Mat')) {
    const m = ctx.mats?.[name];
    if (!m) throw dimErr(`${name} has not been defined. Define it with MATRIX ▸ Dim`);
    return m;
  }
  if (name.startsWith('Vct')) {
    const v = ctx.vecs?.[name];
    if (!v) throw dimErr(`${name} has not been defined. Define it with VECTOR ▸ Dim`);
    return v;
  }
  if (name.startsWith('k:')) {
    const c = CONST_BY_ID[name.slice(2)];
    if (!c) throw syntaxErr('Unknown constant');
    const negc = c.value.startsWith('-');
    const val = fromDecimal(negc ? c.value.slice(1) : c.value);
    return negc ? sNeg(val) : val;
  }
  if (name.startsWith('st:')) {
    const sv = STAT_VAR[name.slice(3)];
    const s = ctx.getStats ? ctx.getStats() : null;
    if (!s) throw mathErr('Statistics variables need STAT mode data');
    const v = s[sv.field];
    if (v === undefined || Number.isNaN(v)) throw mathErr(`${sv.label} is not available for this statistics type or data`);
    return R(round15(v));
  }
  throw syntaxErr(`Unknown symbol ${name}`);
}

function convValue(id, v) {
  const c = CONVERSIONS[id - 1];
  if (!c) throw syntaxErr('Unknown conversion');
  if (!isReal(v)) throw mathErr('Conversions require a real number');
  if (c.factor === 'F2C') return sMul(sSub(v, Q(32n)), Q(5n, 9n));
  if (c.factor === 'C2F') return sAdd(sMul(v, Q(9n, 5n)), Q(32n));
  const [n, d] = c.factor.split('/');
  const f = d ? sDiv(fromDecimal(n), fromDecimal(d)) : fromDecimal(n);
  return sMul(v, f);
}

function angleUnitConvert(v, from, to) {
  if (from === to) return v;
  if (from !== 'R' && to !== 'R') return sMul(v, from === 'D' ? Q(10n, 9n) : Q(9n, 10n));
  if (from === 'R') return fromRad(toF(v), to);
  return R(round15(toRad(v, from)));
}

// ---------------------------------------------------------------- main interpreter
export function evaluate(ast, ctx) {
  if (ctx.deadline && Date.now() > ctx.deadline) throw new CalcError('Time Out', 'The calculation took too long');
  switch (ast.op) {
    case 'num': {
      const v = fromDecimal(ast.text);
      if (!v) throw syntaxErr('Invalid number');
      return v;
    }
    case 'atom': return atomValue(ast.name, ctx);
    case 'neg': return neg(evaluate(ast.a, ctx));
    case 'bin': {
      if (ast.o === '÷R') {
        if (!ctx.top) throw syntaxErr('÷R can only be used on its own (a ÷R b)');
        const a = toBigInt(evaluate(ast.a, { ...ctx, top: false }), '÷R requires integers'), b = toBigInt(evaluate(ast.b, { ...ctx, top: false }), '÷R requires integers');
        if (b === 0n) throw mathErr('Division by zero');
        if (a < 0n || b < 0n) throw mathErr('÷R requires non-negative integers');
        return { k: 'multi', items: [{ label: 'Q', v: Q(a / b) }, { label: 'R', v: Q(a % b) }], qr: true, store: {}, ans: Q(a / b) };
      }
      const sub2 = ctx.top ? { ...ctx, top: false } : ctx;
      const a = evaluate(ast.a, sub2), b = evaluate(ast.b, sub2);
      switch (ast.o) {
        case '+': return add(a, b);
        case '−': return sub(a, b);
        case '×': return mul(a, b);
        case '÷': return div(a, b);
        case '·': {
          if (a.k === 'v' && b.k === 'v') return LA.vDot(a, b);
          return mul(a, b);
        }
        case 'nPr': return Q(nPrBig(nonNegInt(a, 'nPr'), nonNegInt(b, 'nPr')));
        case 'nCr': return Q(nCrBig(nonNegInt(a, 'nCr'), nonNegInt(b, 'nCr')));
        case '∠': {
          if (!ctx.complex) throw syntaxErr('∠ (polar form) is only available in CMPLX mode');
          const r = toF(a);
          const th = toRad(b, ctx.angle);
          const c = trig('cos', b, ctx), s = trig('sin', b, ctx);
          void th;
          return Cx(round15(r * toF(c)), round15(r * toF(s)));
        }
        case 'and': case 'or': case 'xor': case 'xnor':
          throw syntaxErr('Logical operators are only available in BASE-N mode');
        default: throw syntaxErr(`Unknown operator ${ast.o}`);
      }
    }
    case 'post': {
      const o = ast.o;
      const a = evaluate(ast.a, ctx.top && o !== '▸r∠θ' && o !== '▸a+bi' ? { ...ctx, top: false } : ctx);
      if (o === '!') return factorial(a);
      if (o === '%') return div(a, Q(100n));
      if (o === '⁻¹') {
        if (a.k === 'm') return LA.mInv(a);
        if (a.k === 'v') throw mathErr('A vector has no inverse');
        return sRecip(a);
      }
      if (o === 'ᵈ') return angleUnitConvert(a, 'D', ctx.angle);
      if (o === 'ʳ') return angleUnitConvert(a, 'R', ctx.angle);
      if (o === 'ᵍ') return angleUnitConvert(a, 'G', ctx.angle);
      if (o.startsWith('cv:')) return convValue(parseInt(o.slice(3), 10), a);
      if (o === 'ŷ' || o === 'x̂' || o === 'x̂₁' || o === 'x̂₂' || o === '→t') {
        const s = ctx.getStats ? ctx.getStats() : null;
        if (!s) throw mathErr('Estimates need STAT mode data');
        const x = realArg(a, o);
        if (o === 'ŷ') return R(checkF(round15(estimateY(s, x))));
        if (o === '→t') { if (!(s.popsdx > 0)) throw mathErr('→t needs data with non-zero standard deviation'); return R(round15((x - s.mean) / s.popsdx)); }
        const xs = estimateX(s, x);
        if (o === 'x̂₂') { if (xs.length < 2) throw mathErr('x̂₂ is only for quadratic regression'); return R(checkF(round15(xs[1]))); }
        return R(checkF(round15(xs[0])));
      }
      if (o === '▸r∠θ' || o === '▸a+bi') {
        if (!ctx.top) throw syntaxErr(`${o} can only be used at the end of a calculation`);
        return { ...a, fmt: o === '▸r∠θ' ? 'polar' : 'rect' };
      }
      throw syntaxErr(`Unknown postfix ${o}`);
    }
    case 'dms': {
      let v = evaluate(ast.parts[0], ctx);
      if (ast.parts[1]) v = sAdd(v, sDiv(evaluate(ast.parts[1], ctx), Q(60n)));
      if (ast.parts[2]) v = sAdd(v, sDiv(evaluate(ast.parts[2], ctx), Q(3600n)));
      return v;
    }
    case 'pow': {
      const c2 = ctx.top ? { ...ctx, top: false } : ctx;
      const a = evaluate(ast.a, c2), b = evaluate(ast.b, c2);
      if (a.k === 'm') {
        if (!isReal(b)) throw mathErr('Matrix powers must be integers');
        return LA.mPowInt(a, toInt(b, 'Matrix powers must be integers'));
      }
      if (a.k === 'v' || b.k === 'm' || b.k === 'v') throw mathErr('This power is not defined');
      // e^x exactly at 0
      return sPow(a, b, ctx.complex);
    }
    case 'frac': {
      const c2 = ctx.top ? { ...ctx, top: false } : ctx;
      return div(evaluate(ast.a, c2), evaluate(ast.b, c2));
    }
    case 'mixed': {
      const w = evaluate(ast.w, ctx), a = evaluate(ast.a, ctx), b = evaluate(ast.b, ctx);
      const f = sDiv(a, b);
      return toF(w) < 0 ? sSub(w, f) : sAdd(w, f);
    }
    case 'sqrt': {
      const a = evaluate(ast.a, ctx.top ? { ...ctx, top: false } : ctx);
      if (!isScalar(a)) throw mathErr('√ requires a number');
      return sSqrt(a, ctx.complex);
    }
    case 'root': {
      const c2 = ctx.top ? { ...ctx, top: false } : ctx;
      const n = evaluate(ast.n, c2), a = evaluate(ast.a, c2);
      if (isZero(n)) throw mathErr('The 0th root is undefined');
      if (isQ(n) && n.d === 1n && isQ(a)) {
        const k = Number(n.n);
        if (Math.abs(k) <= 64) {
          const r = qRoot(a, Math.abs(k));
          if (r) return k < 0 ? sRecip(r) : r;
        }
      }
      if (isReal(a) && toF(a) < 0 && isReal(n)) {
        const k = toF(n);
        if (Number.isInteger(k) && Math.abs(k) % 2 === 1) return R(round15(-Math.pow(-toF(a), 1 / k)));
        if (!ctx.complex) throw mathErr('An even root of a negative number is undefined in real mode');
      }
      return sPow(a, sRecip(n), ctx.complex);
    }
    case 'logb': return logBase(evaluate(ast.b, ctx), evaluate(ast.a, ctx), ctx);
    case 'call': {
      const c2 = ctx.top ? { ...ctx, top: false } : ctx;
      if (ast.f === 'Pol' || ast.f === 'Rec') {
        if (!ctx.top) throw syntaxErr(`${ast.f}( can only be used on its own, not inside an expression`);
      }
      return callFunc(ast.f, ast.args.map((x) => evaluate(x, c2)), ctx, ast);
    }
    case 'integ': {
      const lo = toF(evaluate(ast.lo, ctx)), hi = toF(evaluate(ast.hi, ctx));
      const f = numFn(ast.f, ctx);
      const v = integrate(f, lo, hi, { deadline: Date.now() + 8000 });
      return R(checkF(round15(snapTiny(v))));
    }
    case 'deriv': {
      const x = toF(evaluate(ast.x, ctx));
      const f = numFn(ast.f, ctx);
      const v = derivative(f, x);
      return R(round15(snapNice(v)));
    }
    case 'sum': case 'prod': {
      const lo = evaluate(ast.lo, ctx), hi = evaluate(ast.hi, ctx);
      const a = toInt(lo, 'Σ / Π limits must be integers'), b = toInt(hi, 'Σ / Π limits must be integers');
      if (b < a) throw mathErr('The end value must not be less than the start value');
      if (b - a > 1e6) throw mathErr('Too many terms (maximum 1,000,000)');
      const deadline = Date.now() + 8000;
      let acc = ast.op === 'sum' ? ZERO : ONE;
      const local = { ...ctx, top: false, vars: { ...ctx.vars } };
      for (let k = a; k <= b; k++) {
        local.vars.X = Q(BigInt(k));
        const term = evaluate(ast.f, local);
        acc = ast.op === 'sum' ? add(acc, term) : mul(acc, term);
        if ((k - a) % 1000 === 999 && Date.now() > deadline) throw new CalcError('Time Out', 'The sum took too long');
      }
      return acc;
    }
    default: throw syntaxErr('Unsupported expression');
  }
}

function snapTiny(v) { return Math.abs(v) < 1e-13 ? 0 : v; }
function snapNice(v) {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v))) return r;
  return v;
}

/** Turn an AST into a fast float function of X (used by ∫, d/dx, SOLVE, TABLE). */
export function numFn(ast, ctx, varName = 'X') {
  const local = { ...ctx, top: false, vars: { ...ctx.vars } };
  return (x) => {
    local.vars[varName] = R(x);
    const v = evaluate(ast, local);
    if (!isReal(v)) {
      if (v.k === 'c' && Math.abs(v.im) < 1e-12) return v.re;
      throw mathErr('The function must give a real value');
    }
    return toF(v);
  };
}

export { CalcError };
