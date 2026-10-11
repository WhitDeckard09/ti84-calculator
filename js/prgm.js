/* ---------------------------------------------------------------------------
 * prgm.js — program storage and the TI-BASIC interpreter.
 *
 * A program is a list of lines; a line is a token array, like every other
 * editable line in the calculator. Lines of plain text are perfectly valid —
 * that is how notes get stored on a real TI-84 — and lines that start with a
 * command token are executed.
 *
 * Execution suspends rather than blocks: Pause and Input park the machine in
 * `waiting` and the home screen resumes it when ENTER arrives.
 * ------------------------------------------------------------------------- */
(function (TI) {
  'use strict';

  var S = TI.State, T = TI.Tok;
  var STEP_BUDGET = 200000;      /* stops a runaway loop hanging the browser */

  /* Commands, in the order the PRGM menu lists them. */
  var CMDS = {
    If:      { s: 'If ' },
    Then:    { s: 'Then' },
    Else:    { s: 'Else' },
    For:     { s: 'For(', paren: true },
    While:   { s: 'While ' },
    Repeat:  { s: 'Repeat ' },
    End:     { s: 'End' },
    Pause:   { s: 'Pause ' },
    Lbl:     { s: 'Lbl ' },
    Goto:    { s: 'Goto ' },
    Return:  { s: 'Return' },
    Stop:    { s: 'Stop' },
    DelVar:  { s: 'DelVar ' },
    Input:   { s: 'Input ' },
    Prompt:  { s: 'Prompt ' },
    Disp:    { s: 'Disp ' },
    Output:  { s: 'Output(', paren: true },
    ClrHome: { s: 'ClrHome' }
  };

  function cmdTok(name) { return T.cmd(name, CMDS[name].s); }

  /* --- storage ---------------------------------------------------------- */

  function list() { return S.programs; }

  function find(name) {
    for (var i = 0; i < S.programs.length; i++) if (S.programs[i].name === name) return S.programs[i];
    return null;
  }

  function create(name) {
    var p = find(name);
    if (p) return p;
    p = { name: name, lines: [[]] };
    S.programs.push(p);
    S.programs.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    S.save();
    return p;
  }

  function remove(name) {
    var i = S.programs.findIndex(function (p) { return p.name === name; });
    if (i >= 0) { S.programs.splice(i, 1); S.save(); }
  }

  function validName(name) {
    return /^[A-Zθ][A-Zθ0-9]{0,7}$/.test(name);
  }

  /* --- reading a line --------------------------------------------------- */

  function err(kind, line) { var e = new Error(kind); e.ti = kind; e.line = line; return e; }

  function firstCmd(line) {
    for (var i = 0; i < line.length; i++) {
      if (line[i].t === 'sp') continue;
      return line[i].t === 'cmd' ? { tok: line[i], at: i } : null;
    }
    return null;
  }

  function isBlank(line) {
    return line.every(function (t) { return t.t === 'sp'; });
  }

  /* Split tokens on commas that are not nested inside parentheses or quotes. */
  function splitArgs(toks) {
    var out = [], cur = [], depth = 0, inStr = false;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'quote') { inStr = !inStr; cur.push(t); continue; }
      if (!inStr) {
        if (t.t === 'lp' || t.t === 'fn') depth++;
        else if (t.t === 'rp') depth--;
        else if (t.t === 'comma' && depth === 0) { out.push(cur); cur = []; continue; }
      }
      cur.push(t);
    }
    if (cur.length || out.length) out.push(cur);
    return out;
  }

  /* The token run inside the parentheses of Output( / For( . */
  function parenBody(line, at) {
    var toks = line.slice(at + 1);      /* the command token carries its own ( */
    var depth = 1, out = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'lp' || t.t === 'fn') depth++;
      else if (t.t === 'rp') { depth--; if (!depth) break; }
      out.push(t);
    }
    return out;
  }

  function isString(toks) {
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].t === 'sp') continue;
      return toks[i].t === 'quote';
    }
    return false;
  }

  function stringValue(toks) {
    var out = '', started = false;
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].t === 'quote') {
        if (!started) { started = true; continue; }
        break;
      }
      if (started) out += toks[i].s;
      else if (toks[i].t !== 'sp') break;
    }
    return out;
  }

  /* any value: a number, a matrix or a list */
  function evalAny(toks, lineNo) {
    if (!toks || !toks.length) throw err('SYNTAX', lineNo);
    try {
      return TI.Eval.evaluate(TI.Parser.parse(toks), S.evalCtx()).value;
    } catch (e) {
      throw err(e.ti || 'SYNTAX', lineNo);
    }
  }

  /* a number: loop bounds, conditions and screen positions can't be matrices */
  function evalToks(toks, lineNo) {
    var v = evalAny(toks, lineNo);
    if (typeof v !== 'number') throw err('DATA TYPE', lineNo);
    return v;
  }

  function labelOf(line, at) {
    var s = '';
    for (var i = at + 1; i < line.length; i++) {
      if (line[i].t === 'sp') continue;
      s += line[i].s;
    }
    return s;
  }

  /* --- static analysis: match blocks and collect labels ------------------ */

  function nextCmdName(prog, from) {
    for (var i = from; i < prog.lines.length; i++) {
      var c = firstCmd(prog.lines[i]);
      if (c) return c.tok.f;
      if (!isBlank(prog.lines[i])) return null;
    }
    return null;
  }

  function analyse(prog) {
    var labels = {}, blocks = {}, stack = [];
    for (var i = 0; i < prog.lines.length; i++) {
      var c = firstCmd(prog.lines[i]);
      if (!c) continue;
      var f = c.tok.f;
      if (f === 'Lbl') { labels[labelOf(prog.lines[i], c.at)] = i; continue; }
      if (f === 'If') {
        /* a bare If governs only the next line; If…Then opens a block */
        if (nextCmdName(prog, i + 1) === 'Then') stack.push({ type: 'if', line: i });
        continue;
      }
      if (f === 'Then') { var top = stack[stack.length - 1]; if (top && top.type === 'if') top.then = i; continue; }
      if (f === 'Else') { var t2 = stack[stack.length - 1]; if (t2 && t2.type === 'if') t2.els = i; continue; }
      if (f === 'For' || f === 'While' || f === 'Repeat') { stack.push({ type: f, line: i }); continue; }
      if (f === 'End') {
        var b = stack.pop();
        if (b) { b.end = i; blocks[b.line] = b; blocks[i] = b; }
        continue;
      }
    }
    return { labels: labels, blocks: blocks };
  }

  /* --- the machine ------------------------------------------------------ */

  var vm = null;
  var host = null;               /* wired to the home screen at boot */

  function setHost(h) { host = h; }

  function pushFrame(name) {
    var prog = find(name);
    if (!prog) throw err('UNDEFINED');
    if (vm.frames.length > 12) throw err('MEMORY');
    vm.frames.push({ prog: prog, pc: 0, info: analyse(prog), loops: {} });
  }

  function frame() { return vm.frames[vm.frames.length - 1]; }

  function jumpPastBlock(f, b) { f.pc = b.end + 1; }

  function step() {
    var f = frame();
    if (f.pc >= f.prog.lines.length) { vm.frames.pop(); return; }

    var line = f.prog.lines[f.pc];
    var c = firstCmd(line);

    if (!c) {
      if (isBlank(line)) { f.pc++; return; }

      /* a line that is just prgmNAME calls that program */
      var solid = line.filter(function (t) { return t.t !== 'sp'; });
      if (solid.length === 1 && solid[0].t === 'prgm') {
        f.pc++;
        try { pushFrame(solid[0].name); }
        catch (e) { throw err(e.ti || 'UNDEFINED', f.pc - 1); }
        return;
      }

      /* otherwise an expression, a store, or a line of notes. Storing is
         silent inside a program; a bare expression shows its answer. */
      var ast;
      try { ast = TI.Parser.parse(line); }
      catch (e) { throw err(e.ti || 'SYNTAX', f.pc); }
      var res;
      try { res = TI.Eval.evaluate(ast, S.evalCtx()); }
      catch (e) { throw err(e.ti || 'SYNTAX', f.pc); }
      if (ast.k !== 'store') {
        host.progDisp(TI.Fmt.show(res.value, S.mode(), res.frac), true);
      }
      f.pc++;
      return;
    }

    var rest = line.slice(c.at + 1);
    var name = c.tok.f;

    switch (name) {
      case 'ClrHome': host.progClear(); f.pc++; return;

      case 'Disp': {
        var parts = splitArgs(rest);
        if (!parts.length) { f.pc++; return; }
        parts.forEach(function (p) {
          if (isString(p)) host.progDisp(stringValue(p), false);
          else host.progDisp(TI.Fmt.show(evalAny(p, f.pc), S.mode()), true);
        });
        f.pc++;
        return;
      }

      case 'Output': {
        var a = splitArgs(parenBody(line, c.at));
        if (a.length < 3) throw err('SYNTAX', f.pc);
        var r = Math.round(evalToks(a[0], f.pc));
        var col = Math.round(evalToks(a[1], f.pc));
        if (r < 1 || r > 8 || col < 1 || col > 16) throw err('DOMAIN', f.pc);
        var text = isString(a[2]) ? stringValue(a[2]) : TI.Fmt.num(evalToks(a[2], f.pc), S.mode());
        host.progOutput(r, col, text);
        f.pc++;
        return;
      }

      case 'Pause': {
        if (rest.length && !isBlank(rest)) {
          if (isString(rest)) host.progDisp(stringValue(rest), false);
          else host.progDisp(TI.Fmt.show(evalAny(rest, f.pc), S.mode()), true);
        }
        f.pc++;
        vm.waiting = { type: 'pause' };
        return;
      }

      case 'Input':
      case 'Prompt': {
        var args = splitArgs(rest).filter(function (p) { return p.length; });
        if (!args.length) throw err('SYNTAX', f.pc);
        var prompt, target;
        if (name === 'Prompt') {
          target = args[0];
          prompt = TI.Tok.toText(target).trim() + '=?';
        } else if (args.length >= 2 && isString(args[0])) {
          prompt = stringValue(args[0]);
          target = args[1];
        } else {
          prompt = '?';
          target = args[0];
        }
        var vt = target.filter(function (t) { return t.t !== 'sp'; });
        if (vt.length !== 1 || vt[0].t !== 'var') throw err('SYNTAX', f.pc);
        f.pc++;
        vm.waiting = { type: 'input', prompt: prompt, varName: vt[0].n };
        /* queue any further Prompt targets so "Prompt A,B" asks twice */
        if (name === 'Prompt' && args.length > 1) {
          vm.queued = args.slice(1);
          vm.queuedLine = f.pc - 1;
        }
        return;
      }

      case 'DelVar': {
        var dv = rest.filter(function (t) { return t.t !== 'sp'; });
        if (dv.length === 1 && dv[0].t === 'var') delete S.vars[dv[0].n];
        f.pc++;
        return;
      }

      case 'If': {
        var cond = evalToks(rest, f.pc) !== 0;
        var blk = f.info.blocks[f.pc];
        if (!blk) { f.pc += cond ? 1 : 2; return; }     /* bare If governs one line */
        if (cond) { f.pc = blk.then + 1; return; }
        f.pc = (blk.els !== undefined ? blk.els + 1 : blk.end + 1);
        return;
      }

      case 'Then': f.pc++; return;

      case 'Else': {
        /* reached by falling out of the true branch — skip to the End */
        var owner = null;
        Object.keys(f.info.blocks).forEach(function (k) {
          var b = f.info.blocks[k];
          if (b.type === 'if' && b.els === f.pc) owner = b;
        });
        f.pc = owner ? owner.end + 1 : f.pc + 1;
        return;
      }

      case 'For': {
        var fa = splitArgs(parenBody(line, c.at));
        if (fa.length < 3) throw err('SYNTAX', f.pc);
        var vn = fa[0].filter(function (t) { return t.t !== 'sp'; });
        if (vn.length !== 1 || vn[0].t !== 'var') throw err('SYNTAX', f.pc);
        var key = 'L' + f.pc;
        var block = f.info.blocks[f.pc];
        if (!block) throw err('SYNTAX', f.pc);
        if (!f.loops[key]) {
          f.loops[key] = {
            name: vn[0].n,
            end: evalToks(fa[2], f.pc),
            step: fa.length > 3 ? evalToks(fa[3], f.pc) : 1
          };
          S.vars[vn[0].n] = evalToks(fa[1], f.pc);
        }
        var lp = f.loops[key];
        var cv = S.vars[lp.name];
        var done = lp.step >= 0 ? cv > lp.end : cv < lp.end;
        if (done) { delete f.loops[key]; jumpPastBlock(f, block); return; }
        f.pc++;
        return;
      }

      case 'While': {
        var wb = f.info.blocks[f.pc];
        if (!wb) throw err('SYNTAX', f.pc);
        if (evalToks(rest, f.pc) === 0) { jumpPastBlock(f, wb); return; }
        f.pc++;
        return;
      }

      case 'Repeat': f.pc++; return;

      case 'End': {
        var eb = f.info.blocks[f.pc];
        if (!eb) { f.pc++; return; }
        if (eb.type === 'For') {
          var lk = 'L' + eb.line, loop = f.loops[lk];
          if (loop) S.vars[loop.name] = (S.vars[loop.name] || 0) + loop.step;
          f.pc = eb.line;
          return;
        }
        if (eb.type === 'While') { f.pc = eb.line; return; }
        if (eb.type === 'Repeat') {
          var rl = f.prog.lines[eb.line];
          var rc = firstCmd(rl);
          f.pc = evalToks(rl.slice(rc.at + 1), eb.line) !== 0 ? eb.end + 1 : eb.line + 1;
          return;
        }
        f.pc++;
        return;
      }

      case 'Lbl': f.pc++; return;

      case 'Goto': {
        var lbl = labelOf(line, c.at);
        var dest = f.info.labels[lbl];
        if (dest === undefined) throw err('LABEL', f.pc);
        f.pc = dest + 1;
        return;
      }

      case 'Return': vm.frames.pop(); return;
      case 'Stop':   vm.frames.length = 0; return;
    }

    throw err('SYNTAX', f.pc);
  }

  function pump() {
    var budget = STEP_BUDGET;
    while (vm && vm.frames.length && !vm.waiting) {
      if (--budget <= 0) { fail(err('BREAK', frame().pc), frame()); return; }
      var f = frame();
      try { step(); }
      catch (e) { fail(e, f); return; }
    }
    if (vm && !vm.waiting && !vm.frames.length) finish();
  }

  function finish() {
    vm = null;
    host.progDone();
  }

  function fail(e, f) {
    var prog = f && f.prog, at = e.line !== undefined ? e.line : (f ? f.pc : 0);
    vm = null;
    host.progError(e.ti || 'SYNTAX', prog ? prog.name : null, at);
  }

  function run(name) {
    vm = { frames: [], waiting: null, queued: null };
    try { pushFrame(name); }
    catch (e) { vm = null; host.progError(e.ti || 'UNDEFINED', null, 0); return; }
    pump();
  }

  function isRunning() { return !!vm; }
  function waiting() { return vm ? vm.waiting : null; }

  function resume(value) {
    if (!vm || !vm.waiting) return;
    var w = vm.waiting;
    vm.waiting = null;
    if (w.type === 'input') {
      S.vars[w.varName] = value;
      /* a multi-target Prompt asks for the next variable */
      if (vm.queued && vm.queued.length) {
        var nxt = vm.queued.shift();
        var vt = nxt.filter(function (t) { return t.t !== 'sp'; });
        if (vt.length === 1 && vt[0].t === 'var') {
          vm.waiting = { type: 'input', prompt: vt[0].n + '=?', varName: vt[0].n };
          return;
        }
      }
      vm.queued = null;
    }
    pump();
  }

  function abort() { vm = null; }

  TI.Prgm = {
    CMDS: CMDS, cmdTok: cmdTok,
    list: list, find: find, create: create, remove: remove, validName: validName,
    run: run, resume: resume, abort: abort,
    isRunning: isRunning, waiting: waiting, setHost: setHost
  };
})(window.TI = window.TI || {});
