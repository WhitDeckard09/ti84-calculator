# TI-84 Plus

A graphing calculator for the phone that behaves like a TI-84 Plus — same keypad,
same screens, same arithmetic, same 96×64 display.

### ▶ [whitdeckard09.github.io/ti84-calculator](https://whitdeckard09.github.io/ti84-calculator/)

No build step and no dependencies. Open `index.html` and it runs.

---

## Running it

**On a phone.** Open the link above in Safari, then **Share → Add to Home
Screen**. It launches full screen with no browser chrome, works offline once
loaded, and keeps your functions, window settings and notes between sessions.

The layout has no fixed dimensions — it measures the screen, takes the widest
LCD the case allows, and backs off a step if that would squeeze the keypad,
so it fits every iPhone from the SE up to the Pro Max without any per-device
tuning. Safe-area insets are respected, so nothing hides behind the Dynamic
Island or the home indicator. Double-tap and pinch cannot zoom the page; the
only pinch that does anything is on the graph.

**On a desktop.** Double-click `index.html`, or serve the folder and visit
`http://localhost:8000`. The number keys, operators, arrows, Enter and
Backspace are wired to the physical keyboard.

```bash
python3 serve.py 8000
```

(`serve.py` is `http.server` with caching turned off, so edits show up on
reload. Any static server works.)

**As a native binary.** The app is plain HTML/CSS/JS, so it drops into a
[Capacitor](https://capacitorjs.com) shell unchanged:

```bash
npm install @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npx cap init "TI-84" com.example.ti84 --web-dir=.
npx cap add ios && npx cap add android
```

---

## The display

The screen is a real 96×64 monochrome framebuffer with the TI's two bitmap fonts
(5×7 in a 6×8 cell for text, 3×5 for TRACE readouts). Nothing is drawn with the
browser's text renderer.

That matters for more than looks. The graph area is **95×63 pixels**, so

```
ΔX = (Xmax − Xmin) / 94        ΔY = (Ymax − Ymin) / 62
```

which is why TRACE on the standard window steps in `.2127659574` and lands
exactly on `X=0` at the middle column — the same numbers the hardware gives.

---

## Screens

| Key | Screen |
|---|---|
| *(home)* | Type a whole expression, press ENTER. Entries left-aligned, answers right-aligned, scrollback above. `2nd ENTRY` walks back through past entries; swipe the screen to scroll further back. |
| `Y=` | Ten function slots, Y1–Y0. A function plots when its `=` is highlighted — arrow left onto the `=` and press ENTER to toggle. |
| `WINDOW` | Xmin, Xmax, Xscl, Ymin, Ymax, Yscl, Xres. Fields accept expressions, so `2π` in Xmax is fine. |
| `ZOOM` | ZBox, Zoom In, Zoom Out, ZDecimal, ZSquare, ZStandard, ZTrig, ZInteger, ZoomFit, and the MEMORY tab (ZPrevious / ZoomSto / ZoomRcl). |
| `GRAPH` | Plots every selected function. Free cursor with arrows; drag to pan and pinch to zoom. |
| `TRACE` | Walks the curve pixel by pixel, reads out X and Y, up/down switches functions, and pans the window when you trace past the edge. |
| `2nd GRAPH` → TABLE | X and Y columns with a full-precision readout of the highlighted cell. Scrolls without limit in both directions. |
| `2nd WINDOW` → TBLSET | TblStart, ΔTbl, Indpnt and Depend (Auto / Ask). |
| `MODE` | NORMAL/SCI/ENG, FLOAT/0–9, RADIAN/DEGREE, CONNECTED/DOT. |
| `2nd ZOOM` → FORMAT | CoordOn/Off, GridOn/Off, AxesOn/Off, LabelOn/Off, ExprOn/Off. |
| `PRGM` | EXEC / EDIT / NEW. Create a program, type into it, run it. This is where notes live — see below. |
| `APPS` | Opens your notes. |
| `MATH` | MATH (▸Frac, ▸Dec, ³, ³√, ˣ√, fMin, fMax, nDeriv, fnInt), NUM (abs, round, iPart, fPart, int, min, max, lcm, gcd), PRB (rand, nPr, nCr, !, randInt). |
| `2nd MATH` → TEST | Relational operators and `and` / `or` / `xor` / `not`. |
| `VARS` | Inserts a Y-variable reference, so `Y1` can appear inside another expression. |
| `2nd x⁻¹` → MATRIX | NAMES pastes `[A]`…`[J]` with their sizes, MATH holds `det(`, `ᵀ`, `dim(`, `Fill(`, `identity(`, `randM(`, `augment(`, `Matr▸list(`, `List▸matr(`, `cumSum(`, `ref(`, `rref(` and the four row operations, EDIT opens the matrix editor. |
| `2nd ×` `2nd −` | `[` and `]`, for matrix literals such as `[[1,2][3,4]]`. |
| `2nd (` `2nd )` | `{` and `}`, for list literals such as `{1,2,3}`. |
| `2nd 1` … `2nd 6` | The lists `L₁` to `L₆`. |
| `2nd +` → MEM | About, delete a program, reset to defaults, or clear all RAM. |

Everything is saved as you go, so closing the app keeps your functions, window
and mode settings.

---

## Notes and programs

Notes go where they go on a real TI-84: in a program.

```
PRGM  →  ▶ NEW  →  1:Create New
```

Type a name (A-LOCK is already on, so letters come straight off the keypad),
press ENTER, and you are in the editor. Each line starts with `:` and holds
whatever you type. `2nd ALPHA` locks the ALPHA layer so you can write a
sentence without pressing ALPHA between every letter, `ENTER` starts a new
line, and `2nd MODE` quits. Everything saves as you type.

To read a note again: `PRGM → ▶ EDIT → your program`, or just press `APPS`.

```
PROGRAM:PHYSICS
:CH 4 FORMULAS
:F=MA
:KE=1/2MV²
:P=MV
:V=IR
```

Delete one with `2nd + → 2:Delete Prgm…`.

### Programs that run

Press `PRGM` inside the editor to paste commands from the CTL and I/O menus,
then run the program from `PRGM → EXEC`. These commands work:

```
CTL   If  Then  Else  For(  While  Repeat  End  Pause
      Lbl  Goto  Return  Stop  DelVar  prgm
I/O   Input  Prompt  Disp  Output(  ClrHome
```

Plus stores, expressions, and calls to other programs. `Pause` waits for
ENTER; `Input` and `Prompt` hand the line back to you and resume when you
press ENTER. `ON` breaks a running program, and a runtime error offers
`2:Goto`, which drops you into the editor on the line that failed.

```
:ClrHome
:Prompt R
:Disp "AREA",πR²
```

Two differences from the hardware worth knowing. Statements are one per line
rather than separated by `:` within a line — the editor already displays TI
programs that way, so it reads the same. And a store inside a program is
silent, as it is on a real TI, while a bare expression displays its answer.

---

## Order of operations

Binding powers reproduce the TI-83/84 evaluation order, highest first:

```
10  postfix   x²  x³  x⁻¹  !  °
 9  ^  ˣ√                         (right associative)
 8  unary (-)
 7  nPr  nCr
 6  *  /  and implied multiplication
 5  +  -
 4  =  ≠  >  ≥  <  ≤
 3  and
 2  or  xor
 1  →  (store)
```

The consequences people trip over on the real machine behave the same way here:

| Entry | Result | Why |
|---|---|---|
| `(-)2²` | `⁻4` | `x²` outranks negation, so it is `⁻(2²)` |
| `2^3^2` | `512` | powers associate right, `2^(3^2)` |
| `1/2X` with X=3 | `1.5` | implied multiplication gets no special rank on a TI-83/84 |
| `5(-)3` | `ERR:SYNTAX` | `(-)` is negation; subtraction needs the `−` key |
| `2^(-)3` | `.125` | negation is fine as an exponent |
| `(-)8^(1/3)` | `⁻2` | the power runs before the negation |
| `((-)8)^(1/3)` | `ERR:NONREAL ANS` | fractional power of a negative base |

Unclosed parentheses are closed for you at ENTER: `2(3+4` is `14`.

---

## Number display

Ten significant digits on screen, the leading zero dropped, negatives written
with the raised minus, and scientific notation below `.001` or from `1ᴇ10` up.

```
1/2          .5
1/3          .3333333333
2/3          .6666666667
.1+.2        .3
1/1000       .001
1/10000      1ᴇ⁻4
√2           1.414213562
(-)1/4       ⁻.25
```

Fractions come from `MATH 1:▸Frac`, which converts by continued fractions and
falls back to the decimal when the denominator runs past four digits — so
`1/2+1/3▸Frac` is `5/6` but `π▸Frac` stays `3.141592654`.

---

## Matrices and lists

Ten matrices, `[A]` to `[J]`, up to 99×99, and six lists, `L₁` to `L₆`. Type a
literal (`[[1,2][3,4]]`, `{1,2,3}`), store it with `→`, and use it in any
expression:

```
[[1,2][3,4]]→[A]           stores it
[A]²                       [[7  10]
                            [15 22]]
det([A])                   ⁻2
[A](2,1)                   3
9→[A](1,2)                 sets one entry
{3,3}→dim([A])             resizes, keeping what fits
{1,2,3}*2                  {2 4 6}
```

| | |
|---|---|
| `+` `−` | matrix with matrix, same size (`ERR:DIM MISMATCH` otherwise); a number never mixes in (`ERR:DATA TYPE`) |
| `*` | matrix × matrix, number × matrix, matrix × number |
| `^` | `[A]^n` for whole `n ≥ 0`, and `[A]⁻¹`; `x²`, `x³` and `ᵀ` work too |
| `=` `≠` | compare whole matrices; `<` and the rest are `ERR:DATA TYPE` |
| `abs(` `round(` `iPart(` `fPart(` `int(` | act on every entry |
| lists | every operator and function works entry by entry, with a number broadcast across |

The matrix editor is the real one: type the dimensions first (UP from the top
row reaches them), then entries, which are expressions, so `2π` is fine. ENTER
walks across a row and then down.

A wide matrix is cut off at the screen edge with `…`, and the arrow keys scroll
it sideways, as on the calculator.

### Matching the real numbers

A TI-84 does not compute in binary doubles. Every real is 14 significant
decimal digits, and matrix algebra shows it: `det([[1,2],[3,4]])` is
`⁻2.0000000000001` inside the calculator, and `[[1,2][3,4]]⁻¹` holds
`⁻1.9999999999998`. A version built on binary doubles gets different digits in
the 13th place, and can disagree with the calculator about whether a nearly
singular matrix is singular at all.

So the matrix code runs on its own decimal type (`js/math/dec.js`) and each
algorithm follows the order of operations the real OS uses:

- every `+ − × ÷` is the exact result rounded to 14 digits, half up;
- an addition aligns the smaller operand with two guard digits and **drops**
  the rest, so `⁻8472344763845000+1150.5` is `⁻8472344763843900`;
- an addition that cancels 13 or more leading digits is exactly `0`;
- `[A]*[B]` sums each entry from the last term to the first;
- `det(` is Crout LU with partial pivoting, dot products summed first and
  subtracted once, pivots multiplied last to first;
- `[A]⁻¹` is `U⁻¹·L⁻¹` on that same factorisation;
- a pivot under `3ᴇ⁻13 · n ·` (largest row sum) counts as zero, which is what
  makes `[[1,2][3,6.00000000001]]⁻¹` an `ERR:SINGULAR MAT` and
  `[[1,2][3,6.0000000001]]⁻¹` not.

Those rules were not guessed. They were recovered by running the real OS in an
emulator and comparing results at full 14-digit precision, and `test/` holds
the real calculator's answers: 700-odd matrix and list results that this engine
reproduces digit for digit, apart from a few `rref(` and `ref(` inputs that are
rank deficient and span ten orders of magnitude (last digit only).

Scalar arithmetic outside matrices and lists is still ordinary double
arithmetic rounded to ten digits for display.

---

## Phone-specific additions

Three things the hardware has no way to do, added because a touchscreen does:

- **Drag** the graph to pan, **pinch** to zoom.
- **Swipe** the home screen to scroll further back through history than the
  eight visible lines.
- The **2nd** and **ALPHA** keys light up while their layer is armed, since a
  phone has no cursor to watch on every screen.

Key presses fire on touch-down with a short haptic tick, like a membrane switch.

---

## What is not implemented

These parts of the real OS are not here, and their keys do nothing when
pressed:

`STAT` and its list editor (so `ZoomStat` reports `ERR:STAT`), the `LIST` menu
(lists themselves work from `L₁` to `L₆` and `{ }`), `2nd TRACE` (CALC),
`2nd Y=` (STAT PLOT), `DISTR`, `DRAW`, `LINK`, `CATALOG`, complex numbers
(`a+bi`), and the PAR / POL / SEQ graphing modes. MODE displays
those rows so the screen reads correctly, but only the supported options can be
selected.

Two deliberate shortcuts:

- `VARS` opens the Y-variable list directly instead of going through
  `VARS → Y-VARS → Function`, because that is the only branch of that menu
  that does anything here.
- `APPS` opens your notes. A real TI-84 lists installed applications there and
  this build has none, so the key goes to what most people press it looking
  for. The authentic route, `PRGM → EDIT`, works too.

---

## Layout

```
index.html            shell and script order
css/calc.css          case, keypad, key colours
js/font.js            5×7 and 3×5 bitmap fonts
js/lcd.js             96×64 framebuffer and drawing primitives
js/state.js           persisted state, and the shared line editor
js/prgm.js            program storage and the TI-BASIC interpreter
js/keypad.js          the key matrix: layout, legends, three bindings per key
js/app.js             boot, key routing, gestures, render loop
js/math/tokens.js     token model (a "sin(" is one token, and DEL removes it whole)
js/math/parser.js     precedence-climbing parser
js/math/dec.js        14-digit decimal arithmetic, as the real machine does it
js/math/matrix.js     determinant, inverse, rref and the rest, in TI's order of operations
js/math/evaluator.js  evaluation, honouring MODE; numbers, matrices and lists
js/math/format.js     TI number display rules
js/screens/*.js       home, yequals, fields (WINDOW/TBLSET), settings (MODE/FORMAT),
                      graph, table, prgmedit, matedit, menu
sw.js                 offline cache (network first, so updates land)
serve.py              no-cache dev server
```

---

## Tests

```bash
node test/math.test.js    # 114 checks
node test/prgm.test.js    # 51 checks
node test/matrix.test.js  # 746 recorded answers from a real TI-84 Plus
```

The first covers the parser, evaluator and formatter — each check is an entry a
real TI-84 Plus answers a specific way. The second covers program storage and
every interpreter command, including loops, branches, and suspend/resume for
`Pause`, `Input` and `Prompt`, and `Disp` of matrices and lists.

The third replays `test/matrix.fixtures.json`: matrix and list inputs, with
what a real TI-84 Plus (OS 2.55MP) answered, read back at full 14-digit
precision. 743 match digit for digit; 3 rank-deficient `rref(` / `ref(` inputs
differ in the last digit and are reported separately.
`test/gen-matrix-fixtures.py` regenerates the file, given an emulator and a ROM
image, which are not part of this repository.

For the UI, serve the folder, open the app, and run this in the console:

```js
fetch('/test/ui.js').then(r => r.text()).then(s => (0, eval)(s)).then(() => TIUI.run())
```

60 checks that press real keys and read the resulting framebuffer back — home
arithmetic, Y= editing, WINDOW, every ZOOM preset, TRACE stepping, the table,
writing and reopening a note, running a program, error dialogs, 2nd/ALPHA
latching, and typing, storing, inverting and editing matrices.
