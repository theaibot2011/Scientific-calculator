// Parser: editor rows -> abstract syntax tree.
//
// Operator priority follows the fx-991ES user's guide (highest first):
//   1. functions with brackets, templates, bracketed expressions
//   2. postfix: x⁻¹ x! ° (DMS) % x̂ ŷ  unit conversions, angle units
//   3. powers (x^y, x²) and roots
//   4. prefix minus  (so −2² = −4)
//   5. multiplication with omitted sign (2π, 3A, 2(4)) — binds tighter than ÷ (1÷2π = 1/(2π))
//   6. nPr nCr ∠
//   7. × ÷ ·
//   8. + −
//   9. and ; or xor xnor (BASE-N)
// No string evaluation is used anywhere; the AST is interpreted by evaluator.js.
import { syntaxErr, CalcError } from './errors.js';
import { isTemplate } from './editor.js';

const POSTFIX = new Set(['!', '%', '⁻¹', '°', 'ʳ', 'ᵍ', 'ᵈ', 'x̂', 'ŷ', 'x̂₁', 'x̂₂', '→t', '▸r∠θ', '▸a+bi']);
const MULOPS = new Set(['×', '÷', '·', '÷R']);
const PCOPS = new Set(['nPr', 'nCr', '∠']);
const ADDOPS = new Set(['+', '−']);
const ATOMS = new Set(['π', 'e', 'i', 'Ans', 'PreAns', 'A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M', 'Ran#']);
const MAX_DEPTH = 48; // nesting limit (Stack ERROR beyond)

/** Lexical pass over one row. Merges digits into number tokens. */
function lex(row, opts) {
  const toks = [];
  for (let i = 0; i < row.length; i++) {
    const it = row[i];
    if (it.t === 'c') {
      const v = it.v;
      if (opts.base && /^[0-9A-F]$/.test(v)) {
        let s = v, j = i + 1;
        while (j < row.length && row[j].t === 'c' && /^[0-9A-F]$/.test(row[j].v)) s += row[j++].v;
        toks.push({ type: 'num', text: s, pos: i, based: true });
        i = j - 1; continue;
      }
      if (/^[0-9.]$/.test(v) || v === 'ᴇ') {
        let s = '', j = i;
        while (j < row.length && row[j].t === 'c' && /^[0-9.]$/.test(row[j].v)) s += row[j++].v;
        if (j < row.length && row[j].t === 'c' && row[j].v === 'ᴇ') {
          if (s === '') s = '1';
          s += 'E'; j++;
          if (j < row.length && row[j].t === 'c' && (row[j].v === '−' || row[j].v === 'neg' || row[j].v === '+')) { if (row[j].v !== '+') s += '-'; j++; }
          let digits = '';
          while (j < row.length && row[j].t === 'c' && /^[0-9]$/.test(row[j].v)) digits += row[j++].v;
          if (!digits) throw syntaxErr('The ×10ˣ exponent is missing', j);
          s += digits;
        }
        if ((s.match(/\./g) || []).length > 1) throw syntaxErr('A number contains more than one decimal point', i);
        if (s === '.') throw syntaxErr('A decimal point needs digits', i);
        toks.push({ type: 'num', text: s, pos: i });
        i = j - 1; continue;
      }
      if (v === '(') { toks.push({ type: '(', pos: i }); continue; }
      if (v === ')') { toks.push({ type: ')', pos: i }); continue; }
      if (v === ',') { toks.push({ type: ',', pos: i }); continue; }
      if (v === '=') { toks.push({ type: '=', pos: i }); continue; }
      if (v === 'neg') { toks.push({ type: 'neg', pos: i }); continue; }
      if (ADDOPS.has(v)) { toks.push({ type: 'add', op: v, pos: i }); continue; }
      if (MULOPS.has(v)) { toks.push({ type: 'mul', op: v, pos: i }); continue; }
      if (PCOPS.has(v)) { toks.push({ type: 'pc', op: v, pos: i }); continue; }
      if (v === 'and') { toks.push({ type: 'and', op: v, pos: i }); continue; }
      if (v === 'or' || v === 'xor' || v === 'xnor') { toks.push({ type: 'or', op: v, pos: i }); continue; }
      if (POSTFIX.has(v) || v.startsWith('cv:')) { toks.push({ type: 'post', op: v, pos: i }); continue; }
      if (v.startsWith('bp:')) { toks.push({ type: 'bp', op: v.slice(3), pos: i }); continue; }
      if (ATOMS.has(v) || v.startsWith('Mat') || v.startsWith('Vct') || v.startsWith('k:') || v.startsWith('st:')) {
        toks.push({ type: 'atom', name: v, pos: i }); continue;
      }
      throw syntaxErr(`Unexpected symbol “${v}”`, i);
    } else if (it.t === 'f') {
      toks.push({ type: 'func', name: it.v, pos: i });
    } else if (it.t === 'pow') {
      toks.push({ type: 'pow', item: it, pos: i });
    } else if (isTemplate(it)) {
      toks.push({ type: 'tpl', item: it, pos: i });
    } else throw syntaxErr('Unknown item', i);
  }
  return toks;
}

class Parser {
  constructor(toks, opts, depth) { this.t = toks; this.i = 0; this.opts = opts; this.depth = depth; }
  peek() { return this.t[this.i]; }
  next() { return this.t[this.i++]; }
  err(msg) { const tok = this.peek(); throw syntaxErr(msg, tok ? tok.pos : null); }
  enter() { if (++this.depth > MAX_DEPTH) throw new CalcError('Stack', 'The expression is nested too deeply'); }
  leave() { this.depth--; }

  parseTop() {
    if (!this.t.length) throw syntaxErr('The expression is empty', 0);
    const e = this.parseExpr();
    if (this.peek()) {
      const tok = this.peek();
      if (tok.type === ')') this.err('There is a closing bracket without a matching opening bracket');
      if (tok.type === '=') this.err('“=” can only be used with SOLVE');
      this.err('Unexpected symbol');
    }
    return e;
  }
  parseExpr() { return this.parseOr(); }
  parseOr() {
    let a = this.parseAnd();
    while (this.peek() && this.peek().type === 'or') { const op = this.next().op; a = { op: 'bin', o: op, a, b: this.parseAnd() }; }
    return a;
  }
  parseAnd() {
    let a = this.parseAdd();
    while (this.peek() && this.peek().type === 'and') { this.next(); a = { op: 'bin', o: 'and', a, b: this.parseAdd() }; }
    return a;
  }
  parseAdd() {
    let a = this.parseMul();
    while (this.peek() && this.peek().type === 'add') {
      const op = this.next().op;
      a = { op: 'bin', o: op, a, b: this.parseMul() };
    }
    return a;
  }
  parseMul() {
    let a = this.parsePC();
    while (this.peek() && this.peek().type === 'mul') {
      const op = this.next().op;
      a = { op: 'bin', o: op, a, b: this.parsePC() };
    }
    return a;
  }
  parsePC() {
    let a = this.parseImplicit();
    while (this.peek() && this.peek().type === 'pc') {
      const op = this.next().op;
      a = { op: 'bin', o: op, a, b: this.parseImplicit() };
    }
    return a;
  }
  startsOperand(tok) {
    return tok && ['num', 'atom', 'func', '(', 'tpl', 'bp'].includes(tok.type);
  }
  parseImplicit() {
    let a = this.parseUnary();
    while (this.startsOperand(this.peek())) {
      a = { op: 'bin', o: '×', implicit: true, a, b: this.parseUnary() };
    }
    return a;
  }
  parseUnary() {
    const tok = this.peek();
    if (!tok) this.err('The expression is incomplete');
    if (tok.type === 'neg' || (tok.type === 'add')) {
      this.next();
      this.enter();
      const a = this.parseUnary();
      this.leave();
      // prefix minus binds looser than powers but tighter than implicit multiplication
      return tok.op === '+' ? a : { op: 'neg', a };
    }
    return this.parsePower();
  }
  parsePower() {
    let a = this.parsePostfix(this.parsePrimary());
    while (this.peek() && this.peek().type === 'pow') {
      const tok = this.next();
      const e = parseRow(tok.item.s[0], this.opts, this.depth + 1, 'exponent');
      a = { op: 'pow', a, b: e };
      a = this.parsePostfix(a);
    }
    return a;
  }
  parsePostfix(a) {
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.type !== 'post') return a;
      this.next();
      if (tok.op === '°') {
        // DMS entry: d°m°s°
        let node = { op: 'dms', parts: [a] };
        for (let k = 0; k < 2; k++) {
          const n1 = this.t[this.i], n2 = this.t[this.i + 1];
          if (n1 && n1.type === 'num' && n2 && n2.type === 'post' && n2.op === '°') {
            node.parts.push({ op: 'num', text: n1.text });
            this.i += 2;
          } else break;
        }
        a = node;
        continue;
      }
      a = { op: 'post', o: tok.op, a };
    }
  }
  parsePrimary() {
    const tok = this.next();
    if (!tok) throw syntaxErr('The expression is incomplete', null);
    switch (tok.type) {
      case 'num': return { op: 'num', text: tok.text, based: !!tok.based, pos: tok.pos };
      case 'bp': {
        const n = this.next();
        if (!n || n.type !== 'num') throw syntaxErr('A base prefix must be followed by a number', tok.pos);
        return { op: 'num', text: n.text, based: true, base: tok.op };
      }
      case 'atom': return { op: 'atom', name: tok.name };
      case '(': {
        this.enter();
        const e = this.parseExpr();
        this.leave();
        if (this.peek() && this.peek().type === ')') this.next();
        else if (this.peek()) this.err('A closing bracket is missing');
        return e;
      }
      case 'func': {
        this.enter();
        const args = [];
        if (this.peek() && this.peek().type === ')') this.err(`${tok.name}( needs an argument`);
        if (this.peek()) {
          args.push(this.parseExpr());
          while (this.peek() && this.peek().type === ',') { this.next(); args.push(this.parseExpr()); }
        }
        this.leave();
        if (this.peek() && this.peek().type === ')') this.next();
        else if (this.peek()) this.err('A closing bracket is missing');
        if (!args.length) throw syntaxErr(`${tok.name}( needs an argument`, tok.pos);
        return { op: 'call', f: tok.name, args };
      }
      case 'tpl': return this.template(tok.item);
      case ')': throw syntaxErr('There is a closing bracket without a matching opening bracket', tok.pos);
      case 'pow': throw syntaxErr('A power needs a base before it', tok.pos);
      case 'post': throw syntaxErr(`“${tok.op}” needs a value before it`, tok.pos);
      default: throw syntaxErr('A value is missing before an operator', tok.pos);
    }
  }
  template(it) {
    const s = it.s, d = this.depth + 1, o = this.opts;
    const P = (row, what) => parseRow(row, o, d, what);
    switch (it.t) {
      case 'frac': return { op: 'frac', a: P(s[0], 'numerator'), b: P(s[1], 'denominator') };
      case 'mixed': return { op: 'mixed', w: P(s[0], 'whole part'), a: P(s[1], 'numerator'), b: P(s[2], 'denominator') };
      case 'sqrt': return { op: 'sqrt', a: P(s[0], 'radicand') };
      case 'cbrt': return { op: 'root', n: { op: 'num', text: '3' }, a: P(s[0], 'radicand') };
      case 'root': return { op: 'root', n: P(s[0], 'root index'), a: P(s[1], 'radicand') };
      case 'pow10': return { op: 'pow', a: { op: 'num', text: '10' }, b: P(s[0], 'exponent') };
      case 'exp': return { op: 'pow', a: { op: 'atom', name: 'e' }, b: P(s[0], 'exponent') };
      case 'logb': return { op: 'logb', b: P(s[0], 'base'), a: P(s[1], 'argument') };
      case 'abs': return { op: 'call', f: 'Abs', args: [P(s[0], 'argument')] };
      case 'integ': return { op: 'integ', f: P(s[0], 'integrand'), lo: P(s[1], 'lower limit'), hi: P(s[2], 'upper limit') };
      case 'deriv': return { op: 'deriv', f: P(s[0], 'expression'), x: P(s[1], 'point') };
      case 'sum': return { op: 'sum', f: P(s[0], 'expression'), lo: P(s[1], 'start value'), hi: P(s[2], 'end value') };
      case 'prod': return { op: 'prod', f: P(s[0], 'expression'), lo: P(s[1], 'start value'), hi: P(s[2], 'end value') };
      default: throw syntaxErr('Unknown template');
    }
  }
}

export function parseRow(row, opts = {}, depth = 0, what = null) {
  if (depth > MAX_DEPTH) throw new CalcError('Stack', 'The expression is nested too deeply');
  if (!row.length) throw syntaxErr(what ? `The ${what} is empty` : 'The expression is empty', null);
  // result-form conversions (▸r∠θ, ▸a+bi) apply to the whole calculation
  const last = row[row.length - 1];
  if (depth === 0 && last && last.t === 'c' && (last.v === '▸r∠θ' || last.v === '▸a+bi') && row.length > 1) {
    return { op: 'post', o: last.v, a: parseRow(row.slice(0, -1), opts, depth + 1, what) };
  }
  const toks = lex(row, opts);
  const p = new Parser(toks, opts, depth);
  return p.parseTop();
}

/** Parse an equation "lhs = rhs" (for SOLVE). Returns {lhs, rhs|null}. */
export function parseEquation(row, opts = {}) {
  const k = row.findIndex((it) => it.t === 'c' && it.v === '=');
  if (k < 0) return { lhs: parseRow(row, opts), rhs: null };
  if (row.slice(k + 1).some((it) => it.t === 'c' && it.v === '=')) throw syntaxErr('Only one “=” is allowed', k);
  return { lhs: parseRow(row.slice(0, k), opts), rhs: parseRow(row.slice(k + 1), opts) };
}

/** Collect variable names referenced by an AST (for CALC prompts). */
export function collectVars(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.op === 'atom' && /^[A-FXYM]$/.test(ast.name)) out.add(ast.name);
  for (const k of Object.keys(ast)) {
    const v = ast[k];
    if (Array.isArray(v)) v.forEach((x) => collectVars(x, out));
    else if (v && typeof v === 'object' && v.op) collectVars(v, out);
  }
  return out;
}
export function astHas(ast, pred) {
  if (!ast || typeof ast !== 'object') return false;
  if (pred(ast)) return true;
  for (const k of Object.keys(ast)) {
    const v = ast[k];
    if (Array.isArray(v)) { if (v.some((x) => astHas(x, pred))) return true; }
    else if (v && typeof v === 'object' && v.op && astHas(v, pred)) return true;
  }
  return false;
}
