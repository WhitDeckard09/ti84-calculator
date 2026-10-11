/* ---------------------------------------------------------------------------
 * parser.js — precedence-climbing parser over the token array.
 *
 * Binding powers reproduce the TI-83/84 evaluation order:
 *
 *   10  postfix   x²  x³  x⁻¹  !  °
 *    9  ^  ˣ√                       (right associative)
 *    8  unary (-)                   (prefix; binds looser than ^)
 *    7  nPr  nCr
 *    6  *  /  and implied multiplication  (same level — TI-83/84 behaviour,
 *                                          unlike the TI-85/86)
 *    5  +  -
 *    4  =  ≠  >  ≥  <  ≤
 *    3  and
 *    2  or  xor
 *    1  →  (store)
 *
 * Two consequences worth calling out because they trip people up on the real
 * machine and are reproduced exactly here:
 *   ⁻2²   = ⁻(2²)  = -4     because ² outranks negation
 *   1/2X  = (1/2)X = .5X    because implied multiplication is not special
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var INFIX = {
    '^':   { lbp: 9, rbp: 9 },   /* right assoc: rbp == lbp */
    'nPr': { lbp: 7, rbp: 8 },
    'nCr': { lbp: 7, rbp: 8 },
    '*':   { lbp: 6, rbp: 7 },
    '/':   { lbp: 6, rbp: 7 },
    '+':   { lbp: 5, rbp: 6 },
    '-':   { lbp: 5, rbp: 6 },
    '=':   { lbp: 4, rbp: 5 },
    '≠':   { lbp: 4, rbp: 5 },
    '>':   { lbp: 4, rbp: 5 },
    '≥':   { lbp: 4, rbp: 5 },
    '<':   { lbp: 4, rbp: 5 },
    '≤':   { lbp: 4, rbp: 5 }
  };
  var WORD_BP = { and: { lbp: 3, rbp: 4 }, or: { lbp: 2, rbp: 3 }, xor: { lbp: 2, rbp: 3 } };

  var NEG_RBP = 8;
  var IMPLIED_MUL = { lbp: 6, rbp: 7 };

  function err(kind, pos) { var e = new Error(kind); e.ti = kind; e.pos = pos; return e; }

  function Parser(toks) {
    this.k = toks;
    this.i = 0;
    /* Unclosed delimiters are closed for you at ENTER, same as the real thing.
       The stack remembers which closer each opener needs: ) ] or }. */
    var open = [];
    for (var j = 0; j < toks.length; j++) {
      var t = toks[j].t;
      if (t === 'lp' || t === 'fn') open.push('rp');
      else if (t === 'lb') open.push('rb');
      else if (t === 'lbr') open.push('rbr');
      else if (t === 'rp' || t === 'rb' || t === 'rbr') open.pop();
    }
    this.autoStack = open;       /* innermost closer is last */
  }

  /* Spaces are decoration; the calculator ignores them inside an expression. */
  Parser.prototype.skipSpace = function () {
    while (this.i < this.k.length && this.k[this.i].t === 'sp') this.i++;
  };
  Parser.prototype.peek = function () {
    this.skipSpace();
    if (this.i < this.k.length) return this.k[this.i];
    return this.autoStack.length ? this.autoTok() : null;
  };
  Parser.prototype.autoTok = function () {
    var c = this.autoStack[this.autoStack.length - 1];
    return { t: c, s: c === 'rp' ? ')' : c === 'rb' ? ']' : '}', auto: true };
  };
  Parser.prototype.next = function () {
    this.skipSpace();
    if (this.i < this.k.length) return this.k[this.i++];
    if (this.autoStack.length) { var a = this.autoTok(); this.autoStack.pop(); return a; }
    return null;
  };
  Parser.prototype.atEnd = function () { return this.peek() === null; };

  /* Digits and decimal points are separate tokens; glue them into a literal. */
  Parser.prototype.number = function () {
    var start = this.i, s = '', dots = 0;
    while (this.i < this.k.length && this.k[this.i].t === 'd') {
      if (this.k[this.i].s === '.') dots++;
      s += this.k[this.i].s;
      this.i++;
    }
    if (dots > 1) throw err('SYNTAX', start);
    var v = parseFloat(s === '.' ? '0' : s);
    if (isNaN(v)) throw err('SYNTAX', start);
    /* scientific-notation suffix: 1ᴇ⁻4 */
    if (this.i < this.k.length && this.k[this.i].t === 'ee') {
      this.i++;
      var sign = 1;
      if (this.i < this.k.length && this.k[this.i].t === 'neg') { sign = -1; this.i++; }
      var es = '';
      while (this.i < this.k.length && this.k[this.i].t === 'd' && this.k[this.i].s !== '.') {
        es += this.k[this.i].s; this.i++;
      }
      if (!es) throw err('SYNTAX', start);
      v = v * Math.pow(10, sign * parseInt(es, 10));
    }
    return { k: 'num', v: v };
  };

  Parser.prototype.argList = function (openPos) {
    var args = [];
    if (this.peek() && this.peek().t === 'rp') { this.next(); return args; }
    for (;;) {
      args.push(this.expr(0));
      var t = this.peek();
      if (t && t.t === 'comma') { this.next(); continue; }
      if (t && t.t === 'rp') { this.next(); break; }
      throw err('SYNTAX', this.i);
    }
    return args;
  };

  /* a comma separated run of expressions up to the closer */
  Parser.prototype.itemList = function (closer) {
    var items = [];
    var t = this.peek();
    if (t && t.t === closer) { this.next(); return items; }
    for (;;) {
      items.push(this.expr(0));
      t = this.peek();
      if (t && t.t === 'comma') { this.next(); continue; }
      if (t && t.t === closer) { this.next(); break; }
      throw err('SYNTAX', this.i);
    }
    return items;
  };

  /* [[1,2][3,4]], with the opening [ already consumed */
  Parser.prototype.matrixLiteral = function (pos) {
    var rows = [];
    for (;;) {
      var t = this.next();
      if (!t || t.t !== 'lb') throw err('SYNTAX', this.i - 1);
      var row = this.itemList('rb');
      if (!row.length) throw err('SYNTAX', this.i - 1);
      rows.push(row);
      var nx = this.peek();
      if (nx && nx.t === 'rb') { this.next(); break; }
      if (!nx || nx.t !== 'lb') throw err('SYNTAX', this.i);
    }
    return { k: 'matlit', rows: rows, pos: pos };
  };

  Parser.prototype.prefix = function () {
    var t = this.next();
    if (!t) throw err('SYNTAX', this.i);
    var pos = this.i - 1;

    switch (t.t) {
      case 'd':
        this.i--;
        return this.number();
      case 'neg':
        return { k: 'neg', a: this.expr(NEG_RBP) };
      case 'lp': {
        var e = this.expr(0);
        var c = this.next();
        if (!c || c.t !== 'rp') throw err('SYNTAX', pos);
        return e;
      }
      case 'fn':
        return { k: 'call', f: t.f, args: this.argList(pos), pos: pos };
      case 'lb':    return this.matrixLiteral(pos);
      case 'lbr':   return { k: 'listlit', items: this.itemList('rbr'), pos: pos };
      case 'mat': {
        var nx = this.peek();
        if (nx && nx.t === 'lp') {
          this.next();
          return { k: 'matel', n: t.n, args: this.argList(pos), pos: pos };
        }
        return { k: 'mat', n: t.n, pos: pos };
      }
      case 'lst': {
        var nl = this.peek();
        if (nl && nl.t === 'lp') {
          this.next();
          return { k: 'lstel', n: t.n, args: this.argList(pos), pos: pos };
        }
        return { k: 'lst', n: t.n, pos: pos };
      }
      case 'var':   return { k: 'var', n: t.n, pos: pos };
      case 'yvar':  return { k: 'yvar', n: t.n, pos: pos };
      case 'ans':   return { k: 'ans' };
      case 'const': return { k: 'const', n: t.f };
      case 'op':
        /* A leading + - * / recalls Ans, exactly like typing "+5" after a result. */
        if (INFIX[t.s] && pos === 0) {
          var op = INFIX[t.s];
          return { k: 'bin', o: t.s, a: { k: 'ans' }, b: this.expr(op.rbp) };
        }
        throw err('SYNTAX', pos);
      default:
        throw err('SYNTAX', pos);
    }
  };

  Parser.prototype.expr = function (minBP) {
    var left = this.prefix();

    for (;;) {
      var t = this.peek();
      if (!t) break;

      if (t.t === 'post') {
        if (10 < minBP) break;
        this.next();
        left = { k: 'post', o: t.f, a: left };
        continue;
      }
      if (t.t === 'conv') {
        if (1 < minBP) break;
        this.next();
        left = { k: 'conv', f: t.f, a: left };
        continue;
      }
      if (t.t === 'xroot') {
        if (9 < minBP) break;
        this.next();
        left = { k: 'bin', o: 'xroot', a: left, b: this.expr(9) };
        continue;
      }
      if (t.t === 'op' && INFIX[t.s]) {
        var bp = INFIX[t.s];
        if (bp.lbp < minBP) break;
        this.next();
        left = { k: 'bin', o: t.s, a: left, b: this.expr(bp.rbp) };
        continue;
      }
      if (t.t === 'word' && WORD_BP[t.f]) {
        var wbp = WORD_BP[t.f];
        if (wbp.lbp < minBP) break;
        this.next();
        left = { k: 'bin', o: t.f, a: left, b: this.expr(wbp.rbp) };
        continue;
      }
      /* implied multiplication: 2(3+4), 3X, 2π, 4sin(1) */
      if (TI.Tok.startsOperand(t) && !t.auto) {
        if (IMPLIED_MUL.lbp < minBP) break;
        left = { k: 'bin', o: '*', a: left, b: this.expr(IMPLIED_MUL.rbp), implied: true };
        continue;
      }
      break;
    }
    return left;
  };

  /* A whole entry: expression, optionally followed by →target. The target is
     a variable, [A], [A](r,c), L1, L1(n), or dim([A]) / dim(L1). */
  Parser.prototype.statement = function () {
    var e = this.expr(0);
    var t = this.peek();
    while (t && t.t === 'store') {
      this.next();
      var at = this.i;
      var target;
      var first = this.peek();
      if (!first) throw err('SYNTAX', at);
      var okTok = first.t === 'var' || first.t === 'yvar' || first.t === 'mat' ||
                  first.t === 'lst' || (first.t === 'fn' && first.f === 'dim');
      if (!okTok) throw err('SYNTAX', at);
      target = this.prefix();
      if (target.k === 'call' && !(target.args.length === 1 &&
          (target.args[0].k === 'mat' || target.args[0].k === 'lst'))) throw err('SYNTAX', at);
      e = { k: 'store', a: e, target: target };
      t = this.peek();
    }
    return e;
  };

  function parse(toks) {
    if (!toks.length) throw err('SYNTAX', 0);
    var p = new Parser(toks);
    var ast = p.statement();
    if (!p.atEnd()) throw err('SYNTAX', p.i);
    return ast;
  }

  TI.Parser = { parse: parse, err: err };
})(window.TI = window.TI || {});
