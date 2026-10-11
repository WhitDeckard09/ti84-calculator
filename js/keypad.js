/* ---------------------------------------------------------------------------
 * keypad.js — the TI-84 Plus key matrix.
 *
 * Layout, colours and the blue/green legends above each key follow the real
 * keypad. Each key carries up to three bindings: unshifted, 2nd, and ALPHA.
 * A binding is either { tok: fn } (insert a token) or { act: 'name' }.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var T = TI.Tok;
  function tok(fn) { return { tok: fn }; }
  function act(name, arg) { return { act: name, arg: arg }; }
  function letter(ch) { return { tok: function () { return T.vari(ch); } }; }
  function digit(ch) { return { tok: function () { return T.digit(ch); } }; }

  /* id, class, main label, [2nd label, 2nd binding], [alpha label, alpha binding] */
  var ROWS = [
    /* ---- graphing row ------------------------------------------------- */
    [
      { id: 'yeq',    cls: 'k-top', label: 'Y=',     main: act('yeq'),    s2: 'STAT PLOT', s: act('statplot') },
      { id: 'window', cls: 'k-top', label: 'WINDOW', main: act('window'), s2: 'TBLSET',    s: act('tblset') },
      { id: 'zoom',   cls: 'k-top', label: 'ZOOM',   main: act('zoom'),   s2: 'FORMAT',    s: act('format') },
      { id: 'trace',  cls: 'k-top', label: 'TRACE',  main: act('trace'),  s2: 'CALC',      s: act('calc') },
      { id: 'graph',  cls: 'k-top', label: 'GRAPH',  main: act('graph'),  s2: 'TABLE',     s: act('table') }
    ],
    /* ---- 2nd / ALPHA block + directional pad -------------------------- */
    [
      { id: 'second', cls: 'k-2nd',  label: '2nd',  main: act('second') },
      { id: 'mode',   cls: 'k-fn',   label: 'MODE', main: act('mode'), s2: 'QUIT', s: act('quit') },
      { id: 'del',    cls: 'k-fn',   label: 'DEL',  main: act('del'),  s2: 'INS',  s: act('ins') }
    ],
    [
      { id: 'alpha',  cls: 'k-alpha', label: 'ALPHA', main: act('alpha'), s2: 'A-LOCK', s: act('alphalock') },
      { id: 'xtn',    cls: 'k-fn',    label: 'X,T,θ,n', small: true, main: tok(function () { return T.vari('X'); }), s2: 'LINK', s: act('na') },
      { id: 'stat',   cls: 'k-fn',    label: 'STAT', main: act('na'), s2: 'LIST', s: act('na') }
    ],
    /* ---- main block ---------------------------------------------------- */
    [
      { id: 'math',  cls: 'k-fn', label: 'MATH',  main: act('math'),  s2: 'TEST',  s: act('test'),  a2: 'A', a: letter('A') },
      { id: 'apps',  cls: 'k-fn', label: 'APPS',  main: act('apps'),  s2: 'ANGLE', s: act('angle'), a2: 'B', a: letter('B') },
      { id: 'prgm',  cls: 'k-fn', label: 'PRGM',  main: act('prgm'),  s2: 'DRAW',  s: act('na'),    a2: 'C', a: letter('C') },
      { id: 'vars',  cls: 'k-fn', label: 'VARS',  main: act('vars'),  s2: 'DISTR', s: act('na') },
      { id: 'clear', cls: 'k-fn', label: 'CLEAR', main: act('clear') }
    ],
    [
      { id: 'inv', cls: 'k-fn', label: 'x⁻¹', main: tok(function () { return T.post('inv', '⁻¹'); }), s2: 'MATRIX', s: act('matrix'), a2: 'D', a: letter('D') },
      { id: 'sin', cls: 'k-fn', label: 'SIN', main: tok(function () { return T.fn('sin'); }), s2: 'SIN⁻¹', s: tok(function () { return T.fn('asin', 'sin⁻¹('); }), a2: 'E', a: letter('E') },
      { id: 'cos', cls: 'k-fn', label: 'COS', main: tok(function () { return T.fn('cos'); }), s2: 'COS⁻¹', s: tok(function () { return T.fn('acos', 'cos⁻¹('); }), a2: 'F', a: letter('F') },
      { id: 'tan', cls: 'k-fn', label: 'TAN', main: tok(function () { return T.fn('tan'); }), s2: 'TAN⁻¹', s: tok(function () { return T.fn('atan', 'tan⁻¹('); }), a2: 'G', a: letter('G') },
      { id: 'pow', cls: 'k-fn', label: '^', main: tok(function () { return T.op('^'); }), s2: 'π', s: tok(function () { return T.konst('pi', 'π'); }), a2: 'H', a: letter('H') }
    ],
    [
      { id: 'sq',    cls: 'k-fn', label: 'x²', main: tok(function () { return T.post('sq', '²'); }), s2: '√', s: tok(function () { return T.fn('sqrt', '√('); }), a2: 'I', a: letter('I') },
      { id: 'comma', cls: 'k-fn', label: ',', main: tok(function () { return T.comma(); }), s2: 'EE', s: tok(function () { return T.ee(); }), a2: 'J', a: letter('J') },
      { id: 'lp',    cls: 'k-fn', label: '(', main: tok(function () { return T.lp(); }), s2: '{', s: tok(function () { return T.lbr(); }), a2: 'K', a: letter('K') },
      { id: 'rp',    cls: 'k-fn', label: ')', main: tok(function () { return T.rp(); }), s2: '}', s: tok(function () { return T.rbr(); }), a2: 'L', a: letter('L') },
      { id: 'div',   cls: 'k-op', label: '÷', main: tok(function () { return T.op('/'); }), s2: 'e', s: tok(function () { return T.konst('e', 'e'); }), a2: 'M', a: letter('M') }
    ],
    [
      { id: 'log', cls: 'k-fn',  label: 'LOG', main: tok(function () { return T.fn('log'); }), s2: '10ˣ', s: tok(function () { return T.fn('tenpow', '10^('); }), a2: 'N', a: letter('N') },
      { id: 'n7',  cls: 'k-num', label: '7', main: digit('7'), s2: 'u', s: act('na'), a2: 'O', a: letter('O') },
      { id: 'n8',  cls: 'k-num', label: '8', main: digit('8'), s2: 'v', s: act('na'), a2: 'P', a: letter('P') },
      { id: 'n9',  cls: 'k-num', label: '9', main: digit('9'), s2: 'w', s: act('na'), a2: 'Q', a: letter('Q') },
      { id: 'mul', cls: 'k-op',  label: '×', main: tok(function () { return T.op('*'); }), s2: '[', s: tok(function () { return T.lb(); }), a2: 'R', a: letter('R') }
    ],
    [
      { id: 'ln',  cls: 'k-fn',  label: 'LN', main: tok(function () { return T.fn('ln'); }), s2: 'eˣ', s: tok(function () { return T.fn('exp', 'e^('); }), a2: 'S', a: letter('S') },
      { id: 'n4',  cls: 'k-num', label: '4', main: digit('4'), s2: 'L₄', s: tok(function () { return T.lst(4); }), a2: 'T', a: letter('T') },
      { id: 'n5',  cls: 'k-num', label: '5', main: digit('5'), s2: 'L₅', s: tok(function () { return T.lst(5); }), a2: 'U', a: letter('U') },
      { id: 'n6',  cls: 'k-num', label: '6', main: digit('6'), s2: 'L₆', s: tok(function () { return T.lst(6); }), a2: 'V', a: letter('V') },
      { id: 'sub', cls: 'k-op',  label: '−', main: tok(function () { return T.op('-'); }), s2: ']', s: tok(function () { return T.rb(); }), a2: 'W', a: letter('W') }
    ],
    [
      { id: 'sto', cls: 'k-fn',  label: 'STO▸', main: act('sto'), s2: 'RCL', s: act('na'), a2: 'X', a: letter('X') },
      { id: 'n1',  cls: 'k-num', label: '1', main: digit('1'), s2: 'L₁', s: tok(function () { return T.lst(1); }), a2: 'Y', a: letter('Y') },
      { id: 'n2',  cls: 'k-num', label: '2', main: digit('2'), s2: 'L₂', s: tok(function () { return T.lst(2); }), a2: 'Z', a: letter('Z') },
      { id: 'n3',  cls: 'k-num', label: '3', main: digit('3'), s2: 'L₃', s: tok(function () { return T.lst(3); }), a2: 'θ', a: letter('θ') },
      { id: 'add', cls: 'k-op',  label: '+', main: tok(function () { return T.op('+'); }), s2: 'MEM', s: act('mem'), a2: '"', a: tok(function () { return T.quote(); }) }
    ],
    [
      { id: 'on',    cls: 'k-fn',    label: 'ON', main: act('on'), s2: 'OFF', s: act('off') },
      { id: 'n0',    cls: 'k-num',   label: '0', main: digit('0'), s2: 'CATALOG', s: act('na'), a2: '␣', a: tok(function () { return T.sp(); }) },
      { id: 'dot',   cls: 'k-num',   label: '.', main: digit('.'), s2: 'i', s: act('na'), a2: ':', a: tok(function () { return T.punct(':'); }) },
      { id: 'negate',cls: 'k-num',   label: '(−)', main: tok(function () { return T.neg(); }), s2: 'ANS', s: tok(function () { return T.ans(); }), a2: '?', a: tok(function () { return T.punct('?'); }) },
      /* SOLVE is printed above ENTER but only lives in the equation solver, so
         ENTER keeps working while A-LOCK is on — which is how you finish
         typing a program name. */
      { id: 'enter', cls: 'k-enter', label: 'ENTER', main: act('enter'), s2: 'ENTRY', s: act('entry'), a2: 'SOLVE' }
    ]
  ];

  var DPAD = [
    { id: 'up',    act: 'up' },
    { id: 'left',  act: 'left' },
    { id: 'right', act: 'right' },
    { id: 'down',  act: 'down' }
  ];

  var byId = {};
  ROWS.forEach(function (r) { r.forEach(function (k) { byId[k.id] = k; }); });

  /* --- DOM ------------------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function build(root, onPress) {
    root.innerHTML = '';

    ROWS.forEach(function (row, ri) {
      row.forEach(function (k, ci) {
        var cell = el('div', 'cell');
        cell.style.gridRow = String(ri + 1);
        cell.style.gridColumn = String(ci + 1);

        var legend = el('div', 'legend');
        legend.appendChild(el('span', 'lg-2nd', k.s2 || ''));
        legend.appendChild(el('span', 'lg-alpha', k.a2 || ''));
        cell.appendChild(legend);

        var btn = el('button', 'key ' + k.cls + (k.small ? ' key-sm' : ''), k.label);
        btn.type = 'button';
        btn.dataset.key = k.id;
        btn.setAttribute('aria-label', k.label);
        cell.appendChild(btn);

        root.appendChild(cell);
      });
    });

    /* directional pad spans the two rows to the right of 2nd / ALPHA */
    var pad = el('div', 'dpad');
    pad.style.gridRow = '2 / span 2';
    pad.style.gridColumn = '4 / span 2';
    DPAD.forEach(function (d) {
      var b = el('button', 'arrow arrow-' + d.id);
      b.type = 'button';
      b.dataset.key = d.id;
      b.setAttribute('aria-label', d.id);
      b.appendChild(el('i', 'chev'));
      pad.appendChild(b);
    });
    pad.appendChild(el('div', 'dpad-hub'));
    root.appendChild(pad);

    /* One delegated handler; pointerdown so the key answers on touch-down
       like a real membrane switch. */
    var active = null;
    function press(e) {
      var b = e.target.closest('button[data-key]');
      if (!b) {
        /* the legend strip above a key counts as part of it — worth ~10px of
           extra target on a small phone */
        var cell = e.target.closest('.cell');
        if (cell) b = cell.querySelector('button[data-key]');
      }
      if (!b) return;
      e.preventDefault();
      active = b;
      b.classList.add('down');
      /* isTrusted keeps synthetic events from tripping the gesture policy */
      if (e.isTrusted && navigator.vibrate) { try { navigator.vibrate(8); } catch (err) {} }
      onPress(b.dataset.key);
    }
    function release() {
      if (active) { active.classList.remove('down'); active = null; }
    }
    root.addEventListener('pointerdown', press);
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('pointerleave', release);
    root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* Resolve a key press through the current modifier into a binding. */
  function resolve(id, mod) {
    if (id === 'up' || id === 'down' || id === 'left' || id === 'right') return { act: id };
    var k = byId[id];
    if (!k) return null;
    if (mod === '2nd' && k.s) return k.s;
    if ((mod === 'alpha' || mod === 'lock') && k.a) return k.a;
    return k.main;
  }

  TI.Keypad = { ROWS: ROWS, byId: byId, build: build, resolve: resolve };
})(window.TI = window.TI || {});
