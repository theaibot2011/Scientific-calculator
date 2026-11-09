// Engine & state machine tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator } from '../src/engine/calculator.js';
import { textToRow } from '../src/engine/editor.js';
import { KEYBOARD } from '../src/engine/keys.js';
import { toF } from '../src/engine/num.js';
import { plainValue } from '../src/engine/format.js';
import { convertUnit } from '../src/engine/units.js';

function fresh(mode = 'COMP', settings = {}) {
  const c = new Calculator();
  if (mode !== 'COMP') c.enterMode(mode);
  c.screen = 'calc'; c.menu = null;
  Object.assign(c.settings, settings);
  c.random = () => 0.5;
  return c;
}
/** Evaluate linear text; returns {text, value, error, c}. */
function ev(text, { mode = 'COMP', settings = {}, c = null, base = false } = {}) {
  c = c || fresh(mode, settings);
  if (c.screen !== 'calc') { c.screen = 'calc'; c.error = null; c.menu = null; }
  c.editor.set(textToRow(text, { base }));
  c.showing = false;
  c.press('eq');
  const v = c.view();
  if (v.screen === 'error') return { error: v.error.title, detail: v.error.detail, c };
  return { text: v.calc.result.text, value: c.result.value, c };
}
const T = (text, expected, opts) => {
  const r = ev(text, opts);
  assert.equal(r.error, undefined, `${text} → unexpected ${r.error}: ${r.detail}`);
  assert.equal(r.text, expected, `${text}`);
};
const N = (text, expected, opts, tol = 1e-9) => {
  const r = ev(text, opts);
  assert.equal(r.error, undefined, `${text} → unexpected ${r.error}: ${r.detail}`);
  const x = toF(r.value);
  assert.ok(Math.abs(x - expected) <= tol * Math.max(1, Math.abs(expected)), `${text}: got ${x}, expected ${expected}`);
};
const E = (text, kind, opts) => {
  const r = ev(text, opts);
  assert.equal(r.error, kind, `${text} should give ${kind} but gave ${r.text}`);
};

test('basic arithmetic and operator precedence', () => {
  T('2+3×4', '14'); T('(2+3)×4', '20'); T('10÷4', '5/2'); T('7−10', '−3');
  T('−2^2', '−4'); T('(−2)^2', '4'); T('2^(3^2)', '512'); T('((2+3)×(4−1))÷5', '3');
  T('2×3+4×5−6÷2', '23'); T('100−99−1', '0'); T('2÷4×8', '4');
  N('1÷2π', 1 / (2 * Math.PI)); // implicit multiplication binds tighter than ÷ (Casio rule)
  N('2π', 2 * Math.PI); T('3(4+1)', '15'); T('(1+1)(2+2)', '8');
  T('99999×99999', '9999800001');
  T('1.5+2.25', '15/4'); T('0.1+0.2', '3/10'); T('0.75', '3/4');
});

test('fractions, reciprocal, percent', () => {
  T('1/2+1/3', '5/6'); T('3/4×2/3', '1/2'); T('(1/2)/(3/4)', '2/3'); T('4⁻¹', '1/4'); T('(2/3)⁻¹', '3/2');
  T('50×20%', '10'); T('200×15%', '30');
  const c = fresh(); c.keys('1', 'shift', 'frac', '1', 'right', '2', 'right', 'add', '1', 'frac', '2', 'eq');
  assert.equal(c.view().calc.result.text, '2');
  // mixed format setting
  T('7/2', '3⌟1⌟2', { settings: { fracFormat: 'abc' } });
  // capture: typing 12 then fraction key puts 12 in the numerator
  const d = fresh(); d.keys('1', '2', 'frac', '5', 'eq'); assert.equal(d.view().calc.result.text, '12/5');
});

test('surds and roots', () => {
  T('√(12)', '2√3'); T('√(2)×√(8)', '4'); T('√(1/2)', '√2/2'); T('√(50)', '5√2'); T('(1+√(5))/2', '(1+√5)/2');
  T('√(2)+√(8)', '3√2'); T('∛(27)', '3'); T('root(4,16)', '2'); T('root(3,−27)', '−3'); T('∛(−8)', '−2');
  T('3^(1/2)', '√3'); T('8^(2/3)', '4'); T('(−8)^(1/3)', '−2');
  E('√(−4)', 'Math ERROR'); E('root(2,−16)', 'Math ERROR');
  T('√(0.25)', '1/2');
});

test('factorials, combinatorics, number functions', () => {
  T('5!', '120'); T('0!', '1'); T('20!', '2.432902008×10¹⁸'); E('(−1)!', 'Math ERROR'); E('171!', 'Math ERROR');
  N('0.5!', Math.sqrt(Math.PI) / 2); // Γ(1.5) enhancement
  T('10nCr3', '120'); T('10nPr3', '720'); T('52nCr5', '2598960'); E('3nCr5', 'Math ERROR');
  T('Abs(−3.5)', '7/2'); T('GCD(12,18)', '6'); T('LCM(4,6)', '12'); T('GCD(12,18,30)', '6');
  T('Int(−2.5)', '−2'); T('Intg(−2.5)', '−3'); T('Floor(2.7)', '2'); T('Ceil(2.1)', '3'); T('Sign(−5)', '−1'); T('Frac(3.75)', '3/4');
  T('17÷R5', 'Q=3, R=2'); E('17÷R0', 'Math ERROR');
  const c = fresh(); c.editor.set(textToRow('360')); c.press('eq'); c.press('shift'); c.press('dms');
  assert.equal(c.view().calc.result.text, '2^3×3^2×5');
  const r = fresh(); r.random = () => 0.1234; r.editor.set(textToRow('Ran#')); r.press('eq'); assert.equal(r.view().calc.result.text, '123/1000');
  r.editor.set(textToRow('RanInt#(1,6)')); r.showing = false; r.press('eq'); assert.equal(r.view().calc.result.text, '1');
});

test('trigonometry in all angle units', () => {
  T('sin(30)', '1/2'); T('cos(60)', '1/2'); T('tan(45)', '1'); T('sin(45)', '√2/2'); T('cos(30)', '√3/2');
  T('sin(−30)', '−1/2'); T('sin(390)', '1/2'); T('cos(90)', '0'); T('sin(180)', '0'); E('tan(90)', 'Math ERROR'); E('tan(270)', 'Math ERROR');
  N('sin(10)', Math.sin(10 * Math.PI / 180));
  const R = { settings: { angle: 'R' } }, G = { settings: { angle: 'G' } };
  T('sin(π/6)', '1/2', R); T('cos(π)', '−1', R); T('sin(π)', '0', R); N('sin(1)', Math.sin(1), R); E('tan(π/2)', 'Math ERROR', R);
  T('sin(100)', '1', G); T('cos(200)', '−1', G);
  T('sin⁻¹(1)', '90'); T('cos⁻¹(0.5)', '60'); T('tan⁻¹(1)', '45'); E('sin⁻¹(2)', 'Math ERROR');
  T('sin⁻¹(1)', 'π/2', R); T('tan⁻¹(1)', 'π/4', R); T('sin⁻¹(1)', '100', G);
  T('sin(30)^2+cos(30)^2', '1');
  // angle unit markers (DRG▸)
  T('πʳ', '180'); T('100ᵍ', '90'); N('90ᵈ', Math.PI / 2, R);
  // DMS input
  T('2°30°0°', '5/2');
});

test('hyperbolic, logarithmic and exponential functions', () => {
  N('sinh(1)', Math.sinh(1)); T('cosh(0)', '1'); N('tanh(0.5)', Math.tanh(0.5));
  N('sinh⁻¹(1)', Math.asinh(1)); N('cosh⁻¹(2)', Math.acosh(2)); N('tanh⁻¹(0.5)', Math.atanh(0.5)); E('cosh⁻¹(0.5)', 'Math ERROR');
  T('log(100)', '2'); T('log(0.001)', '−3'); T('ln(1)', '0'); N('ln(e^(2))', 2); T('log(2,32)', '5'); N('log(3,10)', Math.log(10) / Math.log(3));
  E('log(0)', 'Math ERROR'); E('ln(−1)', 'Math ERROR'); E('log(1,5)', 'Math ERROR');
  N('e^(1)', Math.E); T('10^(−2)', '1/100'); T('10^(3)', '1000'); N('e', Math.E); N('π', Math.PI);
  T('1.5E3', '1500'); T('2E−3', '1/500'); T('5E20', '5×10²⁰');
});

test('scientific / engineering notation and display formats', () => {
  T('1÷3', '1/3');
  const c = fresh(); c.editor.set(textToRow('1÷3')); c.press('eq'); c.press('sd');
  assert.equal(c.view().calc.result.text, '0.3333333333');
  c.press('sd'); assert.equal(c.view().calc.result.text, '1/3');
  const d = fresh(); d.editor.set(textToRow('2÷3')); d.press('eq'); d.press('sd'); assert.equal(d.view().calc.result.text, '0.6666666667');
  T('sin(10)', '0.174', { settings: { fmt: 'Fix', digits: 3 } });
  T('1÷3', '1⌟3'.replace('⌟', '/'), { settings: { fmt: 'Fix', digits: 3 } }); // fractions are not affected by Fix
  T('12345', '1.23×10⁴', { settings: { fmt: 'Sci', digits: 3 } });
  T('0.001×√(2)', '1.414213562×10⁻³');
  T('0.001×√(2)', '0.001414213562', { settings: { fmt: 'Norm2' } });
  T('2^100', '1.2676506×10³⁰');
  const e = fresh(); e.editor.set(textToRow('12345')); e.press('eq'); e.press('eng'); assert.equal(e.view().calc.result.text, '12.345×10³');
  e.press('eng'); assert.equal(e.view().calc.result.text, '12345×10⁰');
  e.press('engL'); e.press('engL'); assert.equal(e.view().calc.result.text, '0.012345×10⁶');
  T('4700', '4.7k', { settings: { engSymbols: true, mathIO: false } });
  E('1E300×1E9', 'Math ERROR');
  // DMS output
  const f = fresh(); f.editor.set(textToRow('2.5')); f.press('eq'); f.press('dms'); assert.equal(f.view().calc.result.text, '2°30′0″');
  // ≈ forces decimal
  const g = fresh(); g.editor.set(textToRow('√(2)')); g.keys('shift', 'eq'); assert.equal(g.view().calc.result.text, '1.414213562');
  // linear display shows decimals for surds but keeps fractions
  T('√(8)', '2.828427125', { settings: { mathIO: false } });
  T('1/2+1/3', '5/6', { settings: { mathIO: false } });
});

test('coordinate conversion', () => {
  T('Pol(1,1)', 'r=√2, θ=45'); T('Rec(2,60)', 'X=1, Y=√3');
  const r = ev('Pol(3,4)'); assert.equal(toF(r.c.vars.X), 5); assert.ok(Math.abs(toF(r.c.vars.Y) - 53.13010235415598) < 1e-9);
});

test('calculus: summation, product, derivative, integral', () => {
  T('Σ(X,1,100)', '5050'); T('Σ(X^2,1,10)', '385'); T('Σ(1/X,1,4)', '25/12'); T('Π(X,1,5)', '120');
  N('d/dx(X^3,2)', 12); N('d/dx(sin(X),0)', 1, { settings: { angle: 'R' } }); N('d/dx(ln(X),2)', 0.5);
  N('∫(X^2,0,3)', 9); N('∫(sin(X),0,π)', 2, { settings: { angle: 'R' } }); N('∫(1/X,1,e)', 1);
  N('∫(e^(−X^2),−5,5)', Math.sqrt(Math.PI)); N('∫(√(X),0,1)', 2 / 3, {}, 1e-7);
  N('∫(X,3,1)', -4);
  // integral results are shown as decimals (as on the calculator)
  T('∫(X^2,0,1)', '0.3333333333');
});

test('SOLVE and CALC', () => {
  const c = fresh();
  c.editor.set(textToRow('X^2−2=0')); c.keys('shift', 'calc'); c.press('1'); c.press('eq');
  assert.equal(c.view().calc.result.text, 'X=1.414213562, L−R=0');
  const d = fresh(); d.settings.angle = 'R';
  d.editor.set(textToRow('cos(X)=X')); d.keys('shift', 'calc', 'eq');
  assert.ok(Math.abs(toF(d.vars.X) - 0.7390851332151607) < 1e-10);
  const e = fresh(); e.editor.set(textToRow('X^3−X−1')); e.keys('shift', 'calc', 'eq');
  assert.ok(Math.abs(toF(e.vars.X) - 1.324717957244746) < 1e-10);
  const f = fresh(); f.editor.set(textToRow('X^2+1=0')); f.keys('shift', 'calc', 'eq');
  assert.equal(f.view().error?.title, "Can't Solve");
  // CALC prompts for each variable
  const g = fresh(); g.editor.set(textToRow('2X+Y')); g.press('calc'); g.keys('3', 'eq', '1', 'eq');
  assert.equal(g.view().calc.result.text, '7');
  // CALC again keeps previous values when = is pressed directly
  g.press('calc'); g.keys('eq', 'eq'); assert.equal(g.view().calc.result.text, '7');
  // assignment form Y = expression
  const h = fresh(); h.editor.set(textToRow('Y=X^2')); h.press('calc'); h.keys('4', 'eq'); assert.equal(toF(h.vars.Y), 16);
});

test('memory, Ans, STO/RCL, M+', () => {
  const c = fresh();
  c.keys('5', 'eq', 'mul', '2', 'eq'); assert.equal(c.view().calc.result.text, '10');
  c.keys('add', '1', 'eq'); assert.equal(c.view().calc.result.text, '11'); // Ans+1
  c.keys('1', '2', 'shift', 'rcl', 'neg'); assert.equal(toF(c.vars.A), 12);
  c.keys('ac', 'alpha', 'neg', 'mul', '2', 'eq'); assert.equal(c.view().calc.result.text, '24');
  c.keys('ac', 'rcl', 'neg'); assert.equal(c.view().calc.result.text, '12');
  c.keys('ac', '3', 'mplus', 'ac', '4', 'mplus', 'ac', '1', 'shift', 'mplus');
  assert.equal(toF(c.vars.M), 6);
  assert.equal(c.view().ind.M, true);
  c.keys('ac', 'alpha', 'mplus', 'eq'); assert.equal(c.view().calc.result.text, '6');
  // variables via ALPHA for X and Y
  c.keys('ac', '7', 'shift', 'rcl', 'rp', 'ac', 'alpha', 'rp', 'sq', 'eq'); assert.equal(c.view().calc.result.text, '49');
  // replay previous calculation
  c.keys('ac', 'up'); assert.equal(c.view().calc.result.text, '49');
  // CLR memory
  c.keys('shift', '9', '2', 'eq'); assert.equal(toF(c.vars.A), 0); assert.equal(toF(c.vars.M), 0);
  // serialise / restore
  c.keys('ac', '9', 'shift', 'rcl', 'tan');
  const d = new Calculator(JSON.parse(JSON.stringify(c.save())));
  assert.equal(toF(d.vars.F), 9);
});

test('complex numbers (CMPLX)', () => {
  const o = { mode: 'CMPLX' };
  T('(3+4i)(1−2i)', '11−2i', o); T('Abs(3+4i)', '5', o); T('arg(i)', '90', o); T('Conjg(2+3i)', '2−3i', o);
  T('(1+i)^2', '2i', o); T('1÷i', '−i', o); T('2∠60', '1+√3i', o); T('√(−4)', '2i', o); T('i^2', '−1', o);
  T('ReP(5−2i)', '5', o); T('ImP(5−2i)', '−2', o); T('(1+i)÷(1−i)', 'i', o);
  T('1+i▸r∠θ', '√2∠45', o);
  T('2+2i', '2√2∠45', { ...o, settings: { cmplx: 'polar' } });
  E('i', 'Math ERROR'); // not in COMP
  N('Abs(1+i)', Math.SQRT2, o);
});

test('matrices', () => {
  const c = fresh('MATRIX');
  c.keys('shift', '4', '1', '1', '2', '2'); // Dim MatA 2×2
  c.keys('1', 'eq', '2', 'eq', '3', 'eq', '4', 'eq', 'ac');
  assert.equal(c.mats.MatA.r, 2);
  T('det(MatA)', '−2', { c }); T('MatA⁻¹', '[[−2, 1], [3/2, −1/2]]', { c });
  T('MatA×MatA', '[[7, 10], [15, 22]]', { c }); T('Trn(MatA)', '[[1, 3], [2, 4]]', { c });
  T('MatA^2', '[[7, 10], [15, 22]]', { c }); T('2MatA', '[[2, 4], [6, 8]]', { c }); T('MatA−MatA', '[[0, 0], [0, 0]]', { c });
  T('MatAns+MatA', '[[1, 2], [3, 4]]', { c });
  T('Rank(MatA)', '2', { c }); T('Tr(MatA)', '5', { c });
  c.keys('shift', '4', '1', '2', '2', '3', '1', 'eq', '2', 'eq', '3', 'eq', '4', 'eq', '5', 'eq', '6', 'eq', 'ac'); // MatB 2×3
  T('MatA×MatB', '[[9, 12, 15], [19, 26, 33]]', { c });
  E('MatB×MatA', 'Dimension ERROR', { c }); E('det(MatB)', 'Dimension ERROR', { c }); E('MatA+MatB', 'Dimension ERROR', { c });
  c.keys('ac', 'shift', '4', '1', '3', '2', '2', '1', 'eq', '2', 'eq', '2', 'eq', '4', 'eq', 'ac'); // singular MatC
  E('MatC⁻¹', 'Math ERROR', { c }); T('det(MatC)', '0', { c });
  // 3×3 determinant
  c.keys('ac', 'shift', '4', '1', '3', '3', '3', '2', 'eq', '0', 'eq', '1', 'eq', '1', 'eq', '3', 'eq', '2', 'eq', '1', 'eq', '1', 'eq', '2', 'eq', 'ac');
  T('det(MatC)', '6', { c });
});

test('vectors', () => {
  const c = fresh('VECTOR');
  c.keys('shift', '5', '1', '1', '2', '1', 'eq', '2', 'eq', '3', 'eq', 'ac');
  c.keys('shift', '5', '1', '2', '2', '4', 'eq', '5', 'eq', '6', 'eq', 'ac');
  T('VctA·VctB', '32', { c }); T('VctA×VctB', '[−3, 6, −3]', { c }); T('Abs(VctA)', '√14', { c });
  T('VctA+VctB', '[5, 7, 9]', { c }); T('3VctA', '[3, 6, 9]', { c });
  N('Angle(VctA,VctB)', 12.933154491899135, { c });
  T('UnitV(VctB)×√(77)', '[4, 5, 6]', { c });
});

test('statistics and regression', () => {
  const c = fresh('STAT');
  c.statData = { type: '1var', rows: [1, 2, 3, 4].map((x) => ({ x })) };
  N('st:xbar', 2.5, { c }); N('st:sigx', 1.118033988749895, { c }); N('st:sx', 1.2909944487358056, { c });
  N('st:n', 4, { c }); N('st:sumx2', 30, { c }); N('st:med', 2.5, { c }); N('st:Q1', 1.5, { c }); N('st:Q3', 3.5, { c });
  // frequencies
  c.settings.statFreq = true; c.statData.rows = [{ x: 1, f: 3 }, { x: 5, f: 1 }]; N('st:xbar', 2, { c }); N('st:n', 4, { c }); c.settings.statFreq = false;
  // linear regression y = 2x + 1
  const pts = [1, 2, 3, 4, 5];
  const reg = (type, f) => { c.statData = { type, rows: pts.map((x) => ({ x, y: f(x) })) }; };
  reg('lin', (x) => 2 * x + 1); N('st:A', 1, { c }); N('st:B', 2, { c }); N('st:r', 1, { c }); N('10ŷ', 21, { c }); N('5x̂', 2, { c });
  reg('quad', (x) => x * x - 3); N('st:A', -3, { c }); N('st:B', 0, { c }, 1e-8); N('st:C', 1, { c }); N('6x̂₁', 3, { c }); N('6x̂₂', -3, { c });
  reg('exp', (x) => 3 * Math.exp(0.5 * x)); N('st:A', 3, { c }); N('st:B', 0.5, { c });
  reg('abexp', (x) => 2 * 3 ** x); N('st:A', 2, { c }); N('st:B', 3, { c });
  reg('pow', (x) => 2 * x ** 3); N('st:A', 2, { c }); N('st:B', 3, { c });
  reg('log', (x) => 1 + 2 * Math.log(x)); N('st:A', 1, { c }); N('st:B', 2, { c });
  reg('inv', (x) => 1 + 2 / x); N('st:A', 1, { c }); N('st:B', 2, { c });
  // real-world noisy data checked against a reference least-squares fit
  c.statData = { type: 'lin', rows: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]].map(([x, y]) => ({ x, y })) };
  N('st:B', 1.99, { c }); N('st:A', 0.05, { c }, 1e-8); N('st:r', 0.9986517555689657, { c }, 1e-8);
  // normal distribution
  N('P(0)', 0.5); N('R(1.96)', 0.024997895148220435); N('Q(1)', 0.341344746068543); N('P(−1)', 0.15865525393145707);
  // STAT editor via keys
  const d = fresh(); d.keys('mode', '3', '2'); // A+BX
  d.keys('1', 'eq', '2', 'eq', '3', 'eq', 'right', 'up', 'up', 'up', '3', 'eq', '5', 'eq', '7', 'eq', 'ac');
  T('st:B', '2', { c: d }); T('st:A', '1', { c: d });
  E('st:xbar', 'Math ERROR'); // no STAT data outside STAT mode
});

test('equations (EQN)', () => {
  const solve = (typeKey, coefs) => {
    const c = fresh(); c.keys('mode', '5', typeKey);
    for (const v of coefs) { for (const k of String(v)) c.press(k === '-' ? 'neg' : k === '.' ? 'dot' : k); c.press('eq'); }
    c.press('eq');
    const v = c.view();
    if (v.eqn.message) return v.eqn.message;
    return v.eqn.items.map((i) => `${i.label}=${i.display.text}`).join('; ');
  };
  assert.equal(solve('1', [2, 3, 8, 1, -1, -1]), 'X=1; Y=2');
  assert.equal(solve('2', [1, 1, 1, 6, 0, 2, 5, -4, 2, 5, -1, 27]), 'X=5; Y=3; Z=−2');
  assert.equal(solve('3', [1, 1, 1, 1, 10, 1, -1, 1, -1, -2, 1, 2, 3, 4, 30, 2, 0, 1, 0, 5]), 'X=1; Y=2; Z=3; T=4');
  assert.equal(solve('1', [1, 1, 1, 2, 2, 2]), 'Infinite Solution');
  assert.equal(solve('1', [1, 1, 1, 1, 1, 2]), 'No Solution');
  assert.equal(solve('4', [1, -3, 2]), 'X₁=2; X₂=1');
  assert.equal(solve('4', [1, 1, 1]), 'X₁=−1/2+√3/2i; X₂=−1/2−√3/2i');
  assert.equal(solve('4', [1, 0, -2]), 'X₁=√2; X₂=−√2');
  assert.equal(solve('4', [1, -1, -1]), 'X₁=(1+√5)/2; X₂=(1−√5)/2');
  assert.equal(solve('4', [1, -4, 4]), 'X₁=2; X₂=2');
  assert.equal(solve('5', [1, -6, 11, -6]), 'X₁=3; X₂=2; X₃=1');
  assert.equal(solve('5', [1, 0, 0, -1]), 'X₁=1; X₂=−1/2+√3/2i; X₃=−1/2−√3/2i');
  assert.equal(solve('6', [1, 0, -10, 0, 9]), 'X₁=3; X₂=1; X₃=−1; X₄=−3');
  assert.equal(solve('7', [1, -15, 85, -225, 274, -120]), 'X₁=5; X₂=4; X₃=3; X₄=2; X₅=1');
  // quadratic with leading coefficient 0 is rejected
  const c = fresh(); c.keys('mode', '5', '4', 'eq', 'eq', 'eq', 'eq'); assert.equal(c.view().error?.title, 'Math ERROR');
});

test('BASE-N', () => {
  const c = fresh('BASE');
  c.press('inv'); // HEX
  c.editor.set(textToRow('FF+1', { base: true })); c.press('eq');
  assert.equal(c.view().calc.result.text, '00000100');
  assert.equal(c.view().calc.baseAll.DEC, '256');
  c.press('sq'); assert.equal(c.view().calc.result.text, '256'); // DEC
  c.press('log'); // BIN
  c.editor.set(textToRow('1010 and 1100', { base: true })); c.showing = false; c.press('eq');
  assert.equal(c.view().calc.result.text.replace(/ /g, '').replace(/^0+/, ''), '1000');
  c.press('sq');
  for (const [t, exp] of [['Not(0)', '−1'], ['7÷2', '3'], ['Neg(5)', '−5'], ['12 xor 10', '6'], ['12 or 3', '15'], ['bp:h FF+bp:b 1', '256']]) {
    c.editor.set(textToRow(t, { base: true })); c.showing = false; c.press('eq');
    assert.equal(c.view().calc.result.text, exp, t);
  }
  c.editor.set(textToRow('2147483647+1', { base: true })); c.showing = false; c.press('eq');
  assert.equal(c.view().error.title, 'Math ERROR');
  c.press('ac'); c.press('inv');
  c.editor.set(textToRow('Not(0)', { base: true })); c.showing = false; c.press('eq');
  assert.equal(c.view().calc.result.text, 'FFFFFFFF');
  // BASE keys type hexadecimal digits
  const d = fresh('BASE'); d.press('inv'); d.keys('neg', 'dms', 'add', '1', 'eq'); assert.equal(d.view().calc.result.text, '000000AC');
});

test('TABLE mode', () => {
  const c = fresh('TABLE');
  c.keys('alpha', 'rp', 'sq', 'add', '1', 'eq'); // f(X) = X²+1
  c.keys('1', 'eq', '5', 'eq', '1', 'eq');
  const t = c.view().tableView;
  assert.equal(t.rows.length, 5);
  assert.deepEqual(t.rows.map((r) => r.f.d.text), ['2', '5', '10', '17', '26']);
  c.press('ac'); c.settings.tableG = true; c.keys('down', 'alpha', 'rp', 'mul', '2', 'eq', 'eq', 'eq', 'eq');
  assert.deepEqual(c.view().tableView.rows.map((r) => r.g.d.text), ['2', '4', '6', '8', '10']);
  // errors in single cells do not abort the table
  const d = fresh('TABLE'); d.keys('1', 'frac', 'alpha', 'rp', 'eq', 'neg', '1', 'eq', '1', 'eq', '1', 'eq');
  assert.equal(d.view().tableView.rows[1].f.err, 'Math ERROR');
});

test('syntax, math, stack and domain errors', () => {
  E('1+', 'Syntax ERROR'); E(')(', 'Syntax ERROR'); E('×2', 'Syntax ERROR'); E('2..3', 'Syntax ERROR'); E('sin()', 'Syntax ERROR');
  E('1÷0', 'Math ERROR'); E('0^0', 'Math ERROR'); E('0^(−1)', 'Math ERROR'); E('5÷(2−2)', 'Math ERROR');
  E('('.repeat(60) + '1', 'Stack ERROR');
  T('((((((1+1))))))', '2'); T('(1+2', '3'); T('sin(30', '1/2');
  const c = fresh(); c.editor.set(textToRow('1÷0')); c.press('eq'); c.press('left');
  assert.equal(c.view().screen, 'calc'); assert.equal(c.editor.toText(), '1÷0');
});

test('constants, conversions, unit converter', () => {
  T('k:c0', '299792458'); N('k:G', 6.6743e-11); N('k:NA×k:kB', 8.31446261815324);
  T('1cv:1', '127/50'); T('100cv:38', '212'); T('212cv:37', '100'); N('1cv:29', 0.7456998715822702);
  assert.ok(Math.abs(convertUnit('Length', 1, 'mi', 'km') - 1.609344) < 1e-12);
  assert.ok(Math.abs(convertUnit('Temperature', 100, '°C', '°F') - 212) < 1e-9);
  assert.ok(Math.abs(convertUnit('Temperature', 0, 'K', '°C') + 273.15) < 1e-9);
  assert.ok(Math.abs(convertUnit('Data', 1, 'GiB', 'MB') - 1073.741824) < 1e-9);
});

test('keyboard input matches keypad input', () => {
  const typeKeys = (str) => {
    const c = fresh();
    for (const ch of str) { const m = KEYBOARD[ch]; if (Array.isArray(m)) c.keys(...m); else c.press(m); }
    c.press(KEYBOARD.Enter);
    return c.view().calc.result.text;
  };
  const pad = (...ks) => { const c = fresh(); c.keys(...ks, 'eq'); return c.view().calc.result.text; };
  assert.equal(typeKeys('2*(3+4)'), pad('2', 'mul', 'lp', '3', 'add', '4', 'rp'));
  assert.equal(typeKeys('2*(3+4)'), '14');
  assert.equal(typeKeys('10/4'), '5/2');
  assert.equal(typeKeys('r2'), pad('sqrt', '2'));
  assert.equal(typeKeys('s30)'), '1/2');
  assert.equal(typeKeys('2^10'), '1024');
  assert.equal(typeKeys('5!'), '120');
  assert.equal(typeKeys('l1)'), '0');
  assert.equal(typeKeys('n3+5'), '2');
  assert.equal(typeKeys('1E3'), '1000');
  assert.equal(typeKeys('50*20%'), '10');
});

test('paste of linear text', () => {
  const c = fresh();
  c.pasteText('sqrt(2)/2+sin(30)'); c.press('eq');
  assert.equal(c.view().calc.result.text, '(1+√2)/2');
  c.pasteText('2*pi'); c.press('eq'); assert.ok(Math.abs(toF(c.result.value) - 2 * Math.PI) < 1e-12);
  c.pasteText('3.5E-2'); c.press('eq'); assert.equal(c.view().calc.result.text, '7/200');
});

test('mode switching keeps memory and settings', () => {
  const c = fresh();
  c.keys('5', 'shift', 'rcl', 'neg');
  c.keys('mode', '2'); assert.equal(c.mode, 'CMPLX');
  c.keys('alpha', 'neg', 'add', 'eng', 'eq'); assert.equal(c.view().calc.result.text, '5+i');
  c.keys('shift', 'mode', '4'); assert.equal(c.settings.angle, 'R');
  c.keys('mode', '1'); assert.equal(c.mode, 'COMP'); assert.equal(c.settings.angle, 'R');
  c.keys('shift', 'mode', '6', '3'); assert.equal(c.settings.fmt, 'Fix'); assert.equal(c.settings.digits, 3);
  c.keys('shift', 'mode', '8', '1'); assert.equal(c.settings.fmt, 'Norm1');
  c.keys('shift', 'mode', '2'); assert.equal(c.settings.mathIO, false);
  assert.equal(plainValue(c.vars.A), '5');
});
