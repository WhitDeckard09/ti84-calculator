/* ---------------------------------------------------------------------------
 * matrix.js: matrix algebra the way a TI-84 Plus does it.
 *
 * Matrices are arrays of row arrays of JS numbers; lists are flat arrays.
 * Inside, every algorithm runs on TI.Dec (14-digit decimals) and reproduces
 * the real machine's order of operations, because that order is what decides
 * the last digit. What each routine does was recovered from a real TI-84 Plus:
 *
 *   product    sum over k from the LAST column down to the first, each product
 *              rounded to 14 digits, running sum rounded after every add
 *   det        Crout LU, partial pivoting; the dot products are summed
 *              first and subtracted once; the pivots multiply last-to-first
 *   inverse    A = P'LU, then U⁻¹ · L⁻¹ · P
 *   rref, ref  Gauss-Jordan with normalised pivot rows
 *
 * A pivot smaller than 3ᴇ⁻13 · n · (largest row sum of |a|) counts as zero.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var D = TI.Dec;
  var err = TI.Parser.err;
  var MAXDIM = 99;

  function isMat(v) { return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]); }
  function isList(v) { return Array.isArray(v) && !(v.length > 0 && Array.isArray(v[0])); }
  function rows(A) { return A.length; }
  function cols(A) { return A[0].length; }

  function toD(A) { return A.map(function (r) { return r.map(D.from); }); }
  function fromD(A) { return A.map(function (r) { return r.map(D.toNumber); }); }
  function zeros(r, c) {
    var out = [];
    for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(D.ZERO); out.push(row); }
    return out;
  }
  function copy(A) { return A.map(function (r) { return r.slice(); }); }

  function checkFiniteMat(M) {
    for (var i = 0; i < M.length; i++) for (var j = 0; j < M[i].length; j++) {
      if (!isFinite(M[i][j]) || Math.abs(M[i][j]) >= 1e100) throw err('OVERFLOW');
    }
    return M;
  }

  /* --- element-wise --------------------------------------------------- */

  function sameDim(A, B) { return rows(A) === rows(B) && cols(A) === cols(B); }

  function addSub(A, B, sign) {
    if (!sameDim(A, B)) throw err('DIM MISMATCH');
    var a = toD(A), b = toD(B), out = [];
    for (var i = 0; i < a.length; i++) {
      var row = [];
      for (var j = 0; j < a[i].length; j++) {
        row.push(D.toNumber(sign > 0 ? D.add(a[i][j], b[i][j]) : D.sub(a[i][j], b[i][j])));
      }
      out.push(row);
    }
    return checkFiniteMat(out);
  }

  function scale(k, A) {
    var kd = D.from(k);
    return checkFiniteMat(A.map(function (r) {
      return r.map(function (x) { return D.toNumber(D.mul(kd, D.from(x))); });
    }));
  }

  function negate(A) { return A.map(function (r) { return r.map(function (x) { return x === 0 ? 0 : -x; }); }); }

  function map(A, f) { return A.map(function (r) { return r.map(f); }); }

  function equal(A, B) {
    if (!sameDim(A, B)) throw err('DIM MISMATCH');
    for (var i = 0; i < A.length; i++) for (var j = 0; j < A[i].length; j++) if (A[i][j] !== B[i][j]) return false;
    return true;
  }

  /* --- product -------------------------------------------------------- */

  function mulD(a, b) {
    var n = a.length, p = b.length, m = b[0].length, out = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < m; j++) {
        var acc = D.ZERO;
        for (var k = p - 1; k >= 0; k--) acc = D.add(acc, D.mul(a[i][k], b[k][j]));
        row.push(acc);
      }
      out.push(row);
    }
    return out;
  }

  function mul(A, B) {
    if (cols(A) !== rows(B)) throw err('DIM MISMATCH');
    return checkFiniteMat(fromD(mulD(toD(A), toD(B))));
  }

  /* --- elimination helpers --------------------------------------------- */

  /* n * (largest row sum of |a|): the scale the singularity test is built on.
     n is the number of columns. */
  function scaleOf(a) {
    var best = D.ZERO;
    for (var i = 0; i < a.length; i++) {
      var s = D.ZERO;
      for (var j = 0; j < a[i].length; j++) s = D.add(s, D.abs(a[i][j]));
      if (D.cmp(s, best) > 0) best = s;
    }
    return D.mul(D.from(a[0].length), best);
  }
  var TOL = D.from(3e-13);

  /* Crout LU with partial pivoting, in place. Returns { a, perm, sign } or
     null when a pivot falls under the singularity threshold. */
  function crout(a) {
    var n = a.length, sign = 1, perm = [], i, j, k;
    for (i = 0; i < n; i++) perm.push(i);
    var tol = D.mul(TOL, scaleOf(a));
    for (j = 0; j < n; j++) {
      for (i = j; i < n; i++) {
        var acc = D.ZERO;
        for (k = 0; k < j; k++) acc = D.add(acc, D.mul(a[i][k], a[k][j]));
        a[i][j] = D.sub(a[i][j], acc);
      }
      var p = j;
      for (i = j + 1; i < n; i++) if (D.cmpAbs(a[i][j], a[p][j]) > 0) p = i;
      if (D.isZero(a[p][j]) || D.cmpAbs(a[p][j], tol) < 0) return null;
      if (p !== j) {
        var t = a[p]; a[p] = a[j]; a[j] = t;
        var tp = perm[p]; perm[p] = perm[j]; perm[j] = tp;
        sign = -sign;
      }
      var piv = a[j][j];
      for (var c = j + 1; c < n; c++) {
        var s = D.ZERO;
        for (k = 0; k < j; k++) s = D.add(s, D.mul(a[j][k], a[k][c]));
        a[j][c] = D.div(D.sub(a[j][c], s), piv);
      }
    }
    return { a: a, perm: perm, sign: sign };
  }

  function squareOrThrow(A) {
    if (rows(A) !== cols(A)) throw err('INVALID DIM');
  }

  function det(A) {
    squareOrThrow(A);
    var f = crout(toD(A));
    if (!f) return 0;
    var d = D.ONE;
    for (var i = A.length - 1; i >= 0; i--) d = D.mul(d, f.a[i][i]);
    if (f.sign < 0) d = D.neg(d);
    return D.toNumber(d);
  }

  function inverse(A) {
    squareOrThrow(A);
    var n = A.length;
    if (n === 1) {
      if (A[0][0] === 0) throw err('DIVIDE BY 0');
      return [[D.toNumber(D.div(D.ONE, D.from(A[0][0])))]];
    }
    var f = crout(toD(A));
    if (!f) throw err('SINGULAR MAT');
    var a = f.a, i, j, k;

    /* U⁻¹ (unit upper), column by column */
    var Ui = zeros(n, n);
    for (i = 0; i < n; i++) Ui[i][i] = D.ONE;
    for (j = 0; j < n; j++) {
      for (i = j - 1; i >= 0; i--) {
        var acc = a[i][j];                              /* the diagonal term first */
        for (k = i + 1; k < j; k++) acc = D.add(acc, D.mul(a[i][k], Ui[k][j]));
        Ui[i][j] = D.neg(acc);
      }
    }
    /* L⁻¹ (lower) */
    var Li = zeros(n, n);
    for (i = 0; i < n; i++) Li[i][i] = D.div(D.ONE, a[i][i]);
    for (j = 0; j < n; j++) {
      for (i = j + 1; i < n; i++) {
        var s = D.ZERO;
        for (k = j; k < i; k++) s = D.add(s, D.mul(a[i][k], Li[k][j]));
        Li[i][j] = D.div(D.neg(s), a[i][i]);
      }
    }
    var W = zeros(n, n);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      var t = D.ZERO;
      for (k = 0; k < n; k++) t = D.add(t, D.mul(Ui[i][k], Li[k][j]));
      W[i][j] = t;
    }
    var X = zeros(n, n);
    for (i = 0; i < n; i++) for (var r = 0; r < n; r++) X[r][f.perm[i]] = W[r][i];
    return checkFiniteMat(fromD(X));
  }

  function transpose(A) {
    var out = [];
    for (var j = 0; j < cols(A); j++) { var row = []; for (var i = 0; i < rows(A); i++) row.push(A[i][j]); out.push(row); }
    return out;
  }

  function identity(n) {
    if (!(n >= 1 && n <= MAXDIM) || n !== Math.floor(n)) throw err('INVALID DIM');
    var out = [];
    for (var i = 0; i < n; i++) { var row = []; for (var j = 0; j < n; j++) row.push(i === j ? 1 : 0); out.push(row); }
    return out;
  }

  function overflowGuard(a) {
    for (var i = 0; i < a.length; i++) for (var j = 0; j < a[i].length; j++) {
      var d = a[i][j];
      if (d.m !== 0n && d.e + 13 >= 100) throw err('OVERFLOW');
    }
    return a;
  }

  /* A^n for integer n >= -1 */
  function power(A, n) {
    squareOrThrow(A);
    if (n !== Math.floor(n)) throw err('DOMAIN');
    if (n === -1) return inverse(A);
    if (n < -1) throw err('DOMAIN');
    if (n === 0) return identity(A.length);
    /* repeated squaring, low bit first: res times base each time a bit is set.
       Anything past 1ᴇ99 is OVERFLOW, so a huge exponent stops early. */
    var base = toD(A), res = null, e = n;
    while (e > 0) {
      if (e % 2 === 1) res = res ? overflowGuard(mulD(res, base)) : base;
      e = Math.floor(e / 2);
      if (e > 0) base = overflowGuard(mulD(base, base));
    }
    return checkFiniteMat(fromD(res));
  }

  /* --- row reduction --------------------------------------------------- */

  function reduce(A, full) {
    var m = rows(A), n = cols(A);
    if (m > n) throw err('INVALID DIM');
    var M = toD(A);
    var tol = D.mul(TOL, scaleOf(M));
    var r = 0, c, i, j;
    for (c = 0; c < n && r < m; c++) {
      var p = r;
      for (i = r + 1; i < m; i++) if (D.cmpAbs(M[i][c], M[p][c]) > 0) p = i;
      if (D.isZero(M[p][c]) || D.cmpAbs(M[p][c], tol) <= 0) {
        for (i = r; i < m; i++) M[i][c] = D.ZERO;
        continue;
      }
      var t = M[p]; M[p] = M[r]; M[r] = t;
      var pv = M[r][c];
      var row = M[r].map(function (x) { return D.div(x, pv); });
      row[c] = D.ONE;
      M[r] = row;
      for (i = 0; i < m; i++) {
        if (i === r || (!full && i < r)) continue;
        var f = M[i][c];
        if (D.isZero(f)) continue;
        for (j = 0; j < n; j++) M[i][j] = D.sub(M[i][j], D.mul(f, row[j]));
        M[i][c] = D.ZERO;
      }
      r++;
    }
    return fromD(M);
  }

  /* --- assembling / editing ---------------------------------------------- */

  function augment(A, B) {
    if (rows(A) !== rows(B)) throw err('DIM MISMATCH');
    return A.map(function (r, i) { return r.concat(B[i]); });
  }

  function cumSum(A) {
    var a = toD(A), out = [], i, j;
    for (i = 0; i < a.length; i++) {
      var row = [];
      for (j = 0; j < a[i].length; j++) row.push(i === 0 ? a[i][j] : D.add(out[i - 1][j], a[i][j]));
      out.push(row);
    }
    return fromD(out);
  }

  function cumSumList(l) {
    var acc = D.ZERO;
    return l.map(function (x) { acc = D.add(acc, D.from(x)); return D.toNumber(acc); });
  }

  function rowIndex(A, v) {
    if (v !== Math.floor(v) || v < 1 || v > rows(A)) throw err('INVALID DIM');
    return v - 1;
  }

  function rowSwap(A, r1, r2) {
    var a = rowIndex(A, r1), b = rowIndex(A, r2);
    var out = copy(A);
    var t = out[a]; out[a] = out[b]; out[b] = t;
    return out;
  }

  /* row+(A, r1, r2): row r2 becomes row r1 + row r2 */
  function rowPlus(A, r1, r2) {
    var a = rowIndex(A, r1), b = rowIndex(A, r2);
    var out = copy(A);
    out[b] = A[b].map(function (x, j) { return D.toNumber(D.add(D.from(A[a][j]), D.from(x))); });
    return out;
  }

  /* *row(k, A, r) */
  function mulRow(k, A, r) {
    var a = rowIndex(A, r);
    var out = copy(A), kd = D.from(k);
    out[a] = A[a].map(function (x) { return D.toNumber(D.mul(kd, D.from(x))); });
    return checkFiniteMat(out);
  }

  /* *row+(k, A, r1, r2): row r2 becomes k * row r1 + row r2 */
  function mulRowPlus(k, A, r1, r2) {
    var a = rowIndex(A, r1), b = rowIndex(A, r2);
    var out = copy(A), kd = D.from(k);
    out[b] = A[b].map(function (x, j) {
      return D.toNumber(D.add(D.mul(kd, D.from(A[a][j])), D.from(x)));
    });
    return checkFiniteMat(out);
  }

  function fill(v, r, c) {
    var out = [];
    for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(v); out.push(row); }
    return out;
  }

  /* Resize keeping what fits in place and padding with zeros (the { r, c }→dim( store). */
  function resize(A, r, c) {
    if (r !== Math.floor(r) || c !== Math.floor(c) || r < 1 || c < 1 || r > MAXDIM || c > MAXDIM) throw err('INVALID DIM');
    var out = fill(0, r, c);
    if (A) for (var i = 0; i < r && i < rows(A); i++) for (var j = 0; j < c && j < cols(A); j++) out[i][j] = A[i][j];
    return out;
  }

  function randM(r, c) {
    if (r !== Math.floor(r) || c !== Math.floor(c) || r < 1 || c < 1 || r > MAXDIM || c > MAXDIM) throw err('INVALID DIM');
    var out = [];
    for (var i = 0; i < r; i++) {
      var row = [];
      for (var j = 0; j < c; j++) row.push(Math.floor(Math.random() * 19) - 9);
      out.push(row);
    }
    return out;
  }

  /* Matr▸list: column j of A as a list. */
  function column(A, j) {
    if (j !== Math.floor(j) || j < 1 || j > cols(A)) throw err('INVALID DIM');
    return A.map(function (r) { return r[j - 1]; });
  }

  /* List▸matr: each list becomes a column. */
  function fromLists(lists) {
    var n = lists[0].length;
    for (var i = 1; i < lists.length; i++) if (lists[i].length !== n) throw err('DIM MISMATCH');
    var out = [];
    for (var r = 0; r < n; r++) out.push(lists.map(function (l) { return l[r]; }));
    return out;
  }

  /* --- lists (element-wise, same-length or scalar) ------------------------ */

  function listOp(a, b, f) {
    if (a.length !== b.length) throw err('DIM MISMATCH');
    return a.map(function (x, i) { return f(x, b[i]); });
  }

  TI.Mat = {
    MAXDIM: MAXDIM,
    isMat: isMat, isList: isList, rows: rows, cols: cols,
    add: function (A, B) { return addSub(A, B, 1); },
    sub: function (A, B) { return addSub(A, B, -1); },
    scale: scale, negate: negate, map: map, equal: equal,
    mul: mul, det: det, inverse: inverse, transpose: transpose, power: power,
    identity: identity, rref: function (A) { return reduce(A, true); },
    ref: function (A) { return reduce(A, false); },
    augment: augment, cumSum: cumSum, cumSumList: cumSumList,
    rowSwap: rowSwap, rowPlus: rowPlus, mulRow: mulRow, mulRowPlus: mulRowPlus,
    fill: fill, resize: resize, randM: randM, column: column, fromLists: fromLists,
    listOp: listOp, copy: copy
  };
})(window.TI = window.TI || {});
