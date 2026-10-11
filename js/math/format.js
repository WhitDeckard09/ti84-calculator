/* ---------------------------------------------------------------------------
 * format.js — TI-83/84 number display rules.
 *
 *   .5            leading zero is dropped
 *   ⁻3            negatives use the raised minus, not the subtraction sign
 *   .3333333333   10 significant digits on screen (14 are kept internally)
 *   1ᴇ⁻4          scientific below .001 or at/above 1ᴇ10
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var NEG = '⁻', EE = 'ᴇ';
  var DISPLAY_DIGITS = 10;

  function sigRound(x, digits) {
    if (x === 0 || !isFinite(x)) return x;
    var mag = Math.floor(Math.log10(Math.abs(x)));
    var f = Math.pow(10, digits - 1 - mag);
    /* guard against f overflowing for extreme magnitudes */
    if (!isFinite(f) || f === 0) return Number(x.toPrecision(digits));
    return Math.round(x * f) / f;
  }

  function stripNum(s) {
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s.indexOf('0.') === 0) s = s.slice(1);
    else if (s.indexOf('-0.') === 0) s = '-' + s.slice(2);
    if (s === '' || s === '-') s = '0';
    return s;
  }

  function signed(s) {
    return s.charAt(0) === '-' ? NEG + s.slice(1) : s;
  }

  function sciParts(x, sig) {
    var e = Math.floor(Math.log10(Math.abs(x)));
    var m = x / Math.pow(10, e);
    m = sigRound(m, sig);
    if (Math.abs(m) >= 10) { m /= 10; e++; }
    if (Math.abs(m) < 1) { m *= 10; e--; }
    return { m: m, e: e };
  }

  function sci(x, sig) {
    var p = sciParts(x, sig);
    var mant = stripNum(p.m.toFixed(Math.max(0, sig - 1)));
    return signed(mant) + EE + signed(String(p.e));
  }

  function eng(x, sig) {
    var p = sciParts(x, sig);
    var shift = ((p.e % 3) + 3) % 3;
    var e = p.e - shift;
    var m = x / Math.pow(10, e);
    m = sigRound(m, sig);
    return signed(stripNum(String(m))) + EE + signed(String(e));
  }

  /* mode: { notation: 'NORMAL'|'SCI'|'ENG', digits: -1 for FLOAT, else 0..9 } */
  function num(x, mode) {
    mode = mode || { notation: 'NORMAL', digits: -1 };
    if (typeof x !== 'number' || x !== x) return 'ERROR';
    if (!isFinite(x)) return signed(x > 0 ? '1' + EE + '100' : '-1' + EE + '100');

    var sig = mode.digits >= 0 ? undefined : DISPLAY_DIGITS;

    if (mode.notation === 'SCI') return sci(x, mode.digits >= 0 ? mode.digits + 1 : DISPLAY_DIGITS);
    if (mode.notation === 'ENG') return eng(x, mode.digits >= 0 ? mode.digits + 1 : DISPLAY_DIGITS);

    /* fixed number of decimals */
    if (mode.digits >= 0) {
      if (Math.abs(x) >= 1e10) return sci(x, mode.digits + 1);
      var s = x.toFixed(mode.digits);
      if (s.indexOf('0.') === 0) s = s.slice(1);
      else if (s.indexOf('-0.') === 0) s = '-' + s.slice(2);
      if (parseFloat(s) === 0) s = s.replace('-', '');
      return signed(s);
    }

    /* FLOAT */
    var v = sigRound(x, DISPLAY_DIGITS);
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e10 || a < 1e-3) return sci(x, DISPLAY_DIGITS);

    /* enough decimals to reach 10 significant digits, then trim */
    var mag = Math.floor(Math.log10(a));
    var dec = Math.max(0, Math.min(12, DISPLAY_DIGITS - 1 - mag));
    return signed(stripNum(v.toFixed(dec)));
  }

  /* ▸Frac output, falling back to the decimal when TI would give up. */
  function frac(x, mode) {
    var f = TI.Eval.toFraction(sigRound(x, 12));
    if (!f) return num(x, mode);
    if (f.d === 1) return num(f.n, mode);
    return signed(String(f.n)) + '/' + String(f.d);
  }

  /* --- matrices and lists -------------------------------------------------
   * [[1 2 3]        entries are left aligned in columns one space apart, the
   *  [4 5 6]]       block is right aligned on the screen.
   * {1 2 3}         lists are one line.
   * Returns the lines; the caller decides how to fit them on 16 columns.
   */
  function matrixLines(M, mode) {
    var cells = M.map(function (r) { return r.map(function (x) { return num(x, mode); }); });
    var widths = [];
    cells.forEach(function (r) {
      r.forEach(function (c, j) { widths[j] = Math.max(widths[j] || 0, Array.from(c).length); });
    });
    return cells.map(function (r, i) {
      var body = r.map(function (c, j) {
        var pad = widths[j] - Array.from(c).length;
        return c + new Array(pad + 1).join(' ');
      }).join(' ');
      var s = (i === 0 ? '[' : ' ') + '[' + body + ']';
      if (i === cells.length - 1) s += ']';
      return s;
    });
  }

  function listLine(L, mode) {
    return '{' + L.map(function (x) { return num(x, mode); }).join(' ') + '}';
  }

  /* A number as text; a matrix or list as { lines: [...] }. */
  function show(v, mode, asFrac) {
    if (Array.isArray(v)) {
      if (v.length && Array.isArray(v[0])) return { lines: matrixLines(v, mode) };
      return { lines: [listLine(v, mode)] };
    }
    return asFrac ? frac(v, mode) : num(v, mode);
  }

  TI.Fmt = { num: num, frac: frac, show: show, sigRound: sigRound, NEG: NEG, EE: EE };
})(window.TI = window.TI || {});
