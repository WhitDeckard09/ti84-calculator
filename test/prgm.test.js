/* Node harness for the program editor's storage and the TI-BASIC interpreter. */
global.window = {};
require('../js/font.js');
require('../js/math/tokens.js');
require('../js/math/parser.js');
require('../js/math/dec.js');
require('../js/math/matrix.js');
require('../js/math/evaluator.js');
require('../js/math/format.js');
require('../js/state.js');
require('../js/prgm.js');
var TI = global.window.TI;
var T = TI.Tok, P = TI.Prgm, S = TI.State;

/* stand-in for the home screen */
var out = [];
var host = {
  progDisp: function (t, right) { out.push(typeof t === 'string' ? (right ? '>' : '') + t : t); },
  progClear: function () { out.length = 0; },
  progOutput: function (r, c, t) { out.push('@' + r + ',' + c + ':' + t); },
  progDone: function () { out.push('Done'); },
  progError: function (kind, name, line) { out.push('ERR:' + kind + '@' + line); }
};
P.setHost(host);

function lit(s) { return Array.from(s).map(function (c) {
  if (c >= '0' && c <= '9' || c === '.') return T.digit(c);
  if (c === ' ') return T.sp();
  if (c >= 'A' && c <= 'Z') return T.vari(c);
  if (c === ',') return T.comma();
  if (c === '(') return T.lp();
  if (c === ')') return T.rp();
  if (c === '"') return T.quote();
  if (c === '>') return T.op('>');
  if (c === '<') return T.op('<');
  if (c === '=') return T.op('=');
  if (c === '+') return T.op('+');
  if (c === '-') return T.op('-');
  if (c === '*') return T.op('*');
  if (c === '/') return T.op('/');
  if (c === '→') return T.store();
  if (c === '?' || c === ':' ) return T.punct(c);
  throw new Error('lit: ' + c);
}); }

/* "Disp|"HI"" -> command token then literal tokens */
function line(src) {
  var m = /^([A-Za-z]+)\|?(.*)$/.exec(src);
  if (m && P.CMDS[m[1]]) return [P.cmdTok(m[1])].concat(lit(m[2]));
  return lit(src);
}

function prog(name, lines) {
  P.remove(name);
  var p = P.create(name);
  p.lines = lines.map(line);
  return p;
}

var pass = 0, fails = [];
function check(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else fails.push('  ' + name + '\n      want ' + w + '\n      got  ' + g);
}
function runOut(name) { out = []; S.vars = {}; P.run(name); return out; }

/* --- matrices and lists in programs -------------------------------------- */
function mline(src) {
  if (P.CMDS[src]) return [P.cmdTok(src)];
  var m = /^([A-Za-z]+)\|(.*)$/.exec(src);
  if (m && P.CMDS[m[1]]) return [P.cmdTok(m[1])].concat(TI.Tok.lex(m[2]));
  return TI.Tok.lex(src);
}
function mprog(name, lines) {
  P.remove(name);
  var p = P.create(name);
  p.lines = lines.map(mline);
  return p;
}
function runM(name) { out = []; S.vars = {}; S.mats = {}; S.lists = {}; P.run(name); return out; }

mprog('MATA', ['[[1,2][3,4]]→[A]', 'Disp|[A]', 'Disp|[A](2,1)', '[A]²']);
var mo = runM('MATA');
check('Disp matrix hands the host its lines', mo[0].lines, ['[[1 2]', ' [3 4]]']);
check('Disp matrix is right aligned', mo.length, 4);
check('Disp element', mo[1], '>3');
check('bare matrix expression shows its answer', mo[2].lines, ['[[7  10]', ' [15 22]]']);

mprog('MATB', ['{1,2,3}→L1', 'Disp|L1*2', 'Disp|dim(L1)']);
var lo = runM('MATB');
check('Disp list', lo[0].lines, ['{2 4 6}']);
check('Disp dim of a list', lo[1], '>3');

mprog('MATC', ['[[1,2][3,4]]→[A]', 'For|I,1,2', 'Disp|[A](I,I)', 'End']);
var co = runM('MATC');
check('matrix element inside a loop', co, ['>1', '>4', 'Done']);

mprog('MATD', ['[[1,2][3,4]]→X']);
check('storing a matrix in a real variable is DATA TYPE', runM('MATD').slice(-1)[0], 'ERR:DATA TYPE@0');

mprog('MATE', ['Disp|[B]']);
check('undefined matrix', runM('MATE').slice(-1)[0], 'ERR:UNDEFINED@0');

/* --- names ------------------------------------------------------------- */
check('valid name', P.validName('NOTES'), true);
check('8 chars ok', P.validName('ABCDEFGH'), true);
check('9 chars rejected', P.validName('ABCDEFGHI'), false);
check('cannot start with a digit', P.validName('1ABC'), false);
check('no lowercase', P.validName('Notes'), false);

/* --- storage ------------------------------------------------------------ */
P.remove('ZZ'); P.create('ZZ');
check('created', !!P.find('ZZ'), true);
check('create is idempotent', P.list().filter(function (p) { return p.name === 'ZZ'; }).length, 1);
P.remove('ZZ');
check('removed', P.find('ZZ'), null);

/* --- notes: plain text lines are stored verbatim ------------------------ */
var notes = prog('NOTES', ['AREA OF A CIRCLE', 'A=PI R SQUARED']);
check('note line 1', TI.Tok.toText(notes.lines[0]), 'AREA OF A CIRCLE');
check('note line 2', TI.Tok.toText(notes.lines[1]), 'A=PI R SQUARED');

/* --- Disp and ClrHome --------------------------------------------------- */
prog('D1', ['ClrHome', 'Disp|"HELLO"', 'Disp|42']);
check('Disp string then number', runOut('D1'), ['HELLO', '>42', 'Done']);

prog('D2', ['Disp|"A","B"']);
check('Disp takes several arguments', runOut('D2'), ['A', 'B', 'Done']);

/* --- Output( ------------------------------------------------------------ */
prog('O1', ['ClrHome', 'Output|2,3,"HI"']);
check('Output positions text', runOut('O1'), ['@2,3:HI', 'Done']);

/* --- stores and bare expressions ---------------------------------------- */
prog('S1', ['5→A', 'A+2']);
check('a store is silent inside a program', runOut('S1'), ['>7', 'Done']);

/* --- If / Then / Else / End --------------------------------------------- */
prog('I1', ['5→A', 'If|A>3', 'Then', 'Disp|"BIG"', 'Else', 'Disp|"SMALL"', 'End', 'Disp|"AFTER"']);
check('If true branch', runOut('I1'), ['BIG', 'AFTER', 'Done']);
prog('I2', ['1→A', 'If|A>3', 'Then', 'Disp|"BIG"', 'Else', 'Disp|"SMALL"', 'End', 'Disp|"AFTER"']);
check('If false branch', runOut('I2'), ['SMALL', 'AFTER', 'Done']);

/* a bare If governs only the following line */
prog('I3', ['0→A', 'If|A>3', 'Disp|"YES"', 'Disp|"ALWAYS"']);
check('bare If skips one line', runOut('I3'), ['ALWAYS', 'Done']);
prog('I4', ['9→A', 'If|A>3', 'Disp|"YES"', 'Disp|"ALWAYS"']);
check('bare If runs one line', runOut('I4'), ['YES', 'ALWAYS', 'Done']);

/* --- For( --------------------------------------------------------------- */
prog('F1', ['For|A,1,3', 'Disp|A', 'End', 'Disp|"OUT"']);
check('For counts up', runOut('F1'), ['>1', '>2', '>3', 'OUT', 'Done']);
prog('F2', ['For|A,10,1,-3', 'Disp|A', 'End']);
check('For with a negative step', runOut('F2'), ['>10', '>7', '>4', '>1', 'Done']);
prog('F3', ['For|A,5,1', 'Disp|A', 'End', 'Disp|"NONE"']);
check('For that never runs', runOut('F3'), ['NONE', 'Done']);

/* nested loops */
prog('F4', ['For|A,1,2', 'For|B,1,2', 'Disp|A*10+B', 'End', 'End']);
check('nested For', runOut('F4'), ['>11', '>12', '>21', '>22', 'Done']);

/* --- While / Repeat ------------------------------------------------------ */
prog('W1', ['1→A', 'While|A<4', 'Disp|A', 'A+1→A', 'End']);
check('While', runOut('W1'), ['>1', '>2', '>3', 'Done']);
prog('R1', ['1→A', 'Repeat|A>3', 'Disp|A', 'A+1→A', 'End']);
check('Repeat runs at least once', runOut('R1'), ['>1', '>2', '>3', 'Done']);

/* --- Lbl / Goto / Stop --------------------------------------------------- */
prog('G1', ['Goto|A', 'Disp|"SKIPPED"', 'Lbl|A', 'Disp|"JUMPED"']);
check('Goto', runOut('G1'), ['JUMPED', 'Done']);
prog('G2', ['Disp|"ONE"', 'Stop', 'Disp|"TWO"']);
check('Stop ends the program', runOut('G2'), ['ONE', 'Done']);
prog('G3', ['Goto|Z']);
check('missing label', runOut('G3'), ['ERR:LABEL@0']);

/* --- DelVar -------------------------------------------------------------- */
prog('V1', ['7→A', 'DelVar|A', 'A']);
check('DelVar clears the variable', runOut('V1'), ['>0', 'Done']);

/* --- calling another program --------------------------------------------- */
prog('SUB', ['Disp|"SUB"']);
var main = prog('MAIN', ['Disp|"A"', 'X', 'Disp|"B"']);
main.lines[1] = [T.prgm('SUB')];
check('prgm calls a subprogram', runOut('MAIN'), ['A', 'SUB', 'B', 'Done']);

/* --- Pause suspends and resumes ------------------------------------------ */
prog('P1', ['Disp|"ONE"', 'Pause', 'Disp|"TWO"']);
out = []; S.vars = {}; P.run('P1');
check('Pause holds', out, ['ONE']);
check('waiting on pause', P.waiting().type, 'pause');
P.resume();
check('resume finishes', out, ['ONE', 'TWO', 'Done']);
check('not running afterwards', P.isRunning(), false);

/* --- Input / Prompt ------------------------------------------------------ */
prog('N1', ['Prompt|A', 'Disp|A*2']);
out = []; S.vars = {}; P.run('N1');
check('Prompt asks', P.waiting().prompt, 'A=?');
P.resume(21);
check('Prompt result', out, ['>42', 'Done']);

prog('N2', ['Input|"AGE?",A', 'Disp|A']);
out = []; S.vars = {}; P.run('N2');
check('Input prompt text', P.waiting().prompt, 'AGE?');
P.resume(9);
check('Input result', out, ['>9', 'Done']);

prog('N3', ['Prompt|A,B', 'Disp|A+B']);
out = []; S.vars = {}; P.run('N3');
check('multi Prompt asks for A', P.waiting().varName, 'A');
P.resume(3);
check('multi Prompt then asks for B', P.waiting().varName, 'B');
P.resume(4);
check('multi Prompt result', out, ['>7', 'Done']);

/* --- errors point at the offending line ----------------------------------- */
prog('E1', ['Disp|"OK"', '1/0']);
check('runtime error reports its line', runOut('E1'), ['OK', 'ERR:DIVIDE BY 0@1']);

/* --- runaway loops are stopped -------------------------------------------- */
prog('E2', ['Lbl|A', 'Goto|A']);
var r = runOut('E2');
check('infinite loop is broken', r[0].indexOf('ERR:BREAK') === 0, true);

console.log('\n  ' + pass + ' passed, ' + fails.length + ' failed\n');
if (fails.length) { console.log(fails.join('\n\n')); process.exit(1); }
