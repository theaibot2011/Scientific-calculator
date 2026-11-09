// BASE-N mode: 32-bit two's complement integer arithmetic and logic.
import { mathErr, syntaxErr } from './errors.js';
import { Q, toF, isQ } from './num.js';

export const BASES = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const PREFIX = { d: 10, h: 16, b: 2, o: 8 };

function check(n) {
  if (!Number.isFinite(n) || n > 2147483647 || n < -2147483648) throw mathErr('The result is outside the 32-bit range (−2147483648 … 2147483647)');
  return n;
}
function parseIn(text, radix) {
  const digits = '0123456789ABCDEF'.slice(0, radix);
  for (const ch of text) if (!digits.includes(ch)) throw syntaxErr(`“${ch}” is not a valid digit in base ${radix}`);
  if (text.includes('.')) throw syntaxErr('BASE-N mode only uses integers');
  const v = parseInt(text, radix);
  if (radix === 10) return check(v);
  if (v > 0xFFFFFFFF) throw mathErr('The value is outside the 32-bit range');
  return v | 0; // two's complement interpretation
}

export function evaluateBase(ast, ctx) {
  const radix = BASES[ctx.base] || 10;
  const ev = (n) => evaluateBase(n, ctx);
  switch (ast.op) {
    case 'num': return parseIn(ast.text, ast.base ? PREFIX[ast.base] : radix);
    case 'atom': {
      if (ast.name === 'Ans') return fromVal(ctx.ans);
      if (ast.name === 'PreAns') return fromVal(ctx.preAns);
      if (/^[XYM]$/.test(ast.name) || /^[A-F]$/.test(ast.name)) return fromVal(ctx.vars[ast.name]);
      throw syntaxErr(`${ast.name} cannot be used in BASE-N mode`);
    }
    case 'neg': return check(-ev(ast.a));
    case 'bin': {
      const a = ev(ast.a), b = ev(ast.b);
      switch (ast.o) {
        case '+': return check(a + b);
        case '−': return check(a - b);
        case '×': return check(a * b);
        case '÷': if (b === 0) throw mathErr('Division by zero'); return check(Math.trunc(a / b));
        case 'and': return a & b;
        case 'or': return a | b;
        case 'xor': return a ^ b;
        case 'xnor': return ~(a ^ b);
        default: throw syntaxErr(`${ast.o} is not available in BASE-N mode`);
      }
    }
    case 'call': {
      if (ast.args.length !== 1) throw syntaxErr(`${ast.f}( takes one argument`);
      const a = ev(ast.args[0]);
      if (ast.f === 'Not') return ~a;
      if (ast.f === 'Neg') return check(-a);
      throw syntaxErr(`${ast.f}( is not available in BASE-N mode`);
    }
    default: throw syntaxErr('This operation is not available in BASE-N mode');
  }
}
function fromVal(v) {
  if (!v) return 0;
  const x = toF(v);
  if (!Number.isInteger(x)) return check(Math.trunc(x));
  return check(x);
}

export function formatBase(n, base) {
  const radix = BASES[base];
  if (radix === 10) return String(n);
  const u = n >>> 0; // unsigned view of two's complement
  let s = u.toString(radix).toUpperCase();
  const width = radix === 2 ? 32 : radix === 16 ? 8 : 11;
  s = s.padStart(width, '0');
  if (radix === 2) s = s.replace(/(.{4})(?=.)/g, '$1 ');
  return s;
}
export const baseValue = (n) => Q(BigInt(n));
export { isQ };
