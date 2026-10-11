/* ---------------------------------------------------------------------------
 * state.js — everything the calculator remembers, plus the shared line editor.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var STORE_KEY = 'ti84.state.v1';

  function defaultWindow() {
    return { Xmin: -10, Xmax: 10, Xscl: 1, Ymin: -10, Ymax: 10, Yscl: 1, Xres: 1 };
  }

  var S = {
    /* MODE */
    notation: 'NORMAL',      /* NORMAL | SCI | ENG            */
    digits: -1,              /* -1 = FLOAT, else 0..9         */
    angle: 'RADIAN',         /* RADIAN | DEGREE               */
    plotStyle: 'CONNECTED',  /* CONNECTED | DOT               */

    /* FORMAT */
    coord: true, grid: false, axes: true, label: false, expr: true,

    /* memory */
    vars: {},                /* A..Z and θ                    */
    mats: {},                /* 'A'..'J' -> rows of numbers   */
    lists: {},               /* 1..6 -> array of numbers      */
    ans: 0,                  /* a number, a matrix or a list  */
    ys: [],                  /* index 0 => Y1 ... index 9 => Y0 */

    win: defaultWindow(),
    zoomFactors: { x: 4, y: 4 },
    zoomPrev: null,

    tbl: { start: 0, delta: 1, indpnt: 'AUTO', depend: 'AUTO', ask: [] },

    programs: [],            /* [{ name, lines: [[tok]] }]    */
    entries: [],             /* 2nd ENTRY ring                */
    home: { rows: [], scroll: 0 }
  };

  for (var i = 0; i < 10; i++) S.ys.push({ toks: [], on: true });

  S.mode = function () { return { notation: S.notation, digits: S.digits }; };

  S.evalCtx = function () {
    return {
      degree: S.angle === 'DEGREE',
      ans: S.ans,
      vars: S.vars,
      mats: S.mats,
      lists: S.lists,
      yGet: function (n) {
        var slot = S.ys[(n + 9) % 10];      /* Y1..Y9 -> 0..8, Y0 -> 9 */
        return slot ? slot.toks : null;
      }
    };
  };

  /* Label for Y-slot index: 0 -> "Y1", ... 9 -> "Y0" */
  var SUB = '₀₁₂₃₄₅₆₇₈₉';
  S.yLabel = function (idx) { return 'Y' + SUB.charAt((idx + 1) % 10); };
  S.yNumber = function (idx) { return (idx + 1) % 10; };

  /* --- persistence ------------------------------------------------------ */

  function serialiseToks(toks) { return toks.map(function (t) { return t; }); }

  S.save = function () {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        notation: S.notation, digits: S.digits, angle: S.angle, plotStyle: S.plotStyle,
        coord: S.coord, grid: S.grid, axes: S.axes, label: S.label, expr: S.expr,
        vars: S.vars, ans: S.ans, mats: S.mats, lists: S.lists,
        ys: S.ys.map(function (y) { return { toks: serialiseToks(y.toks), on: y.on }; }),
        win: S.win, tbl: { start: S.tbl.start, delta: S.tbl.delta, indpnt: S.tbl.indpnt, depend: S.tbl.depend },
        programs: S.programs
      }));
    } catch (e) { /* private browsing, quota — not worth interrupting the user */ }
  };

  S.load = function () {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      ['notation','digits','angle','plotStyle','coord','grid','axes','label','expr','ans'].forEach(function (k) {
        if (d[k] !== undefined) S[k] = d[k];
      });
      if (d.vars) S.vars = d.vars;
      if (d.mats && typeof d.mats === 'object') S.mats = d.mats;
      if (d.lists && typeof d.lists === 'object') S.lists = d.lists;
      if (d.win) S.win = d.win;
      if (d.tbl) { S.tbl.start = d.tbl.start; S.tbl.delta = d.tbl.delta; S.tbl.indpnt = d.tbl.indpnt; S.tbl.depend = d.tbl.depend; }
      if (Array.isArray(d.programs)) S.programs = d.programs;
      if (d.ys) for (var i = 0; i < 10 && i < d.ys.length; i++) {
        S.ys[i].toks = d.ys[i].toks || [];
        S.ys[i].on = d.ys[i].on !== false;
      }
    } catch (e) { /* corrupt payload: start fresh rather than fail to boot */ }
  };

  /* Programs survive "Reset Defaults" — only "All RAM" clears them, same as
     the real calculator, where Defaults resets settings rather than memory. */
  S.resetDefaults = function () {
    S.win = defaultWindow();
    S.vars = {}; S.ans = 0; S.mats = {}; S.lists = {};
    for (var i = 0; i < 10; i++) { S.ys[i].toks = []; S.ys[i].on = true; }
  };

  TI.State = S;

  /* --- shared line editor ----------------------------------------------- */

  function Editor(toks) {
    this.toks = toks || [];
    this.cur = this.toks.length;
  }
  Editor.prototype.text = function () { return TI.Tok.toText(this.toks); };
  Editor.prototype.charIndex = function (upto) {
    var n = 0, lim = upto === undefined ? this.cur : upto;
    for (var i = 0; i < lim && i < this.toks.length; i++) n += this.toks[i].s.length;
    return n;
  };
  Editor.prototype.charLength = function () { return this.charIndex(this.toks.length); };
  Editor.prototype.insert = function (tok, overwrite) {
    if (overwrite && this.cur < this.toks.length) this.toks.splice(this.cur, 1, tok);
    else this.toks.splice(this.cur, 0, tok);
    this.cur++;
  };
  Editor.prototype.del = function () {
    if (this.cur < this.toks.length) this.toks.splice(this.cur, 1);
    else if (this.cur > 0) { this.cur--; this.toks.splice(this.cur, 1); }
  };
  Editor.prototype.left = function () { if (this.cur > 0) { this.cur--; return true; } return false; };
  Editor.prototype.right = function () { if (this.cur < this.toks.length) { this.cur++; return true; } return false; };
  Editor.prototype.home = function () { this.cur = 0; };
  Editor.prototype.end = function () { this.cur = this.toks.length; };
  Editor.prototype.clear = function () { this.toks = []; this.cur = 0; };
  Editor.prototype.set = function (toks) { this.toks = toks.slice(); this.cur = this.toks.length; };
  Editor.prototype.isEmpty = function () { return this.toks.length === 0; };
  Editor.prototype.copy = function () { return this.toks.map(function (t) { return t; }); };

  /* Load a plain number into the editor as tokens (WINDOW / TBLSET fields). */
  Editor.prototype.setNumber = function (v) {
    var s = TI.Fmt.num(v, { notation: 'NORMAL', digits: -1 });
    var toks = [];
    Array.from(s).forEach(function (c) {
      if (c === TI.Fmt.NEG) toks.push(TI.Tok.neg());
      else if (c === TI.Fmt.EE) toks.push(TI.Tok.ee());
      else toks.push(TI.Tok.digit(c));
    });
    this.set(toks);
  };

  TI.Editor = Editor;
})(window.TI = window.TI || {});
