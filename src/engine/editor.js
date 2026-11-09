// Structured expression editor (the model behind Natural Display input).
//
// An expression is a row: an array of items.
//   {t:'c', v:'7'}            a single token (digit, operator, variable, constant ...)
//   {t:'f', v:'sin'}          a function name with its opening bracket  -> renders "sin("
//   {t:<template>, s:[row..]} a 2-D template with editable slots (fraction, root, power ...)
// The cursor is a path of {i, s} steps (item index + slot index) from the root plus a position.

export const SLOTS = {
  frac: 2, mixed: 3, sqrt: 1, cbrt: 1, root: 2, pow: 1, pow10: 1, exp: 1,
  logb: 2, abs: 1, integ: 3, deriv: 2, sum: 3, prod: 3,
};
// pairs of slot indices for ▲ / ▼ movement: [upperSlot, lowerSlot]
const VERTICAL = { frac: [0, 1], mixed: [1, 2], integ: [2, 1], sum: [2, 1], prod: [2, 1] };

export const isTemplate = (it) => it && SLOTS[it.t] !== undefined;
export const C = (v) => ({ t: 'c', v });
export const F = (v) => ({ t: 'f', v });
export const T = (t, slots) => ({ t, s: slots || Array.from({ length: SLOTS[t] }, () => []) });

const DIGITISH = /^[0-9.ᴇ]$/;

export class Editor {
  constructor(root = []) { this.root = root; this.path = []; this.pos = root.length; }

  static fromJSON(json) { const e = new Editor(JSON.parse(JSON.stringify(json))); return e; }
  toJSON() { return JSON.parse(JSON.stringify(this.root)); }
  clone() { const e = Editor.fromJSON(this.root); e.path = this.path.map((p) => ({ ...p })); e.pos = this.pos; return e; }

  clear() { this.root = []; this.path = []; this.pos = 0; }
  isEmpty() { return this.root.length === 0; }
  set(rowItems) { this.root = rowItems; this.path = []; this.pos = rowItems.length; }

  rowAt(path) {
    let row = this.root;
    for (const p of path) row = row[p.i].s[p.s];
    return row;
  }
  row() { return this.rowAt(this.path); }
  parentItem() {
    if (!this.path.length) return null;
    const pp = this.path.slice(0, -1);
    return this.rowAt(pp)[this.path[this.path.length - 1].i];
  }

  // ---------------------------------------------------------------- insertion
  insert(item) {
    const row = this.row();
    row.splice(this.pos, 0, item);
    this.pos++;
  }
  insertChar(v) { this.insert(C(v)); }
  insertFunc(v) { this.insert(F(v)); }

  /**
   * Insert a template. Options:
   *   capture: move the operand immediately left of the cursor into slot 0 (e.g. "12" then ▭/▭)
   *   fill:    initial contents per slot, e.g. {0: [C('2')]} for x²
   *   after:   leave the cursor after the template instead of inside it
   *   slot:    slot index to put the cursor in (default: first empty slot)
   */
  insertTemplate(type, opts = {}) {
    const tpl = T(type);
    const row = this.row();
    if (opts.fill) for (const [k, v] of Object.entries(opts.fill)) tpl.s[k] = v;
    let at = this.pos;
    if (opts.capture) {
      const start = operandStart(row, at);
      if (start < at) {
        tpl.s[0] = row.splice(start, at - start);
        at = start;
      }
    }
    row.splice(at, 0, tpl);
    if (opts.after) { this.pos = at + 1; return; }
    let slot = opts.slot ?? tpl.s.findIndex((s) => s.length === 0);
    if (slot < 0) slot = 0;
    this.path.push({ i: at, s: slot });
    this.pos = tpl.s[slot].length;
  }

  // ---------------------------------------------------------------- deletion
  backspace() {
    const row = this.row();
    if (this.pos > 0) {
      const it = row[this.pos - 1];
      if (isTemplate(it)) {
        const empty = it.s.every((s) => s.length === 0);
        const smallPow = (it.t === 'pow') && it.s[0].length <= 1;
        if (empty || smallPow) { row.splice(this.pos - 1, 1); this.pos--; return; }
        this.left();
        return;
      }
      row.splice(this.pos - 1, 1);
      this.pos--;
      return;
    }
    // at the start of a slot
    if (!this.path.length) return;
    const parent = this.parentItem();
    if (parent.s.every((s) => s.length === 0)) {
      const p = this.path.pop();
      this.rowAt(this.path).splice(p.i, 1);
      this.pos = p.i;
      return;
    }
    // template with content in the first slot only and we're at slot 0 start: unwrap it
    const p = this.path[this.path.length - 1];
    if (p.s === 0 && parent.s.slice(1).every((s) => s.length === 0)) {
      this.path.pop();
      const outer = this.rowAt(this.path);
      const content = parent.s[0];
      outer.splice(p.i, 1, ...content);
      this.pos = p.i;
      return;
    }
    this.left();
  }

  // ---------------------------------------------------------------- navigation
  left() {
    const row = this.row();
    if (this.pos > 0) {
      const it = row[this.pos - 1];
      if (isTemplate(it)) {
        const s = it.s.length - 1;
        this.path.push({ i: this.pos - 1, s });
        this.pos = it.s[s].length;
      } else this.pos--;
      return true;
    }
    if (!this.path.length) { this.pos = this.root.length; return false; } // wrap
    const p = this.path[this.path.length - 1];
    if (p.s > 0) { p.s--; this.pos = this.row().length; return true; }
    this.path.pop();
    this.pos = p.i;
    return true;
  }
  right() {
    const row = this.row();
    if (this.pos < row.length) {
      const it = row[this.pos];
      if (isTemplate(it)) { this.path.push({ i: this.pos, s: 0 }); this.pos = 0; } else this.pos++;
      return true;
    }
    if (!this.path.length) { this.pos = 0; return false; } // wrap
    const p = this.path[this.path.length - 1];
    const parent = this.parentItem();
    if (p.s < parent.s.length - 1) { p.s++; this.pos = 0; return true; }
    this.path.pop();
    this.pos = p.i + 1;
    return true;
  }
  vertical(dir) { // dir: -1 up, +1 down; returns true if moved
    for (let k = this.path.length - 1; k >= 0; k--) {
      const p = this.path[k];
      const item = this.rowAt(this.path.slice(0, k))[p.i];
      const v = VERTICAL[item.t];
      if (!v) continue;
      const target = dir < 0 ? v[0] : v[1];
      if (p.s === target || !v.includes(p.s)) continue;
      this.path = this.path.slice(0, k);
      this.path.push({ i: p.i, s: target });
      this.pos = Math.min(this.pos, item.s[target].length);
      if (k < this.path.length - 1) this.pos = item.s[target].length;
      this.pos = Math.min(this.pos, this.row().length);
      return true;
    }
    return false;
  }
  home() { this.path = []; this.pos = 0; }
  end() { this.path = []; this.pos = this.root.length; }
  setCursor(path, pos) { this.path = path.map((p) => ({ ...p })); this.pos = Math.min(pos, this.row().length); }

  /** Is the cursor at the very end of the top-level row? */
  atEnd() { return this.path.length === 0 && this.pos === this.root.length; }

  toText() { return rowToText(this.root); }
}

/** Index where the operand that ends at `end` begins (for capture into a fraction numerator). */
export function operandStart(row, end) {
  let i = end;
  if (i === 0) return end;
  const last = row[i - 1];
  // trailing power templates belong to the operand
  while (i > 0 && row[i - 1].t === 'pow') i--;
  if (i === 0) return end;
  const it = row[i - 1];
  if (it.t === 'c' && DIGITISH.test(it.v)) {
    while (i > 0 && row[i - 1].t === 'c' && DIGITISH.test(row[i - 1].v)) i--;
    return i;
  }
  if (it.t === 'c' && it.v === ')') {
    let depth = 0;
    for (let j = i - 1; j >= 0; j--) {
      const x = row[j];
      if (x.t === 'c' && x.v === ')') depth++;
      else if ((x.t === 'c' && x.v === '(') || x.t === 'f') { depth--; if (depth === 0) return j; }
    }
    return end;
  }
  if (it.t === 'c' && isAtomToken(it.v)) return i - 1;
  if (isTemplate(it) && it.t !== 'pow') return i - 1;
  return last ? end : end;
}

const ATOMS = new Set(['π', 'e', 'i', 'Ans', 'A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M', 'PreAns']);
export function isAtomToken(v) {
  return ATOMS.has(v) || v.startsWith('Mat') || v.startsWith('Vct') || v.startsWith('k:') || v.startsWith('st:');
}

// ---------------------------------------------------------------- text conversion
const CHAR_TEXT = { 'ᴇ': 'E', 'neg': '-', '⁻¹': '⁻¹', ',': ',' };

function needsParens(row) {
  if (row.length <= 1) return false;
  return !row.every((it) => it.t === 'c' && DIGITISH.test(it.v));
}
function wrap(row) { const t = rowToText(row); return needsParens(row) ? `(${t})` : t; }

export function itemToText(it) {
  if (it.t === 'c') {
    if (it.v.startsWith('k:') || it.v.startsWith('st:') || it.v.startsWith('cv:') || it.v.startsWith('bp:')) return it.v;
    if (/^[a-z]+$/i.test(it.v) && it.v.length > 1 && !['Ans', 'PreAns'].includes(it.v) && !it.v.startsWith('Mat') && !it.v.startsWith('Vct')) return ` ${it.v} `;
    return CHAR_TEXT[it.v] ?? it.v;
  }
  if (it.t === 'f') return `${it.v}(`;
  const s = it.s;
  switch (it.t) {
    case 'frac': return `${wrap(s[0])}/${wrap(s[1])}`;
    case 'mixed': return `${rowToText(s[0])}⌟${rowToText(s[1])}⌟${rowToText(s[2])}`;
    case 'sqrt': return `√(${rowToText(s[0])})`;
    case 'cbrt': return `∛(${rowToText(s[0])})`;
    case 'root': return `root(${rowToText(s[0])},${rowToText(s[1])})`;
    case 'pow': return `^${wrap(s[0])}`;
    case 'pow10': return `10^${wrap(s[0])}`;
    case 'exp': return `e^${wrap(s[0])}`;
    case 'logb': return `log(${rowToText(s[0])},${rowToText(s[1])})`;
    case 'abs': return `Abs(${rowToText(s[0])})`;
    case 'integ': return `∫(${rowToText(s[0])},${rowToText(s[1])},${rowToText(s[2])})`;
    case 'deriv': return `d/dx(${rowToText(s[0])},${rowToText(s[1])})`;
    case 'sum': return `Σ(${rowToText(s[0])},${rowToText(s[1])},${rowToText(s[2])})`;
    case 'prod': return `Π(${rowToText(s[0])},${rowToText(s[1])},${rowToText(s[2])})`;
    default: return '?';
  }
}
export function rowToText(row) { return row.map(itemToText).join('').replace(/\s+/g, ' ').trim(); }

// ---------------------------------------------------------------- text -> items (paste / tests)
const FUNC_NAMES = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹', 'asinh', 'acosh', 'atanh', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'log', 'ln', 'Pol', 'Rec', 'Rnd', 'RanInt#', 'GCD', 'LCM', 'Intg', 'Int',
  'Floor', 'Ceil', 'Sign', 'Frac', 'det', 'Trn', 'Conjg', 'ReP', 'ImP', 'arg', 'Not', 'Neg', 'P', 'Q', 'R', 'Angle', 'UnitV', 'Rank', 'Tr', 'Abs'];
const FUNC_ALIASES = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹' };
const TEMPLATE_FUNCS = { 'sqrt': 'sqrt', '√': 'sqrt', 'cbrt': 'cbrt', '∛': 'cbrt', 'root': 'root', 'abs': 'abs', 'Abs': 'abs',
  '∫': 'integ', 'integral': 'integ', 'd/dx': 'deriv', 'Σ': 'sum', 'sum': 'sum', 'Π': 'prod', 'prod': 'prod', 'exp': 'exp' };
const WORD_TOKENS = ['x̂₁', 'x̂₂', 'x̂', 'ŷ', '→t', 'MatAns', 'MatA', 'MatB', 'MatC', 'VctAns', 'VctA', 'VctB', 'VctC', 'PreAns', 'Ans', 'Ran#', 'nPr', 'nCr', 'xnor', 'xor', 'and', 'or', '÷R', '▸r∠θ', '▸a+bi', 'pi', '⁻¹'];
const CHAR_MAP = { '*': '×', '/': '÷', '-': '−', '–': '−', 'x': '×', 'E': 'ᴇ', '·': '·', '×': '×', '÷': '÷' };

function splitArgs(str) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
function readGroup(str, i) { // str[i] === '(' ; returns [content, nextIndex]
  let depth = 0;
  for (let j = i; j < str.length; j++) {
    if (str[j] === '(') depth++;
    else if (str[j] === ')') { depth--; if (depth === 0) return [str.slice(i + 1, j), j + 1]; }
  }
  return [str.slice(i + 1), str.length];
}

/** Convert linear text (as typed or pasted) into editor items. Lenient by design. */
export function textToRow(str, opts = {}) {
  const out = [];
  let i = 0;
  str = str.replace(/\s+/g, ' ');
  while (i < str.length) {
    const rest = str.slice(i);
    const ch = str[i];
    if (ch === ' ') { i++; continue; }
    // templates written as functions
    let matched = false;
    for (const name of Object.keys(TEMPLATE_FUNCS).sort((a, b) => b.length - a.length)) {
      if (rest.startsWith(name + '(')) {
        const [content, next] = readGroup(str, i + name.length);
        const type = TEMPLATE_FUNCS[name];
        const args = splitArgs(content).map((a) => textToRow(a, opts));
        const tpl = T(type);
        tpl.s.forEach((_, k) => { tpl.s[k] = args[k] || []; });
        out.push(tpl);
        i = next; matched = true; break;
      }
    }
    if (matched) continue;
    if (rest.startsWith('log(') && splitArgs(readGroup(str, i + 3)[0]).length === 2) {
      const [content, next] = readGroup(str, i + 3);
      const [b, a] = splitArgs(content);
      out.push(T('logb', [textToRow(b, opts), textToRow(a, opts)]));
      i = next; continue;
    }
    if (rest.startsWith('10^') || rest.startsWith('e^')) {
      const n = rest.startsWith('10^') ? 3 : 2;
      const [content, next] = readPowArg(str, i + n);
      out.push(T(n === 3 ? 'pow10' : 'exp', [textToRow(content, opts)]));
      i = next; continue;
    }
    if (ch === '^' || rest.startsWith('**')) {
      const [content, next] = readPowArg(str, i + (ch === '^' ? 1 : 2));
      out.push(T('pow', [textToRow(content, opts)]));
      i = next; continue;
    }
    if (ch === '²' || ch === '³') { out.push(T('pow', [[C(ch === '²' ? '2' : '3')]])); i++; continue; }
    for (const name of FUNC_NAMES.concat(Object.keys(FUNC_ALIASES)).sort((a, b) => b.length - a.length)) {
      if (rest.startsWith(name + '(')) {
        out.push(F(FUNC_ALIASES[name] || name)); i += name.length + 1; matched = true; break;
      }
    }
    if (matched) continue;
    for (const w of WORD_TOKENS) {
      if (rest.startsWith(w)) { out.push(C(w === 'pi' ? 'π' : w)); i += w.length; matched = true; break; }
    }
    if (matched) continue;
    const m = /^(k:[\w]+|st:[\w]+|cv:\d+|bp:[dhbo])/.exec(rest);
    if (m) { out.push(C(m[1])); i += m[1].length; continue; }
    if (opts.base && /[A-F]/.test(ch)) { out.push(C(ch)); i++; continue; }
    if (ch === 'E' && out.length && out[out.length - 1].t === 'c' && /[0-9.]/.test(out[out.length - 1].v)) { out.push(C('ᴇ')); i++; continue; }
    if (ch === '⌟') { // mixed / simple fraction in linear notation is rare; treat as division
      out.push(C('÷')); i++; continue;
    }
    out.push(C(CHAR_MAP[ch] && !(ch === 'x' && !opts.xIsTimes) ? CHAR_MAP[ch] : ch === 'x' ? 'X' : ch));
    i++;
  }
  return out;
}
function readPowArg(str, i) {
  if (str[i] === '(') return readGroup(str, i);
  const m = /^[-−]?[0-9.]+|^[A-Za-zπ]/.exec(str.slice(i));
  if (m) return [m[0], i + m[0].length];
  return ['', i];
}
