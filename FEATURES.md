# Graphite Scientific: feature list and fx-991ES comparison

Legend:

* **[fx-991ES]**: a function of the original Casio fx-991ES.
* **[later Casio]**: found on later Casio models (fx-991ES PLUS, fx-115ES PLUS, fx-991EX) but not on the original fx-991ES.
* **[added]**: an enhancement specific to this application.

The sandbox used to build this app could not reach Casio's manual servers. The ES / ES PLUS split below is
therefore based on general knowledge of those models, not checked line by line against the manual. Treat the
**[later Casio]** tags as approximate.

## Implemented and tested

### Input and display
- Natural display (MathIO) with vertical fractions, radicals, superscripts, nested templates, ∫/Σ notation, and a blinking cursor you can position by clicking **[fx-991ES]**
- Linear display (LineIO) **[fx-991ES]**
- Exact results: fractions, mixed fractions, surds `a√b/c` and `(p ± q√b)/s`, multiples of π. Decimal inputs become fractions (0.75 → 3/4) **[fx-991ES]**
- S⇔D, a b/c ⇔ d/c, ENG / ←ENG, DMS output **[fx-991ES]**; ≈ decimal result (SHIFT =) **[later Casio]**
- Norm1 / Norm2 / Fix 0–9 / Sci 1–10 **[fx-991ES]**; engineering-symbol output (k, M, μ …) **[added]**
- Status indicators: S, A, M, STO, RCL, hyp, mode, base, FIX/SCI, ENG, Math/Line, D/R/G **[fx-991ES]**
- Error screens: Math, Syntax, Stack, Argument, Dimension, Can't Solve, Time Out. Each has a plain-language explanation **[added]** and ◀/▶ to go back and edit **[fx-991ES]**

### Basic calculation
- + − × ÷, brackets (auto-closed at the end), nested expressions, operator priority as in the fx-991ES manual. Implicit multiplication binds tighter than ÷, so 1÷2π = 1/(2π), and −2² = −4 **[fx-991ES]**
- Fractions, mixed fractions, reciprocal x⁻¹, percent, negative numbers (−) **[fx-991ES]**
- x², x³, x^y, √, ∛, ˣ√ (exact where possible, e.g. √12 = 2√3, (−8)^(1/3) = −2) **[fx-991ES]**
- x! for 0…170 (the fx-991ES stops at 69) **[fx-991ES]**; Γ(x+1) for non-integers **[added]**
- Abs **[fx-991ES]**; GCD, LCM, Int, Intg, ÷R (quotient and remainder), FACT (prime factorisation) **[later Casio]**; Floor, Ceil, Sign, Frac **[added]**
- Ans, auto-Ans continuation, REPLAY (▲), multiple-step editing **[fx-991ES]**

### Scientific
- sin, cos, tan and inverses in Deg / Rad / Gra. Exact values at multiples of 30° and 45°, and tan 90° gives Math ERROR **[fx-991ES]**
- sinh, cosh, tanh and inverses (hyp key) **[fx-991ES]**
- log, ln, logₐb, 10^x, e^x **[fx-991ES]**
- ×10ˣ scientific entry, π, e **[fx-991ES]**
- Angle-unit markers ° ʳ ᵍ (DRG▸) and DMS entry °′″ **[fx-991ES]**
- 40 scientific constants (CONST), with values updated to CODATA 2018 **[fx-991ES]**
- 40 metric conversions (CONV) **[fx-991ES]**

### Advanced
- nPr, nCr (exact BigInt) **[fx-991ES]**
- Ran# **[fx-991ES]**; RanInt#(a,b) **[later Casio]**
- Rnd( rounding to the display format **[fx-991ES]**
- Pol( / Rec( with results stored in X, Y **[fx-991ES]**
- d/dx numerical derivative (Ridders extrapolation) **[fx-991ES]**
- ∫ definite integral (adaptive Gauss–Kronrod 7/15) **[fx-991ES]**
- Σ summation **[later Casio]**; Π product **[added]**
- SOLVE: numerical root finding (safeguarded Newton, then sign-change search with Brent). Shows X and L−R **[fx-991ES]**
- CALC: prompts for each variable; `Y=…` assignment form **[fx-991ES]**

### EQN mode
- Simultaneous linear equations in 2 and 3 unknowns, with exact fraction results **[fx-991ES]**; 4 unknowns **[later Casio]**
- "No Solution" / "Infinite Solution" detection using rank **[later Casio]**
- Quadratic and cubic equations with real and complex roots. Quadratics are solved exactly in surd form, e.g. (1+√5)/2 and −1/2+√3/2 i **[fx-991ES]**
- Quadratic vertex (minimum or maximum) **[later Casio]**
- Quartic **[later Casio]**; degree 5 and 6 polynomials **[added]**
- Step-by-step working (discriminant, Cramer's rule) in the Inspect tab **[added]**

### CMPLX mode
- Complex arithmetic, i, polar entry r∠θ, arg, Conjg, Abs, ▸r∠θ / ▸a+bi, and the a+bi / r∠θ output setting **[fx-991ES]**
- ReP, ImP **[later Casio]**
- Complex results for √ of negative numbers, logs of negative numbers, and non-integer complex powers **[added]**

### MATRIX mode
- MatA–MatC up to 3×3 plus MatAns, with Dim/Data editors **[fx-991ES]**; 4×4 **[later Casio]**
- +, −, ×, scalar ×, x⁻¹ (inverse), x², x³, integer powers, det, Trn, Abs. Results stay exact (fractions) **[fx-991ES]**
- Rank, Trace, Identity **[added]**
- Dimension and singular-matrix errors **[fx-991ES]**

### VECTOR mode
- VctA–VctC (2D/3D) plus VctAns; +, −, scalar ×, dot product, cross product, Abs (magnitude) **[fx-991ES]**
- Angle between vectors, unit vector **[later Casio]**

### STAT mode
- Data editor with X, Y and optional FREQ columns (up to 200 rows; the fx-991ES has fewer) **[fx-991ES]**
- 1-VAR, A+BX, _+CX², ln X, e^X, A·B^X, A·X^B, 1/X regressions **[fx-991ES]**
- n, x̄, σx, sx, Σx, Σx², ȳ, σy, sy, Σy, Σy², Σxy, Σx³, Σx²y, Σx⁴, minX/maxX/minY/maxY, A, B, C, r, x̂, ŷ (x̂₁, x̂₂ for quadratic regression) **[fx-991ES]**
- Median and quartiles **[later Casio]**
- Normal distribution P(, Q(, R(, ▸t **[fx-991ES]**
- Full statistics summary screen with variances, and R² for quadratic regression **[added]**

### BASE-N mode
- DEC/HEX/BIN/OCT switching on the x², x⁻¹, log, ln keys; A–F on the (−)…tan keys; base prefixes d, h, b, o **[fx-991ES]**
- +, −, ×, ÷ (integer), and, or, xor, xnor, Not, Neg **[fx-991ES]**
- The other bases are shown live under the result **[added]**

### TABLE mode
- f(X) table with Start/End/Step **[fx-991ES]**; second function g(X) **[later Casio]**
- Up to 199 rows (the fx-991ES allows 30) and a plot of the table in the Inspect tab **[added]**
- An error in one cell does not stop the rest of the table **[fx-991ES]**

### Memory
- Variables A–F, X, Y, M with STO / RCL; M+, M−; Ans **[fx-991ES]**
- CLR: Setup / Memory / All **[fx-991ES]**; clear History **[added]**
- Everything persists between sessions **[added]**

### Desktop extras [added]
- Persistent, searchable history panel with copy, reuse and delete
- Copy result (Ctrl+C) / copy expression (Ctrl+Shift+C) / paste linear text (Ctrl+V, e.g. `sqrt(2)/2+sin(30)`)
- Result inspector: exact, decimal, scientific, engineering, mixed, hex, binary, prime factors, DMS
- Unit converter with 14 categories and about 130 units
- Constants browser with search
- In-app function reference and keyboard guide
- Three themes, optional key-click sound, always-on-top, resizable window with automatic scaling, remembered window position

## Partially supported or different from the fx-991ES

| Area | Difference |
|---|---|
| Internal precision | IEEE double precision (about 15–16 significant digits) instead of Casio's 15-digit decimal arithmetic. Exact rational arithmetic (BigInt) is used wherever inputs are rational, so most everyday results match exactly, but the 10th displayed digit of some transcendental results can differ by one unit. |
| Number range | About ±1.8×10³⁰⁸ instead of ±10¹⁰⁰. |
| Exact (V.P.A.M.) forms | Recognises fractions, `a√b/c`, `(p ± q√b)/s` and `aπ/b`. Mixed forms such as `√2·π` are shown as decimals. Exact forms are found by verified numerical recognition, not full symbolic algebra. |
| BASE-N | All bases use 32-bit two's complement. On the Casio, binary is limited to 16 bits. |
| SOLVE | Solves for X (or the first variable if there is no X). Casio's syntax for choosing a different solve variable is not supported. SOLVE is available in COMP mode only. |
| STAT editor | Rows can be deleted (DEL on a cell); there is no "insert row" command. |
| Prime factorisation | Very large numbers whose factors cannot be found within the time limit show the unfactored part in brackets. |
| Matrices | A matrix result can't be stored straight into MatA–C with STO; it stays in MatAns and can be used from there. |

## Not implemented

- Multi-statement calculations separated by `:` (ALPHA ∫ on the Casio).
- Overwrite (OVR) editing mode and SHIFT INS template wrapping.
- Engineering-symbol input (typing `4k`). Engineering symbols are output only.
- LCD contrast, the decimal-comma setting, and the hardware RESET/ON/OFF keys. These don't apply to a desktop app.
- Trigonometric or hyperbolic functions of complex arguments (the fx-991ES doesn't have these either).
