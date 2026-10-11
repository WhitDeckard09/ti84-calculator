/* ---------------------------------------------------------------------------
 * fields.js — shared "list of name=value" editor used by WINDOW and TBLSET.
 *
 * Values are typed as expressions, exactly like the real machine: you can put
 * 2π in Xmax and it evaluates when you leave the field.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var LCD = TI.LCD, S = TI.State;

  function FieldScreen(opts) {
    this.title = opts.title;
    this.fields = opts.fields;         /* [{ label, get, set, integer, choices }] */
    this.sel = 0;
    this.ed = new TI.Editor([]);
    this.dirty = false;
    this.top = 0;
  }

  FieldScreen.prototype.load = function () {
    var f = this.fields[this.sel];
    if (f.choices) return;
    this.ed.setNumber(f.get());
    this.dirty = false;
  };

  FieldScreen.prototype.commit = function () {
    var f = this.fields[this.sel];
    if (f.choices || !this.dirty) { this.dirty = false; return true; }
    var toks = this.ed.copy();
    if (!toks.length) { this.load(); return true; }
    try {
      var r = TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx());
      var v = r.value;
      if (typeof v !== 'number') { TI.Menu.error('DATA TYPE'); return false; }
      if (f.integer) v = Math.round(v);
      f.set(v);
      this.dirty = false;
      S.save();
      return true;
    } catch (e) {
      TI.Menu.error(e.ti || 'SYNTAX');
      return false;
    }
  };

  FieldScreen.prototype.enter = function () { this.sel = 0; this.top = 0; this.load(); };

  FieldScreen.prototype.move = function (d) {
    if (!this.commit()) return;
    var n = this.fields.length;
    this.sel = Math.max(0, Math.min(n - 1, this.sel + d));
    this.load();
  };

  FieldScreen.prototype.draw = function (blink) {
    LCD.clear();
    var rowsAvail = 8 - (this.title ? 1 : 0);
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + rowsAvail) this.top = this.sel - rowsAvail + 1;

    if (this.title) LCD.text(0, 0, this.title);
    var base = this.title ? 1 : 0;

    for (var i = 0; i < rowsAvail; i++) {
      var idx = this.top + i;
      var f = this.fields[idx];
      if (!f) break;
      var row = base + i;
      var x = LCD.text(0, row, ' ' + f.label);
      var col = Math.ceil(x / 6);
      if (f.choices) {
        var vals = f.choices();
        var c = col;
        for (var j = 0; j < vals.length; j++) {
          LCD.text(c, row, vals[j].label, { invert: vals[j].on });
          if (idx === this.sel && j === (f.opt || 0) && blink) LCD.invertCell(c, row);
          c += vals[j].label.length + 1;
        }
      } else if (idx === this.sel) {
        var text = this.ed.text();
        LCD.text(col, row, text);
        if (blink) {
          var cc = col + this.ed.charIndex();
          if (cc < 16) LCD.invertCell(cc, row);
        }
      } else {
        LCD.text(col, row, TI.Fmt.num(f.get(), { notation: 'NORMAL', digits: -1 }));
      }
    }
  };

  FieldScreen.prototype.key = function (k) {
    var f = this.fields[this.sel];

    if (f.choices) {
      var vals = f.choices();
      if (k.act === 'left')  { f.opt = Math.max(0, (f.opt || 0) - 1); return true; }
      if (k.act === 'right') { f.opt = Math.min(vals.length - 1, (f.opt || 0) + 1); return true; }
      if (k.act === 'enter') { f.pick(f.opt || 0); S.save(); return true; }
      if (k.act === 'up')    { this.move(-1); return true; }
      if (k.act === 'down')  { this.move(1); return true; }
      return true;
    }

    if (k.tok) {
      var t = k.tok();
      if (t.t === 'op' || t.t === 'store' || t.t === 'rp' || t.t === 'comma') {
        if (t.t !== 'op') return true;
      }
      if (!this.dirty && this.ed.cur === this.ed.toks.length && this.ed.charIndex() > 0) {
        /* first keystroke replaces the field, as on the calculator */
        var replaceable = (t.t === 'd' || t.t === 'neg');
        if (replaceable) this.ed.clear();
      }
      this.dirty = true;
      this.ed.insert(t, TI.App.insert === false);
      return true;
    }

    switch (k.act) {
      case 'up':    this.move(-1); return true;
      case 'down':  this.move(1); return true;
      case 'enter': if (this.commit() && this.sel < this.fields.length - 1) this.move(1); return true;
      case 'left':  this.ed.left(); return true;
      case 'right': this.ed.right(); return true;
      case 'del':   this.ed.del(); this.dirty = true; return true;
      case 'clear': this.ed.clear(); this.dirty = true; return true;
    }
    return false;
  };

  FieldScreen.prototype.leave = function () { this.commit(); };

  TI.FieldScreen = FieldScreen;

  /* --- WINDOW ----------------------------------------------------------- */
  function winField(name, integer) {
    return {
      label: name + '=',
      get: function () { return S.win[name]; },
      set: function (v) { S.win[name] = v; },
      integer: !!integer
    };
  }
  var windowScreen = new FieldScreen({
    title: 'WINDOW',
    fields: [
      winField('Xmin'), winField('Xmax'), winField('Xscl'),
      winField('Ymin'), winField('Ymax'), winField('Yscl'),
      winField('Xres', true)
    ]
  });

  /* --- TABLE SETUP ------------------------------------------------------ */
  function choiceField(label, options, getter, setter) {
    return {
      label: label,
      opt: 0,
      choices: function () {
        var cur = getter();
        return options.map(function (o) { return { label: o, on: o === cur }; });
      },
      pick: function (i) { setter(options[i]); },
      get: function () { return 0; }, set: function () {}
    };
  }
  var tblScreen = new FieldScreen({
    title: 'TABLE SETUP',
    fields: [
      { label: 'TblStart=', get: function () { return S.tbl.start; }, set: function (v) { S.tbl.start = v; } },
      { label: 'ΔTbl=',     get: function () { return S.tbl.delta; }, set: function (v) { S.tbl.delta = v; } },
      choiceField('Indpnt:', ['Auto', 'Ask'],
        function () { return S.tbl.indpnt === 'ASK' ? 'Ask' : 'Auto'; },
        function (v) { S.tbl.indpnt = v.toUpperCase(); }),
      choiceField('Depend:', ['Auto', 'Ask'],
        function () { return S.tbl.depend === 'ASK' ? 'Ask' : 'Auto'; },
        function (v) { S.tbl.depend = v.toUpperCase(); })
    ]
  });

  TI.Screens = TI.Screens || {};
  TI.Screens.window = {
    id: 'window',
    draw: function (b) { windowScreen.draw(b); },
    key: function (k) { windowScreen.key(k); },
    enter: function () { windowScreen.enter(); },
    leave: function () { windowScreen.leave(); },
    reset: function () { windowScreen.sel = 0; windowScreen.top = 0; windowScreen.dirty = false; }
  };
  TI.Screens.tblset = {
    id: 'tblset',
    draw: function (b) { tblScreen.draw(b); },
    key: function (k) { tblScreen.key(k); },
    enter: function () { tblScreen.enter(); },
    leave: function () { tblScreen.leave(); },
    reset: function () { tblScreen.sel = 0; tblScreen.top = 0; tblScreen.dirty = false; }
  };
})(window.TI = window.TI || {});
