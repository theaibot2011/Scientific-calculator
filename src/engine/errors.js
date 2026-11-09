// Error types modelled on the fx-991ES error messages, each with a human explanation.
export class CalcError extends Error {
  constructor(kind, detail = '', pos = null) {
    super(`${kind} ERROR${detail ? ': ' + detail : ''}`);
    this.kind = kind;       // 'Math' | 'Syntax' | 'Stack' | 'Argument' | 'Dimension' | 'Can\'t Solve' | 'Time Out' | 'Range'
    this.detail = detail;
    this.pos = pos;
  }
  get title() {
    if (this.kind === "Can't Solve") return "Can't Solve";
    if (this.kind === 'Time Out') return 'Time Out';
    return `${this.kind} ERROR`;
  }
}
export const mathErr = (d) => new CalcError('Math', d);
export const syntaxErr = (d, pos) => new CalcError('Syntax', d, pos);
export const argErr = (d) => new CalcError('Argument', d);
export const dimErr = (d) => new CalcError('Dimension', d);
