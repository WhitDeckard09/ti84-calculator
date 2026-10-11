/* ---------------------------------------------------------------------------
 * evaluator.js — walks the AST and produces a number, honouring MODE settings.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var err = TI.Parser.err;

  function toRad(ctx, x) { return ctx.degree ? x * Math.PI / 180 : x; }
  function fromRad(ctx, x) { return ctx.degree ? x * 180 / Math.PI : x; }

  function checkFinite(v) {
    if (typeof v !== 'number' || v !== v) throw err('DOMAIN');
    if (!isFinite(v) || Math.abs(v) >= 1e100) throw err('OVERFLOW');
    return v;
  }

  function factorial(n) {
    /* TI accepts non-negative integers and halves up to 69. */
    if (n < 0 || Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) throw err('DOMAIN');
    if (n > 69) throw err('OVERFLOW');
    if (Math.abs(n - Math.round(n)) > 1e-9) {           /* half-integer: use Γ */
      var half = Math.round(n - 0.5);
      var r = Math.sqrt(Math.PI);
      for (var k = 1; k <= half; k++) r *= (k + 0.5);
      return r;
    }
    var out = 1;
    for (var i = 2; i <= Math.round(n); i++) out *= i;
    return out;
  }

  function nPr(n, r) {
    if (n < 0 || r < 0 || n !== Math.round(n) || r !== Math.round(r) || r > n) throw err('DOMAIN');
    var out = 1;
    for (var i = 0; i < r; i++) out *= (n - i);
    return out;
  }
  function nCr(n, r) {
    if (n < 0 || r < 0 || n !== Math.round(n) || r !== Math.round(r) || r > n) throw err('DOMAIN');
    r = Math.min(r, n - r);
    var out = 1;
    for (var i = 1; i <= r; i++) out = out * (n - r + i) / i;
    return Math.round(out);
  }

  function gcd2(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { var t = b; b = a % b; a = t; }
    return a;
  }

  /* --- functions taking already-evaluated arguments --------------------- */
  var FN = {
    sin:  function (c, a) { return Math.sin(toRad(c, a[0])); },
    cos:  function (c, a) { return Math.cos(toRad(c, a[0])); },
    tan:  function (c, a) { return Math.tan(toRad(c, a[0])); },
    asin: function (c, a) { if (a[0] < -1 || a[0] > 1) throw err('DOMAIN'); return fromRad(c, Math.asin(a[0])); },
    acos: function (c, a) { if (a[0] < -1 || a[0] > 1) throw err('DOMAIN'); return fromRad(c, Math.acos(a[0])); },
    atan: function (c, a) { return fromRad(c, Math.atan(a[0])); },
    sinh: function (c, a) { return Math.sinh(a[0]); },
    cosh: function (c, a) { return Math.cosh(a[0]); },
    tanh: function (c, a) { return Math.tanh(a[0]); },
    log:  function (c, a) { if (a[0] === 0) throw err('DIVIDE BY 0'); if (a[0] < 0) throw err('NONREAL ANS'); return Math.log10(a[0]); },
    ln:   function (c, a) { if (a[0] === 0) throw err('DIVIDE BY 0'); if (a[0] < 0) throw err('NONREAL ANS'); return Math.log(a[0]); },
    exp:  function (c, a) { return Math.exp(a[0]); },
    tenpow: function (c, a) { return Math.pow(10, a[0]); },
    sqrt: function (c, a) { if (a[0] < 0) throw err('NONREAL ANS'); return Math.sqrt(a[0]); },
    cbrt: function (c, a) { return Math.cbrt(a[0]); },
    abs:  function (c, a) { return Math.abs(a[0]); },
    /* these three work on the 14-digit decimal so -0.7 stays -0.7 */
    int:  function (c, a) { return TI.Dec.toNumber(TI.Dec.floor(TI.Dec.from(a[0]))); },
    iPart: function (c, a) { return TI.Dec.toNumber(TI.Dec.trunc(TI.Dec.from(a[0]))); },
    fPart: function (c, a) {
      var x = TI.Dec.from(a[0]);
      return TI.Dec.toNumber(TI.Dec.sub(x, TI.Dec.trunc(x)));
    },
    round: function (c, a) {
      var d = a.length > 1 ? Math.round(a[1]) : 9;
      if (d < 0 || d > 9) throw err('DOMAIN');
      /* decimal rounding, half away from zero: round(1.005,2) is 1.01 */
      return TI.Dec.toNumber(TI.Dec.roundTo(TI.Dec.from(a[0]), d));
    },
    min: function (c, a) { if (a.length < 2) throw err('SYNTAX'); return Math.min(a[0], a[1]); },
    max: function (c, a) { if (a.length < 2) throw err('SYNTAX'); return Math.max(a[0], a[1]); },
    gcd: function (c, a) { if (a.length < 2) throw err('SYNTAX'); return gcd2(a[0], a[1]); },
    lcm: function (c, a) {
      if (a.length < 2) throw err('SYNTAX');
      var g = gcd2(a[0], a[1]);
      return g === 0 ? 0 : Math.abs(Math.round(a[0]) * Math.round(a[1])) / g;
    },
    not: function (c, a) { return a[0] === 0 ? 1 : 0; },
    rand: function () { return Math.random(); },
    randInt: function (c, a) {
      if (a.length < 2) throw err('SYNTAX');
      var lo = Math.round(a[0]), hi = Math.round(a[1]);
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
  };
  var ARITY1 = ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','log','ln',
                'exp','tenpow','sqrt','cbrt','abs','int','iPart','fPart','not'];

  /* --- functions that need the unevaluated argument --------------------- */
  var LAZY = {
    /* nDeriv(expr, var, value [, ε]) — symmetric difference, TI default ε=1e-3 */
    nDeriv: function (ctx, args, ev) {
      if (args.length < 3) throw err('SYNTAX');
      var name = varName(args[1]);
      var x = ev(args[2]);
      var h = args.length > 3 ? ev(args[3]) : 1e-3;
      return withVar(ctx, name, x, function () {
        var f = function (t) { return withVar(ctx, name, t, function () { return ev(args[0]); }); };
        return (f(x + h) - f(x - h)) / (2 * h);
      });
    },
    /* fnInt(expr, var, lower, upper) — adaptive Simpson */
    fnInt: function (ctx, args, ev) {
      if (args.length < 4) throw err('SYNTAX');
      var name = varName(args[1]);
      var lo = ev(args[2]), hi = ev(args[3]);
      var f = function (t) { return withVar(ctx, name, t, function () { return ev(args[0]); }); };
      return simpson(f, lo, hi, 1e-9, 20);
    },
    fMin: function (ctx, args, ev) { return extremum(ctx, args, ev, -1); },
    fMax: function (ctx, args, ev) { return extremum(ctx, args, ev, 1); }
  };

  function varName(node) {
    if (!node || node.k !== 'var') throw err('SYNTAX');
    return node.n;
  }
  function withVar(ctx, name, value, fn) {
    var prev = ctx.vars[name];
    ctx.vars[name] = value;
    try { return fn(); } finally { ctx.vars[name] = prev; }
  }
  function simpson(f, a, b, eps, depth) {
    function s(a, b, fa, fm, fb) { return (b - a) / 6 * (fa + 4 * fm + fb); }
    function rec(a, b, fa, fm, fb, whole, d) {
      var m = (a + b) / 2;
      var lm = (a + m) / 2, rm = (m + b) / 2;
      var flm = f(lm), frm = f(rm);
      var left = s(a, m, fa, flm, fm), right = s(m, b, fm, frm, fb);
      if (d <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
      return rec(a, m, fa, flm, fm, left, d - 1) + rec(m, b, fm, frm, fb, right, d - 1);
    }
    var fa = f(a), fb = f(b), fm = f((a + b) / 2);
    return rec(a, b, fa, fm, fb, s(a, b, fa, fm, fb), depth);
  }
  /* golden-section search; sign = -1 finds the minimiser, +1 the maximiser */
  function extremum(ctx, args, ev, sign) {
    if (args.length < 4) throw err('SYNTAX');
    var name = varName(args[1]);
    var a = ev(args[2]), b = ev(args[3]);
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var f = function (t) { return sign * withVar(ctx, name, t, function () { return ev(args[0]); }); };

    /* Golden section brackets the optimum reliably but stalls around sqrt(eps)
       because f is flat there, so finish with parabolic interpolation. */
    var gr = (Math.sqrt(5) - 1) / 2;
    var c = b - gr * (b - a), d = a + gr * (b - a);
    var fc = f(c), fd = f(d);
    for (var i = 0; i < 200 && Math.abs(b - a) > 1e-7; i++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    }
    var span = hi - lo;
    var x = (a + b) / 2;
    for (var j = 0; j < 40; j++) {
      var h = Math.max(Math.abs(x) * 1e-5, 1e-6);
      var f0 = f(x - h), f1 = f(x), f2 = f(x + h);
      var den = f0 - 2 * f1 + f2;
      if (!(den < 0)) break;                       /* not concave here */
      var step = -h * (f2 - f0) / (2 * den);
      if (!isFinite(step) || Math.abs(step) > span) break;
      var nx = x + step;
      if (nx < lo || nx > hi) break;
      x = nx;
      if (Math.abs(step) < 1e-13 * Math.max(1, Math.abs(x))) break;
    }
    return x;
  }

  /* --- ▸Frac ------------------------------------------------------------ */
  /* Continued-fraction expansion. TI gives up and shows the decimal when the
     denominator would run past four digits. */
  function toFraction(x) {
    if (!isFinite(x)) return null;
    if (Math.abs(x - Math.round(x)) < 1e-11) return { n: Math.round(x), d: 1 };
    var sign = x < 0 ? -1 : 1, v = Math.abs(x);
    var h0 = 0, h1 = 1, k0 = 1, k1 = 0, t = v;
    for (var i = 0; i < 40; i++) {
      var a = Math.floor(t);
      var h2 = a * h1 + h0, k2 = a * k1 + k0;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (k1 > 9999) return null;
      if (Math.abs(v - h1 / k1) < 1e-10 * Math.max(1, v)) return { n: sign * h1, d: k1 };
      var frac = t - a;
      if (frac < 1e-12) break;
      t = 1 / frac;
    }
    return null;
  }

  /* --- matrices and lists ------------------------------------------------- */

  var M = TI.Mat;
  var isArr = Array.isArray;

  function dataType() { return err('DATA TYPE'); }

  function scalarBin(o, A, B) {
    switch (o) {
      case '+': return checkFinite(A + B);
      case '-': return checkFinite(A - B);
      case '*': return checkFinite(A * B);
      case '/': if (B === 0) throw err('DIVIDE BY 0'); return checkFinite(A / B);
      case '^': {
        if (A === 0 && B < 0) throw err('DIVIDE BY 0');
        /* a negative base is only real for integer exponents */
        if (A < 0 && Math.abs(B - Math.round(B)) > 1e-12) throw err('NONREAL ANS');
        return checkFinite(Math.pow(A, B));
      }
      case 'xroot': {
        if (A === 0) throw err('DIVIDE BY 0');
        if (B < 0) {
          if (Math.abs(A - Math.round(A)) < 1e-12 && Math.round(A) % 2 !== 0) return -Math.pow(-B, 1 / A);
          throw err('NONREAL ANS');
        }
        return checkFinite(Math.pow(B, 1 / A));
      }
      case 'nPr': return nPr(A, B);
      case 'nCr': return nCr(A, B);
      case '=':  return A === B ? 1 : 0;
      case '≠':  return A !== B ? 1 : 0;
      case '>':  return A > B ? 1 : 0;
      case '≥':  return A >= B ? 1 : 0;
      case '<':  return A < B ? 1 : 0;
      case '≤':  return A <= B ? 1 : 0;
      case 'and': return (A !== 0 && B !== 0) ? 1 : 0;
      case 'or':  return (A !== 0 || B !== 0) ? 1 : 0;
      case 'xor': return ((A !== 0) !== (B !== 0)) ? 1 : 0;
    }
    throw err('SYNTAX');
  }

  /* A binary operator where at least one side is a matrix or a list. */
  function arrayBin(o, A, B) {
    var am = M.isMat(A), bm = M.isMat(B);
    if (am || bm) {
      var an = typeof A === 'number', bn = typeof B === 'number';
      switch (o) {
        case '+': if (am && bm) return M.add(A, B); break;
        case '-': if (am && bm) return M.sub(A, B); break;
        case '*':
          if (am && bm) return M.mul(A, B);
          if (am && bn) return M.scale(B, A);
          if (bm && an) return M.scale(A, B);
          break;
        case '^': if (am && bn) return M.power(A, B); break;
        case '=': if (am && bm) return M.equal(A, B) ? 1 : 0; break;
        case '≠': if (am && bm) return M.equal(A, B) ? 0 : 1; break;
      }
      throw dataType();
    }
    /* lists work element by element, with a scalar broadcast */
    if (isArr(A) && isArr(B)) return M.listOp(A, B, function (x, y) { return listBin(o, x, y); });
    if (isArr(A)) return A.map(function (x) { return listBin(o, x, B); });
    return B.map(function (y) { return listBin(o, A, y); });
  }

  /* One list element: + - * / use the 14-digit decimal, the rest are rounded to it. */
  function listBin(o, x, y) {
    var D = TI.Dec;
    switch (o) {
      case '+': return checkFinite(D.toNumber(D.add(D.from(x), D.from(y))));
      case '-': return checkFinite(D.toNumber(D.sub(D.from(x), D.from(y))));
      case '*': return checkFinite(D.toNumber(D.mul(D.from(x), D.from(y))));
      case '/':
        if (y === 0) throw err('DIVIDE BY 0');
        return checkFinite(D.toNumber(D.div(D.from(x), D.from(y))));
    }
    return round14(scalarBin(o, x, y));
  }

  function round14(x) { return TI.Dec.toNumber(TI.Dec.from(x)); }

  /* Functions that also accept a matrix (the rest raise DATA TYPE). */
  var MAT_MAPPED = { abs: 1, round: 1, iPart: 1, fPart: 1, int: 1 };

  function listReduce(name, l) {
    if (!l.length) throw err('INVALID DIM');
    return l.reduce(function (a, b) { return name === 'min' ? Math.min(a, b) : Math.max(a, b); });
  }

  /* A scalar function called with an array argument somewhere. */
  function arrayCall(name, ctx, args, pos) {
    var first = args[0];
    if (M.isMat(first) || args.some(M.isMat)) {
      if (!MAT_MAPPED[name]) throw dataType();
      if (name === 'round' && args.length > 1) {
        if (typeof args[1] !== 'number') throw dataType();
        return M.map(first, function (x) { return FN.round(ctx, [x, args[1]]); });
      }
      if (args.length !== 1 && name !== 'round') throw err('ARGUMENT', pos);
      return M.map(first, function (x) { return FN[name](ctx, [x]); });
    }
    if ((name === 'min' || name === 'max') && args.length === 1 && isArr(first)) return listReduce(name, first);
    /* broadcast over lists */
    var len = -1;
    args.forEach(function (a) {
      if (isArr(a)) {
        if (len >= 0 && a.length !== len) throw err('DIM MISMATCH');
        len = a.length;
      }
    });
    var out = [];
    for (var i = 0; i < len; i++) {
      var one = args.map(function (a) { return isArr(a) ? a[i] : a; });
      var r = FN[name](ctx, one);
      if (r !== r) throw err('DOMAIN', pos);
      out.push(round14(checkFinite(r)));
    }
    return out;
  }

  function mapScalar(v, f) {
    return isArr(v) ? v.map(f) : f(v);
  }

  /* Matrix / list names live on the context so tests can supply their own. */
  function getMat(ctx, name, pos) {
    var m = ctx.mats && ctx.mats[name];
    if (!m) throw err('UNDEFINED', pos);
    return m;
  }
  function getList(ctx, n) {
    return (ctx.lists && ctx.lists[n]) || [];
  }
  function wholeIndex(v) {
    if (typeof v !== 'number') throw dataType();
    return v;
  }

  function elementIndexes(ctx, node, ev) {
    var args = node.args;
    var m = getMat(ctx, node.n, node.pos);
    if (args.length !== 2) throw err('ARGUMENT', node.pos);
    var r = wholeIndex(ev(args[0])), c = wholeIndex(ev(args[1]));
    if (r !== Math.floor(r) || c !== Math.floor(c) || r < 1 || c < 1 || r > M.rows(m) || c > M.cols(m)) {
      throw err('INVALID DIM', node.pos);
    }
    return { m: m, r: r - 1, c: c - 1 };
  }

  function listIndex(ctx, node, ev, allowAppend) {
    if (node.args.length !== 1) throw err('ARGUMENT', node.pos);
    var l = getList(ctx, node.n);
    var i = wholeIndex(ev(node.args[0]));
    var max = l.length + (allowAppend ? 1 : 0);
    if (i !== Math.floor(i) || i < 1 || i > max) throw err('INVALID DIM', node.pos);
    return { l: l, i: i - 1 };
  }

  function wholeDim(v, lo) {
    if (typeof v !== 'number' || v !== Math.floor(v)) throw err('INVALID DIM');
    if (v < (lo === undefined ? 1 : lo)) throw err('INVALID DIM');
    return v;
  }

  function needMatrix(v) { if (!M.isMat(v)) throw dataType(); return v; }
  function needNumber(v) { if (typeof v !== 'number') throw dataType(); return v; }
  function needList(v) { if (!M.isList(v)) throw dataType(); return v; }

  /* Functions that evaluate their own arguments (they take names, not values). */
  var MATFN = {
    det: function (ctx, a, ev) { one(a); return M.det(needMatrix(ev(a[0]))); },
    dim: function (ctx, a, ev) {
      one(a);
      var v = ev(a[0]);
      if (M.isMat(v)) return [M.rows(v), M.cols(v)];
      if (isArr(v)) return v.length;
      throw dataType();
    },
    identity: function (ctx, a, ev) { one(a); return M.identity(needNumber(ev(a[0]))); },
    randM: function (ctx, a, ev) {
      two(a);
      return M.randM(needNumber(ev(a[0])), needNumber(ev(a[1])));
    },
    augment: function (ctx, a, ev) {
      two(a);
      var x = ev(a[0]), y = ev(a[1]);
      if (M.isMat(x) && M.isMat(y)) return M.augment(x, y);
      if (isArr(x) && isArr(y) && !M.isMat(x) && !M.isMat(y)) return x.concat(y);
      throw dataType();
    },
    cumSum: function (ctx, a, ev) {
      one(a);
      var v = ev(a[0]);
      if (M.isMat(v)) return M.cumSum(v);
      if (isArr(v)) return M.cumSumList(v);
      throw dataType();
    },
    ref: function (ctx, a, ev) { one(a); return M.ref(needMatrix(ev(a[0]))); },
    rref: function (ctx, a, ev) { one(a); return M.rref(needMatrix(ev(a[0]))); },
    rowSwap: function (ctx, a, ev) {
      if (a.length !== 3) throw err('ARGUMENT');
      return M.rowSwap(needMatrix(ev(a[0])), needNumber(ev(a[1])), needNumber(ev(a[2])));
    },
    rowPlus: function (ctx, a, ev) {
      if (a.length !== 3) throw err('ARGUMENT');
      return M.rowPlus(needMatrix(ev(a[0])), needNumber(ev(a[1])), needNumber(ev(a[2])));
    },
    mulRow: function (ctx, a, ev) {
      if (a.length !== 3) throw err('ARGUMENT');
      return M.mulRow(needNumber(ev(a[0])), needMatrix(ev(a[1])), needNumber(ev(a[2])));
    },
    mulRowPlus: function (ctx, a, ev) {
      if (a.length !== 4) throw err('ARGUMENT');
      return M.mulRowPlus(needNumber(ev(a[0])), needMatrix(ev(a[1])), needNumber(ev(a[2])), needNumber(ev(a[3])));
    },
    /* Fill(value, [A]) overwrites the named matrix (or list) */
    fill: function (ctx, a, ev) {
      two(a);
      var v = needNumber(ev(a[0]));
      var t = a[1];
      if (t.k === 'mat') {
        var m = getMat(ctx, t.n, t.pos);
        var out = M.fill(v, M.rows(m), M.cols(m));
        ctx.mats[t.n] = out;
        return out;
      }
      if (t.k === 'lst') {
        var l = getList(ctx, t.n);
        var lo = l.map(function () { return v; });
        ctx.lists[t.n] = lo;
        return lo;
      }
      throw dataType();
    },
    /* Matr▸list([A], n, L1)  or  Matr▸list([A], L1, L2, ...) */
    matrToList: function (ctx, a, ev) {
      if (a.length < 2) throw err('ARGUMENT');
      var m = needMatrix(ev(a[0]));
      var last = null;
      if (a[1].k !== 'lst') {
        if (a.length < 3 || a[2].k !== 'lst') throw dataType();
        last = M.column(m, needNumber(ev(a[1])));
        ctx.lists[a[2].n] = last;
        return last;
      }
      for (var i = 1; i < a.length; i++) {
        if (a[i].k !== 'lst') throw dataType();
        if (i - 1 >= M.cols(m)) break;
        last = M.column(m, i);
        ctx.lists[a[i].n] = last;
      }
      return last;
    },
    /* List▸matr(L1, L2, ..., [A]) */
    listToMatr: function (ctx, a, ev) {
      if (a.length < 2) throw err('ARGUMENT');
      var target = a[a.length - 1];
      if (target.k !== 'mat') throw dataType();
      var lists = [];
      for (var i = 0; i < a.length - 1; i++) lists.push(needList(ev(a[i])));
      var out = M.fromLists(lists);
      ctx.mats[target.n] = out;
      return out;
    }
  };
  function one(a) { if (a.length !== 1) throw err('ARGUMENT'); }
  function two(a) { if (a.length !== 2) throw err('ARGUMENT'); }

  /* --- the evaluator ---------------------------------------------------- */

  function evaluate(ast, ctx) {
    ctx.depth = 0;
    ctx.frac = false;
    if (!ctx.mats) ctx.mats = {};
    if (!ctx.lists) ctx.lists = {};
    var v = ev(ast, ctx);
    return { value: v, frac: ctx.frac };
  }

  function storeInto(n, val, ctx) {
    var t = n.target;
    switch (t.k) {
      case 'var':
        if (isArr(val)) throw dataType();
        ctx.vars[t.n] = val;
        return val;
      case 'mat':
        if (!M.isMat(val)) throw dataType();
        ctx.mats[t.n] = M.copy(val);
        return val;
      case 'lst':
        if (!M.isList(val)) throw dataType();
        ctx.lists[t.n] = val.slice();
        return val;
      case 'matel': {
        var x = elementIndexes(ctx, t, function (nd) { return ev(nd, ctx); });
        if (typeof val !== 'number') throw dataType();
        x.m[x.r][x.c] = val;
        return val;
      }
      case 'lstel': {
        var li = listIndex(ctx, t, function (nd) { return ev(nd, ctx); }, true);
        if (typeof val !== 'number') throw dataType();
        if (!ctx.lists[t.n]) ctx.lists[t.n] = li.l;
        li.l[li.i] = val;
        return val;
      }
      case 'call': {                       /* {r, c} → dim([A])  /  n → dim(L1) */
        var arg = t.args[0];
        if (arg.k === 'mat') {
          if (!M.isList(val) || val.length !== 2) throw dataType();
          ctx.mats[arg.n] = M.resize(ctx.mats[arg.n], wholeDim(val[0]), wholeDim(val[1]));
          return val;
        }
        var len = wholeDim(needNumber(val), 0);
        if (len > 999) throw err('INVALID DIM');
        var cur = getList(ctx, arg.n).slice(0, len);
        while (cur.length < len) cur.push(0);
        ctx.lists[arg.n] = cur;
        return val;
      }
      case 'yvar':
        throw err('SYNTAX');
    }
    throw err('SYNTAX');
  }

  function ev(n, ctx) {
    switch (n.k) {
      case 'num': return n.v;
      case 'ans': return ctx.ans;
      case 'const':
        if (n.n === 'pi') return Math.PI;
        if (n.n === 'rand') return Math.random();
        return Math.E;
      case 'var': {
        var v = ctx.vars[n.n];
        return typeof v === 'number' ? v : 0;   /* unset variables are 0 */
      }
      case 'yvar': {
        var toks = ctx.yGet ? ctx.yGet(n.n) : null;
        if (!toks || !toks.length) throw err('UNDEFINED', n.pos);
        if (ctx.depth > 12) throw err('MEMORY', n.pos);
        ctx.depth++;
        try { return ev(TI.Parser.parse(toks), ctx); } finally { ctx.depth--; }
      }
      case 'mat': return M.copy(getMat(ctx, n.n, n.pos));
      case 'lst': return getList(ctx, n.n).slice();
      case 'matel': {
        var e = elementIndexes(ctx, n, function (nd) { return ev(nd, ctx); });
        return e.m[e.r][e.c];
      }
      case 'lstel': {
        var le = listIndex(ctx, n, function (nd) { return ev(nd, ctx); }, false);
        return le.l[le.i];
      }
      case 'matlit': {
        var w = n.rows[0].length;
        var rows = n.rows.map(function (r) {
          return r.map(function (x) {
            var val = ev(x, ctx);
            if (typeof val !== 'number') throw dataType();
            return round14(val);
          });
        });
        for (var ri = 0; ri < rows.length; ri++) if (rows[ri].length !== w) throw err('INVALID DIM', n.pos);
        if (rows.length > M.MAXDIM || w > M.MAXDIM) throw err('INVALID DIM', n.pos);
        return rows;
      }
      case 'listlit':
        return n.items.map(function (x) {
          var val = ev(x, ctx);
          if (typeof val !== 'number') throw dataType();
          return round14(val);
        });
      case 'neg': {
        var nv = ev(n.a, ctx);
        if (M.isMat(nv)) return M.negate(nv);
        return mapScalar(nv, function (x) { return -x; });
      }
      case 'post': {
        var a = ev(n.a, ctx);
        if (n.o === 'transp') {
          if (!M.isMat(a)) throw dataType();
          return M.transpose(a);
        }
        if (M.isMat(a)) {
          switch (n.o) {
            case 'sq':   return M.mul(a, a);
            case 'cube': return M.mul(M.mul(a, a), a);
            case 'inv':  return M.inverse(a);
          }
          throw dataType();
        }
        var DEC = TI.Dec, isList = isArr(a);
        return mapScalar(a, function (x) {
          switch (n.o) {
            case 'sq':
              return isList ? checkFinite(DEC.toNumber(DEC.mul(DEC.from(x), DEC.from(x)))) : checkFinite(x * x);
            case 'cube':
              if (isList) { var dx = DEC.from(x); return checkFinite(DEC.toNumber(DEC.mul(DEC.mul(dx, dx), dx))); }
              return checkFinite(x * x * x);
            case 'inv':
              if (x === 0) throw err('DIVIDE BY 0');
              return isList ? DEC.toNumber(DEC.div(DEC.ONE, DEC.from(x))) : 1 / x;
            case 'fact': return factorial(x);
            case 'deg':  return ctx.degree ? x : x * Math.PI / 180;
          }
          throw err('SYNTAX');
        });
      }
      case 'conv':
        if (n.f === 'frac') { var val = ev(n.a, ctx); ctx.frac = true; return val; }
        { var v2 = ev(n.a, ctx); ctx.frac = false; return v2; }
      case 'bin': {
        var A = ev(n.a, ctx), B = ev(n.b, ctx);
        if (isArr(A) || isArr(B)) return arrayBin(n.o, A, B);
        return scalarBin(n.o, A, B);
      }
      case 'call': {
        if (MATFN[n.f]) return MATFN[n.f](ctx, n.args, function (node) { return ev(node, ctx); });
        if (LAZY[n.f]) return checkFinite(LAZY[n.f](ctx, n.args, function (node) { return ev(node, ctx); }));
        var fn = FN[n.f];
        if (!fn) throw err('SYNTAX', n.pos);
        var args = n.args.map(function (x) { return ev(x, ctx); });
        if (args.some(isArr)) return arrayCall(n.f, ctx, args, n.pos);
        if (ARITY1.indexOf(n.f) >= 0 && args.length !== 1) throw err('SYNTAX', n.pos);
        if (!args.length && n.f !== 'rand') throw err('SYNTAX', n.pos);
        var r = fn(ctx, args);
        if (r !== r) throw err('DOMAIN', n.pos);
        return r;
      }
      case 'store': {
        var sv = ev(n.a, ctx);
        return storeInto(n, sv, ctx);
      }
    }
    throw err('SYNTAX');
  }

  TI.Eval = {
    evaluate: evaluate,
    toFraction: toFraction,
    factorial: factorial,
    FN: FN
  };
})(window.TI = window.TI || {});
