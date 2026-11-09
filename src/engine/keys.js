// Physical key definitions: one source of truth for the keypad UI, keyboard mapping and the state machine.
// Each key has a main action and optional SHIFT / ALPHA actions, plus per-mode overrides.
// Labels use a tiny markup: ^{...} superscript, _{...} subscript, [] = empty box.

export const KEYS = {
  shift: { main: 'shift', label: 'SHIFT', cls: 'shift' },
  alpha: { main: 'alpha', label: 'ALPHA', cls: 'alpha' },
  mode: { main: 'mode', shift: 'setup', label: 'MODE', s: 'SETUP', cls: 'ctl' },
  func: { main: 'catalog', shift: 'help', label: 'FUNC', s: 'HELP', cls: 'ctl', enh: true },
  up: { main: 'up' }, down: { main: 'down' }, left: { main: 'left' }, right: { main: 'right' },

  calc: { main: 'calc', shift: 'solve', alpha: 'char:=', label: 'CALC', s: 'SOLVE', a: '=', cls: 'fn' },
  integ: { main: 'tpl:integ', shift: 'tpl:deriv', alpha: 'tpl:prod', label: '∫▭', s: 'd/dx', a: 'Π', cls: 'fn' },
  inv: { main: 'char:⁻¹', shift: 'char:!', label: 'x^{−1}', s: 'x!', cls: 'fn' },
  logb: { main: 'tpl:logb', shift: 'tpl:sum', label: 'log_{▫}▫', s: 'Σ', cls: 'fn' },

  frac: { main: 'tpl:frac', shift: 'tpl:mixed', label: 'frac', s: '▫⌟▫', cls: 'fn' },
  sqrt: { main: 'tpl:sqrt', shift: 'tpl:cbrt', label: '√▫', s: '∛▫', cls: 'fn' },
  sq: { main: 'sq', shift: 'cube', label: 'x^{2}', s: 'x³', cls: 'fn' },
  pow: { main: 'tpl:pow', shift: 'tpl:root', label: 'x^{▫}', s: '^{x}√▫', cls: 'fn' },
  log: { main: 'func:log', shift: 'tpl:pow10', label: 'log', s: '10^{x}', cls: 'fn' },
  ln: { main: 'func:ln', shift: 'tpl:exp', label: 'ln', s: 'e^{x}', cls: 'fn' },

  neg: { main: 'char:neg', shift: 'char:∠', alpha: 'var:A', label: '(−)', s: '∠', a: 'A', cls: 'fn' },
  dms: { main: 'dms', shift: 'fact', alpha: 'var:B', label: "°′″", s: 'FACT', a: 'B', cls: 'fn' },
  hyp: { main: 'hyp', shift: 'tpl:abs', alpha: 'var:C', label: 'hyp', s: 'Abs', a: 'C', cls: 'fn' },
  sin: { main: 'func:sin', shift: 'func:sin⁻¹', alpha: 'var:D', label: 'sin', s: 'sin⁻¹', a: 'D', cls: 'fn' },
  cos: { main: 'func:cos', shift: 'func:cos⁻¹', alpha: 'var:E', label: 'cos', s: 'cos⁻¹', a: 'E', cls: 'fn' },
  tan: { main: 'func:tan', shift: 'func:tan⁻¹', alpha: 'var:F', label: 'tan', s: 'tan⁻¹', a: 'F', cls: 'fn' },

  rcl: { main: 'rcl', shift: 'sto', label: 'RCL', s: 'STO', cls: 'fn' },
  eng: { main: 'eng', shift: 'engL', alpha: 'char:i', label: 'ENG', s: '←ENG', a: 'i', cls: 'fn' },
  lp: { main: 'char:(', shift: 'char:%', label: '(', s: '%', cls: 'fn' },
  rp: { main: 'char:)', shift: 'char:,', alpha: 'var:X', label: ')', s: ',', a: 'X', cls: 'fn' },
  sd: { main: 'sd', shift: 'abcdc', alpha: 'var:Y', label: 'S⇔D', s: 'a⌟b⇔d/c', a: 'Y', cls: 'fn' },
  mplus: { main: 'mplus', shift: 'mminus', alpha: 'var:M', label: 'M+', s: 'M−', a: 'M', cls: 'fn' },

  7: { main: 'char:7', shift: 'const', label: '7', s: 'CONST', cls: 'num' },
  8: { main: 'char:8', shift: 'conv', label: '8', s: 'CONV', cls: 'num' },
  9: { main: 'char:9', shift: 'clr', label: '9', s: 'CLR', cls: 'num' },
  del: { main: 'del', label: 'DEL', cls: 'del' },
  ac: { main: 'ac', label: 'AC', cls: 'ac' },
  4: { main: 'char:4', shift: 'matrixMenu', label: '4', s: 'MATRIX', cls: 'num' },
  5: { main: 'char:5', shift: 'vectorMenu', label: '5', s: 'VECTOR', cls: 'num' },
  6: { main: 'char:6', shift: 'statDistr', label: '6', s: 'DISTR', cls: 'num', enhS: true },
  mul: { main: 'char:×', shift: 'char:nPr', label: '×', s: 'nPr', cls: 'op' },
  div: { main: 'char:÷', shift: 'char:nCr', label: '÷', s: 'nCr', cls: 'op' },
  1: { main: 'char:1', shift: 'statMenu', label: '1', s: 'STAT', cls: 'num' },
  2: { main: 'char:2', shift: 'cmplxMenu', label: '2', s: 'CMPLX', cls: 'num' },
  3: { main: 'char:3', shift: 'baseMenu', label: '3', s: 'BASE', cls: 'num' },
  add: { main: 'char:+', shift: 'func:Pol', label: '+', s: 'Pol', cls: 'op' },
  sub: { main: 'char:−', shift: 'func:Rec', label: '−', s: 'Rec', cls: 'op' },
  0: { main: 'char:0', shift: 'func:Rnd', label: '0', s: 'Rnd', cls: 'num' },
  dot: { main: 'char:.', shift: 'char:Ran#', alpha: 'func:RanInt#', label: '.', s: 'Ran#', a: 'RanInt', cls: 'num' },
  exp10: { main: 'char:ᴇ', shift: 'char:π', alpha: 'char:e', label: '×10^{x}', s: 'π', a: 'e', cls: 'num' },
  ans: { main: 'char:Ans', shift: 'drg', label: 'Ans', s: 'DRG▸', cls: 'num' },
  eq: { main: 'eq', shift: 'approx', label: '=', s: '≈', cls: 'eq' },
};

// Per-mode overrides: {mode: {key: {main|shift|alpha: action, label…}}}
export const MODE_OVERRIDES = {
  BASE: {
    sq: { main: 'base:DEC', label: 'DEC' },
    inv: { main: 'base:HEX', label: 'HEX' },
    log: { main: 'base:BIN', label: 'BIN' },
    ln: { main: 'base:OCT', label: 'OCT' },
    neg: { main: 'char:A', label: 'A' },
    dms: { main: 'char:B', label: 'B' },
    hyp: { main: 'char:C', label: 'C' },
    sin: { main: 'char:D', label: 'D' },
    cos: { main: 'char:E', label: 'E' },
    tan: { main: 'char:F', label: 'F' },
    sub: { main: 'char:−' },
  },
  CMPLX: { eng: { main: 'char:i', label: 'i' } },
};

export function resolveAction(key, layer, mode) {
  const k = KEYS[key];
  if (!k) return null;
  const ov = MODE_OVERRIDES[mode]?.[key];
  if (layer === 'main') return ov?.main ?? k.main;
  if (layer === 'shift') return ov?.shift ?? k.shift ?? null;
  if (layer === 'alpha') return ov?.alpha ?? k.alpha ?? null;
  return null;
}

// Keyboard → key presses. Values are a key id, or an array of key ids (e.g. SHIFT + key).
export const KEYBOARD = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'dot', ',': ['shift', 'rp'], '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '÷': 'div', '×': 'mul',
  '(': 'lp', ')': 'rp', '^': 'pow', '!': ['shift', 'inv'], '%': ['shift', 'lp'],
  Enter: 'eq', '=': 'eq', Backspace: 'del', Delete: 'del', Escape: 'ac',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  s: 'sin', c: 'cos', t: 'tan', S: ['shift', 'sin'], C: ['shift', 'cos'], T: ['shift', 'tan'],
  l: 'ln', L: 'log', g: 'log', r: 'sqrt', R: ['shift', 'sqrt'], q: 'sq', Q: ['shift', 'sq'],
  p: ['shift', 'exp10'], e: ['alpha', 'exp10'], E: 'exp10', i: ['alpha', 'eng'],
  x: ['alpha', 'rp'], X: ['alpha', 'rp'], y: ['alpha', 'sd'], Y: ['alpha', 'sd'], m: ['alpha', 'mplus'],
  a: 'ans', f: 'frac', F: ['shift', 'frac'], n: 'neg', '~': 'neg', '|': ['shift', 'hyp'], h: 'hyp',
  d: 'dms', v: 'inv', '\\': 'frac', '<': ['shift', 'eq'], k: 'logb',
  F2: 'shift', F3: 'alpha', F4: 'mode', F5: ['shift', 'mode'], F6: 'calc', F7: ['shift', 'calc'], F8: 'sd', F9: 'eng',
  Home: 'home', End: 'end',
};
// Alt + letter → variable/recall (ALPHA layer)
export const KEYBOARD_ALT = { a: 'neg', b: 'dms', c: 'hyp', d: 'sin', e: 'cos', f: 'tan', x: 'rp', y: 'sd', m: 'mplus' };
