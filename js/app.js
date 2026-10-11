/* ---------------------------------------------------------------------------
 * app.js — boots the calculator, routes keys, and drives the display.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LCD = TI.LCD, S = TI.State, T = TI.Tok;

  var App = {
    screen: 'home',
    mod: null,          /* null | '2nd' | 'alpha' | 'lock' */
    insert: false,      /* false = overwrite, matching the block cursor  */
    off: false,
    blink: true
  };
  TI.App = App;

  var canvas, ctx, scale = 4;
  var COLORS = { on: '#12160e', off: '#9caa84' };

  /* --- screens ---------------------------------------------------------- */
  function cur() { return TI.Screens[App.screen]; }

  App.setScreen = function (name, opts) {
    var from = TI.Screens[App.screen];
    if (from && from.leave && name !== App.screen) from.leave();
    App.screen = name;
    var to = TI.Screens[name];
    if (to && to.enter) to.enter(opts || {});
    render();
  };

  /* Put every screen's cursor back where a freshly reset calculator has it. */
  App.resetScreens = function () {
    Object.keys(TI.Screens).forEach(function (name) {
      var sc = TI.Screens[name];
      if (sc && sc.reset) sc.reset();
    });
  };

  App.insertToken = function (tok) {
    var sc = cur();
    if (sc && sc.key) sc.key({ tok: function () { return tok; } });
    render();
  };

  /* --- menus ------------------------------------------------------------ */
  function insertItem(label, makeTok) {
    return { label: label, run: function () { App.insertToken(makeTok()); } };
  }

  function openMath() {
    TI.Menu.open({
      tabs: ['MATH', 'NUM', 'PRB'],
      items: [
        [
          insertItem('▸Frac', function () { return T.conv('frac', '▸Frac'); }),
          insertItem('▸Dec',  function () { return T.conv('dec', '▸Dec'); }),
          insertItem('³',     function () { return T.post('cube', '³'); }),
          insertItem('³√(',   function () { return T.fn('cbrt', '³√('); }),
          insertItem('ˣ√',    function () { return T.xroot(); }),
          insertItem('fMin(', function () { return T.fn('fMin'); }),
          insertItem('fMax(', function () { return T.fn('fMax'); }),
          insertItem('nDeriv(', function () { return T.fn('nDeriv'); }),
          insertItem('fnInt(',  function () { return T.fn('fnInt'); })
        ],
        [
          insertItem('abs(',   function () { return T.fn('abs'); }),
          insertItem('round(', function () { return T.fn('round'); }),
          insertItem('iPart(', function () { return T.fn('iPart'); }),
          insertItem('fPart(', function () { return T.fn('fPart'); }),
          insertItem('int(',   function () { return T.fn('int'); }),
          insertItem('min(',   function () { return T.fn('min'); }),
          insertItem('max(',   function () { return T.fn('max'); }),
          insertItem('lcm(',   function () { return T.fn('lcm'); }),
          insertItem('gcd(',   function () { return T.fn('gcd'); })
        ],
        [
          insertItem('rand',     function () { return T.konst('rand', 'rand'); }),
          insertItem('nPr',      function () { return T.op('nPr'); }),
          insertItem('nCr',      function () { return T.op('nCr'); }),
          insertItem('!',        function () { return T.post('fact', '!'); }),
          insertItem('randInt(', function () { return T.fn('randInt'); })
        ]
      ]
    });
  }

  /* 2nd MATRIX: NAMES pastes [A], MATH pastes a function, EDIT opens the editor. */
  var MATRIX_NAMES = 'ABCDEFGHIJ'.split('');
  function matLabel(n) {
    var m = S.mats[n];
    return '[' + n + ']' + (m ? ' ' + TI.Mat.rows(m) + '×' + TI.Mat.cols(m) : '');
  }
  function openMatrix() {
    var fns = [
      ['det(', 'det'], ['ᵀ', null], ['dim(', 'dim'], ['Fill(', 'fill'], ['identity(', 'identity'],
      ['randM(', 'randM'], ['augment(', 'augment'], ['Matr▸list(', 'matrToList'],
      ['List▸matr(', 'listToMatr'], ['cumSum(', 'cumSum'], ['ref(', 'ref'], ['rref(', 'rref'],
      ['rowSwap(', 'rowSwap'], ['row+(', 'rowPlus'], ['*row(', 'mulRow'], ['*row+(', 'mulRowPlus']
    ];
    TI.Menu.open({
      tabs: ['NAMES', 'MATH', 'EDIT'],
      items: [
        MATRIX_NAMES.map(function (n) {
          return insertItem(matLabel(n), function () { return T.mat(n); });
        }),
        fns.map(function (f) {
          if (f[1] === null) return insertItem(f[0], function () { return T.post('transp', 'ᵀ'); });
          return insertItem(f[0], function () { return T.fn(f[1], f[0]); });
        }),
        MATRIX_NAMES.map(function (n) {
          return { label: matLabel(n), run: function () { App.setScreen('matedit', { name: n }); } };
        })
      ]
    });
  }

  function openTest() {
    TI.Menu.open({
      tabs: ['TEST', 'LOGIC'],
      items: [
        ['=', '≠', '>', '≥', '<', '≤'].map(function (o) {
          return insertItem(o, function () { return T.op(o); });
        }),
        [
          insertItem('and', function () { return T.word('and', ' and '); }),
          insertItem('or',  function () { return T.word('or', ' or '); }),
          insertItem('xor', function () { return T.word('xor', ' xor '); }),
          insertItem('not(', function () { return T.fn('not'); })
        ]
      ]
    });
  }

  function openYVars() {
    var items = [];
    for (var i = 0; i < 10; i++) {
      (function (i) {
        items.push({ label: S.yLabel(i), run: function () { App.insertToken(T.yvar(S.yNumber(i))); } });
      })(i);
    }
    TI.Menu.open({ title: 'FUNCTION', items: items });
  }

  function openAngle() {
    TI.Menu.open({
      title: 'ANGLE',
      items: [insertItem('°', function () { return T.post('deg', '°'); })]
    });
  }

  function progItems(onPick) {
    return TI.Prgm.list().map(function (p) {
      return { label: p.name, run: function () { onPick(p.name); } };
    });
  }

  /* PRGM from the home screen: run, edit, or create. */
  function openPrgm() {
    TI.Menu.open({
      tabs: ['EXEC', 'EDIT', 'NEW'],
      items: [
        progItems(function (name) {
          App.setScreen('home');
          App.insertToken(T.prgm(name));
        }),
        progItems(function (name) { TI.Screens.prgmedit.open(name); }),
        [{ label: 'Create New', run: function () { App.setScreen('prgmname'); } }]
      ]
    });
  }

  /* PRGM from inside the editor: paste a command token. */
  function openPrgmCtl() {
    function cmdItems(names) {
      return names.map(function (n) {
        return { label: TI.Prgm.CMDS[n].s.trim(), run: function () { App.insertToken(TI.Prgm.cmdTok(n)); } };
      });
    }
    TI.Menu.open({
      tabs: ['CTL', 'I/O', 'EXEC'],
      items: [
        cmdItems(['If', 'Then', 'Else', 'For', 'While', 'Repeat', 'End', 'Pause',
                  'Lbl', 'Goto', 'Return', 'Stop', 'DelVar']),
        cmdItems(['Input', 'Prompt', 'Disp', 'Output', 'ClrHome']),
        progItems(function (name) { App.insertToken(T.prgm(name)); })
      ]
    });
  }

  /* APPS has no TI applications in this build; it opens the notes you have
     written, which is what most people press it looking for. */
  function openApps() {
    var items = progItems(function (name) { TI.Screens.prgmedit.open(name); });
    items.push({ label: 'New Note…', run: function () { App.setScreen('prgmname'); } });
    TI.Menu.open({ title: 'APPLICATIONS', items: items });
  }

  function openDeletePrgm() {
    var items = TI.Prgm.list().map(function (p) {
      return { label: p.name, run: function () {
        TI.Menu.open({
          title: 'DELETE ' + p.name + '?',
          items: [
            { label: 'No', run: function () {} },
            { label: 'Yes', run: function () { TI.Prgm.remove(p.name); App.setScreen('home'); } }
          ]
        });
      } };
    });
    TI.Menu.open({ title: 'DELETE PRGM', items: items });
  }

  function openMem() {
    TI.Menu.open({
      title: 'MEMORY',
      items: [
        { label: 'About', run: function () {
          TI.Menu.open({ title: 'TI-84 PLUS', items: [
            { label: 'OS 2.55MP (sim)', run: function () {} }
          ] });
        } },
        { label: 'Delete Prgm…', run: openDeletePrgm },
        { label: 'Reset…', run: function () {
          TI.Menu.open({ title: 'RESET', items: [
            { label: 'Defaults', run: function () {
              S.resetDefaults(); App.resetScreens(); S.save(); App.setScreen('home');
            } },
            { label: 'All RAM', run: function () {
              S.resetDefaults(); S.home.rows.length = 0; S.entries.length = 0;
              S.programs.length = 0;
              App.resetScreens(); S.save(); App.setScreen('home');
            } }
          ] });
        } }
      ]
    });
  }

  /* --- key routing ------------------------------------------------------ */
  var SCREEN_ACTS = {
    yeq:    function () { App.setScreen('yeq'); },
    window: function () { App.setScreen('window'); },
    zoom:   function () { TI.Screens.graph.openZoomMenu(); },
    trace:  function () { App.setScreen('graph', { trace: true }); },
    graph:  function () { App.setScreen('graph'); },
    table:  function () { App.setScreen('table'); },
    tblset: function () { App.setScreen('tblset'); },
    format: function () { App.setScreen('format'); },
    mode:   function () { App.setScreen('mode'); },
    quit:   function () { App.setScreen('home'); },
    math:   openMath,
    matrix: openMatrix,
    test:   openTest,
    prgm:   function () { App.screen === 'prgmedit' ? openPrgmCtl() : openPrgm(); },
    apps:   openApps,
    vars:   openYVars,
    angle:  openAngle,
    mem:    openMem
  };

  function press(id) {
    if (App.off) { App.off = false; render(); return; }

    if (id === 'second') {
      App.mod = App.mod === '2nd' ? null : '2nd';
      render(); return;
    }
    if (id === 'alpha') {
      if (App.mod === '2nd') App.mod = 'lock';
      else App.mod = (App.mod === 'alpha' || App.mod === 'lock') ? null : 'alpha';
      render(); return;
    }

    var binding = TI.Keypad.resolve(id, App.mod);
    if (App.mod !== 'lock') App.mod = null;
    if (!binding) { render(); return; }

    var k = { act: binding.act, tok: binding.tok };

    if (k.act === 'off') { App.off = true; render(); return; }
    if (k.act === 'on' && !TI.Prgm.isRunning()) { TI.Menu.closeAll(); render(); return; }
    if (k.act === 'ins') { App.insert = !App.insert; render(); return; }
    if (k.act === 'na')  { render(); return; }

    if (SCREEN_ACTS[k.act]) {
      TI.Menu.closeAll();
      SCREEN_ACTS[k.act]();
      render();
      return;
    }

    /* ON stops a running program, the way the real BREAK key does */
    if (k.act === 'on' && TI.Prgm.isRunning()) {
      TI.Prgm.abort();
      TI.Menu.error('BREAK');
      render();
      return;
    }

    if (TI.Menu.active()) { TI.Menu.key(k); render(); return; }

    var sc = cur();
    if (sc && sc.key) sc.key(k);
    render();
  }
  App.press = press;

  /* --- rendering -------------------------------------------------------- */
  function render() {
    if (!ctx) return;
    if (App.off) {
      LCD.clear();
    } else if (TI.Menu.active()) {
      TI.Menu.draw();
    } else {
      var sc = cur();
      if (sc) sc.draw(App.blink);
    }
    LCD.present(ctx, scale, COLORS);
    syncModifierLights();
  }
  App.render = render;

  function syncModifierLights() {
    var s2 = document.querySelector('[data-key="second"]');
    var sa = document.querySelector('[data-key="alpha"]');
    if (s2) s2.classList.toggle('latched', App.mod === '2nd');
    if (sa) sa.classList.toggle('latched', App.mod === 'alpha' || App.mod === 'lock');
    if (sa) sa.classList.toggle('locked', App.mod === 'lock');
  }

  /* --- canvas sizing ----------------------------------------------------
   * Every LCD pixel must land on a whole number of device pixels or the
   * display shimmers, so the scale is an integer. Take the widest screen the
   * case allows, then step back down if that would squeeze the keypad below a
   * comfortable key height. Doing it this way fits any phone without knowing
   * anything about the phone.
   */
  var KEY_ROWS = 10;
  var MIN_ROW_H = 40;          /* CSS px per key cell, legend included */

  function px(el, prop) { return parseFloat(getComputedStyle(el)[prop]) || 0; }

  function resize() {
    var host = document.getElementById('lcd-host');
    var calc = document.querySelector('.calc');
    var bezel = document.querySelector('.screen-bezel');
    var brand = document.querySelector('.brandbar');
    if (!host || !calc || !bezel) return;

    var dpr = window.devicePixelRatio || 1;
    var hostW = host.clientWidth;
    var contentH = calc.clientHeight - px(calc, 'paddingTop') - px(calc, 'paddingBottom');
    var landscape = getComputedStyle(calc).flexDirection === 'row';

    var s;
    if (landscape) {
      s = Math.floor(Math.min(hostW * dpr / LCD.W, (contentH - 20) * dpr / LCD.H));
    } else {
      var chrome = px(bezel, 'paddingTop') + px(bezel, 'paddingBottom') +
                   px(bezel, 'borderTopWidth') + px(bezel, 'borderBottomWidth') +
                   (brand ? brand.offsetHeight : 0);
      s = Math.floor(hostW * dpr / LCD.W);
      while (s > 1) {
        var keypadH = contentH - chrome - (LCD.H * s / dpr);
        if (keypadH / KEY_ROWS >= MIN_ROW_H) break;
        s--;
      }
    }

    scale = Math.max(1, s);
    canvas.width = LCD.W * scale;
    canvas.height = LCD.H * scale;
    canvas.style.width = (LCD.W * scale / dpr) + 'px';
    canvas.style.height = (LCD.H * scale / dpr) + 'px';
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    render();
  }

  /* --- touch gestures on the screen ------------------------------------- */
  function bindGestures() {
    var pts = new Map();
    var lastPan = null, lastPinch = null, moved = false;

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      lastPan = { x: e.clientX, y: e.clientY };
      lastPinch = null;
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var dpr = window.devicePixelRatio || 1;
      var pxPerLcd = scale / dpr;

      if (pts.size >= 2) {
        var it = Array.from(pts.values());
        var dist = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
        var mid = { x: (it[0].x + it[1].x) / 2, y: (it[0].y + it[1].y) / 2 };
        if (lastPinch && App.screen === 'graph' && !TI.Menu.active()) {
          var f = dist / lastPinch.dist;
          if (isFinite(f) && f > 0) {
            var r = canvas.getBoundingClientRect();
            TI.Screens.graph.pinch((mid.x - r.left) / pxPerLcd, (mid.y - r.top) / pxPerLcd, f);
            render();
          }
        }
        lastPinch = { dist: dist, mid: mid };
        lastPan = null;
        moved = true;
        return;
      }

      if (!lastPan) return;
      var dx = e.clientX - lastPan.x, dy = e.clientY - lastPan.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      moved = true;

      if (TI.Menu.active()) return;
      if (App.screen === 'graph') {
        TI.Screens.graph.pan(dx / pxPerLcd, dy / pxPerLcd);
        lastPan = { x: e.clientX, y: e.clientY };
        render();
      } else if (App.screen === 'home') {
        if (Math.abs(dy) > 6) {
          TI.Screens.home.scrollBy(dy > 0 ? -1 : 1);
          lastPan = { x: e.clientX, y: e.clientY };
          render();
        }
      }
    });

    function end(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) lastPinch = null;
      if (pts.size === 0) {
        lastPan = null;
        if (moved && App.screen === 'graph') { TI.Screens.graph.settle(); render(); }
      }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /* --- physical keyboard (handy on a desktop browser) -------------------- */
  var KEYMAP = {
    '0':'n0','1':'n1','2':'n2','3':'n3','4':'n4','5':'n5','6':'n6','7':'n7','8':'n8','9':'n9',
    '.':'dot', '+':'add', '-':'sub', '*':'mul', '/':'div', '^':'pow',
    '(':'lp', ')':'rp', ',':'comma', '=':'enter',
    'Enter':'enter', 'Backspace':'del', 'Delete':'del', 'Escape':'clear',
    'ArrowUp':'up', 'ArrowDown':'down', 'ArrowLeft':'left', 'ArrowRight':'right',
    'x':'xtn', 'X':'xtn'
  };
  /* matrix brackets and list braces sit behind 2nd on the keypad, so the
     keyboard types them straight in */
  var BRACKETS = {
    '[': function () { return T.lb(); }, ']': function () { return T.rb(); },
    '{': function () { return T.lbr(); }, '}': function () { return T.rbr(); }
  };
  function bindKeyboard() {
    window.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey) return;
      if (BRACKETS[e.key]) {
        e.preventDefault();
        App.insertToken(BRACKETS[e.key]());
        return;
      }
      var id = KEYMAP[e.key];
      if (!id) return;
      e.preventDefault();
      press(id);
      var btn = document.querySelector('[data-key="' + id + '"]');
      if (btn) { btn.classList.add('down'); setTimeout(function () { btn.classList.remove('down'); }, 90); }
    });
  }

  /* --- keep the browser from zooming the app ----------------------------
   * Safari ignores user-scalable=no, so double-tap and pinch have to be shut
   * down directly. The graph's own pinch runs on pointer events and is
   * unaffected.
   */
  function blockBrowserZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
      document.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
    });

    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

    /* belt and braces: swallow the second tap of a quick double-tap */
    var lastTap = 0;
    document.addEventListener('touchend', function (e) {
      var now = e.timeStamp;
      if (now - lastTap < 320) e.preventDefault();
      lastTap = now;
    }, { passive: false });

    /* no page bounce; the canvas keeps its own two-finger handling */
    document.addEventListener('touchmove', function (e) {
      if (e.target !== canvas && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  /* --- boot -------------------------------------------------------------- */
  function boot() {
    canvas = document.getElementById('lcd');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    S.load();
    TI.Prgm.setHost(TI.Screens.home);
    TI.Keypad.build(document.getElementById('keypad'), press);
    TI.Screens.home.enter();

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

    bindGestures();
    bindKeyboard();
    blockBrowserZoom();

    setInterval(function () {
      App.blink = !App.blink;
      if (!App.off) render();
    }, 500);

    document.body.classList.remove('booting');
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.TI = window.TI || {});
