/* ---------------------------------------------------------------------------
 * dec.js: the calculator's 14-digit decimal arithmetic.
 *
 * A TI-83/84 stores every real as 14 significant decimal digits, not as a
 * binary double. Matrix work accumulates visible differences from doubles
 * (det([[1,2],[3,4]]) is ⁻2.0000000000001 on the real machine), so the matrix
 * code runs on this type and only converts to a JS number at the edges.
 *
 * Rules, each verified against a real TI-84 Plus (OS 2.55MP):
 *   * every + - * / result is the exact result rounded half-up to 14 digits;
 *   * an addition or subtraction that cancels 13 or more leading digits
 *     returns exactly 0 (1-.9999999999999 = 0, but 1-.999999999999 = 1ᴇ⁻12).
 *
 * A value is { s: 1|-1, m: BigInt, e: int } meaning s * m * 10^e, with m
 * either 0n or exactly 14 digits (10^13 <= m < 10^14).
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LO = 10000000000000n;      /* 10^13 */
  var HI = 100000000000000n;     /* 10^14 */
  var ZERO = { s: 1, m: 0n, e: 0 };
  var ONE = { s: 1, m: LO, e: -13 };

  var POW = [1n];
  function pow10(n) {
    while (POW.length <= n) POW.push(POW[POW.length - 1] * 10n);
    return POW[n];
  }

  function digits(n) { return n === 0n ? 0 : n.toString().length; }

  /* Round the non-negative integer M * 10^E to 14 digits, half up. */
  function norm(s, M, E) {
    if (M === 0n) return ZERO;
    var len = digits(M);
    if (len < 14) {
      M *= pow10(14 - len);
      E -= 14 - len;
    } else if (len > 14) {
      var drop = len - 14;
      var q = M / pow10(drop);
      var next = (M / pow10(drop - 1)) % 10n;
      if (next >= 5n) q += 1n;
      M = q;
      E += drop;
      if (M === HI) { M = LO; E += 1; }
    }
    return { s: s, m: M, e: E };
  }

  function from(x) {
    if (x === 0 || !isFinite(x)) return ZERO;
    var str = Math.abs(x).toExponential(13);          /* d.ddddddddddddde±N */
    var at = str.indexOf('e');
    var digs = str.charAt(0) + str.slice(2, at);
    return { s: x < 0 ? -1 : 1, m: BigInt(digs), e: parseInt(str.slice(at + 1), 10) - 13 };
  }

  function toNumber(d) {
    if (d.m === 0n) return 0;
    return Number((d.s < 0 ? '-' : '') + d.m.toString() + 'e' + d.e);
  }

  function isZero(d) { return d.m === 0n; }
  function neg(d) { return d.m === 0n ? d : { s: -d.s, m: d.m, e: d.e }; }
  function abs(d) { return d.s < 0 ? { s: 1, m: d.m, e: d.e } : d; }

  /* exponent of the leading digit */
  function lead(d) { return d.e + 13; }

  function cmpAbs(a, b) {
    if (a.m === 0n) return b.m === 0n ? 0 : -1;
    if (b.m === 0n) return 1;
    var la = lead(a), lb = lead(b);
    if (la !== lb) return la > lb ? 1 : -1;
    return a.m > b.m ? 1 : a.m < b.m ? -1 : 0;
  }

  function cmp(a, b) {
    var sa = a.m === 0n ? 0 : a.s, sb = b.m === 0n ? 0 : b.s;
    if (sa !== sb) return sa > sb ? 1 : -1;
    if (sa === 0) return 0;
    return cmpAbs(a, b) * sa;
  }

  function mul(a, b) {
    if (a.m === 0n || b.m === 0n) return ZERO;
    return norm(a.s * b.s, a.m * b.m, a.e + b.e);
  }

  /* Caller guarantees b != 0. */
  function div(a, b) {
    if (a.m === 0n) return ZERO;
    return norm(a.s * b.s, (a.m * pow10(16)) / b.m, a.e - b.e - 16);
  }

  /* Guard digits kept below the 14th when the smaller operand is aligned.
     Whatever falls past them is dropped, not rounded: the real machine gives
     -8472344763845000 + 1150.5 = -8472344763843900, where the exact sum
     would round to ...3800. */
  var GUARD = 2;

  function add(a, b) {
    if (a.m === 0n) return b;
    if (b.m === 0n) return a;
    var big = cmpAbs(a, b) >= 0 ? a : b;
    var small = big === a ? b : a;
    var gap = big.e - small.e;
    if (gap > 14 + GUARD) return big;
    var A = big.m * pow10(GUARD);
    var B = small.m * pow10(GUARD) / pow10(gap);        /* truncating */
    var S = big.s === small.s ? A + B : A - B;
    if (S === 0n) return ZERO;
    var E = big.e - GUARD;
    /* cancelling 13 or more leading digits is exactly zero */
    var sumLead = E + digits(S) - 1;
    if (sumLead <= lead(big) - 13) return ZERO;
    return norm(big.s, S, E);
  }

  function sub(a, b) { return add(a, neg(b)); }

  function fromInt(n) { return from(n); }

  /* Drop the digits right of 10^-places, rounding the first dropped digit
     half away from zero. places may be 0 or negative. */
  function roundTo(d, places) {
    if (d.m === 0n) return d;
    var shift = -places - d.e;               /* digits to drop */
    if (shift <= 0) return d;
    if (shift > 14) return ZERO;
    var q = d.m / pow10(shift);
    if ((d.m / pow10(shift - 1)) % 10n >= 5n) q += 1n;
    return q === 0n ? ZERO : norm(d.s, q, d.e + shift);
  }

  /* toward zero */
  function trunc(d) {
    if (d.m === 0n || d.e >= 0) return d;
    var shift = -d.e;
    if (shift > 14) return ZERO;
    var q = d.m / pow10(shift);
    return q === 0n ? ZERO : norm(d.s, q, 0);
  }

  /* toward minus infinity */
  function floor(d) {
    var t = trunc(d);
    if (d.s < 0 && cmp(t, d) !== 0) return sub(t, ONE);
    return t;
  }

  TI.Dec = {
    ZERO: ZERO, ONE: ONE,
    from: from, toNumber: toNumber, fromInt: fromInt,
    isZero: isZero, neg: neg, abs: abs,
    cmp: cmp, cmpAbs: cmpAbs,
    add: add, sub: sub, mul: mul, div: div,
    roundTo: roundTo, trunc: trunc, floor: floor,
    setGuard: function (g) { GUARD = g; }
  };
})(window.TI = window.TI || {});
