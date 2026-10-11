/* ---------------------------------------------------------------------------
 * matedit.js: the MATRIX editor (2nd MATRIX, EDIT, pick a matrix).
 *
 *   MATRIX[A] 2 ×3
 *   [ 1       2       3     ]
 *   [ 4       5       6     ]
 *   1,1=1
 *
 * The title row holds the dimensions, which you can edit first (UP from the
 * top row); the grid shows three columns of small-font entries; the bottom
 * line spells out the selected entry in full. Entries are typed as
 * expressions, so 2π or √(2) work and evaluate when you press ENTER.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LCD = TI.LCD, S = TI.State, M = TI.Mat;

  var COLS = 3;            /* columns visible at once */
  var ROWS = 6;            /* rows visible at once */
  var CELL_W = 29;         /* px per column */
  var X0 = 4;
  var Y0 = 10;
  var ROW_H = 6;

  var st = {
    name: 'A',
    focus: 'cells',        /* 'rows' | 'cols' | 'cells' */
    r: 0, c: 0,            /* selected entry */
    top: 0, left: 0,       /* scroll */
    ed: new TI.Editor([]), /* entry being typed */
    editing: false,
    dim: ''                /* digits typed into a dimension field */
  };

  function mat() { return S.mats[st.name] || null; }
  function rows() { var m = mat(); return m ? M.rows(m) : 1; }
  function cols() { var m = mat(); return m ? M.cols(m) : 1; }
  function value(r, c) { var m = mat(); return m ? m[r][c] : 0; }

  /* ---- editing ---------------------------------------------------------- */

  function cancelEdit() { st.ed.clear(); st.editing = false; }

  function commitCell() {
    if (!st.editing) return true;
    var toks = st.ed.copy();
    if (!toks.length) { cancelEdit(); return true; }
    try {
      var r = TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx());
      if (typeof r.value !== 'number') throw Object.assign(new Error('DATA TYPE'), { ti: 'DATA TYPE' });
      if (!mat()) S.mats[st.name] = M.resize(null, 1, 1);
      S.mats[st.name][st.r][st.c] = r.value;
      cancelEdit();
      S.save();
      return true;
    } catch (e) {
      TI.Menu.error(e.ti || 'SYNTAX');
      return false;
    }
  }

  function applyDim() {
    if (st.dim === '') return;
    var n = parseInt(st.dim, 10);
    st.dim = '';
    var r = st.focus === 'rows' ? n : rows();
    var c = st.focus === 'cols' ? n : cols();
    try {
      S.mats[st.name] = M.resize(mat(), r, c);
      S.save();
    } catch (e) {
      TI.Menu.error(e.ti || 'INVALID DIM');
      return;
    }
    clampCursor();
  }

  function clampCursor() {
    st.r = Math.max(0, Math.min(rows() - 1, st.r));
    st.c = Math.max(0, Math.min(cols() - 1, st.c));
    scrollIntoView();
  }

  function scrollIntoView() {
    if (st.r < st.top) st.top = st.r;
    if (st.r >= st.top + ROWS) st.top = st.r - ROWS + 1;
    if (st.c < st.left) st.left = st.c;
    if (st.c >= st.left + COLS) st.left = st.c - COLS + 1;
  }

  function move(dr, dc) {
    if (!commitCell()) return;
    st.r = Math.max(0, Math.min(rows() - 1, st.r + dr));
    st.c = Math.max(0, Math.min(cols() - 1, st.c + dc));
    scrollIntoView();
  }

  /* ---- drawing ---------------------------------------------------------- */

  function bracket(x, y, left) {
    /* a 3×5 square bracket */
    for (var i = 0; i < 5; i++) LCD.px(left ? x : x + 2, y + i, 1);
    LCD.px(left ? x + 1 : x + 1, y, 1);
    LCD.px(left ? x + 1 : x + 1, y + 4, 1);
  }

  function cellText(x) {
    var s = TI.Fmt.num(x, { notation: 'NORMAL', digits: -1 });
    var chars = Array.from(s);
    return chars.length > 7 ? chars.slice(0, 6).join('') + '…' : s;
  }

  function draw(blink) {
    LCD.clear();
    LCD.text(0, 0, 'MATRIX[' + st.name + ']');
    var rs = String(rows()), cs = String(cols());
    if (st.focus === 'rows' && st.dim !== '') rs = st.dim;
    if (st.focus === 'cols' && st.dim !== '') cs = st.dim;
    LCD.text(10, 0, rs);
    LCD.text(10 + rs.length + 1, 0, '×');
    LCD.text(10 + rs.length + 2, 0, cs);
    if (st.focus === 'rows') for (var i = 0; i < rs.length; i++) LCD.invertCell(10 + i, 0);
    if (st.focus === 'cols') for (var j = 0; j < cs.length; j++) LCD.invertCell(10 + rs.length + 2 + j, 0);

    var nr = Math.min(ROWS, rows() - st.top), nc = Math.min(COLS, cols() - st.left);
    for (var r = 0; r < nr; r++) {
      var y = Y0 + r * ROW_H;
      bracket(0, y, true);
      bracket(93, y, false);
      for (var c = 0; c < nc; c++) {
        var rr = st.top + r, cc = st.left + c;
        var x = X0 + c * CELL_W;
        var sel = st.focus === 'cells' && rr === st.r && cc === st.c;
        var text = sel && st.editing ? st.ed.text() : cellText(value(rr, cc));
        LCD.textPx(x, y, text, { small: true });
        if (sel && !st.editing) LCD.invertRect(x - 1, y - 1, CELL_W - 3, ROW_H + 1);
        else if (sel && blink) {
          var cx = x + Array.from(text).length * 4;
          LCD.invertRect(cx, y - 1, 4, ROW_H + 1);
        }
      }
    }
    /* "↓" / "→" hint that there is more off screen */
    if (st.top + ROWS < rows()) LCD.px(48, Y0 + ROWS * ROW_H, 1);

    if (st.focus === 'cells') {
      var line = (st.r + 1) + ',' + (st.c + 1) + '=';
      var val = st.editing ? st.ed.text() : TI.Fmt.num(value(st.r, st.c), { notation: 'NORMAL', digits: -1 });
      LCD.textPx(0, 58, (line + val).slice(0, 24), { small: true });
    }
  }

  /* ---- keys ------------------------------------------------------------- */

  function key(k) {
    if (st.focus !== 'cells') return dimKey(k);

    if (k.tok) {
      var t = k.tok();
      /* only things that make sense inside an expression */
      if (t.t === 'store' || t.t === 'comma') return true;
      if (!st.editing) { st.ed.clear(); st.editing = true; }
      st.ed.insert(t, false);
      return true;
    }
    switch (k.act) {
      case 'up':
        if (st.r === 0) {
          if (commitCell()) { st.focus = 'rows'; st.dim = ''; }
        } else move(-1, 0);
        return true;
      case 'down':  move(1, 0); return true;
      case 'left':
        if (st.editing) st.ed.left(); else move(0, -1);
        return true;
      case 'right':
        if (st.editing) st.ed.right(); else move(0, 1);
        return true;
      case 'enter':
        if (!commitCell()) return true;
        /* ENTER walks along the row, then on to the next one */
        if (st.c < cols() - 1) st.c++;
        else if (st.r < rows() - 1) { st.c = 0; st.r++; }
        scrollIntoView();
        return true;
      case 'del':
        if (st.editing) st.ed.del();
        else if (mat()) { S.mats[st.name][st.r][st.c] = 0; S.save(); }
        return true;
      case 'clear':
        cancelEdit();
        return true;
    }
    return true;
  }

  function dimKey(k) {
    if (k.tok) {
      var t = k.tok();
      if (t.t === 'd' && t.s !== '.' && st.dim.length < 3) st.dim += t.s;
      return true;
    }
    switch (k.act) {
      case 'enter':
        applyDim();
        if (st.focus === 'rows') { st.focus = 'cols'; }
        else { st.focus = 'cells'; clampCursor(); }
        return true;
      case 'right': applyDim(); st.focus = 'cols'; return true;
      case 'left':  applyDim(); st.focus = 'rows'; return true;
      case 'down':  applyDim(); st.focus = 'cells'; clampCursor(); return true;
      case 'del':   st.dim = st.dim.slice(0, -1); return true;
      case 'clear': st.dim = ''; return true;
    }
    return true;
  }

  function enter(opts) {
    st.name = (opts && opts.name) || st.name;
    st.r = 0; st.c = 0; st.top = 0; st.left = 0;
    cancelEdit();
    st.dim = '';
    /* a matrix that does not exist yet is created 1×1 and starts on its dimensions */
    var fresh = !mat();
    if (fresh) S.mats[st.name] = M.resize(null, 1, 1);
    st.focus = fresh ? 'rows' : 'cells';
  }

  function leave() { commitCell(); applyDim(); }

  TI.Screens = TI.Screens || {};
  TI.Screens.matedit = {
    id: 'matedit', draw: draw, key: key, enter: enter, leave: leave,
    reset: function () { cancelEdit(); st.focus = 'cells'; st.r = 0; st.c = 0; st.top = 0; st.left = 0; st.dim = ''; }
  };
})(window.TI = window.TI || {});
