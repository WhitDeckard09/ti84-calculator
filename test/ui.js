/* ---------------------------------------------------------------------------
 * test/ui.js — drives the real keypad and reads the real framebuffer back.
 * Load it in the page (or paste into the console) and call TIUI.run().
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  function dumpLarge() {
    var F = TI.Font.large.glyphs, L = TI.LCD;
    var table = Object.keys(F).map(function (ch) { return { ch: ch, key: F[ch].join(',') }; });
    var out = [];
    for (var r = 0; r < 8; r++) {
      var line = '';
      for (var c = 0; c < 16; c++) {
        var rows = [];
        for (var y = 0; y < 7; y++) {
          var b = 0;
          for (var x = 0; x < 5; x++) b |= L.get(c * 6 + x, r * 8 + y) << (4 - x);
          rows.push(b);
        }
        var key = rows.join(',');
        var hit = null;
        for (var i = 0; i < table.length; i++) if (table[i].key === key) { hit = table[i]; break; }
        line += hit ? hit.ch : (rows.every(function (v) { return v === 31; }) ? '█' : '?');
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out;
  }

  function dumpSmall(y) {
    var F = TI.Font.small.glyphs, L = TI.LCD;
    var table = Object.keys(F).map(function (ch) { return { ch: ch, key: F[ch].join(',') }; });
    var line = '';
    for (var c = 0; c < 24; c++) {
      var rows = [];
      for (var yy = 0; yy < 5; yy++) {
        var b = 0;
        for (var x = 0; x < 3; x++) b |= L.get(c * 4 + x, y + yy) << (2 - x);
        rows.push(b);
      }
      var key = rows.join(','), hit = null;
      for (var i = 0; i < table.length; i++) if (table[i].key === key) { hit = table[i]; break; }
      line += hit ? hit.ch : '?';
    }
    return line.replace(/\s+$/, '');
  }

  function press(seq) {
    seq.split(/\s+/).filter(Boolean).forEach(function (id) { TI.App.press(id); });
  }

  function reset() {
    try { localStorage.removeItem('ti84.state.v1'); } catch (e) {}
    TI.State.resetDefaults();
    TI.State.home.rows.length = 0;
    TI.State.entries.length = 0;
    TI.State.notation = 'NORMAL'; TI.State.digits = -1;
    TI.State.angle = 'RADIAN'; TI.State.plotStyle = 'CONNECTED';
    TI.State.tbl.start = 0; TI.State.tbl.delta = 1; TI.State.tbl.indpnt = 'AUTO';
    TI.State.programs.length = 0;
    TI.Prgm.abort();
    TI.Menu.closeAll();
    TI.App.resetScreens();
    TI.App.mod = null; TI.App.insert = false; TI.App.blink = false;
    TI.App.setScreen('home');
  }

  function run() {
    var pass = 0, fails = [];
    function check(name, got, want) {
      var g = JSON.stringify(got), w = JSON.stringify(want);
      if (g === w) pass++;
      else fails.push(name + '\n    want ' + w + '\n    got  ' + g);
    }
    function lastRows(n) { return TI.State.home.rows.slice(-n).map(function (r) { return r.s; }); }

    /* --- home: typing, ENTER, history ---------------------------------- */
    reset();
    press('n1 n2 add n3 n4 enter');
    check('addition', lastRows(2), ['12+34', '46']);

    press('mul n2 enter');                    /* leading operator recalls Ans */
    check('Ans chaining', lastRows(2), ['Ans*2', '92']);

    press('second enter');                    /* 2nd ENTRY recalls last entry */
    check('2nd ENTRY', TI.Screens.home.editor().text(), 'Ans*2');
    press('clear');

    /* --- squares, roots, negation --------------------------------------- */
    reset();
    press('negate n3 sq enter');
    check('(-)3² is -9', lastRows(2), ['⁻3²', '⁻9']);
    press('second sq n1 n6 rp enter');
    check('2nd x² gives the radical', lastRows(2), ['√(16)', '4']);

    /* --- MATH menu and fractions ---------------------------------------- */
    reset();
    press('n3 div n8 math n1 enter');         /* MATH 1:▸Frac */
    check('3/8 ▸Frac', lastRows(2), ['3/8▸Frac', '3/8']);

    /* --- trig honours MODE ---------------------------------------------- */
    reset();
    press('mode down down right enter');      /* MODE -> DEGREE */
    check('degree mode set', TI.State.angle, 'DEGREE');
    press('second mode');                     /* QUIT */
    press('sin n3 n0 rp enter');
    check('sin(30) in degrees', lastRows(1), ['.5']);

    /* --- store and recall a variable ------------------------------------ */
    reset();
    press('n7 sto alpha math enter');         /* 7 STO▸ A */
    check('7→A', lastRows(2), ['7→A', '7']);
    press('alpha math mul n6 enter');
    check('A*6', lastRows(1), ['42']);

    /* --- errors --------------------------------------------------------- */
    reset();
    press('n1 div n0 enter');
    check('divide by zero opens the error menu', dumpLarge().slice(0, 3),
          ['ERR:DIVIDE BY 0', '▸1:Quit', ' 2:Goto']);
    press('n2');                              /* 2:Goto */
    check('Goto restores the entry', TI.Screens.home.editor().text(), '1/0');

    /* --- Y= editor ------------------------------------------------------- */
    reset();
    press('yeq xtn sq');
    check('Y1 stored', TI.Tok.toText(TI.State.ys[0].toks), 'X²');
    press('down n2 xtn add n1');
    check('Y2 stored', TI.Tok.toText(TI.State.ys[1].toks), '2X+1');
    press('up left left left left enter');    /* walk onto the = and toggle */
    check('deselect Y1', TI.State.ys[0].on, false);
    press('enter');
    check('reselect Y1', TI.State.ys[0].on, true);

    /* --- WINDOW ---------------------------------------------------------- */
    press('window n5 down');                  /* Xmin = 5 */
    check('Xmin edited', TI.State.win.Xmin, 5);
    press('up negate n5 enter');
    check('Xmin negative', TI.State.win.Xmin, -5);

    /* --- ZOOM ------------------------------------------------------------ */
    press('zoom n6');                         /* 6:ZStandard */
    check('ZStandard', [TI.State.win.Xmin, TI.State.win.Xmax, TI.State.win.Ymin, TI.State.win.Ymax],
          [-10, 10, -10, 10]);
    press('zoom n4');                         /* 4:ZDecimal */
    check('ZDecimal', [TI.State.win.Xmin, TI.State.win.Xmax, TI.State.win.Ymin, TI.State.win.Ymax],
          [-4.7, 4.7, -3.1, 3.1]);
    check('ZDecimal ΔX is exactly .1', Math.round(TI.Graph.dX() * 1e12) / 1e12, 0.1);
    press('zoom n6 zoom n5');                 /* ZStandard then 5:ZSquare */
    check('ZSquare widens X', Math.round(TI.State.win.Xmax * 1e6) / 1e6, 15.16129);
    press('zoom n6 zoom n7');                 /* ZTrig, radian mode */
    check('ZTrig Xmax', Math.round(TI.State.win.Xmax * 1e9) / 1e9, Math.round(47 * Math.PI / 24 * 1e9) / 1e9);
    check('ZTrig Xscl', TI.State.win.Xscl, Math.PI / 2);
    press('zoom right n1');                   /* MEMORY tab, 1:ZPrevious */
    check('ZPrevious restores', [TI.State.win.Xmin, TI.State.win.Xmax], [-10, 10]);

    /* --- TRACE ----------------------------------------------------------- */
    press('zoom n6 trace');
    TI.App.render();
    check('trace starts at the centre column', dumpSmall(58), 'X=0         Y=0');
    press('right');
    TI.App.render();
    check('one column right is ΔX', dumpSmall(58).slice(0, 12), 'X=.212765957');

    /* --- TABLE ----------------------------------------------------------- */
    press('second window');                   /* TBLSET */
    press('n0 down n1 enter');                /* TblStart=0, ΔTbl=1 */
    press('second graph');                    /* TABLE */
    TI.App.render();
    var t = dumpLarge();
    check('table X column', [t[1].slice(0, 5).trim(), t[2].slice(0, 5).trim(), t[3].slice(0, 5).trim()],
          ['0', '1', '2']);
    check('table readout', t[7], 'X=0');
    press('right right');
    TI.App.render();
    check('table Y2 readout', dumpLarge()[7], 'Y2=1');

    /* --- VARS inserts a Y reference --------------------------------------- */
    reset();
    press('yeq xtn sq second mode');           /* Y1=X², QUIT */
    press('n3 sto xtn enter');                 /* 3→X */
    press('vars n1 enter');                    /* VARS 1:Y1 */
    check('Y1 evaluated at X=3', lastRows(2), ['Y₁', '9']);

    /* --- PRGM: create a note, type into it, read it back ------------------- */
    reset();
    press('prgm right right n1');              /* PRGM > NEW > 1:Create New */
    check('name entry turns A-LOCK on', [TI.App.screen, TI.App.mod], ['prgmname', 'lock']);
    press('log n7 n4 sin ln');                 /* N O T E S */
    press('enter');
    check('program created and opened', [TI.App.screen, !!TI.Prgm.find('NOTES')], ['prgmedit', true]);

    press('second alpha');                     /* A-LOCK for the body */
    press('pow sq n0 n4 sin ln n4');           /* "HI TEST" */
    press('enter');
    press('apps n1 sin');                      /* "BYE" */
    check('note lines stored', TI.Prgm.find('NOTES').lines.map(function (l) { return TI.Tok.toText(l); }),
          ['HI TEST', 'BYE']);

    press('second mode');                      /* QUIT */
    check('notes survive leaving the editor',
          TI.Prgm.find('NOTES').lines.map(function (l) { return TI.Tok.toText(l); }),
          ['HI TEST', 'BYE']);

    /* reopening through EDIT shows the same text */
    press('prgm right n1');
    check('reopened for editing', [TI.App.screen, TI.Screens.prgmedit.current().name], ['prgmedit', 'NOTES']);
    check('editor renders the note', dumpLarge().slice(0, 3), ['PROGRAM:NOTES', ':HI TEST', ':BYE']);

    /* APPS reaches the same notes */
    press('second mode');
    press('apps n1');
    check('APPS opens the note', TI.App.screen, 'prgmedit');

    /* EXEC pastes prgmNAME on the home screen and ENTER runs it */
    press('second mode');
    press('prgm n1');
    check('EXEC pastes the call', TI.Screens.home.editor().text(), 'prgmNOTES');

    /* a program that displays something */
    reset();
    (function () {
      var p = TI.Prgm.create('HELLO');
      p.lines = [
        [TI.Prgm.cmdTok('ClrHome')],
        [TI.Prgm.cmdTok('Disp'), TI.Tok.quote(), TI.Tok.vari('H'), TI.Tok.vari('I'), TI.Tok.quote()],
        [TI.Prgm.cmdTok('Pause')],
        [TI.Prgm.cmdTok('Disp'), TI.Tok.digit('4'), TI.Tok.digit('2')]
      ];
    })();
    TI.Screens.home.runProgram('HELLO');
    check('program output', TI.State.home.rows.map(function (r) { return r.s; }), ['HI']);
    check('paused', TI.Prgm.waiting().type, 'pause');
    press('enter');
    check('resumed to the end',
          TI.State.home.rows.map(function (r) { return r.s; }).filter(Boolean), ['HI', '42', 'Done']);

    /* Prompt collects a value typed on the home screen */
    reset();
    (function () {
      var p = TI.Prgm.create('ASK');
      p.lines = [
        [TI.Prgm.cmdTok('Prompt'), TI.Tok.vari('A')],
        [TI.Prgm.cmdTok('Disp'), TI.Tok.vari('A'), TI.Tok.op('*'), TI.Tok.digit('2')]
      ];
    })();
    TI.Screens.home.runProgram('ASK');
    check('prompt shown', TI.State.home.rows.slice(-1)[0].s, 'A=?');
    press('n2 n1 enter');
    check('prompt answered', TI.State.home.rows.slice(-2).map(function (r) { return r.s; }), ['42', 'Done']);

    /* --- matrices -------------------------------------------------------- */
    reset();
    press('second mul second mul n1 comma n2 second sub second mul n3 comma n4 second sub second sub');
    check('matrix literal on the entry line', TI.Screens.home.editor().text(), '[[1,2][3,4]]');
    press('enter');
    check('matrix answer is two lines, right aligned',
          dumpLarge().slice(1, 3), ['         [[1 2]', '          [3 4]]']);
    press('sto second inv enter');            /* Ans→[A] from the NAMES tab */
    press('enter');
    check('[[1,2][3,4]]→[A] stores it', TI.State.mats.A, [[1, 2], [3, 4]]);

    press('second inv enter');                /* paste [A] */
    check('NAMES pastes [A]', TI.Screens.home.editor().text(), '[A]');
    press('inv enter');                       /* [A]⁻¹ */
    check('inverse keeps the real calculator\'s rounding', TI.State.ans,
          [[-1.9999999999998, 0.99999999999994], [1.4999999999999, -0.49999999999997]]);

    reset();
    press('second inv right enter');          /* MATH 1:det( */
    press('second mul second mul n5 second sub second sub rp enter');
    check('det([[5]])', TI.State.ans, 5);

    reset();
    press('second mul second mul n1 comma n2 second sub second sub plus'.replace('plus', 'add')
          + ' n3 enter');
    check('matrix plus a number is DATA TYPE',
          dumpLarge().slice(0, 1), ['ERR:DATA TYPE']);

    /* --- the matrix editor ------------------------------------------------ */
    reset();
    press('second inv right right enter');    /* EDIT, [A] */
    check('editor opens on a fresh 1x1', TI.State.mats.A, [[0]]);
    press('n2 enter n2 enter');               /* 2 rows, 2 columns */
    press('n1 enter n2 enter n3 enter n4 enter');
    check('ENTER walks across then down', TI.State.mats.A, [[1, 2], [3, 4]]);
    press('second mode');                     /* QUIT */
    check('QUIT returns home', TI.App.screen, 'home');

    /* --- lists ------------------------------------------------------------- */
    reset();
    press('second lp n1 comma n2 comma n3 second rp sto second n1 enter');
    check('{1,2,3}→L1', TI.State.lists[1], [1, 2, 3]);
    press('second n1 mul n2 enter');
    check('L1*2', TI.State.ans, [2, 4, 6]);

    /* --- 2nd / ALPHA latching --------------------------------------------- */
    reset();
    press('second');
    check('2nd arms', TI.App.mod, '2nd');
    press('second');
    check('2nd disarms', TI.App.mod, null);
    press('second alpha');
    check('2nd then ALPHA locks', TI.App.mod, 'lock');
    press('alpha');
    check('ALPHA clears the lock', TI.App.mod, null);

    reset();
    return { pass: pass, fail: fails.length, failures: fails };
  }

  window.TIUI = { run: run, press: press, dumpLarge: dumpLarge, dumpSmall: dumpSmall, reset: reset };
})();
