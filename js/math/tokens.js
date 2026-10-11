/* ---------------------------------------------------------------------------
 * tokens.js — the entry buffer is an array of tokens, not characters.
 *
 * This mirrors the real machine: pressing SIN inserts one "sin(" token, and
 * DEL removes the whole thing rather than a single letter.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var SUB = '₀₁₂₃₄₅₆₇₈₉';

  var T = {
    digit:  function (c) { return { t: 'd', s: c }; },
    op:     function (c) { return { t: 'op', s: c }; },
    neg:    function ()  { return { t: 'neg', s: '⁻' }; },
    lp:     function ()  { return { t: 'lp', s: '(' }; },
    rp:     function ()  { return { t: 'rp', s: ')' }; },
    comma:  function ()  { return { t: 'comma', s: ',' }; },
    /* a function name that carries its own open paren, as on the keypad */
    fn:     function (f, s) { return { t: 'fn', s: s || (f + '('), f: f }; },
    post:   function (f, s) { return { t: 'post', s: s, f: f }; },
    konst:  function (f, s) { return { t: 'const', s: s, f: f }; },
    vari:   function (n)  { return { t: 'var', s: n, n: n }; },
    /* matrix literal brackets, list braces, and the [A]..[J] / L1..L6 names */
    lb:     function ()  { return { t: 'lb', s: '[' }; },
    rb:     function ()  { return { t: 'rb', s: ']' }; },
    lbr:    function ()  { return { t: 'lbr', s: '{' }; },
    rbr:    function ()  { return { t: 'rbr', s: '}' }; },
    mat:    function (n)  { return { t: 'mat', s: '[' + n + ']', n: n }; },
    lst:    function (n)  { return { t: 'lst', s: 'L' + SUB.charAt(n), n: n }; },
    yvar:   function (n)  { return { t: 'yvar', s: 'Y' + SUB.charAt(n), n: n }; },
    ans:    function ()  { return { t: 'ans', s: 'Ans' }; },
    store:  function ()  { return { t: 'store', s: '→' }; },
    conv:   function (f, s) { return { t: 'conv', s: s, f: f }; },
    ee:     function ()  { return { t: 'ee', s: 'ᴇ' }; },
    xroot:  function ()  { return { t: 'xroot', s: 'ˣ√' }; },
    word:   function (f, s) { return { t: 'word', s: s, f: f }; }, /* and / or / not( */

    /* program tokens */
    cmd:    function (f, s) { return { t: 'cmd', s: s, f: f }; },
    quote:  function ()  { return { t: 'quote', s: '"' }; },
    sp:     function ()  { return { t: 'sp', s: ' ' }; },
    punct:  function (s) { return { t: 'punct', s: s }; },
    prgm:   function (n) { return { t: 'prgm', s: 'prgm' + n, name: n }; }
  };

  T.toText = function (toks) {
    var s = '';
    for (var i = 0; i < toks.length; i++) s += toks[i].s;
    return s;
  };

  /* Tokens that can begin an operand. Used for implied multiplication and for
     deciding whether a leading operator should auto-prepend Ans. */
  T.startsOperand = function (tok) {
    if (!tok) return false;
    return tok.t === 'd' || tok.t === 'lp' || tok.t === 'fn' || tok.t === 'var' ||
           tok.t === 'yvar' || tok.t === 'const' || tok.t === 'ans' ||
           tok.t === 'mat' || tok.t === 'lst' || tok.t === 'lb' || tok.t === 'lbr';
  };

  /* --- ASCII lexer -----------------------------------------------------
   * Not used by the keypad (which emits tokens directly) but it lets the test
   * suite and the README speak in plain text. '~' means the (-) key.
   */
  var NAMES = [
    ['sin⁻¹(', function () { return T.fn('asin', 'sin⁻¹('); }],
    ['cos⁻¹(', function () { return T.fn('acos', 'cos⁻¹('); }],
    ['tan⁻¹(', function () { return T.fn('atan', 'tan⁻¹('); }],
    ['asin(', function () { return T.fn('asin', 'sin⁻¹('); }],
    ['acos(', function () { return T.fn('acos', 'cos⁻¹('); }],
    ['atan(', function () { return T.fn('atan', 'tan⁻¹('); }],
    ['sinh(', function () { return T.fn('sinh'); }],
    ['cosh(', function () { return T.fn('cosh'); }],
    ['tanh(', function () { return T.fn('tanh'); }],
    ['sin(', function () { return T.fn('sin'); }],
    ['cos(', function () { return T.fn('cos'); }],
    ['tan(', function () { return T.fn('tan'); }],
    ['log(', function () { return T.fn('log'); }],
    ['ln(', function () { return T.fn('ln'); }],
    ['sqrt(', function () { return T.fn('sqrt', '√('); }],
    ['√(', function () { return T.fn('sqrt', '√('); }],
    ['cbrt(', function () { return T.fn('cbrt', '³√('); }],
    ['abs(', function () { return T.fn('abs'); }],
    ['round(', function () { return T.fn('round'); }],
    ['iPart(', function () { return T.fn('iPart'); }],
    ['fPart(', function () { return T.fn('fPart'); }],
    ['int(', function () { return T.fn('int'); }],
    ['min(', function () { return T.fn('min'); }],
    ['max(', function () { return T.fn('max'); }],
    ['gcd(', function () { return T.fn('gcd'); }],
    ['lcm(', function () { return T.fn('lcm'); }],
    ['nDeriv(', function () { return T.fn('nDeriv'); }],
    ['fnInt(', function () { return T.fn('fnInt'); }],
    ['fMin(', function () { return T.fn('fMin'); }],
    ['fMax(', function () { return T.fn('fMax'); }],
    ['ˣ√', function () { return T.xroot(); }],
    ['xroot', function () { return T.xroot(); }],
    ['nPr', function () { return T.op('nPr'); }],
    ['nCr', function () { return T.op('nCr'); }],
    ['e^(', function () { return T.fn('exp', 'e^('); }],
    ['10^(', function () { return T.fn('tenpow', '10^('); }],
    ['Ans', function () { return T.ans(); }],
    ['▸Frac', function () { return T.conv('frac', '▸Frac'); }],
    ['▸Dec', function () { return T.conv('dec', '▸Dec'); }],
    ['>Frac', function () { return T.conv('frac', '▸Frac'); }],
    ['>Dec', function () { return T.conv('dec', '▸Dec'); }],
    ['pi', function () { return T.konst('pi', 'π'); }],
    ['π', function () { return T.konst('pi', 'π'); }],
    ['²', function () { return T.post('sq', '²'); }],
    ['³', function () { return T.post('cube', '³'); }],
    ['⁻¹', function () { return T.post('inv', '⁻¹'); }],
    ['and', function () { return T.word('and', ' and '); }],
    ['xor', function () { return T.word('xor', ' xor '); }],
    ['or', function () { return T.word('or', ' or '); }],
    ['not(', function () { return T.fn('not'); }],

    /* matrix and list functions */
    ['Matr>list(', function () { return T.fn('matrToList', 'Matr▸list('); }],
    ['Matr▸list(', function () { return T.fn('matrToList', 'Matr▸list('); }],
    ['List>matr(', function () { return T.fn('listToMatr', 'List▸matr('); }],
    ['List▸matr(', function () { return T.fn('listToMatr', 'List▸matr('); }],
    ['identity(', function () { return T.fn('identity'); }],
    ['augment(', function () { return T.fn('augment'); }],
    ['cumSum(', function () { return T.fn('cumSum'); }],
    ['rowSwap(', function () { return T.fn('rowSwap'); }],
    ['row+(', function () { return T.fn('rowPlus', 'row+('); }],
    ['*row+(', function () { return T.fn('mulRowPlus', '*row+('); }],
    ['*row(', function () { return T.fn('mulRow', '*row('); }],
    ['randM(', function () { return T.fn('randM'); }],
    ['rref(', function () { return T.fn('rref'); }],
    ['ref(', function () { return T.fn('ref'); }],
    ['Fill(', function () { return T.fn('fill'); }],
    ['det(', function () { return T.fn('det'); }],
    ['dim(', function () { return T.fn('dim'); }],
    ['^T', function () { return T.post('transp', 'ᵀ'); }],
    ['ᵀ', function () { return T.post('transp', 'ᵀ'); }]
  ];

  T.lex = function (src) {
    var out = [], i = 0;
    outer: while (i < src.length) {
      var c = src.charAt(i);
      if (c === ' ') { i++; continue; }
      for (var k = 0; k < NAMES.length; k++) {
        var name = NAMES[k][0];
        if (src.substr(i, name.length) === name) { out.push(NAMES[k][1]()); i += name.length; continue outer; }
      }
      if (c >= '0' && c <= '9' || c === '.') { out.push(T.digit(c)); i++; continue; }
      if (c === '~' || c === '⁻') { out.push(T.neg()); i++; continue; }
      if ('+-*/^'.indexOf(c) >= 0) { out.push(T.op(c)); i++; continue; }
      if (c === '[') {
        var nm = src.charAt(i + 1);
        if (nm >= 'A' && nm <= 'J' && src.charAt(i + 2) === ']') { out.push(T.mat(nm)); i += 3; continue; }
        out.push(T.lb()); i++; continue;
      }
      if (c === ']') { out.push(T.rb()); i++; continue; }
      if (c === '{') { out.push(T.lbr()); i++; continue; }
      if (c === '}') { out.push(T.rbr()); i++; continue; }
      if (c === 'L' && src.charAt(i + 1) >= '1' && src.charAt(i + 1) <= '6') {
        out.push(T.lst(+src.charAt(i + 1))); i += 2; continue;
      }
      if (c === '(') { out.push(T.lp()); i++; continue; }
      if (c === ')') { out.push(T.rp()); i++; continue; }
      if (c === ',') { out.push(T.comma()); i++; continue; }
      if (c === 'E') { out.push(T.ee()); i++; continue; }
      if (c === '!') { out.push(T.post('fact', '!')); i++; continue; }
      if (c === '=' && src.charAt(i + 1) === '>') { out.push(T.store()); i += 2; continue; }
      if (c === '→') { out.push(T.store()); i++; continue; }
      if (c === 'Y' && src.charAt(i + 1) >= '0' && src.charAt(i + 1) <= '9') {
        out.push(T.yvar(+src.charAt(i + 1))); i += 2; continue;
      }
      if (c >= 'A' && c <= 'Z' || c === 'θ') { out.push(T.vari(c)); i++; continue; }
      if (c === '<' || c === '>' || c === '=') { out.push(T.op(c)); i++; continue; }
      if (c === '≠' || c === '≤' || c === '≥') { out.push(T.op(c)); i++; continue; }
      throw new Error('lex: unexpected "' + c + '" at ' + i);
    }
    return out;
  };

  TI.Tok = T;
})(window.TI = window.TI || {});
