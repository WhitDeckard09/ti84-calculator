/* Node harness: checks the engine against results a real TI-84 Plus produces. */
global.window = {};
require('../js/font.js');
require('../js/math/tokens.js');
require('../js/math/parser.js');
require('../js/math/dec.js');
require('../js/math/matrix.js');
require('../js/math/evaluator.js');
require('../js/math/format.js');
var TI = global.window.TI;

var ctx = {
  degree: false, ans: 0, vars: {},
  yGet: function (n) { return ctx.ys[n] ? TI.Tok.lex(ctx.ys[n]) : null; },
  ys: {}
};
var mode = { notation: 'NORMAL', digits: -1 };

function run(src) {
  var r = TI.Eval.evaluate(TI.Parser.parse(TI.Tok.lex(src)), ctx);
  return r.frac ? TI.Fmt.frac(r.value, mode) : TI.Fmt.num(r.value, mode);
}

var pass = 0, fail = 0, failures = [];
function eq(src, expect, note) {
  var got;
  try { got = run(src); }
  catch (e) { got = 'ERR:' + (e.ti || e.message); }
  if (got === expect) pass++;
  else { fail++; failures.push('  ' + src + '\n      expected ' + expect + '\n      got      ' + got + (note ? '   (' + note + ')' : '')); }
}

/* ---- order of operations ------------------------------------------------ */
eq('2+3*4', '14');
eq('(2+3)*4', '20');
eq('2+3*4^2', '50');
eq('2^3^2', '512', 'power is right associative');
eq('100/10/2', '5', 'division is left associative');
eq('8-3-2', '3');
eq('2*3+4*5', '26');
eq('6/2*3', '9', 'same precedence, left to right');

/* ---- negation vs subtraction (the classic TI trip-ups) ------------------ */
eq('~2^2', '⁻4', '(-)2^2 is -(2^2)');
eq('(~2)^2', '4');
eq('~2²', '⁻4', 'x-squared outranks negation');
eq('~3*4', '⁻12');
eq('2^~3', '.125', 'negative exponent');
eq('5-3', '2');
eq('5~3', 'ERR:SYNTAX', 'using (-) where - was meant is a syntax error');
eq('3*~2', '⁻6');
eq('~~5', '5');

/* ---- implied multiplication (TI-83/84 rules, not TI-85) ----------------- */
eq('2(3+4)', '14');
eq('(2)(3)', '6');
eq('2pi', '6.283185307');
eq('4sin(0)', '0');
eq('3(4)+2', '14');

/* ---- decimals, leading zeros, display digits ---------------------------- */
eq('1/2', '.5', 'leading zero is dropped');
eq('1/3', '.3333333333', '10 significant digits');
eq('2/3', '.6666666667', 'rounds at the 10th digit');
eq('.1+.2', '.3', '14-digit internal precision hides binary noise');
eq('1/8', '.125');
eq('.5*.5', '.25');
eq('1/1000', '.001', 'still fixed notation at 1e-3');
eq('1/10000', '1ᴇ⁻4', 'scientific below 1e-3');
eq('123456789*100', '1.23456789ᴇ10', 'scientific at 1e10 and up');
eq('2/1', '2');
eq('~1/4', '⁻.25');

/* ---- roots and powers --------------------------------------------------- */
eq('sqrt(9)', '3');
eq('sqrt(2)', '1.414213562');
eq('sqrt(9+7)', '4', 'the radical carries its own paren');
eq('sqrt(~1)', 'ERR:NONREAL ANS');
eq('sqrt(2)²', '2', 'round-trip cleans up floating point');
eq('3^.5', '1.732050808');
eq('cbrt(27)', '3');
eq('8^(1/3)', '2');
eq('~8^(1/3)', '⁻2', 'negation applies after the power');
eq('(~8)^(1/3)', 'ERR:NONREAL ANS', 'TI refuses fractional powers of a negative base');
eq('4^~1', '.25');
eq('25^.5', '5');

/* ---- x-root, squares, inverses ------------------------------------------ */
eq('3ˣ√(8)', '2');
eq('5²', '25');
eq('5⁻¹', '.2');
ctx.vars.X = 3;
eq('2X²', '18', '2*3² is 2*(3²)');
delete ctx.vars.X;
eq('0⁻¹', 'ERR:DIVIDE BY 0');

/* ---- the 1/2X case ------------------------------------------------------ */
ctx.vars.X = 3;
eq('1/2X', '1.5', 'TI-83/84 gives implied multiplication no special rank');
eq('1/(2X)', '.1666666667');
delete ctx.vars.X;

/* ---- logs and exponentials ---------------------------------------------- */
eq('log(100)', '2');
eq('ln(1)', '0');
eq('e^(1)', '2.718281828');
eq('10^(3)', '1000');
eq('log(0)', 'ERR:DIVIDE BY 0');
eq('log(~5)', 'ERR:NONREAL ANS');
eq('ln(e^(2))', '2');

/* ---- trig, radian then degree ------------------------------------------- */
eq('sin(0)', '0');
eq('cos(0)', '1');
eq('sin(pi/6)', '.5');
eq('sin⁻¹(1)', '1.570796327');
ctx.degree = true;
eq('sin(30)', '.5', 'degree mode');
eq('cos(60)', '.5');
eq('tan(45)', '1');
eq('sin⁻¹(.5)', '30');
ctx.degree = false;

/* ---- errors -------------------------------------------------------------- */
eq('1/0', 'ERR:DIVIDE BY 0');
eq('2+', 'ERR:SYNTAX');
eq('(2+3', '5', 'unclosed parens are closed at ENTER');
eq('2(3', '6');
eq('sin(', 'ERR:SYNTAX');
eq('sin⁻¹(2)', 'ERR:DOMAIN');

/* ---- fractions ----------------------------------------------------------- */
eq('.5>Frac', '1/2');
eq('1/3>Frac', '1/3');
eq('1/2+1/3>Frac', '5/6', '▸Frac applies to the whole expression');
eq('.375>Frac', '3/8');
eq('2>Frac', '2');
eq('pi>Frac', '3.141592654', 'denominator too large, falls back to decimal');
eq('~.25>Frac', '⁻1/4');
eq('.3333333333>Frac', '1/3');

/* ---- Ans, variables, store ----------------------------------------------- */
ctx.ans = 7;
eq('Ans+1', '8');
eq('+5', '12', 'a leading operator recalls Ans');
eq('*2', '14');
eq('5=>A', '5');
eq('A*3', '15');
eq('B', '0', 'unset variables are zero');
eq('2=>B', '2');
eq('A+B', '7');

/* ---- probability and number tools ---------------------------------------- */
eq('5!', '120');
eq('0!', '1');
eq('5nCr2', '10');
eq('5nPr2', '20');
eq('abs(~7)', '7');
eq('int(~2.5)', '⁻3', 'int() floors');
eq('iPart(~2.5)', '⁻2', 'iPart() truncates');
eq('fPart(2.75)', '.75');
eq('round(pi,2)', '3.14');
eq('min(3,8)', '3');
eq('max(3,8)', '8');
eq('gcd(12,18)', '6');
eq('lcm(4,6)', '12');

/* ---- calculus helpers ----------------------------------------------------- */
eq('nDeriv(X²,X,3)', '6');
eq('fnInt(X²,X,0,3)', '9');
eq('fMin(X²+2X,X,~5,5)', '⁻1');

/* ---- Y-vars --------------------------------------------------------------- */
ctx.ys[1] = '2X+1';
ctx.ys[2] = 'Y1*3';
ctx.vars.X = 4;
eq('Y1', '9');
eq('Y2', '27', 'Y-vars may reference each other');
eq('Y3', 'ERR:UNDEFINED');
delete ctx.vars.X;

/* ---- relational ----------------------------------------------------------- */
eq('3>2', '1');
eq('3<2', '0');
eq('2=2', '1');

/* ---- scientific-notation entry -------------------------------------------- */
eq('1E3', '1000');
eq('2.5E~2', '.025');
eq('1E3+1', '1001');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (fail) { console.log(failures.join('\n\n')); process.exit(1); }
