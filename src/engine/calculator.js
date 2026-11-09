// Calculator state machine. UI-independent: driven by key ids, exposes a view model.
import { Editor, C, T, isTemplate, rowToText, textToRow } from './editor.js';
import { parseRow, parseEquation, collectVars, astHas } from './parser.js';
import { evaluate, numFn, sub as vSub } from './evaluator.js';
import { evaluateBase, formatBase } from './basen.js';
import { CalcError, mathErr } from './errors.js';
import { Q, R, ZERO, toF, isQ, isReal, fromDecimal, round15, floatToQ, sAdd, sSub, sMul, sDiv, sNeg, bigAbs, bigGcd, toBigInt, isZero } from './num.js';
import * as LA from './linalg.js';
import { displayValue, realDisplay, fracDisplay, formatReal, DEFAULT_SETTINGS, plainValue, decimalDisplay } from './format.js';
import { KEYS, resolveAction } from './keys.js';
import { CONSTANTS, CONVERSIONS } from './constants.js';
import { STAT_TYPES, computeStats } from './stats.js';
import { solve as numSolve, polyRoots, cubicRoots, primeFactors } from './numeric.js';

export const MODES = [
  { id: 'COMP', label: 'COMP', desc: 'General calculations' },
  { id: 'CMPLX', label: 'CMPLX', desc: 'Complex numbers' },
  { id: 'STAT', label: 'STAT', desc: 'Statistics & regression' },
  { id: 'BASE', label: 'BASE-N', desc: 'Binary, octal, decimal, hex' },
  { id: 'EQN', label: 'EQN', desc: 'Equations & polynomials' },
  { id: 'MATRIX', label: 'MATRIX', desc: 'Matrix calculations' },
  { id: 'TABLE', label: 'TABLE', desc: 'Function tables' },
  { id: 'VECTOR', label: 'VECTOR', desc: 'Vector calculations' },
];

export const EQN_TYPES = [
  { id: 'lin2', label: 'aₙX+bₙY=cₙ', n: 2, kind: 'lin' },
  { id: 'lin3', label: 'aₙX+bₙY+cₙZ=dₙ', n: 3, kind: 'lin' },
  { id: 'lin4', label: '4 unknowns (X,Y,Z,T)', n: 4, kind: 'lin', enh: true },
  { id: 'quad', label: 'aX²+bX+c=0', n: 2, kind: 'poly' },
  { id: 'cubic', label: 'aX³+bX²+cX+d=0', n: 3, kind: 'poly' },
  { id: 'quart', label: 'aX⁴+…+e=0', n: 4, kind: 'poly', enh: true },
  { id: 'quint', label: 'aX⁵+…+f=0', n: 5, kind: 'poly', enh: true },
  { id: 'sext', label: 'aX⁶+…+g=0', n: 6, kind: 'poly', enh: true },
];

const VAR_KEYS = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', rp: 'X', sd: 'Y', mplus: 'M' };
const VARS = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
// Actions that continue from the previous answer ("Ans" is inserted automatically)
const CONTINUE = new Set(['char:+', 'char:−', 'char:×', 'char:÷', 'char:⁻¹', 'char:!', 'char:%', 'sq', 'cube', 'tpl:pow', 'char:nPr', 'char:nCr', 'char:÷R', 'char:·', 'char:and', 'char:or', 'char:xor', 'char:xnor', 'char:∠', 'char:x̂', 'char:ŷ', 'char:→t', 'char:▸r∠θ', 'char:▸a+bi', 'char:ᵈ', 'char:ʳ', 'char:ᵍ']);
const UNIT_POSTFIX = /^char:(cv:\d+)$/;

const LIN_VARS = ['X', 'Y', 'Z', 'T'];
const POLY_LETTERS = 'abcdefg';

// ---------------------------------------------------------------- value (de)serialisation
export function valueToJSON(v) {
  if (!v) return null;
  if (v.k === 'q') return { k: 'q', n: v.n.toString(), d: v.d.toString() };
  if (v.k === 'm') return { k: 'm', a: v.a.map((r) => r.map(valueToJSON)) };
  if (v.k === 'v') return { k: 'v', a: v.a.map(valueToJSON) };
  return { ...v };
}
export function valueFromJSON(j) {
  if (!j) return null;
  if (j.k === 'q') return Q(BigInt(j.n), BigInt(j.d));
  if (j.k === 'm') return LA.M(j.a.map((r) => r.map(valueFromJSON)));
  if (j.k === 'v') return LA.V(j.a.map(valueFromJSON));
  return { ...j };
}

function cell(value = null) { return { value, editor: null }; }

export class Calculator {
  constructor(saved) {
    this.settings = { ...DEFAULT_SETTINGS };
    this.vars = Object.fromEntries(VARS.map((v) => [v, ZERO]));
    this.ans = ZERO;
    this.mats = { MatA: null, MatB: null, MatC: null, MatAns: null };
    this.vecs = { VctA: null, VctB: null, VctC: null, VctAns: null };
    this.statData = { type: '1var', rows: [] };
    this.history = [];
    this.base = 'DEC';
    this.random = Math.random;
    this.tableDef = { f: [], g: [], start: Q(1n), end: Q(5n), step: Q(1n) };
    this.eqnCoef = {};
    this.mode = 'COMP';
    this.listeners = new Set();
    this.resetTransient();
    if (saved) this.load(saved);
    this.enterMode(this.mode, true);
  }

  resetTransient() {
    this.shift = false; this.alpha = false; this.hyp = false; this.stoPending = false; this.rclPending = false;
    this.editor = new Editor();
    this.result = null;     // {value, display, ast, kind}
    this.error = null;      // CalcError
    this.screen = 'calc';
    this.menu = null; this.prompt = null; this.grid = null; this.eqnResult = null; this.table = null;
    this.showing = false;   // result currently displayed (next key may start fresh / continue with Ans)
    this.dispOpts = { decimal: false, eng: null, dms: false, mixedToggle: false };
    this.replayIdx = -1;
    this.message = null;
    this.lastExplain = null;
    this.insertMode = true;
  }

  // ---------------------------------------------------------------- persistence
  save() {
    return {
      v: 1, settings: this.settings, mode: this.mode, base: this.base,
      vars: Object.fromEntries(Object.entries(this.vars).map(([k, v]) => [k, valueToJSON(v)])),
      ans: valueToJSON(this.ans),
      mats: Object.fromEntries(Object.entries(this.mats).map(([k, v]) => [k, valueToJSON(v)])),
      vecs: Object.fromEntries(Object.entries(this.vecs).map(([k, v]) => [k, valueToJSON(v)])),
      statData: { type: this.statData.type, rows: this.statData.rows },
      history: this.history.slice(-200),
      tableDef: { f: this.tableDef.f, g: this.tableDef.g, start: valueToJSON(this.tableDef.start), end: valueToJSON(this.tableDef.end), step: valueToJSON(this.tableDef.step) },
    };
  }
  load(s) {
    try {
      if (s.settings) this.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      if (s.mode && MODES.some((m) => m.id === s.mode)) this.mode = s.mode;
      if (s.base) this.base = s.base;
      if (s.vars) for (const k of VARS) if (s.vars[k]) this.vars[k] = valueFromJSON(s.vars[k]);
      if (s.ans) this.ans = valueFromJSON(s.ans);
      if (s.mats) for (const k of Object.keys(this.mats)) this.mats[k] = valueFromJSON(s.mats[k]);
      if (s.vecs) for (const k of Object.keys(this.vecs)) this.vecs[k] = valueFromJSON(s.vecs[k]);
      if (s.statData) this.statData = { type: s.statData.type || '1var', rows: (s.statData.rows || []).filter((r) => r && typeof r === 'object') };
      if (Array.isArray(s.history)) this.history = s.history;
      if (s.tableDef) this.tableDef = { f: s.tableDef.f || [], g: s.tableDef.g || [], start: valueFromJSON(s.tableDef.start) || Q(1n), end: valueFromJSON(s.tableDef.end) || Q(5n), step: valueFromJSON(s.tableDef.step) || Q(1n) };
    } catch (e) { /* corrupted state: keep defaults */ }
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  // ---------------------------------------------------------------- context
  ctx(extra = {}) {
    return {
      angle: this.settings.angle, vars: this.vars, ans: this.ans, mats: this.mats, vecs: this.vecs,
      complex: this.mode === 'CMPLX', random: this.random, top: true, deadline: Date.now() + 10000,
      getStats: () => this.getStats(), round: (v) => this.roundToDisplay(v), base: this.base, ...extra,
    };
  }
  getStats() {
    if (this.mode !== 'STAT') return null;
    const rows = this.statData.rows.map((r) => ({ x: r.x, y: r.y, f: this.settings.statFreq ? (r.f ?? 1) : 1 }));
    return computeStats(this.statData.type, rows, this.settings.statFreq);
  }
  roundToDisplay(v) {
    if (!isReal(v)) return v;
    const x = toF(v);
    const st = this.settings;
    let s;
    if (st.fmt === 'Fix') s = x.toFixed(st.digits);
    else if (st.fmt === 'Sci') s = x.toExponential(st.digits - 1);
    else s = x.toPrecision(10);
    return fromDecimal(s.replace('e', 'E').replace('E+', 'E')) || R(Number(s));
  }

  activeEditor() {
    if (this.screen === 'prompt') return this.prompt.fields[this.prompt.idx].editor;
    if (this.screen === 'grid') { const g = this.grid; const c = g.cells[g.r][g.c]; if (!c.editor) c.editor = new Editor(); return c.editor; }
    if (this.screen === 'calc' && this.mode === 'TABLE') return this.tableEditor();
    return this.editor;
  }
  tableEditor() { return this.tableFocus === 'g' ? this.tableG : this.tableF; }

  // ---------------------------------------------------------------- key handling
  press(key) {
    this.message = null;
    if (key === 'shift') { this.shift = !this.shift; this.alpha = false; return this.changed(); }
    if (key === 'alpha') { this.alpha = !this.alpha; this.shift = false; return this.changed(); }
    // STO / RCL waiting for a variable key
    if ((this.stoPending || this.rclPending) && !this.shift) {
      const v = VAR_KEYS[key];
      if (v && this.mode !== 'BASE' || (v && this.mode === 'BASE' && ['X', 'Y', 'M'].includes(v))) {
        const sto = this.stoPending;
        this.stoPending = this.rclPending = false; this.alpha = false;
        this.safe(() => (sto ? this.store(v) : this.recall(v)));
        return this.changed();
      }
      if (key !== 'shift' && key !== 'alpha') { this.stoPending = this.rclPending = false; }
    }
    const layer = this.shift ? 'shift' : this.alpha ? 'alpha' : 'main';
    let action = KEYS[key] ? resolveAction(key, layer, this.mode) : key;
    this.shift = false; this.alpha = false;
    if (!action) return this.changed();
    if (this.hyp && /^func:(sin|cos|tan)(⁻¹)?$/.test(action)) {
      const m = /^func:(sin|cos|tan)(⁻¹)?$/.exec(action);
      action = `func:${m[1]}h${m[2] || ''}`;
      this.hyp = false;
    } else if (action !== 'hyp') this.hyp = false;
    this.safe(() => this.dispatch(action));
    return this.changed();
  }
  /** Press a sequence of keys. */
  keys(...ks) { for (const k of ks.flat()) this.press(k); return this; }
  changed() { this.emit('change'); return this; }

  safe(fn) {
    try { fn(); } catch (e) {
      if (e instanceof CalcError) this.showError(e);
      else { console.error(e); this.showError(new CalcError('Math', e.message || String(e))); }
    }
  }
  showError(e) {
    this.error = e;
    this.prevScreen = this.screen;
    this.screen = 'error';
  }

  dispatch(a) {
    // ---- error screen: only AC, DEL and cursor keys
    if (this.screen === 'error') {
      if (a === 'ac') { this.error = null; this.screen = this.prevScreen === 'error' ? 'calc' : (this.prevScreen || 'calc'); if (this.screen === 'calc' && this.mode !== 'TABLE') { this.editor.clear(); this.showing = false; this.result = null; } if (this.screen === 'grid') this.cancelCellEdit(); return; }
      if (a === 'left' || a === 'right' || a === 'del') {
        const pos = this.error.pos;
        this.screen = this.prevScreen === 'error' ? 'calc' : (this.prevScreen || 'calc');
        this.error = null;
        if (this.screen === 'calc') { const ed = this.activeEditor(); if (pos !== null && pos !== undefined) ed.setCursor([], pos); else ed.end(); this.showing = false; this.result = null; }
        return;
      }
      if (a === 'mode' || a === 'setup') { this.error = null; this.screen = this.prevScreen || 'calc'; return this.dispatch(a); }
      return;
    }
    // ---- global actions
    switch (a) {
      case 'mode': return this.openModeMenu();
      case 'setup': return this.openSetupMenu();
      case 'clr': return this.openClrMenu();
      case 'help': this.emit('help'); return;
      default: break;
    }
    if (this.screen === 'menu') return this.menuKey(a);
    if (this.screen === 'confirm') {
      if (a === 'eq') { const fn = this.confirm.onYes; this.screen = 'calc'; this.confirm = null; fn(); }
      else if (a === 'ac') { this.screen = this.confirm.back || 'calc'; this.confirm = null; }
      return;
    }
    if (this.screen === 'eqnResult') return this.eqnResultKey(a);
    if (this.screen === 'table') return this.tableKey(a);
    if (this.screen === 'statResults') { if (['ac', 'eq', 'del'].includes(a)) this.screen = 'calc'; else if (a === 'up' || a === 'down') this.statScroll = Math.max(0, (this.statScroll || 0) + (a === 'up' ? -1 : 1)); return; }
    if (this.screen === 'info') { if (['ac', 'eq', 'del', 'left', 'right'].includes(a)) this.screen = 'calc'; return; }
    if (this.screen === 'prompt') return this.promptKey(a);
    if (this.screen === 'grid') return this.gridKey(a);
    return this.calcKey(a);
  }

  // ---------------------------------------------------------------- calc line
  calcKey(a) {
    const isTable = this.mode === 'TABLE';
    const ed = this.activeEditor();
    // after a result: decide whether to start fresh, continue with Ans, or edit
    if (this.showing && !isTable) {
      if (a === 'left' || a === 'right') {
        this.showing = false; this.result = null;
        if (a === 'right') this.editor.home(); else this.editor.end();
        return;
      }
      if (a === 'up' || a === 'down') return this.replay(a === 'up' ? 1 : -1);
      if (['sd', 'abcdc', 'eng', 'engL', 'dms', 'fact'].includes(a) && this.result) return this.resultToggle(a);
      if (a === 'eq' && this.result) { // repeat last calculation (with updated Ans); re-run SOLVE / CALC
        if (this.result.solve) return this.startSolve();
        if (this.result.calcRun) return this.startCalc();
        return this.evaluateMain(false);
      }
      if (a === 'approx' && this.result) { this.dispOpts.decimal = true; this.refreshResult(); return; }
      if (a === 'del') { this.showing = false; this.result = null; this.editor.end(); return; }
      if (a === 'ac') { this.editor.clear(); this.showing = false; this.result = null; return; }
      if (CONTINUE.has(a) || UNIT_POSTFIX.test(a)) {
        this.editor.clear();
        this.editor.insertChar('Ans');
        this.showing = false; this.result = null;
        this.edit(this.editor, a);
        return;
      }
      if (this.isInsertAction(a)) { this.editor.clear(); this.showing = false; this.result = null; this.edit(this.editor, a); return; }
    }
    switch (a) {
      case 'eq': return isTable ? this.tableStart() : this.evaluateMain(false);
      case 'approx': return isTable ? this.tableStart() : this.evaluateMain(true);
      case 'ac':
        ed.clear(); this.showing = false; this.result = null; this.stoPending = this.rclPending = false;
        if (isTable) this.tableFocus = 'f';
        return;
      case 'up': case 'down':
        if (ed.vertical(a === 'up' ? -1 : 1)) return;
        if (isTable && this.settings.tableG) { this.tableFocus = a === 'down' ? 'g' : 'f'; return; }
        if (ed.isEmpty() && !isTable) return this.replay(a === 'up' ? 1 : -1);
        return;
      case 'hyp': this.hyp = !this.hyp; return;
      case 'sto': this.stoPending = true; this.rclPending = false; return;
      case 'rcl': this.rclPending = true; this.stoPending = false; return;
      case 'mplus': case 'mminus': return this.memAdd(a === 'mplus' ? 1 : -1);
      case 'solve': return this.startSolve();
      case 'calc': return this.startCalc();
      case 'sd': case 'abcdc': case 'eng': case 'engL': case 'fact':
        if (ed.isEmpty() && this.result) return this.resultToggle(a);
        if (!ed.isEmpty()) { this.evaluateMain(false); if (this.result && a !== 'sd') this.resultToggle(a); else if (this.result && a === 'sd') this.resultToggle('sd'); }
        return;
      case 'dms':
        return this.edit(ed, 'char:°');
      case 'const': return this.openConstMenu();
      case 'conv': return this.openConvMenu();
      case 'drg': return this.openMenu('Angle unit', [['° (degrees)', () => this.insertAct('char:ᵈ')], ['ʳ (radians)', () => this.insertAct('char:ʳ')], ['ᵍ (gradians)', () => this.insertAct('char:ᵍ')]]);
      case 'catalog': return this.openCatalog();
      case 'statMenu': return this.openStatMenu();
      case 'statDistr': return this.openDistrMenu();
      case 'cmplxMenu': return this.openCmplxMenu();
      case 'baseMenu': return this.openBaseMenu();
      case 'matrixMenu': return this.openMatrixMenu();
      case 'vectorMenu': return this.openVectorMenu();
      default: break;
    }
    if (a.startsWith('base:')) { return this.setBase(a.slice(5)); }
    if (a.startsWith('var:')) return this.edit(ed, 'char:' + a.slice(4));
    this.edit(ed, a);
  }

  insertAct(a) { // used from menus
    if (this.showing && this.mode !== 'TABLE' && this.screen === 'calc') {
      this.editor.clear(); this.showing = false; this.result = null;
      if (CONTINUE.has(a) || UNIT_POSTFIX.test(a)) this.editor.insertChar('Ans');
    }
    this.edit(this.activeEditor(), a);
  }

  isInsertAction(a) {
    return /^(char|func|tpl|var):/.test(a) || ['sq', 'cube', 'dms'].includes(a);
  }

  /** Apply an editing action to an editor. */
  edit(ed, a) {
    const m = /^(\w+):(.*)$/.exec(a);
    if (m) {
      const [, kind, v] = m;
      if (kind === 'char') {
        if (v === '°' && ed.isEmpty()) throw new CalcError('Syntax', '°′″ needs a number before it');
        return ed.insertChar(v);
      }
      if (kind === 'func') return ed.insertFunc(v);
      if (kind === 'var') return ed.insertChar(v);
      if (kind === 'tpl') {
        const capture = (v === 'frac' || v === 'mixed') && this.settings.mathIO;
        if (!this.settings.mathIO) return this.linearTemplate(ed, v);
        return ed.insertTemplate(v, { capture });
      }
    }
    switch (a) {
      case 'sq': return this.settings.mathIO ? ed.insertTemplate('pow', { fill: { 0: [C('2')] }, after: true }) : ed.insertTemplate('pow', { fill: { 0: [C('2')] }, after: true });
      case 'cube': return ed.insertTemplate('pow', { fill: { 0: [C('3')] }, after: true });
      case 'dms': return ed.insertChar('°');
      case 'del': return ed.backspace();
      case 'left': return ed.left();
      case 'right': return ed.right();
      case 'home': return ed.home();
      case 'end': return ed.end();
      case 'up': case 'down': return ed.vertical(a === 'up' ? -1 : 1);
      default: return undefined;
    }
  }
  linearTemplate(ed, v) {
    // Linear display: templates are still structured (so evaluation is identical) but rendered linearly.
    ed.insertTemplate(v, { capture: v === 'frac' });
  }

  // ---------------------------------------------------------------- evaluation
  evaluateMain(decimal) {
    const row = this.editor.root;
    if (!row.length) { if (this.result) { this.showing = true; } return; }
    this.dispOpts = { decimal, eng: null, dms: false, mixedToggle: false };
    const { value, ast } = this.evalRow(row);
    this.commitResult(value, ast, row);
  }

  evalRow(row, ctxExtra = {}) {
    if (this.mode === 'BASE') {
      const ast = parseRow(row, { base: true });
      const n = evaluateBase(ast, this.ctx(ctxExtra));
      return { value: { k: 'base', n, base: this.base }, ast };
    }
    const hasEq = row.some((it) => it.t === 'c' && it.v === '=');
    if (hasEq) {
      // "Y = expression": evaluate RHS and assign
      const { lhs, rhs } = parseEquation(row);
      if (lhs.op !== 'atom' || !/^[A-FXYM]$/.test(lhs.name)) throw new CalcError('Syntax', '“=” is used with CALC (e.g. Y=2X+1) or SOLVE');
      const v = evaluate(rhs, this.ctx(ctxExtra));
      this.vars[lhs.name] = v;
      return { value: v, ast: rhs };
    }
    const ast = parseRow(row, {});
    const value = evaluate(ast, this.ctx(ctxExtra));
    return { value, ast };
  }

  commitResult(value, ast, row) {
    // update memories
    if (value.k === 'base') this.ans = Q(BigInt(value.n));
    else if (value.k === 'm') this.mats.MatAns = value;
    else if (value.k === 'v') this.vecs.VctAns = value;
    else if (value.k === 'multi') {
      for (const [k, v] of Object.entries(value.store || {})) this.vars[k] = v;
      this.ans = value.ans || value.items[0].v;
    } else this.ans = stripFmt(value);
    this.result = { value, ast };
    this.showing = true;
    this.refreshResult();
    this.addHistory(row, this.result.display, value);
  }

  displayOptions(ast) {
    const st = this.settings;
    const symbolic = st.mathIO && !this.dispOpts.decimal && !this.result?.numeric && symbolicAllowed(ast);
    return {
      exact: !this.dispOpts.decimal,
      symbolic,
      pi: symbolic && ast && (astHas(ast, (n) => n.op === 'atom' && n.name === 'π') || (st.angle === 'R' && astHas(ast, (n) => n.op === 'call' && /⁻¹$/.test(n.f) && !/h⁻¹$/.test(n.f)))),
      radicands: collectRadicands(ast),
      eng: this.dispOpts.eng,
      dms: this.dispOpts.dms,
      decimal: this.dispOpts.decimal,
    };
  }
  refreshResult() {
    if (!this.result) return;
    const st = this.dispOpts.mixedToggle ? { ...this.settings, fracFormat: this.settings.fracFormat === 'dc' ? 'abc' : 'dc' } : this.settings;
    const opts = this.displayOptions(this.result.ast);
    if (!this.settings.mathIO) { opts.symbolic = false; opts.pi = false; }
    if (this.result.fact) { this.result.display = this.result.fact; return; }
    this.result.display = displayValue(this.result.value, st, opts);
  }

  resultToggle(a) {
    const r = this.result; if (!r) return;
    const v = r.value;
    switch (a) {
      case 'sd': {
        if (r.fact) { r.fact = null; break; }
        const was = r.display;
        this.dispOpts.eng = null; this.dispOpts.dms = false;
        this.dispOpts.decimal = !this.dispOpts.decimal;
        this.refreshResult();
        // if nothing changed (already decimal & not representable), stay
        if (!this.dispOpts.decimal && was && r.display.text === was.text && isReal(v)) {
          // try converting the decimal to a fraction (Casio converts decimals to fractions with S⇔D)
          const q = v.k === 'r' ? floatToQ(v.v, 99999) : null;
          if (q && q.d !== 1n) r.display = fracDisplay(q.n, q.d, this.settings) || r.display;
        }
        break;
      }
      case 'abcdc': this.dispOpts.mixedToggle = !this.dispOpts.mixedToggle; this.dispOpts.decimal = false; break;
      case 'eng': if (!isReal(stripFmt(v))) return; this.dispOpts.eng = (this.dispOpts.eng ?? 1) - 1; this.dispOpts.dms = false; break;
      case 'engL': if (!isReal(stripFmt(v))) return; this.dispOpts.eng = (this.dispOpts.eng ?? -1) + 1; this.dispOpts.dms = false; break;
      case 'dms': if (!isReal(v)) return; this.dispOpts.dms = !this.dispOpts.dms; this.dispOpts.eng = null; break;
      case 'fact': {
        let n;
        try { n = toBigInt(v, 'FACT requires a positive integer'); } catch { throw mathErr('FACT (prime factorisation) requires a positive integer result'); }
        if (n <= 0n) throw mathErr('FACT (prime factorisation) requires a positive integer result');
        if (n === 1n) { r.fact = { type: 'fact', factors: [], text: '1' }; break; }
        const { factors, rest } = primeFactors(n);
        const parts = factors.map(([p, e]) => ({ p: p.toString(), e }));
        if (rest > 1n) parts.push({ p: `(${rest})`, e: 1 });
        r.fact = { type: 'fact', factors: parts, text: parts.map((x) => x.p + (x.e > 1 ? '^' + x.e : '')).join('×') };
        break;
      }
      default: break;
    }
    if (a !== 'fact' || !r.fact) this.refreshResult();
    else r.display = r.fact;
  }

  addHistory(row, display, value) {
    const entry = {
      mode: this.mode, expr: JSON.parse(JSON.stringify(row)), exprText: rowToText(row),
      resultText: display?.text ?? '', plain: plainValue(value), display: JSON.parse(JSON.stringify(display || {})),
      time: Date.now(), base: this.mode === 'BASE' ? this.base : undefined,
    };
    const last = this.history[this.history.length - 1];
    if (last && last.exprText === entry.exprText && last.resultText === entry.resultText && last.mode === entry.mode) last.time = entry.time;
    else this.history.push(entry);
    if (this.history.length > 500) this.history.splice(0, this.history.length - 500);
    this.replayIdx = -1;
    this.emit('history');
  }

  replay(dir) {
    const list = this.history.filter((h) => h.mode === this.mode);
    if (!list.length) return;
    let idx = this.replayIdx < 0 ? (dir > 0 ? 0 : -1) : this.replayIdx + dir;
    if (idx < 0) return;
    idx = Math.min(idx, list.length - 1);
    this.replayIdx = idx;
    const h = list[list.length - 1 - idx];
    this.editor.set(JSON.parse(JSON.stringify(h.expr)));
    try {
      const { value, ast } = this.evalRow(this.editor.root);
      this.result = { value, ast }; this.dispOpts = { decimal: false, eng: null, dms: false, mixedToggle: false };
      this.refreshResult(); this.showing = true;
    } catch { this.result = null; this.showing = false; }
  }

  /** Load an expression (from history panel or paste). */
  loadExpression(items, evaluateNow = false) {
    if (this.screen !== 'calc') { this.screen = 'calc'; }
    const ed = this.activeEditor();
    if (this.showing) { this.editor.clear(); this.showing = false; this.result = null; }
    if (evaluateNow) { ed.set(JSON.parse(JSON.stringify(items))); this.safe(() => this.evaluateMain(false)); }
    else { for (const it of JSON.parse(JSON.stringify(items))) ed.insert(it); }
    this.changed();
  }
  pasteText(text) {
    const base = this.mode === 'BASE';
    const items = textToRow(text.trim(), { base });
    if (!items.length) return;
    if (this.screen === 'grid' || this.screen === 'prompt') { const ed = this.activeEditor(); for (const it of items) ed.insert(it); return this.changed(); }
    this.loadExpression(items, false);
  }

  memAdd(sign) {
    let v;
    if (this.showing && this.result) v = stripFmt(this.result.value);
    else if (!this.editor.isEmpty()) { this.evaluateMain(false); v = this.result ? stripFmt(this.result.value) : null; }
    else v = this.ans;
    if (!v || (v.k !== 'q' && v.k !== 'r' && v.k !== 'c' && v.k !== 'base')) throw mathErr('M+ requires a number');
    if (v.k === 'base') v = Q(BigInt(v.n));
    this.vars.M = sign > 0 ? sAdd(this.vars.M, v) : sSub(this.vars.M, v);
    this.ans = v;
    this.message = sign > 0 ? 'M+' : 'M−';
  }
  store(name) {
    let v;
    if (this.showing && this.result) v = stripFmt(this.result.value);
    else if (!this.editor.isEmpty()) { this.evaluateMain(false); if (!this.result) return; v = stripFmt(this.result.value); }
    else v = this.ans;
    if (v.k === 'base') v = Q(BigInt(v.n));
    if (v.k === 'multi') v = v.items[0].v;
    if (!['q', 'r', 'c'].includes(v.k)) throw mathErr('Only numbers can be stored in variables');
    this.vars[name] = v;
    this.ans = v;
    const row = this.showing ? this.editor.root.slice() : [];
    this.editor.set([...(row.length ? row : [C('Ans')]), C('→'), C(name)]);
    this.result = { value: v, ast: null }; this.dispOpts = { decimal: false, eng: null, dms: false, mixedToggle: false };
    this.refreshResult(); this.showing = true;
    this.message = `Stored in ${name}`;
    this.emit('memory');
  }
  recall(name) {
    const v = this.vars[name];
    this.editor.set([C(name)]);
    this.result = { value: this.mode === 'BASE' ? { k: 'base', n: Math.trunc(toF(v)) | 0, base: this.base } : v, ast: null };
    this.dispOpts = { decimal: false, eng: null, dms: false, mixedToggle: false };
    this.refreshResult(); this.showing = true;
  }
  setBase(b) {
    this.base = b;
    if (this.showing && this.result && this.result.value.k === 'base') {
      this.result.value = { ...this.result.value, base: b };
      this.refreshResult();
    }
  }

  // ---------------------------------------------------------------- CALC & SOLVE
  startCalc() {
    const row = this.editor.root;
    if (!row.length) return;
    this.showing = false; this.result = null;
    const hasEq = row.some((it) => it.t === 'c' && it.v === '=');
    const { lhs, rhs } = hasEq ? parseEquation(row) : { lhs: parseRow(row, { base: this.mode === 'BASE' }), rhs: null };
    const vars = [...collectVars(rhs || lhs)];
    if (hasEq && lhs.op === 'atom') { /* Y=… : Y is assigned */ }
    if (!vars.length) return this.evaluateMain(false);
    this.openPrompt('CALC', vars, () => { this.evaluateMain(false); if (this.result) this.result.calcRun = true; });
  }
  startSolve() {
    const row = this.editor.root;
    if (!row.length) throw new CalcError('Syntax', 'Enter an equation first, e.g. X²−2=0 (ALPHA CALC types “=”)');
    if (this.mode !== 'COMP' && this.mode !== 'STAT') throw new CalcError('Syntax', 'SOLVE is available in COMP mode');
    this.showing = false; this.result = null;
    const { lhs, rhs } = parseEquation(row);
    const vars = [...new Set([...collectVars(lhs), ...(rhs ? collectVars(rhs) : [])])];
    const target = vars.includes('X') ? 'X' : vars[0];
    if (!target) throw new CalcError('Syntax', 'The equation must contain a variable (e.g. X) to solve for');
    const others = vars.filter((v) => v !== target);
    const order = [...others, target];
    this.openPrompt('SOLVE', order, () => {
      const ctx = this.ctx({ top: false });
      const f = (x) => {
        const c2 = { ...ctx, vars: { ...ctx.vars, [target]: R(x) } };
        const l = evaluate(lhs, c2), r = rhs ? evaluate(rhs, c2) : ZERO;
        return toF(vSub(l, r));
      };
      const x0 = toF(this.vars[target]);
      const { x, residual } = numSolve(f, x0);
      const xv = floatToQ(round15(x), 1000) && Math.abs(toF(floatToQ(round15(x), 1000)) - x) < 1e-12 * Math.max(1, Math.abs(x)) ? floatToQ(round15(x), 1000) : R(round15(x));
      this.vars[target] = xv;
      this.ans = xv;
      const value = { k: 'multi', items: [{ label: target, v: xv }, { label: 'L−R', v: R(Math.abs(residual) < 1e-13 * Math.max(1, Math.abs(x)) ? 0 : round15(residual)) }], solve: true };
      this.result = { value, ast: null, numeric: true, solve: true }; this.dispOpts = { decimal: false, eng: null, dms: false, mixedToggle: false };
      this.refreshResult(); this.showing = true;
      this.addHistory(row, this.result.display, value);
    });
  }

  openPrompt(title, names, onDone) {
    const fields = names.map((n) => ({ name: n, label: `${n}?`, editor: new Editor(), current: this.vars[n] }));
    this.prompt = { title, fields, idx: 0, onDone };
    this.screen = 'prompt';
  }
  promptKey(a) {
    const p = this.prompt, f = p.fields[p.idx];
    if (a === 'eq' || a === 'approx') {
      if (!f.editor.isEmpty()) {
        const isBase = this.mode === 'BASE';
        const ast = parseRow(f.editor.root, { base: isBase });
        const v = isBase ? Q(BigInt(evaluateBase(ast, this.ctx()))) : evaluate(ast, this.ctx());
        if (!isReal(v) && !(v.k === 'c' && this.mode === 'CMPLX')) throw mathErr('A number is required');
        if (p.setter) p.setter(f.name, v); else this.vars[f.name] = v;
        f.current = v;
      }
      if (p.idx < p.fields.length - 1) { p.idx++; return; }
      this.screen = p.back || 'calc';
      const done = p.onDone; this.prompt = null;
      return done();
    }
    if (a === 'ac') {
      if (!f.editor.isEmpty()) { f.editor.clear(); return; }
      this.screen = p.back || 'calc'; this.prompt = null; return;
    }
    if (a === 'up') { if (p.idx > 0) p.idx--; return; }
    if (a === 'down') { if (p.idx < p.fields.length - 1) p.idx++; return; }
    if (a.startsWith('var:')) return this.edit(f.editor, 'char:' + a.slice(4));
    if (this.isInsertAction(a) || ['del', 'left', 'right'].includes(a)) return this.edit(f.editor, a);
  }

  // ---------------------------------------------------------------- menus
  openMenu(title, items, opts = {}) {
    this.menu = { title, items: items.map(([label, fn, extra]) => ({ label, fn, ...(extra || {}) })), page: 0, perPage: opts.perPage || 8, back: opts.back || this.screen, sub: opts.sub, digitPrompt: opts.digitPrompt };
    if (this.screen !== 'menu') this.menuBack = this.screen;
    this.screen = 'menu';
  }
  closeMenu() {
    const back = this.menu?.back && this.menu.back !== 'menu' ? this.menu.back : 'calc';
    this.menu = null; this.screen = back;
  }
  menuSelect(i) {
    const m = this.menu; if (!m) return this.changed();
    const it = m.items[i];
    if (!it) return this.changed();
    this.safe(() => {
      this.closeMenu();
      it.fn();
    });
    return this.changed();
  }
  menuKey(a) {
    const m = this.menu;
    if (m.digitPrompt) { // e.g. "Fix 0~9?"
      const d = /^char:(\d)$/.exec(a);
      if (d) { this.closeMenu(); m.digitPrompt(parseInt(d[1], 10)); return; }
      if (a === 'ac' || a === 'del') this.closeMenu();
      return;
    }
    const pages = Math.ceil(m.items.length / m.perPage);
    const d = /^char:(\d)$/.exec(a);
    if (d) {
      let n = parseInt(d[1], 10);
      if (n === 0) n = 10;
      const idx = m.page * m.perPage + n - 1;
      if (n <= m.perPage && idx < m.items.length) { const it = m.items[idx]; this.closeMenu(); it.fn(); }
      return;
    }
    if (a === 'down' || a === 'right') { m.page = (m.page + 1) % pages; return; }
    if (a === 'up' || a === 'left') { m.page = (m.page - 1 + pages) % pages; return; }
    if (a === 'ac' || a === 'del') { this.closeMenu(); }
  }

  openModeMenu() {
    this.openMenu('MODE', MODES.map((m) => [m.label, () => this.enterMode(m.id)]), { back: 'calc' });
  }
  enterMode(id, initial = false) {
    const prev = this.mode;
    this.mode = id;
    if (!initial) {
      this.editor.clear();
    }
    this.showing = false; this.result = null; this.screen = 'calc'; this.grid = null; this.eqnResult = null; this.table = null; this.prompt = null;
    this.hyp = false;
    if (id === 'TABLE') {
      this.tableF = new Editor(JSON.parse(JSON.stringify(this.tableDef.f || [])));
      this.tableG = new Editor(JSON.parse(JSON.stringify(this.tableDef.g || [])));
      this.tableFocus = 'f';
    }
    if (initial) return;
    if (id === 'EQN') return this.openEqnTypeMenu();
    if (id === 'STAT') return this.openStatTypeMenu(true);
    void prev;
  }

  openSetupMenu() {
    const st = this.settings;
    const set = (k, v) => () => { st[k] = v; this.emit('settings'); this.refreshResult(); };
    this.openMenu('SETUP', [
      ['MthIO (Natural)', set('mathIO', true)],
      ['LineIO (Linear)', set('mathIO', false)],
      ['Deg', set('angle', 'D')],
      ['Rad', set('angle', 'R')],
      ['Gra', set('angle', 'G')],
      ['Fix', () => this.openMenu('Fix 0~9?', [], { digitPrompt: (n) => { st.fmt = 'Fix'; st.digits = n; this.emit('settings'); this.refreshResult(); } })],
      ['Sci', () => this.openMenu('Sci 0~9?', [], { digitPrompt: (n) => { st.fmt = 'Sci'; st.digits = n === 0 ? 10 : n; this.emit('settings'); this.refreshResult(); } })],
      ['Norm', () => this.openMenu('Norm 1~2?', [['Norm1', set('fmt', 'Norm1')], ['Norm2', set('fmt', 'Norm2')]])],
      ['ab/c (mixed)', set('fracFormat', 'abc')],
      ['d/c (improper)', set('fracFormat', 'dc')],
      ['CMPLX format', () => this.openMenu('CMPLX', [['a+bi', set('cmplx', 'rect')], ['r∠θ', set('cmplx', 'polar')]])],
      ['STAT frequency', () => this.openMenu('Frequency?', [['ON', set('statFreq', true)], ['OFF', set('statFreq', false)]])],
      ['TABLE g(x)', () => this.openMenu('f(x),g(x)?', [['f(x) only', set('tableG', false)], ['f(x),g(x)', set('tableG', true)]], {})],
      ['Eng. symbols', () => this.openMenu('Eng symbols', [['ON', set('engSymbols', true)], ['OFF', set('engSymbols', false)]])],
    ], { back: this.screen === 'menu' ? 'calc' : this.screen });
  }
  openClrMenu() {
    const confirm = (label, fn) => () => { this.confirm = { label, onYes: fn, back: 'calc' }; this.screen = 'confirm'; };
    this.openMenu('CLR', [
      ['Setup', confirm('Clear Setup?', () => { this.settings = { ...DEFAULT_SETTINGS }; this.emit('settings'); this.message = 'Setup cleared'; })],
      ['Memory', confirm('Clear Memory?', () => { for (const k of VARS) this.vars[k] = ZERO; this.ans = ZERO; this.emit('memory'); this.message = 'Memory cleared'; })],
      ['All', confirm('Reset All?', () => {
        this.settings = { ...DEFAULT_SETTINGS };
        for (const k of VARS) this.vars[k] = ZERO; this.ans = ZERO;
        for (const k of Object.keys(this.mats)) this.mats[k] = null;
        for (const k of Object.keys(this.vecs)) this.vecs[k] = null;
        this.statData = { type: '1var', rows: [] };
        this.tableDef = { f: [], g: [], start: Q(1n), end: Q(5n), step: Q(1n) };
        this.history = [];
        this.enterMode('COMP');
        this.emit('settings'); this.emit('memory'); this.emit('history');
        this.message = 'Reset all';
      })],
      ['History', confirm('Clear History?', () => { this.history = []; this.emit('history'); this.message = 'History cleared'; })],
    ]);
  }
  openConstMenu() {
    this.openMenu('CONST', CONSTANTS.map((c) => [`${c.sym}  ${c.name}`, () => this.insertAct(`char:k:${c.id}`), { sym: c.sym }]), { perPage: 8 });
  }
  openConvMenu() {
    this.openMenu('CONV', CONVERSIONS.map((c) => [c.label, () => this.insertAct(`char:cv:${c.id}`)]), { perPage: 8 });
  }
  openCatalog() {
    const ins = (a) => () => this.insertAct(a);
    const items = [
      ['GCD(a,b)', ins('func:GCD')], ['LCM(a,b)', ins('func:LCM')], ['÷R  remainder', ins('char:÷R')], ['FACT  prime factors', () => this.dispatch('fact')],
      ['Int(  integer part', ins('func:Int')], ['Intg(  greatest int ≤ x', ins('func:Intg')], ['Floor(', ins('func:Floor')], ['Ceil(', ins('func:Ceil')],
      ['Sign(', ins('func:Sign')], ['Frac(  fractional part', ins('func:Frac')], ['RanInt#(a,b)', ins('func:RanInt#')], ['Ran#', ins('char:Ran#')],
      ['Σ(  summation', ins('tpl:sum')], ['Π(  product', ins('tpl:prod')], ['∫  integral', ins('tpl:integ')], ['d/dx  derivative', ins('tpl:deriv')],
      ['logₐb', ins('tpl:logb')], ['ˣ√  n-th root', ins('tpl:root')], ['Abs(', ins('tpl:abs')], ['Rnd(', ins('func:Rnd')],
      ['Pol(x,y)', ins('func:Pol')], ['Rec(r,θ)', ins('func:Rec')], ['nPr', ins('char:nPr')], ['nCr', ins('char:nCr')],
    ];
    if (this.mode === 'MATRIX') items.unshift(['det(', ins('func:det')], ['Trn(', ins('func:Trn')], ['Rank(', ins('func:Rank')], ['Tr(  trace', ins('func:Tr')]);
    if (this.mode === 'VECTOR') items.unshift(['Dot ·', ins('char:·')], ['Angle(a,b)', ins('func:Angle')], ['UnitV(', ins('func:UnitV')], ['Abs(  magnitude', ins('tpl:abs')]);
    if (this.mode === 'CMPLX') items.unshift(['ReP(  real part', ins('func:ReP')], ['ImP(  imaginary part', ins('func:ImP')], ['arg(', ins('func:arg')], ['Conjg(', ins('func:Conjg')]);
    this.openMenu('FUNCTIONS', items, { perPage: 8 });
  }
  openStatMenu() {
    if (this.mode !== 'STAT') return this.openDistrMenu();
    const type = STAT_TYPES.find((t) => t.id === this.statData.type);
    const ins = (id) => () => this.insertAct(`char:st:${id}`);
    const items = [
      ['Type', () => this.openStatTypeMenu(false)],
      ['Data', () => this.openStatEditor()],
      ['Sum', () => this.openMenu('Sum', (type.two ? ['sumx2', 'sumx', 'sumy2', 'sumy', 'sumxy', 'sumx3', 'sumx2y', 'sumx4'] : ['sumx2', 'sumx']).map((id) => [labelOf(id), ins(id)]))],
      ['Var', () => this.openMenu('Var', (type.two ? ['n', 'xbar', 'sigx', 'sx', 'ybar', 'sigy', 'sy'] : ['n', 'xbar', 'sigx', 'sx']).map((id) => [labelOf(id), ins(id)]))],
    ];
    if (type.two) {
      const reg = [['A', ins('A')], ['B', ins('B')]];
      if (type.id === 'quad') reg.push(['C', ins('C')], ['x̂₁', () => this.insertAct('char:x̂₁')], ['x̂₂', () => this.insertAct('char:x̂₂')], ['ŷ', () => this.insertAct('char:ŷ')]);
      else reg.push(['r', ins('r')], ['x̂', () => this.insertAct('char:x̂')], ['ŷ', () => this.insertAct('char:ŷ')]);
      items.push(['Reg', () => this.openMenu('Reg', reg)]);
    } else items.push(['Distr', () => this.openDistrMenu()]);
    items.push(['MinMax', () => this.openMenu('MinMax', (type.two ? ['minX', 'maxX', 'minY', 'maxY'] : ['minX', 'maxX', 'med', 'Q1', 'Q3']).map((id) => [labelOf(id), ins(id)]))]);
    items.push(['Results ★', () => this.showStatResults()]);
    this.openMenu('STAT', items);
  }
  openDistrMenu() {
    this.openMenu('DISTR', [['P(', () => this.insertAct('func:P')], ['Q(', () => this.insertAct('func:Q')], ['R(', () => this.insertAct('func:R')], ['▸t', () => this.insertAct('char:→t')]]);
  }
  openCmplxMenu() {
    if (this.mode !== 'CMPLX') { this.message = 'CMPLX menu: switch to CMPLX mode (MODE 2)'; return; }
    this.openMenu('CMPLX', [['arg(', () => this.insertAct('func:arg')], ['Conjg(', () => this.insertAct('func:Conjg')], ['▸r∠θ', () => this.insertAct('char:▸r∠θ')], ['▸a+bi', () => this.insertAct('char:▸a+bi')], ['ReP(', () => this.insertAct('func:ReP')], ['ImP(', () => this.insertAct('func:ImP')]]);
  }
  openBaseMenu() {
    if (this.mode !== 'BASE') { this.message = 'BASE menu: switch to BASE-N mode (MODE 4)'; return; }
    const ins = (a) => () => this.insertAct(a);
    this.openMenu('LOGIC', [['and', ins('char:and')], ['or', ins('char:or')], ['xnor', ins('char:xnor')], ['xor', ins('char:xor')], ['Not(', ins('func:Not')], ['Neg(', ins('func:Neg')], ['d (decimal)', ins('char:bp:d')], ['h (hex)', ins('char:bp:h')], ['b (binary)', ins('char:bp:b')], ['o (octal)', ins('char:bp:o')]]);
  }

  // ---------------------------------------------------------------- generic grid editor
  openGrid(g) {
    g.r = g.r || 0; g.c = g.c || 0; g.scroll = 0;
    this.grid = g; this.screen = 'grid';
  }
  cancelCellEdit() { const g = this.grid; if (!g) return; const c = g.cells[g.r]?.[g.c]; if (c) c.editor = null; }
  commitCell() {
    const g = this.grid, c = g.cells[g.r][g.c];
    if (!c.editor || c.editor.isEmpty()) { c.editor = null; return false; }
    const ast = parseRow(c.editor.root, {});
    const v = evaluate(ast, this.ctx());
    if (!isReal(v)) throw mathErr('Cells must contain real numbers');
    c.value = v; c.editor = null;
    if (g.onCellChange) g.onCellChange(g.r, g.c, v);
    return true;
  }
  moveGrid(dr, dc) {
    const g = this.grid;
    let r = g.r + dr, c = g.c + dc;
    if (c >= g.cols) { c = 0; r++; }
    if (c < 0) { c = g.cols - 1; r--; }
    const maxR = g.growable ? Math.min(g.cells.length, g.maxRows - 1) : g.cells.length - 1;
    if (r < 0) r = 0;
    if (r > maxR) r = maxR;
    if (g.growable && r === g.cells.length) g.cells.push(Array.from({ length: g.cols }, () => cell(null)));
    g.r = r; g.c = c;
  }
  gridKey(a) {
    const g = this.grid, cur = g.cells[g.r][g.c];
    const editing = cur.editor && !cur.editor.isEmpty();
    switch (a) {
      case 'eq': case 'approx':
        if (editing) {
          this.commitCell();
          if (g.moveAfter === 'down') this.moveGrid(1, 0); else this.moveGrid(0, 1);
          return;
        }
        if (g.onSolve) { cur.editor = null; return g.onSolve(); }
        this.moveGrid(g.moveAfter === 'down' ? 1 : 0, g.moveAfter === 'down' ? 0 : 1);
        return;
      case 'ac':
        if (cur.editor && !cur.editor.isEmpty()) { cur.editor = null; return; }
        cur.editor = null;
        if (g.onExit) return g.onExit();
        this.screen = 'calc'; this.grid = null; return;
      case 'up': case 'down': case 'left': case 'right':
        if (editing && (a === 'left' || a === 'right')) return this.edit(cur.editor, a);
        if (editing) this.commitCell(); else cur.editor = null;
        if (a === 'up') this.moveGrid(-1, 0); else if (a === 'down') this.moveGrid(1, 0);
        else if (a === 'left') this.moveGrid(0, -1); else this.moveGrid(0, 1);
        return;
      case 'del':
        if (editing) return this.edit(cur.editor, 'del');
        if (g.growable && g.onDeleteRow) return g.onDeleteRow(g.r);
        return;
      default: break;
    }
    if (a.startsWith('var:')) a = 'char:' + a.slice(4);
    if (this.isInsertAction(a)) {
      if (!cur.editor) cur.editor = new Editor();
      this.edit(cur.editor, a);
    }
  }
  gridClick(r, c) {
    const g = this.grid; if (!g) return this.changed();
    this.safe(() => {
      const cur = g.cells[g.r][g.c];
      if (cur.editor && !cur.editor.isEmpty()) this.commitCell(); else cur.editor = null;
      if (r < g.cells.length) { g.r = r; g.c = Math.min(c, g.cols - 1); }
    });
    return this.changed();
  }

  // ---------------------------------------------------------------- EQN
  openEqnTypeMenu() {
    this.openMenu('EQN', EQN_TYPES.map((t) => [t.label + (t.enh ? ' ★' : ''), () => this.openEqnEditor(t.id)]), { back: 'calc' });
  }
  openEqnEditor(typeId) {
    const type = EQN_TYPES.find((t) => t.id === typeId);
    this.eqnType = type;
    const rows = type.kind === 'lin' ? type.n : 1, cols = type.kind === 'lin' ? type.n + 1 : type.n + 1;
    const saved = this.eqnCoef[typeId];
    const cells = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => cell(saved?.[i]?.[j] ? valueFromJSON(saved[i][j]) : ZERO)));
    const colLabels = type.kind === 'lin' ? [...'abcd'.slice(0, type.n), 'abcde'[type.n]] : POLY_LETTERS.slice(0, cols).split('');
    this.openGrid({
      kind: 'eqn', title: type.label, rows, cols, cells, colLabels, rowLabels: rows > 1 ? Array.from({ length: rows }, (_, i) => String(i + 1)) : null,
      onCellChange: () => { this.eqnCoef[typeId] = cells.map((r) => r.map((c) => valueToJSON(c.value))); },
      onSolve: () => this.solveEqn(),
      onExit: () => {}, // AC stays in the editor (as on the calculator)
    });
  }
  solveEqn() {
    const type = this.eqnType, g = this.grid;
    const coef = g.cells.map((r) => r.map((c) => c.value || ZERO));
    let res;
    if (type.kind === 'lin') res = solveLinear(coef, type.n);
    else res = solvePoly(coef[0], this.settings);
    this.eqnResult = { ...res, type, idx: 0 };
    this.lastExplain = res.steps || null;
    this.screen = 'eqnResult';
    this.emit('explain');
  }
  eqnResultKey(a) {
    const r = this.eqnResult;
    if (a === 'up') { r.idx = Math.max(0, r.idx - 1); return; }
    if (a === 'down') { r.idx = Math.min((r.items?.length || 1) - 1, r.idx + 1); return; }
    if (a === 'sd') { r.decimal = !r.decimal; return; }
    if (['ac', 'eq', 'del', 'left', 'right'].includes(a)) { this.screen = 'grid'; this.eqnResult = null; }
  }
  eqnItemsDisplay() {
    const r = this.eqnResult;
    if (!r) return null;
    if (r.message) return { message: r.message };
    return r.items.map((it) => ({ label: it.label, display: r.decimal || !this.settings.mathIO ? (it.decDisplay || it.display) : it.display, plain: it.plain, note: it.note }));
  }

  // ---------------------------------------------------------------- MATRIX / VECTOR
  openMatrixMenu() {
    if (this.mode !== 'MATRIX') { this.message = 'MATRIX menu: switch to MATRIX mode (MODE 6)'; return; }
    const names = ['MatA', 'MatB', 'MatC'];
    const pick = (fn) => () => this.openMenu('Matrix?', names.map((n) => [n, () => fn(n)]));
    this.openMenu('MATRIX', [
      ['Dim', pick((n) => this.openMenu(`${n}  rows?`, [1, 2, 3, 4].map((r) => [`${r} row${r > 1 ? 's' : ''}${r === 4 ? ' ★' : ''}`, () => this.openMenu(`${n}  columns?`, [1, 2, 3, 4].map((c) => [`${c} column${c > 1 ? 's' : ''}${c === 4 ? ' ★' : ''}`, () => { this.mats[n] = LA.zeroMatrix(r, c); this.openMatrixEditor(n); }]))])))],
      ['Data', pick((n) => { if (!this.mats[n]) throw mathErr(`${n} is not defined yet: use Dim first`); this.openMatrixEditor(n); })],
      ['MatA', () => this.insertAct('char:MatA')], ['MatB', () => this.insertAct('char:MatB')], ['MatC', () => this.insertAct('char:MatC')],
      ['MatAns', () => this.insertAct('char:MatAns')], ['det', () => this.insertAct('func:det')], ['Trn', () => this.insertAct('func:Trn')],
      ['Rank ★', () => this.insertAct('func:Rank')], ['Trace ★', () => this.insertAct('func:Tr')], ['Identity ★', () => this.openMenu('Identity size?', [1, 2, 3, 4].map((k) => [`${k}×${k} → MatAns`, () => { this.mats.MatAns = LA.identity(k); this.message = `Identity ${k}×${k} stored in MatAns`; }]))],
    ]);
  }
  openMatrixEditor(name) {
    const m = this.mats[name];
    const cells = m.a.map((row) => row.map((v) => cell(v)));
    this.openGrid({
      kind: 'matrix', title: `${name} (${m.r}×${m.c})`, name, rows: m.r, cols: m.c, cells,
      onCellChange: () => { this.mats[name] = LA.M(cells.map((r) => r.map((c) => c.value || ZERO))); this.emit('memory'); },
      onExit: () => { this.screen = 'calc'; this.grid = null; },
    });
  }
  openVectorMenu() {
    if (this.mode !== 'VECTOR') { this.message = 'VECTOR menu: switch to VECTOR mode (MODE 8)'; return; }
    const names = ['VctA', 'VctB', 'VctC'];
    const pick = (fn) => () => this.openMenu('Vector?', names.map((n) => [n, () => fn(n)]));
    this.openMenu('VECTOR', [
      ['Dim', pick((n) => this.openMenu(`${n}  dimension?`, [['2 (x, y)', () => { this.vecs[n] = LA.V([ZERO, ZERO]); this.openVectorEditor(n); }], ['3 (x, y, z)', () => { this.vecs[n] = LA.V([ZERO, ZERO, ZERO]); this.openVectorEditor(n); }]]))],
      ['Data', pick((n) => { if (!this.vecs[n]) throw mathErr(`${n} is not defined yet: use Dim first`); this.openVectorEditor(n); })],
      ['VctA', () => this.insertAct('char:VctA')], ['VctB', () => this.insertAct('char:VctB')], ['VctC', () => this.insertAct('char:VctC')],
      ['VctAns', () => this.insertAct('char:VctAns')], ['Dot', () => this.insertAct('char:·')],
      ['Angle( ★', () => this.insertAct('func:Angle')], ['UnitV( ★', () => this.insertAct('func:UnitV')],
    ]);
  }
  openVectorEditor(name) {
    const v = this.vecs[name];
    const cells = [v.a.map((x) => cell(x))];
    this.openGrid({
      kind: 'vector', title: `${name} (${v.a.length}D)`, name, rows: 1, cols: v.a.length, cells, colLabels: ['x', 'y', 'z'].slice(0, v.a.length),
      onCellChange: () => { this.vecs[name] = LA.V(cells[0].map((c) => c.value || ZERO)); this.emit('memory'); },
      onExit: () => { this.screen = 'calc'; this.grid = null; },
    });
  }

  // ---------------------------------------------------------------- STAT
  openStatTypeMenu(openEditorAfter) {
    this.openMenu('STAT type', STAT_TYPES.map((t) => [t.label, () => {
      const prevTwo = STAT_TYPES.find((x) => x.id === this.statData.type)?.two;
      this.statData.type = t.id;
      if (prevTwo !== t.two && !t.two) { /* keep x column */ }
      this.emit('memory');
      this.openStatEditor();
    }]), { back: 'calc' });
    void openEditorAfter;
  }
  openStatEditor() {
    const type = STAT_TYPES.find((t) => t.id === this.statData.type);
    const freq = this.settings.statFreq;
    const keys = ['x', ...(type.two ? ['y'] : []), ...(freq ? ['f'] : [])];
    const rows = this.statData.rows;
    const cells = rows.map((r) => keys.map((k) => cell(k === 'f' ? valueOfNum(r.f ?? 1) : valueOfNum(r[k]))));
    cells.push(keys.map(() => cell(null)));
    const sync = () => {
      const out = [];
      for (const rowCells of cells) {
        const o = {};
        keys.forEach((k, j) => { const v = rowCells[j].value; o[k] = v ? toF(v) : (k === 'f' ? 1 : NaN); });
        if (Number.isFinite(o.x) || (o.y !== undefined && Number.isFinite(o.y))) {
          out.push({ x: o.x, y: o.y, f: o.f ?? 1 });
        }
      }
      this.statData.rows = out;
      this.emit('memory');
    };
    this.openGrid({
      kind: 'stat', title: `STAT ${type.label}`, rows: cells.length, cols: keys.length, cells, growable: true, maxRows: 200,
      colLabels: keys.map((k) => ({ x: 'X', y: 'Y', f: 'FREQ' }[k])), moveAfter: 'down',
      onCellChange: (r, c, v) => {
        if (keys[c] === 'f' && (toF(v) < 0)) throw mathErr('Frequencies must be zero or positive');
        if (r === cells.length - 1) cells.push(keys.map(() => cell(null)));
        // a new row gets frequency 1 by default
        if (freq && cells[r][keys.indexOf('f')].value === null) cells[r][keys.indexOf('f')].value = Q(1n);
        sync();
      },
      onDeleteRow: (r) => { if (r < cells.length - 1) { cells.splice(r, 1); sync(); } this.grid.r = Math.min(this.grid.r, cells.length - 1); },
      onExit: () => { this.screen = 'calc'; this.grid = null; this.editor.clear(); },
    });
  }
  showStatResults() {
    const s = this.getStats();
    this.statResults = s;
    this.statScroll = 0;
    this.screen = 'statResults';
  }

  // ---------------------------------------------------------------- TABLE
  tableStart() {
    if (this.tableF.isEmpty()) throw new CalcError('Syntax', 'Enter a function f(X) first');
    parseRow(this.tableF.root, {}); // syntax check
    if (this.settings.tableG && !this.tableG.isEmpty()) parseRow(this.tableG.root, {});
    this.tableDef.f = this.tableF.toJSON();
    this.tableDef.g = this.tableG.toJSON();
    const t = this.tableDef;
    this.prompt = {
      title: 'TABLE', idx: 0,
      fields: [['start', 'Start?'], ['end', 'End?'], ['step', 'Step?']].map(([name, label]) => ({ name, label, editor: new Editor(), current: t[name] })),
      setter: (name, v) => { t[name] = v; },
      onDone: () => this.buildTable(),
    };
    this.screen = 'prompt';
  }
  buildTable() {
    const t = this.tableDef;
    const start = toF(t.start), end = toF(t.end), step = toF(t.step);
    if (step === 0 || (end - start) / step < 0) throw mathErr('Check Start, End and Step: the table would be empty or infinite');
    const count = Math.floor((end - start) / step + 1e-9) + 1;
    const max = this.settings.tableG && t.g.length ? Math.min(this.settings.tableMax, 199) : this.settings.tableMax;
    if (count > max) throw new CalcError('Range', `Too many rows (${count}). The maximum is ${max}`);
    const fAst = parseRow(t.f, {}), gAst = this.settings.tableG && t.g.length ? parseRow(t.g, {}) : null;
    const rows = [];
    const ctx = this.ctx({ top: false });
    for (let k = 0; k < count; k++) {
      const xq = sAdd(t.start, sMul(Q(BigInt(k)), t.step));
      const c2 = { ...ctx, vars: { ...ctx.vars, X: xq } };
      const ev = (ast) => { try { const v = evaluate(ast, c2); return { v, d: displayValue(v, this.settings, { exact: false }) }; } catch (e) { return { err: e.title || 'ERROR' }; } };
      rows.push({ x: xq, xd: displayValue(xq, this.settings, { exact: false }), f: ev(fAst), g: gAst ? ev(gAst) : null });
    }
    this.table = { rows, sel: 0, hasG: !!gAst, scroll: 0 };
    this.lastTable = this.table;
    this.screen = 'table';
    this.emit('table');
  }
  tableKey(a) {
    const t = this.table;
    if (a === 'up') { t.sel = Math.max(0, t.sel - 1); return; }
    if (a === 'down') { t.sel = Math.min(t.rows.length - 1, t.sel + 1); return; }
    if (a === 'ac') { this.screen = 'calc'; this.table = null; return; }
    if (a === 'eq') { this.tableStart(); }
  }

  // ---------------------------------------------------------------- view model
  view() {
    const st = this.settings;
    const ind = {
      S: this.shift, A: this.alpha, M: !isZero(this.vars.M), STO: this.stoPending, RCL: this.rclPending,
      angle: st.angle, mathIO: st.mathIO, fmt: st.fmt === 'Fix' ? 'FIX' : st.fmt === 'Sci' ? 'SCI' : null,
      hyp: this.hyp, mode: this.mode, base: this.mode === 'BASE' ? this.base : null,
      cmplx: this.mode === 'CMPLX', ins: !this.insertMode, disp: this.dispOpts.eng !== null ? 'ENG' : null,
    };
    const v = { ind, screen: this.screen, mode: this.mode, message: this.message, settings: st };
    switch (this.screen) {
      case 'calc':
        if (this.mode === 'TABLE') {
          v.table = { f: this.tableF.root, g: this.tableG.root, hasG: st.tableG, focus: this.tableFocus, cursor: cursorOf(this.tableEditor()) };
        }
        v.calc = { root: this.editor.root, cursor: this.showing ? null : cursorOf(this.editor), result: this.showing && this.result ? this.result.display : null, showing: this.showing };
        if (this.mode === 'BASE' && this.showing && this.result?.display?.type === 'base') v.calc.baseAll = this.result.display.all;
        break;
      case 'menu': {
        const m = this.menu;
        const pages = Math.max(1, Math.ceil(m.items.length / m.perPage));
        v.menu = { title: m.title, page: m.page, pages, digitPrompt: !!m.digitPrompt, items: m.items.slice(m.page * m.perPage, (m.page + 1) * m.perPage).map((it, i) => ({ n: i + 1, label: it.label, index: m.page * m.perPage + i })) };
        break;
      }
      case 'prompt': {
        const p = this.prompt;
        v.prompt = {
          title: p.title, idx: p.idx,
          fields: p.fields.map((f, i) => ({ label: f.label, root: f.editor.root, cursor: i === p.idx ? cursorOf(f.editor) : null, current: f.current ? displayValue(f.current, st, { exact: true }) : null })),
          expr: p.title === 'TABLE' ? null : this.editor.root,
        };
        break;
      }
      case 'grid': {
        const g = this.grid;
        v.grid = {
          kind: g.kind, title: g.title, r: g.r, c: g.c, rows: g.cells.length, cols: g.cols, colLabels: g.colLabels, rowLabels: g.rowLabels,
          cells: g.cells.map((row, i) => row.map((c, j) => ({
            text: c.value ? displayValue(c.value, { ...st, fmt: 'Norm1' }, { exact: true }).text : '',
            display: c.value ? displayValue(c.value, { ...st, fmt: 'Norm1' }, { exact: true }) : null,
            editing: !!(c.editor && !c.editor.isEmpty()) && i === g.r && j === g.c,
            root: c.editor ? c.editor.root : null, cursor: c.editor && i === g.r && j === g.c ? cursorOf(c.editor) : null,
          }))),
        };
        break;
      }
      case 'eqnResult': v.eqn = { type: this.eqnResult.type, idx: this.eqnResult.idx, items: this.eqnItemsDisplay(), message: this.eqnResult.message, extra: this.eqnResult.extra || null }; break;
      case 'table': v.tableView = this.table; break;
      case 'statResults': v.stats = { data: this.statResults, type: STAT_TYPES.find((t) => t.id === this.statData.type), scroll: this.statScroll || 0 }; break;
      case 'error': v.error = { title: this.error.title, detail: this.error.detail, kind: this.error.kind }; v.calc = { root: this.editor.root, cursor: null }; break;
      case 'confirm': v.confirm = { label: this.confirm.label }; break;
      default: break;
    }
    return v;
  }

  /** Several representations of the current result (for the result inspector). */
  inspect() {
    const r = this.result;
    if (!r || !this.showing) return null;
    const v = stripFmt(r.value);
    const st = this.settings;
    const out = [];
    if (isReal(v)) {
      const x = toF(v);
      const exact = displayValue(v, st, this.displayOptions(r.ast));
      out.push(['Exact', exact.text]);
      out.push(['Decimal', Number(x.toPrecision(15)).toString().replace('e+', '×10^').replace('e-', '×10^-')]);
      const sci = formatReal(x, { ...st, fmt: 'Sci', digits: 10 });
      out.push(['Scientific', `${sci.mant.replace(/\.?0+$/, '')}×10^${sci.exp}`]);
      const eng = formatReal(x, st, 0);
      out.push(['Engineering', `${eng.mant}×10^${eng.exp}`]);
      if (isQ(v) && v.d !== 1n) {
        const f = fracDisplay(v.n, v.d, { ...st, fracFormat: 'abc' }); if (f) out.push(['Mixed', f.text]);
      }
      if (isQ(v) && v.d === 1n && bigAbs(v.n) < 2n ** 31n) {
        const n = Number(v.n);
        out.push(['Hex', formatBase(n | 0, 'HEX').replace(/^0+(?=.)/, '')], ['Binary', formatBase(n | 0, 'BIN').replace(/ /g, '').replace(/^0+(?=.)/, '')]);
        if (v.n > 1n && v.n < 10n ** 15n) {
          const { factors } = primeFactors(v.n);
          out.push(['Prime factors', factors.map(([p, e]) => `${p}${e > 1 ? '^' + e : ''}`).join(' × ')]);
        }
      }
      if (Math.abs(x) < 1e7) out.push(['DMS', displayValue(v, st, { dms: true }).text]);
    } else out.push(['Value', displayValue(v, st, this.displayOptions(r.ast)).text]);
    out.push(['Plain', plainValue(v)]);
    return out;
  }
}

// ---------------------------------------------------------------- helpers
function cursorOf(ed) { return { path: ed.path.map((p) => ({ ...p })), pos: ed.pos }; }
function stripFmt(v) { if (v && v.fmt) { const { fmt, ...rest } = v; return rest; } return v; }
function labelOf(id) { const m = { n: 'n', xbar: 'x̄', sigx: 'σx', sx: 'sx', ybar: 'ȳ', sigy: 'σy', sy: 'sy', sumx: 'Σx', sumx2: 'Σx²', sumy: 'Σy', sumy2: 'Σy²', sumxy: 'Σxy', sumx3: 'Σx³', sumx2y: 'Σx²y', sumx4: 'Σx⁴', minX: 'minX', maxX: 'maxX', minY: 'minY', maxY: 'maxY', med: 'med', Q1: 'Q₁', Q3: 'Q₃' }; return m[id] || id; }
function valueOfNum(x) { if (x === undefined || x === null || Number.isNaN(x)) return null; return floatToQ(x, 100000) || R(x); }

const NON_SYMBOLIC_FUNCS = new Set(['ln', 'log', 'sinh', 'cosh', 'tanh', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹', 'P', 'Q', 'R', 'Rnd', 'RanInt#']);
export function symbolicAllowed(ast) {
  if (!ast) return true;
  return !astHas(ast, (n) =>
    n.op === 'integ' || n.op === 'deriv' ||
    (n.op === 'call' && NON_SYMBOLIC_FUNCS.has(n.f)) ||
    (n.op === 'atom' && (n.name === 'e' || n.name === 'Ran#' || n.name.startsWith('k:') || n.name.startsWith('st:'))) ||
    (n.op === 'post' && (n.o.startsWith('cv:') || n.o === 'x̂' || n.o === 'ŷ' || n.o === '→t')) ||
    (n.op === 'logb'));
}
function collectRadicands(ast) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.op === 'sqrt' && n.a.op === 'num') { const v = parseFloat(n.a.text); if (Number.isInteger(v)) out.push(sqFreePart(v)); }
    for (const k of Object.keys(n)) { const c = n[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c === 'object' && c.op) walk(c); }
  };
  walk(ast);
  return out.filter((x) => x > 1);
}
function sqFreePart(n) { let b = 1; for (let p = 2; p * p <= n; p++) { let c = 0; while (n % p === 0) { n /= p; c++; } if (c % 2) b *= p; } return b * n; }

// ---------------------------------------------------------------- equation solvers (EQN mode)
export function solveLinear(coef, n) {
  const A = LA.M(coef.map((r) => r.slice(0, n)));
  const b = coef.map((r) => r[n]);
  const det = LA.mDet(A);
  const steps = [`System of ${n} linear equations in ${LIN_VARS.slice(0, n).join(', ')}.`, `Coefficient determinant D = ${displayValue(det, DEFAULT_SETTINGS, { exact: true }).text}`];
  if (isZero(det) || Math.abs(toF(det)) < 1e-14) {
    const aug = LA.M(coef.map((r) => r.slice(0, n + 1)));
    const rA = LA.mRank(A), rAug = LA.mRank(aug);
    steps.push(`D = 0, rank(A) = ${rA}, rank(A|b) = ${rAug}`);
    return { message: rA < rAug ? 'No Solution' : 'Infinite Solution', steps };
  }
  const x = LA.mMul(LA.mInv(A), LA.M(b.map((v) => [v])));
  const items = x.a.map((row, i) => {
    const v = row[0];
    return { label: LIN_VARS[i], value: v, display: displayValue(v, DEFAULT_SETTINGS, { exact: true }), decDisplay: displayValue(v, DEFAULT_SETTINGS, { exact: false }), plain: plainValue(v) };
  });
  steps.push('By Cramer\'s rule each unknown = Dᵢ / D, where Dᵢ replaces column i with the constants.');
  items.forEach((it, i) => {
    const Ai = LA.M(coef.map((r) => r.slice(0, n).map((v, j) => (j === i ? r[n] : v))));
    steps.push(`D${LIN_VARS[i]} = ${displayValue(LA.mDet(Ai), DEFAULT_SETTINGS, { exact: true }).text}  ⇒  ${it.label} = ${it.display.text}`);
  });
  return { items, steps };
}

function qOf(v) { return isQ(v) ? v : floatToQ(toF(v), 100000); }
function surdOf(P, Qc, rad) {
  // value = P + Qc·√rad  (P, Qc exact rationals; rad positive squarefree integer > 1)
  const s = lcmBig(P.d, Qc.d);
  const p = P.n * (s / P.d), q = Qc.n * (s / Qc.d);
  const g = bigGcd(bigGcd(p, q), s);
  const pp = p / g, qq = q / g, ss = s / g;
  const qa = bigAbs(qq);
  const surd = `${qa === 1n ? '' : qa}√${rad}`;
  if (pp === 0n) {
    return { type: 'surd', neg: qq < 0n, p: null, q: qa === 1n ? '' : qa.toString(), b: rad.toString(), s: ss === 1n ? null : ss.toString(), text: `${qq < 0n ? '−' : ''}${surd}${ss === 1n ? '' : '/' + ss}` };
  }
  const num = `${pp.toString().replace('-', '−')}${qq < 0n ? '−' : '+'}${surd}`;
  return { type: 'surd', neg: false, p: pp.toString(), qneg: qq < 0n, q: qa === 1n ? '' : qa.toString(), b: rad.toString(), s: ss === 1n ? null : ss.toString(), text: ss === 1n ? num : `(${num})/${ss}` };
}
function lcmBig(a, b) { return a / bigGcd(a, b) * b; }
function sqFreeBig(n) { let a = 1n, b = 1n; for (let p = 2n; p * p <= n && p < 1000000n; p++) { let c = 0; while (n % p === 0n) { n /= p; c++; } if (c) { a *= p ** BigInt(Math.floor(c / 2)); if (c % 2) b *= p; } } return [a, b * n]; }

export function solvePoly(coefVals, st = DEFAULT_SETTINGS) {
  const deg = coefVals.length - 1;
  if (isZero(coefVals[0])) throw mathErr('The leading coefficient a must not be 0');
  const f = coefVals.map(toF);
  const steps = [];
  const items = [];
  const mk = (label, re, im, display) => {
    const val = im === 0 ? R(round15(re)) : { k: 'c', re: round15(re), im: round15(im) };
    const d = display || (im === 0 ? realDisplay(val, st, { exact: true, symbolic: true }) : displayValue(val, st, { exact: true, symbolic: true }));
    items.push({ label, value: val, display: d, decDisplay: displayValue(val, st, { exact: false }), plain: plainValue(val) });
  };
  const exactCoefs = coefVals.map(qOf);
  if (deg === 2 && exactCoefs.every(Boolean)) {
    const [a, b, c] = exactCoefs;
    const D = sSub(sMul(b, b), sMul(Q(4n), sMul(a, c)));
    const twoA = sMul(Q(2n), a);
    const P = sDiv(sNeg(b), twoA);
    steps.push(`Quadratic aX² + bX + c = 0 with a=${showQ(a)}, b=${showQ(b)}, c=${showQ(c)}`);
    steps.push(`Discriminant Δ = b² − 4ac = ${showQ(D)}`);
    steps.push('X = (−b ± √Δ) / 2a');
    // √D = √(Dn·Dd)/Dd
    const absD = D.n < 0n ? { k: 'q', n: -D.n, d: D.d } : D;
    const [sqA, sqB] = sqFreeBig(absD.n * absD.d);
    const Qc = D.n === 0n ? Q(0n) : sDiv(Q(sqA, absD.d), twoA); // √|D| / 2a = Qc·√sqB
    if (D.n >= 0n) {
      if (sqB === 1n || D.n === 0n) {
        const r1 = sAdd(P, Qc), r2 = sSub(P, Qc);
        const [hi, lo] = toF(r1) >= toF(r2) ? [r1, r2] : [r2, r1];
        for (const [lab, r] of [['X₁', hi], ['X₂', lo]]) items.push({ label: lab, value: r, display: displayValue(r, st, { exact: true }), decDisplay: displayValue(r, st, { exact: false }), plain: plainValue(r) });
      } else {
        const QcAbs = toF(Qc) < 0 ? sNeg(Qc) : Qc;
        const r1 = toF(P) + toF(QcAbs) * Math.sqrt(Number(sqB)), r2 = toF(P) - toF(QcAbs) * Math.sqrt(Number(sqB));
        mk('X₁', r1, 0, digitsOk(P, QcAbs) ? surdOf(P, QcAbs, sqB) : null);
        mk('X₂', r2, 0, digitsOk(P, QcAbs) ? surdOf(P, sNeg(QcAbs), sqB) : null);
      }
      if (D.n === 0n) steps.push('Δ = 0: one repeated real root');
    } else {
      steps.push('Δ < 0: two complex conjugate roots');
      const QcAbs = toF(Qc) < 0 ? sNeg(Qc) : Qc;
      const im = toF(QcAbs) * Math.sqrt(Number(sqB));
      const reD = realDisplay(P, st, { exact: true });
      const imD = sqB === 1n ? realDisplay(QcAbs, st, { exact: true }) : surdOf(Q(0n), QcAbs, sqB);
      const cd = (neg) => ({ type: 'complex', re: isZero(P) ? null : reD, im: imD, imNeg: neg, text: `${isZero(P) ? '' : reD.text}${neg ? '−' : '+'}${imD.text === '1' ? '' : imD.text}i` });
      mk('X₁', toF(P), im, digitsOk(P, QcAbs) ? cd(false) : null);
      mk('X₂', toF(P), -im, digitsOk(P, QcAbs) ? cd(true) : null);
    }
    // vertex (ES PLUS 2nd edition style extra information)
    const vy = sSub(c, sDiv(sMul(b, b), sMul(Q(4n), a)));
    const kind = toF(a) > 0 ? 'X-Value Minimum' : 'X-Value Maximum';
    const extra = [{ label: toF(a) > 0 ? 'Min (vertex) X' : 'Max (vertex) X', display: displayValue(P, st, { exact: true }) }, { label: toF(a) > 0 ? 'Min Y' : 'Max Y', display: displayValue(vy, st, { exact: true }) }];
    steps.push(`Vertex at X = −b/2a = ${showQ(P)}, Y = c − b²/4a = ${showQ(vy)} (${kind.includes('Min') ? 'minimum' : 'maximum'})`);
    return { items, steps, extra };
  }
  let roots;
  if (deg === 3) roots = cubicRoots(...f);
  else roots = polyRoots(f);
  steps.push(`Polynomial of degree ${deg}; roots found numerically (${deg === 3 ? 'cubic formula with Newton refinement' : 'Aberth–Ehrlich iteration with Newton polishing'}).`);
  roots.forEach((r, i) => mk(`X${subDigit(i + 1)}`, r.re, r.im));
  return { items, steps };
}
function digitsOk(P, Qc) { return P.n.toString().length < 9 && P.d.toString().length < 9 && Qc.n.toString().length < 9 && Qc.d.toString().length < 9; }
function showQ(v) { return displayValue(v, DEFAULT_SETTINGS, { exact: true }).text; }
function subDigit(n) { return String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join(''); }
export { textToRow, rowToText, decimalDisplay };
