/* ---------------------------------------------------------------------------
 * table.js — the numeric table.
 *
 * Three columns of five characters separated by rule lines, a header row, six
 * data rows, and the full-precision value of the highlighted cell along the
 * bottom. Scrolls without limit in either direction, like the real table.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LCD = TI.LCD, S = TI.State;
  var COLX = [0, 32, 64];          /* pixel origin of each visible column */
  var RULE = [30, 62];             /* vertical rules                      */
  var CW = 5;                      /* characters per cell                 */
  var DATA_ROWS = 6;

  var selRow = 0, colSel = 0, colTop = 0;
  var askEd = new TI.Editor([]);
  var editing = false;

  function columns() {
    var cols = [{ key: 'X', label: 'X' }];
    TI.Graph.activeFns().forEach(function (f) {
      cols.push({ key: 'Y', fn: f, label: 'Y' + S.yNumber(f.slot) });
    });
    return cols;
  }

  function xForRow(i) {
    if (S.tbl.indpnt === 'ASK') {
      var v = S.tbl.ask[i];
      return v === undefined ? null : v;
    }
    return S.tbl.start + i * S.tbl.delta;
  }

  function fit(v) {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'number' || !isFinite(v)) return 'ERROR';
    var s = TI.Fmt.num(v, { notation: S.notation, digits: S.digits });
    if (Array.from(s).length <= CW) return s;
    for (var d = 6; d >= 1; d--) {
      var t = TI.Fmt.num(TI.Fmt.sigRound(v, d), { notation: S.notation, digits: -1 });
      if (Array.from(t).length <= CW) return t;
    }
    return TI.Fmt.num(v, { notation: 'SCI', digits: 0 });
  }

  function cellValue(col, i) {
    var x = xForRow(i);
    if (col.key === 'X') return x;
    if (x === null) return null;
    var ctx = S.evalCtx();
    var saved = S.vars.X;
    var y = TI.Graph.evalAt(col.fn, x, ctx);
    if (saved === undefined) delete S.vars.X; else S.vars.X = saved;
    return y;
  }

  function draw(blink) {
    LCD.clear();
    var cols = columns();
    if (colSel >= cols.length) colSel = cols.length - 1;
    if (colSel < colTop) colTop = colSel;
    if (colSel > colTop + 2) colTop = colSel - 2;
    if (colTop > Math.max(0, cols.length - 3)) colTop = Math.max(0, cols.length - 3);

    var rowTop = rowTopBase();

    /* rules */
    RULE.forEach(function (x) { LCD.vline(x, 0, 55, 1); });

    for (var v = 0; v < 3; v++) {
      var col = cols[colTop + v];
      if (!col) break;
      var x0 = COLX[v];
      /* header */
      LCD.textPx(x0, 0, col.label, { invert: colTop + v === colSel });
      for (var i = 0; i < DATA_ROWS; i++) {
        var idx = rowTop + i;
        var y = 8 + i * 8;
        var text;
        if (col.key === 'X' && editing && idx === selRow) text = askEd.text().slice(0, CW);
        else text = fit(cellValue(col, idx));
        var pad = CW - Array.from(text).length;
        LCD.textPx(x0 + Math.max(0, pad) * 6, y, text.slice(0, CW));
        if (idx === selRow && colTop + v === colSel && blink) {
          LCD.invertRect(x0, y, CW * 6, 8);
        }
      }
    }

    /* full-precision readout of the highlighted cell */
    var sc = cols[colSel];
    if (sc) {
      var val = cellValue(sc, selRow);
      var label = sc.key === 'X' ? 'X' : sc.label;
      var text = (val === null || val === undefined) ? '' :
        (typeof val === 'number' && isFinite(val) ? TI.Fmt.num(val, { notation: S.notation, digits: S.digits }) : 'ERROR');
      LCD.text(0, 7, (label + '=' + text).slice(0, 16));
    }
  }

  /* Keep the selected row inside the visible band. */
  var _rowTop = 0;
  function rowTopBase() {
    if (selRow < _rowTop) _rowTop = selRow;
    if (selRow > _rowTop + DATA_ROWS - 1) _rowTop = selRow - DATA_ROWS + 1;
    return _rowTop;
  }

  function commitAsk() {
    if (!editing) return;
    editing = false;
    var toks = askEd.copy();
    if (!toks.length) return;
    try {
      var r = TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx());
      if (typeof r.value !== 'number') { TI.Menu.error('DATA TYPE'); return; }
      S.tbl.ask[selRow] = r.value;
      S.save();
    } catch (e) { TI.Menu.error(e.ti || 'SYNTAX'); }
  }

  function key(k) {
    var cols = columns();
    var askMode = S.tbl.indpnt === 'ASK' && colSel === 0;

    if (k.tok && askMode) {
      if (!editing) { editing = true; askEd.clear(); }
      askEd.insert(k.tok());
      return;
    }
    switch (k.act) {
      case 'up':    commitAsk(); selRow--; return;
      case 'down':  commitAsk(); selRow++; return;
      case 'left':  commitAsk(); colSel = Math.max(0, colSel - 1); return;
      case 'right': commitAsk(); colSel = Math.min(cols.length - 1, colSel + 1); return;
      case 'enter':
        if (editing) { commitAsk(); selRow++; return; }
        selRow++;
        return;
      case 'del':
        if (editing) { askEd.del(); return; }
        if (askMode) { S.tbl.ask.splice(selRow, 1); S.save(); }
        return;
      case 'clear':
        if (editing) { askEd.clear(); return; }
        TI.App.setScreen('home');
        return;
    }
  }

  function enter() { editing = false; }

  TI.Screens = TI.Screens || {};
  TI.Screens.table = {
    id: 'table', draw: draw, key: key, enter: enter,
    reset: function () { selRow = 0; colSel = 0; colTop = 0; _rowTop = 0; editing = false; askEd.clear(); }
  };
})(window.TI = window.TI || {});
