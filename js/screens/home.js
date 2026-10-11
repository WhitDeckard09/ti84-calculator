/* ---------------------------------------------------------------------------
 * home.js — the calculation screen.
 *
 * 16 columns by 8 rows, entries left-aligned, answers right-aligned, and the
 * whole thing scrolls up as you work. 2nd ENTRY walks back through what you
 * typed; on a phone you can also swipe the screen to read further back.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LCD = TI.LCD, S = TI.State, Fmt = TI.Fmt;
  var W = 16, H = 8;

  var ed = new TI.Editor([]);
  var entryIdx = -1;          /* position in the 2nd ENTRY ring */
  var lastEntry = null;

  function wrap(str) {
    var out = [], chars = Array.from(str);
    if (!chars.length) return [''];
    for (var i = 0; i < chars.length; i += W) out.push(chars.slice(i, i + W).join(''));
    return out;
  }

  function pushLeft(str) {
    wrap(str).forEach(function (l) { S.home.rows.push({ s: l, right: false }); });
  }
  function pushRight(str) {
    var parts = wrap(str);
    parts.forEach(function (l, i) {
      S.home.rows.push({ s: l, right: i === parts.length - 1 });
    });
  }

  function trimRows() {
    /* keep a generous scrollback; the visible window is still 8 rows */
    var MAX = 400;
    if (S.home.rows.length > MAX) S.home.rows.splice(0, S.home.rows.length - MAX);
  }

  /* A number goes right-aligned as text. A matrix or list is kept as lines and
     laid out when drawn, because a wide one scrolls sideways. */
  function pushValue(shown) {
    if (typeof shown === 'string') pushRight(shown);
    else S.home.rows.push({ val: shown.lines, off: 0 });
  }

  /* One logical row can fill several screen rows. */
  function window16(line, off) {
    var chars = Array.from(line), end = off + W;
    var seg = chars.slice(off, end);
    while (seg.length < W) seg.push(' ');
    if (off > 0) seg[0] = '…';
    if (end < chars.length) seg[W - 1] = '…';
    return seg.join('');
  }
  function valueWidth(lines) {
    return lines.reduce(function (m, l) { return Math.max(m, Array.from(l).length); }, 0);
  }
  function expandRow(r, out) {
    if (!r.val) { out.push(r); return; }
    var width = valueWidth(r.val);
    r.off = Math.max(0, Math.min(r.off || 0, Math.max(0, width - W)));
    r.val.forEach(function (l) {
      if (width <= W) out.push({ s: l, col: W - width });
      else out.push({ s: window16(l, r.off), col: 0 });
    });
  }
  /* the newest answer, when it is a matrix or list wider than the screen */
  function wideAnswer() {
    var r = S.home.rows[S.home.rows.length - 1];
    return r && r.val && valueWidth(r.val) > W ? r : null;
  }

  function execute() {
    var toks = ed.toks.length ? ed.copy() : (lastEntry ? lastEntry.slice() : null);
    if (!toks || !toks.length) return;

    var text = TI.Tok.toText(toks);

    /* A line that is just prgmNAME runs that program. */
    var solid = toks.filter(function (t) { return t.t !== 'sp'; });
    if (solid.length === 1 && solid[0].t === 'prgm') {
      lastEntry = toks.slice();
      S.entries.unshift(toks.slice());
      if (S.entries.length > 20) S.entries.pop();
      entryIdx = -1;
      pushLeft(text);
      trimRows();
      ed.clear();
      S.home.scroll = 0;
      runProgram(solid[0].name);
      return;
    }

    var res;
    try {
      res = TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx());
    } catch (e) {
      pushLeft(text);
      trimRows();
      var pos = e.pos;
      TI.Menu.error(e.ti || 'SYNTAX', function () {
        /* 2:Goto puts the cursor back where the parser gave up */
        S.home.rows.splice(S.home.rows.length - wrap(text).length);
        ed.set(toks);
        ed.cur = Math.max(0, Math.min(toks.length, pos === undefined ? toks.length : pos));
      });
      ed.set(toks);
      ed.cur = ed.toks.length;
      return;
    }

    S.ans = res.value;
    lastEntry = toks.slice();
    S.entries.unshift(toks.slice());
    if (S.entries.length > 20) S.entries.pop();
    entryIdx = -1;

    pushLeft(text);
    pushValue(Fmt.show(res.value, S.mode(), res.frac));
    trimRows();
    ed.clear();
    S.home.scroll = 0;
    S.save();
  }

  /* --- program host ------------------------------------------------------
   * A running program writes to this screen, exactly as it does on the real
   * calculator: Disp appends a row, Output( writes at an absolute position.
   */
  function ensureGrid() {
    while (S.home.rows.length < H) S.home.rows.push({ s: '', right: false });
  }

  function progDisp(text, right) {
    if (typeof text !== 'string') pushValue(text);
    else if (right) pushRight(text); else pushLeft(text);
    trimRows();
    S.home.scroll = 0;
  }

  /* ClrHome empties the screen and puts output back at the top line. The
     blank-row padding is only needed by Output(, which addresses rows
     absolutely, so it happens there instead. */
  function progClear() {
    S.home.rows.length = 0;
  }

  function progOutput(row, col, text) {
    ensureGrid();
    var idx = S.home.rows.length - H + (row - 1);
    var r = S.home.rows[idx];
    if (!r) { r = { s: '', right: false }; S.home.rows[idx] = r; }
    var chars = Array.from(r.s);
    while (chars.length < W) chars.push(' ');
    var t = Array.from(text);
    for (var i = 0; i < t.length && (col - 1 + i) < W; i++) chars[col - 1 + i] = t[i];
    r.s = chars.join('').replace(/\s+$/, '');
    r.right = false;
    S.home.scroll = 0;
  }

  function progDone() {
    pushRight('Done');
    trimRows();
    ed.clear();
    S.home.scroll = 0;
    S.save();
  }

  function progError(kind, progName, line) {
    ed.clear();
    TI.Menu.error(kind, progName ? function () {
      TI.Screens.prgmedit.openAt(progName, line);
    } : null);
  }

  /* Announce an Input/Prompt request once, then hand the line to the user. */
  function syncWait() {
    var w = TI.Prgm.waiting();
    if (w && w.type === 'input' && !w.shown) {
      w.shown = true;
      pushLeft(w.prompt);
      trimRows();
      ed.clear();
      S.home.scroll = 0;
    }
  }

  function runProgram(name) {
    TI.Prgm.run(name);
    syncWait();
  }

  function recallEntry() {
    if (!S.entries.length) return;
    entryIdx = Math.min(entryIdx + 1, S.entries.length - 1);
    ed.set(S.entries[entryIdx]);
  }

  /* --- rendering -------------------------------------------------------- */

  function layout() {
    var rows = [];
    S.home.rows.forEach(function (r) { expandRow(r, rows); });
    var entryLines = wrap(ed.text());
    var start = rows.length;
    entryLines.forEach(function (l) { rows.push({ s: l, right: false }); });
    return { rows: rows, entryStart: start };
  }

  function draw(blink) {
    LCD.clear();
    var L = layout();
    var total = L.rows.length;
    var maxScroll = Math.max(0, total - H);
    if (S.home.scroll > maxScroll) S.home.scroll = maxScroll;
    var top = maxScroll - S.home.scroll;

    for (var i = 0; i < H; i++) {
      var r = L.rows[top + i];
      if (!r) continue;
      var col = r.col !== undefined ? r.col : (r.right ? Math.max(0, W - Array.from(r.s).length) : 0);
      LCD.text(col, i, r.s);
    }

    var w = TI.Prgm.waiting();
    if (w && w.type === 'pause') {
      /* the busy/pause marker the calculator shows in the top right corner */
      for (var d = 0; d < 6; d += 2) { LCD.px(93, d, 1); LCD.px(94, d, 1); }
      return;
    }

    if (S.home.scroll === 0 && blink) {
      var ci = ed.charIndex();
      var row = L.entryStart + Math.floor(ci / W) - top;
      var col = ci % W;
      if (row >= 0 && row < H) {
        if (TI.App.mod === '2nd') LCD.text(col, row, '↑', { invert: false });
        else if (TI.App.mod === 'alpha' || TI.App.mod === 'lock') LCD.text(col, row, 'A');
        LCD.invertCell(col, row);
      }
    }
  }

  /* --- keys ------------------------------------------------------------- */

  function key(k) {
    S.home.scroll = 0;

    var waiting = TI.Prgm.waiting();
    if (waiting) {
      if (waiting.type === 'pause') {
        if (k.act === 'enter') { TI.Prgm.resume(); syncWait(); }
        return;                       /* a paused program owns the keypad */
      }
      if (waiting.type === 'input' && k.act === 'enter') {
        var toks = ed.copy();
        if (!toks.length) return;
        var v;
        try { v = TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx()).value; }
        catch (e) { TI.Menu.error(e.ti || 'SYNTAX'); return; }
        pushLeft(TI.Tok.toText(toks));
        trimRows();
        ed.clear();
        TI.Prgm.resume(v);
        syncWait();
        return;
      }
    }

    if (k.tok) {
      var t = k.tok();
      /* Starting a line with an operator recalls the last answer, and the
         calculator shows it: pressing * then 2 reads "Ans*2". */
      if (!ed.toks.length && (t.t === 'op' || t.t === 'post' || t.t === 'conv' || t.t === 'xroot')) {
        ed.insert(TI.Tok.ans());
      }
      ed.insert(t, TI.App.insert === false);
      return;
    }
    switch (k.act) {
      case 'enter': execute(); return;
      case 'del':   ed.del(); return;
      case 'clear':
        /* CLEAR wipes the line; a second press wipes the screen */
        if (ed.isEmpty()) { S.home.rows.length = 0; }
        else ed.clear();
        return;
      case 'left':
        if (ed.isEmpty() && wideAnswer()) { var wl = wideAnswer(); wl.off = Math.max(0, (wl.off || 0) - 1); return; }
        ed.left(); return;
      case 'right':
        if (ed.isEmpty() && wideAnswer()) {
          var wr = wideAnswer();
          wr.off = Math.min(valueWidth(wr.val) - W, (wr.off || 0) + 1);
          return;
        }
        ed.right(); return;
      case 'up':    S.home.scroll = Math.min(S.home.scroll + 1, Math.max(0, layout().rows.length - H)); return;
      case 'down':  S.home.scroll = Math.max(0, S.home.scroll - 1); return;
      case 'entry': recallEntry(); return;
      case 'sto':
        /* STO▸ on an empty line stores the last answer: the calculator shows Ans→ */
        if (!ed.toks.length) ed.insert(TI.Tok.ans());
        ed.insert(TI.Tok.store());
        return;
    }
  }

  function enter() { S.home.scroll = 0; }

  TI.Screens = TI.Screens || {};
  TI.Screens.home = {
    id: 'home', draw: draw, key: key, enter: enter,
    editor: function () { return ed; },
    reset: function () { ed.clear(); entryIdx = -1; lastEntry = null; },
    progDisp: progDisp, progClear: progClear, progOutput: progOutput,
    progDone: progDone, progError: progError,
    runProgram: runProgram, syncWait: syncWait,
    scrollBy: function (n) {
      var max = Math.max(0, layout().rows.length - H);
      S.home.scroll = Math.max(0, Math.min(max, S.home.scroll + n));
    }
  };
})(window.TI = window.TI || {});
