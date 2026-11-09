// Numerical algorithms: integration, differentiation, root finding, polynomial roots,
// special functions and integer number theory.
import { mathErr, CalcError } from './errors.js';

// ---------------------------------------------------------------- integer number theory
export function gcdN(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
export function bigFactorial(n) { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; }

/** Prime factorisation of a positive integer (BigInt). Returns [[prime, exponent], ...] and a remaining cofactor if unfactored. */
export function primeFactors(nBig) {
  let n = nBig < 0n ? -nBig : nBig;
  const out = [];
  if (n < 2n) return { factors: out, rest: 1n };
  const add = (p) => { const last = out[out.length - 1]; if (last && last[0] === p) last[1]++; else out.push([p, 1]); };
  for (const p of [2n, 3n, 5n]) while (n % p === 0n) { add(p); n /= p; }
  // wheel trial division up to a bound, then Pollard rho for the remainder
  const inc = [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n];
  let f = 7n, k = 0, steps = 0;
  while (f * f <= n && steps < 2_000_000) {
    while (n % f === 0n) { add(f); n /= f; }
    f += inc[k]; k = (k + 1) & 7; steps++;
  }
  if (n > 1n) {
    if (f * f > n) add(n);
    else {
      const stack = [n], found = [];
      while (stack.length) {
        const m = stack.pop();
        if (m === 1n) continue;
        if (isProbablePrime(m)) { found.push(m); continue; }
        const d = pollardRho(m);
        if (!d) return { factors: out, rest: m };
        stack.push(d, m / d);
      }
      found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach(add);
    }
  }
  return { factors: out, rest: 1n };
}
function modPow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
export function isProbablePrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }
  outer: for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) continue outer; }
    return false;
  }
  return true;
}
function bgcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a < 0n ? -a : a; }
function pollardRho(n) {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 50n; c++) {
    let x = 2n, y = 2n, d = 1n, it = 0;
    const f = (v) => (v * v + c) % n;
    while (d === 1n && it++ < 200000) { x = f(x); y = f(f(y)); d = bgcd(x - y, n); }
    if (d !== n && d !== 1n) return d;
  }
  return null;
}

// ---------------------------------------------------------------- special functions
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function gamma(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/** Complementary error function, relative accuracy ~1e-15 (W. J. Cody rational approximations replaced by series/CF). */
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) return 1 - erfSeries(x);
  // continued fraction (Lentz) for large x
  const tiny = 1e-300;
  let f = tiny, C = f, D = 0;
  // erfc(x) = exp(-x²)/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + ...))))
  const b0 = x;
  f = b0 || tiny; C = f; D = 0;
  for (let n = 1; n < 300; n++) {
    const an = n / 2, bn = x;
    D = bn + an * D; D = D === 0 ? tiny : D; D = 1 / D;
    C = bn + an / C; C = C === 0 ? tiny : C;
    const delta = C * D; f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}
function erfSeries(x) {
  // erf(x) = 2/√π Σ (-1)^n x^(2n+1) / (n! (2n+1)), use the e^{-x²} form for stability
  let sum = x, term = x;
  const x2 = x * x;
  for (let n = 1; n < 200; n++) {
    term *= 2 * x2 / (2 * n + 1);
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
  }
  return 2 / Math.sqrt(Math.PI) * Math.exp(-x2) * sum;
}
export function erf(x) { return 1 - erfc(x); }
export function normCdf(t) { return 0.5 * erfc(-t / Math.SQRT2); }

// ---------------------------------------------------------------- integration (adaptive Gauss–Kronrod 7/15)
const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0];
const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975,
  0.417959183673469387755102040816327];

function gk15(f, a, b) {
  const c = (a + b) / 2, h = (b - a) / 2;
  const fc = f(c);
  let resK = fc * WGK[7], resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx), f2 = f(c + dx);
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { val: resK * h, err: Math.abs((resK - resG) * h) };
}

export function integrate(f, a, b, { tol = 1e-12, maxEval = 200000, deadline = Date.now() + 8000 } = {}) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw mathErr('Integration limits must be finite numbers');
  if (a === b) return 0;
  let sign = 1;
  if (a > b) { [a, b] = [b, a]; sign = -1; }
  let evals = 0;
  const g = (x) => {
    if (++evals > maxEval || (evals % 512 === 0 && Date.now() > deadline)) throw new CalcError('Time Out', 'The integral did not converge in time');
    const y = f(x);
    if (!Number.isFinite(y)) throw mathErr('The integrand is undefined or infinite inside the interval');
    return y;
  };
  // priority queue (array) of intervals by error
  const first = gk15(g, a, b);
  let intervals = [{ a, b, ...first }];
  let total = first.val, err = first.err;
  for (let iter = 0; iter < 4000; iter++) {
    if (err <= Math.max(tol * Math.abs(total), 1e-14)) break;
    // split the interval with the largest error
    let k = 0;
    for (let j = 1; j < intervals.length; j++) if (intervals[j].err > intervals[k].err) k = j;
    const it = intervals[k];
    const m = (it.a + it.b) / 2;
    if (m <= it.a || m >= it.b) break; // can't subdivide further
    const L = gk15(g, it.a, m), Rr = gk15(g, m, it.b);
    intervals.splice(k, 1, { a: it.a, b: m, ...L }, { a: m, b: it.b, ...Rr });
    total = 0; err = 0;
    for (const x of intervals) { total += x.val; err += x.err; }
  }
  return sign * total;
}

// ---------------------------------------------------------------- differentiation (Ridders' extrapolation)
export function derivative(f, x, h0) {
  let h = h0 || Math.max(Math.abs(x) * 0.05, 0.05);
  const NTAB = 12, CON = 1.4, CON2 = CON * CON, BIG = 1e300, SAFE = 2;
  const a = Array.from({ length: NTAB }, () => new Array(NTAB).fill(0));
  a[0][0] = (f(x + h) - f(x - h)) / (2 * h);
  let err = BIG, ans = a[0][0];
  for (let i = 1; i < NTAB; i++) {
    h /= CON;
    a[0][i] = (f(x + h) - f(x - h)) / (2 * h);
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
      fac *= CON2;
      const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
      if (errt <= err) { err = errt; ans = a[j][i]; }
    }
    if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= SAFE * err) break;
  }
  if (!Number.isFinite(ans)) throw mathErr('The derivative is undefined at this point');
  return ans;
}

// ---------------------------------------------------------------- root finding for SOLVE
function brent(f, a, b, fa, fb) {
  let c = a, fc = fa, d = b - a, e = d;
  for (let iter = 0; iter < 200; iter++) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 1e-300, xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; } else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

/**
 * Solve f(x) = 0 starting from x0. Returns {x, residual}. Throws "Can't Solve" when no root found.
 * Strategy: safeguarded Newton from the guess; then an expanding sign-change scan + Brent.
 */
export function solve(fRaw, x0 = 0, { deadline = Date.now() + 8000 } = {}) {
  let evals = 0;
  const f = (x) => {
    if (++evals % 256 === 0 && Date.now() > deadline) throw new CalcError('Time Out', 'SOLVE did not converge in time');
    try { const y = fRaw(x); return Number.isFinite(y) ? y : NaN; } catch (e) { if (e.kind === 'Time Out') throw e; return NaN; }
  };
  const good = (x, y) => Number.isFinite(y) && Math.abs(y) <= 1e-11 * Math.max(1, Math.abs(x)) ;
  // Newton
  let x = x0, y = f(x);
  if (y === 0) return { x, residual: 0 };
  for (let it = 0; it < 100 && Number.isFinite(y); it++) {
    const h = Math.max(1e-7 * Math.abs(x), 1e-9);
    const d = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    let step = y / d, lam = 1, nx, ny;
    for (let k = 0; k < 30; k++) {
      nx = x - lam * step; ny = f(nx);
      if (Number.isFinite(ny) && Math.abs(ny) < Math.abs(y)) break;
      lam /= 2;
    }
    if (!Number.isFinite(ny)) break;
    const dx = Math.abs(nx - x);
    x = nx; y = ny;
    if (y === 0 || (dx <= 1e-15 * Math.max(1, Math.abs(x)) && good(x, y))) return { x, residual: y };
    if (dx <= 1e-15 * Math.max(1, Math.abs(x))) break;
  }
  if (good(x, y)) return { x, residual: y };
  // bracket search around x0
  const tryBracket = (a, b) => {
    const fa = f(a), fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
    if (fa === 0) return a; if (fb === 0) return b;
    if ((fa < 0) !== (fb < 0)) {
      const r = brent(f, a, b, fa, fb);
      const fr = f(r);
      // reject poles (sign change through infinity)
      if (Number.isFinite(fr) && Math.abs(fr) < 1e-6 * Math.max(1, Math.abs(fa), Math.abs(fb))) return r;
    }
    return null;
  };
  const scale = Math.max(1, Math.abs(x0));
  let prevS = 0;
  for (let s = 0.05 * scale; s < 1e8 * scale; s *= 1.3) {
    for (const dir of [1, -1]) {
      const a = x0 + dir * prevS, b = x0 + dir * s;
      const r = tryBracket(Math.min(a, b), Math.max(a, b));
      if (r !== null) return { x: r, residual: f(r) };
    }
    prevS = s;
  }
  throw new CalcError("Can't Solve", 'No solution was found near the initial value. Try a different starting value.');
}

// ---------------------------------------------------------------- polynomial roots
/** Roots of a real polynomial given coefficients highest-degree first. Returns [{re, im}]. */
export function polyRoots(coeffs) {
  let c = coeffs.slice();
  while (c.length && c[0] === 0) c.shift();
  const n = c.length - 1;
  if (n < 1) throw mathErr('The leading coefficient must not be zero');
  // remove zero roots
  const roots = [];
  while (c.length > 1 && c[c.length - 1] === 0) { roots.push({ re: 0, im: 0 }); c.pop(); }
  const m = c.length - 1;
  if (m === 0) return roots;
  const a = c.map((x) => x / c[0]);
  if (m === 1) { roots.push({ re: -a[1], im: 0 }); return roots; }
  if (m === 2) {
    const [, b, cc] = a, D = b * b - 4 * cc;
    if (D >= 0) {
      const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(D));
      const r1 = q, r2 = q !== 0 ? cc / q : 0;
      roots.push({ re: Math.max(r1, r2), im: 0 }, { re: Math.min(r1, r2), im: 0 });
    } else {
      const s = Math.sqrt(-D) / 2;
      roots.push({ re: -b / 2, im: s }, { re: -b / 2, im: -s });
    }
    return roots;
  }
  // Aberth–Ehrlich iteration on complex numbers
  const cm = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const cd = (x, y) => { const den = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / den, im: (x.im * y.re - x.re * y.im) / den }; };
  const evalP = (z) => { let p = { re: a[0], im: 0 }, dp = { re: 0, im: 0 }; for (let i = 1; i <= m; i++) { dp = { re: dp.re * z.re - dp.im * z.im + p.re, im: dp.re * z.im + dp.im * z.re + p.im }; p = cm(p, z); p.re += a[i]; } return [p, dp]; };
  const radius = 1 + Math.max(...a.slice(1).map(Math.abs));
  let z = Array.from({ length: m }, (_, k) => {
    const ang = (2 * Math.PI * k) / m + 0.4;
    return { re: radius * 0.6 * Math.cos(ang), im: radius * 0.6 * Math.sin(ang) };
  });
  for (let it = 0; it < 500; it++) {
    let maxStep = 0;
    for (let k = 0; k < m; k++) {
      const [p, dp] = evalP(z[k]);
      if (p.re === 0 && p.im === 0) continue;
      const ratio = cd(p, dp);
      let s = { re: 0, im: 0 };
      for (let j = 0; j < m; j++) if (j !== k) { const dz = { re: z[k].re - z[j].re, im: z[k].im - z[j].im }; const inv = cd({ re: 1, im: 0 }, dz); s.re += inv.re; s.im += inv.im; }
      const den = { re: 1 - (ratio.re * s.re - ratio.im * s.im), im: -(ratio.re * s.im + ratio.im * s.re) };
      const w = cd(ratio, den);
      z[k] = { re: z[k].re - w.re, im: z[k].im - w.im };
      maxStep = Math.max(maxStep, Math.hypot(w.re, w.im) / Math.max(1, Math.hypot(z[k].re, z[k].im)));
    }
    if (maxStep < 1e-16) break;
  }
  // Newton polish
  z = z.map((r) => { for (let i = 0; i < 5; i++) { const [p, dp] = evalP(r); if (dp.re === 0 && dp.im === 0) break; const w = cd(p, dp); r = { re: r.re - w.re, im: r.im - w.im }; } return r; });
  for (const r of z) {
    if (Math.abs(r.im) <= 1e-10 * Math.max(1, Math.abs(r.re))) r.im = 0;
    roots.push(r);
  }
  // order: real roots first (descending), then complex by real part, positive imaginary first
  roots.sort((p, q) => (p.im === 0) !== (q.im === 0) ? (p.im === 0 ? -1 : 1) : (p.im === 0 ? q.re - p.re : (q.re - p.re) || (q.im - p.im)));
  return roots;
}

/** Real cubic by trigonometric/Cardano method with Newton polish (more accurate than generic iteration). */
export function cubicRoots(a, b, c, d) {
  if (a === 0) throw mathErr('The leading coefficient must not be zero');
  const r = polyRoots([a, b, c, d]);
  const f = (x) => ((a * x + b) * x + c) * x + d;
  const df = (x) => (3 * a * x + 2 * b) * x + c;
  return r.map((z) => {
    if (z.im !== 0) return z;
    let x = z.re;
    for (let i = 0; i < 4; i++) { const dd = df(x); if (dd === 0) break; const nx = x - f(x) / dd; if (!Number.isFinite(nx)) break; x = nx; }
    return { re: x, im: 0 };
  });
}
