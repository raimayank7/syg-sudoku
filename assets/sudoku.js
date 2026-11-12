/* sudoku.shareyourgroup.com: the game board, the solver page and the print page. Needs core.js (window.SDK). Nothing leaves the browser. */
(function () {
  'use strict';
  var d = document, S = window.SDK, SYG = window.SYG || {}, LS = window.localStorage;
  function $(s, r) { return (r || d).querySelector(s); }
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function load(k, def) { try { var v = JSON.parse(LS.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function clock(s) { var m = Math.floor(s / 60), x = s % 60; return (m >= 60 ? Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2) : m) + ':' + ('0' + x).slice(-2); }
  function today() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  var LEVELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

  /* make a puzzle without freezing the page: a few attempts at a time */
  function make(n, level, seed, done) {
    var r = S.rng(seed), tries = 0;
    (function go() {
      var t = Date.now(), out = null;
      while (!out && Date.now() - t < 40 && tries < 6000) { out = S.attempt(n, level, r); tries++; }
      if (out || tries >= 6000) done(out); else setTimeout(go, 0);
    })();
  }

  function drawBoard(box, n, onTap) {
    var g = S.geo(n), cells = [];
    box.innerHTML = ''; box.style.gridTemplateColumns = 'repeat(' + n + ',1fr)'; box.className = 'sdk-board n' + n;
    for (var i = 0; i < n * n; i++) {
      var b = el('button', 'c'), r = Math.floor(i / n), c = i % n; b.type = 'button';
      if ((c + 1) % g.bw === 0 && c < n - 1) b.className += ' br';
      if ((r + 1) % g.bh === 0 && r < n - 1) b.className += ' bb';
      b.setAttribute('data-i', i); b.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1));
      box.appendChild(b); cells.push(b);
    }
    box.addEventListener('click', function (e) { var b = e.target.closest('.c'); if (b) onTap(+b.getAttribute('data-i')); });
    return cells;
  }
  function notesHtml(n, mask) {
    var h = '<i class="nt">';
    for (var k = 1; k <= n; k++) h += '<span>' + ((mask >> (k - 1)) & 1 ? k : '') + '</span>';
    return h + '</i>';
  }

  /* ---------------- the game ---------------- */
  function Game(root) {
    var self = this, n = this.n = +root.getAttribute('data-n') || 9;
    this.root = root; this.g = S.geo(n); this.daily = root.getAttribute('data-daily') === '1';
    this.level = root.getAttribute('data-level') || 'easy'; this.sel = -1; this.noteMode = false; this.hintStage = 0;
    this.board = $('.sdk-board', root); this.msg = $('.sdk-msg', root); this.pad = $('.sdk-pad', root); this.timeEl = $('.sdk-time', root); this.info = $('.sdk-info', root);
    this.cells = drawBoard(this.board, n, function (i) { self.select(i); });
    this.opts = load('sdk-opts', { live: false });
    for (var k = 1; k <= n; k++) { var b = el('button', '', ''); b.type = 'button'; b.setAttribute('data-d', k); b.innerHTML = '<b>' + k + '</b><small></small>'; this.pad.appendChild(b); }
    this.pad.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) self.input(+b.getAttribute('data-d')); });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'undo') self.undo(); else if (a === 'erase') self.input(0); else if (a === 'notes') self.setNotes(!self.noteMode);
      else if (a === 'hint') self.hint(); else if (a === 'check') self.check(); else if (a === 'new') self.fresh();
      else if (a === 'fill') self.fillNotes(); else if (a === 'pause') self.pause(!self.paused); else if (a === 'print') window.print();
      else if (a === 'restart') self.restart(); else if (a === 'place') self.placeHint(); else if (a === 'share') self.share();
      else if (a === 'level') { self.level = b.value; self.start(); }
    });
    var live = $('.sdk-live', root); if (live) { live.checked = !!this.opts.live; live.addEventListener('change', function () { self.opts.live = live.checked; save('sdk-opts', self.opts); self.paint(); }); }
    var date = $('.sdk-date', root); if (date) { date.max = today(); date.value = today(); date.addEventListener('change', function () { if (date.value && date.value <= today()) self.start(); }); this.dateEl = date; }
    d.addEventListener('keydown', function (e) {
      if (e.target.closest && e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey || self.sel < 0 || !self.st) return;
      var k = e.key, r = Math.floor(self.sel / n), c = self.sel % n;
      if (k >= '1' && k <= String(n)) self.input(+k);
      else if (k === 'Backspace' || k === 'Delete' || k === '0') self.input(0);
      else if (k === 'n' || k === 'N') self.setNotes(!self.noteMode);
      else if (k === 'ArrowUp') self.select(((r + n - 1) % n) * n + c); else if (k === 'ArrowDown') self.select(((r + 1) % n) * n + c);
      else if (k === 'ArrowLeft') self.select(r * n + (c + n - 1) % n); else if (k === 'ArrowRight') self.select(r * n + (c + 1) % n);
      else return;
      e.preventDefault();
    });
    setInterval(function () { if (self.st && !self.st.done && !self.paused && !d.hidden) { self.st.time++; self.timeEl.textContent = clock(self.st.time); if (self.st.time % 5 === 0) self.store(); } }, 1000);
    var m = /^#p=([a-z]+)-([0-9a-f]{1,8})$/.exec(location.hash);
    if (m && LEVELS[m[1]] && !this.daily && n === 9) { this.level = m[1]; this.start(parseInt(m[2], 16)); } else this.start();
  }
  var G = Game.prototype;
  G.slot = function () { return 'sdk-g-' + this.n + '-' + (this.daily ? 'daily' : this.level); };
  G.store = function () { if (this.st) save(this.slot(), this.st); };
  G.start = function (seed) {
    var self = this, saved = load(this.slot(), null), day = this.dateEl ? this.dateEl.value : today(), want;
    [].forEach.call(this.root.querySelectorAll('[data-act=level]'), function (b) { b.setAttribute('aria-pressed', b.value === self.level ? 'true' : 'false'); });
    if (this.daily) want = S.hash('daily ' + day + ' ' + this.level);
    else if (seed != null) want = seed >>> 0;
    if (saved && saved.puzzle && (want == null || saved.seed === want) && (!this.daily || saved.level === this.level)) { this.st = saved; this.level = saved.level; this.ready(); return; }
    if (want == null) want = Math.floor(Math.random() * 4294967296);
    this.build(want, day);
  };
  G.fresh = function () {
    if (this.daily) { this.restart(); return; }
    if (this.st && !this.st.done && this.st.val.some(function (v, i) { return v && !this.st.puzzle[i]; }, this) && !window.confirm('Start a new puzzle? This one will be cleared.')) return;
    this.build(Math.floor(Math.random() * 4294967296));
  };
  G.build = function (seed, day) {
    var self = this; this.st = null; this.board.classList.add('busy'); this.say('Making your puzzle...');
    make(this.n, this.level, seed, function (o) {
      self.board.classList.remove('busy');
      if (!o) { self.say('Could not make a puzzle this time. Please tap New puzzle again.'); return; }
      self.st = { seed: seed, level: self.level, day: day || '', puzzle: o.puzzle, solution: o.solution, val: o.puzzle.slice(), notes: new Array(self.n * self.n).fill(0), time: 0, done: false, hints: 0, undo: [] };
      self.ready();
    });
  };
  G.restart = function () {
    var st = this.st; if (!st) return;
    st.val = st.puzzle.slice(); st.notes = st.notes.map(function () { return 0; }); st.time = 0; st.done = false; st.hints = 0; st.undo = []; this.ready();
  };
  G.ready = function () {
    var st = this.st, self = this;
    [].forEach.call(this.root.querySelectorAll('[data-act=level]'), function (b) { b.setAttribute('aria-pressed', b.value === self.level ? 'true' : 'false'); });
    this.sel = -1; this.hintStage = 0; this.hintStep = null; this.wrong = null; this.pause(false);
    this.timeEl.textContent = clock(st.time);
    if (this.info) this.info.textContent = (this.daily ? 'Daily puzzle, ' + st.day + ', ' : '') + (this.n === 9 ? LEVELS[st.level] : this.n + ' by ' + this.n) + ' · ' + st.puzzle.filter(Boolean).length + ' clues' + (this.daily ? '' : ' · No. ' + st.seed.toString(16));
    if (!this.daily && this.n === 9) try { history.replaceState(null, '', '#p=' + st.level + '-' + st.seed.toString(16)); } catch (e) { }
    this.say(st.done ? 'Solved in ' + clock(st.time) + '. Tap New puzzle for another.' : 'Tap a cell, then tap a number.');
    this.paint(); this.store();
  };
  G.say = function (t, html) { if (html) this.msg.innerHTML = t; else this.msg.textContent = t; };
  G.select = function (i) { if (!this.st || this.paused) return; this.sel = i; this.paint(); };
  G.setNotes = function (on) { this.noteMode = on; var b = $('[data-act=notes]', this.root); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.querySelector('span').textContent = on ? 'On' : 'Off'; };
  G.push = function () { var st = this.st; st.undo.push([st.val.slice(), st.notes.slice()]); if (st.undo.length > 200) st.undo.shift(); };
  G.undo = function () { var st = this.st; if (!st || st.done || !st.undo.length) return; var u = st.undo.pop(); st.val = u[0]; st.notes = u[1]; this.changed(); };
  G.input = function (k) {
    var st = this.st, i = this.sel;
    if (!st || st.done || this.paused) return;
    if (i < 0) { this.say('Tap a cell first.'); return; }
    if (st.puzzle[i]) { this.say('That number is part of the puzzle and cannot be changed.'); return; }
    this.push();
    if (k === 0) { st.val[i] = 0; st.notes[i] = 0; }
    else if (this.noteMode) { if (st.val[i]) st.val[i] = 0; st.notes[i] ^= 1 << (k - 1); }
    else {
      st.val[i] = st.val[i] === k ? 0 : k;
      if (st.val[i]) { st.notes[i] = 0; this.g.peers[i].forEach(function (p) { st.notes[p] &= ~(1 << (k - 1)); }); }
    }
    this.changed();
  };
  G.changed = function () {
    var st = this.st; this.hintStage = 0; this.hintStep = null; this.wrong = null;
    if (st.val.every(function (v, i) { return v === st.solution[i]; })) this.win(); else if (st.val.every(Boolean)) this.say('The grid is full, but something does not fit. Tap Check to see which cells.');
    else if (this.msg.textContent.indexOf('Tap a cell') < 0) this.say('');
    this.paint(); this.store();
  };
  G.win = function () {
    var st = this.st, best = load('sdk-best', {}), key = this.n + '-' + st.level, stats = load('sdk-stats', {});
    st.done = true; stats[key] = (stats[key] || 0) + 1; save('sdk-stats', stats);
    var rec = !st.hints && (!best[key] || st.time < best[key]); if (rec) { best[key] = st.time; save('sdk-best', best); }
    this.say('<b>Solved in ' + clock(st.time) + '</b>' + (st.hints ? ' with ' + st.hints + ' hint' + (st.hints > 1 ? 's' : '') : '') + '. ' + (rec ? 'That is your best time for this level. ' : best[key] ? 'Your best without hints: ' + clock(best[key]) + '. ' : '') +
      'Puzzles solved at this level: ' + stats[key] + '. <button class="btn sm" type="button" data-act="new">' + (this.daily ? 'Play it again' : 'New puzzle') + '</button> <button class="btn sm ghost" type="button" data-act="share">Share</button>', true);
    stat();
  };
  G.share = function () {
    var st = this.st, t = this.daily ? 'I solved the daily Sudoku of ' + st.day + ' (' + LEVELS[st.level] + ') in ' + clock(st.time) + '.' : 'I solved this ' + (LEVELS[st.level] || '') + ' Sudoku in ' + clock(st.time) + '. Can you beat it? Same puzzle:';
    if (SYG.share) SYG.share(d.title, t, location.href);
  };
  G.fillNotes = function () {
    var st = this.st; if (!st || st.done) return; this.push();
    var L = new S.Logic(this.n, st.val); for (var i = 0; i < st.val.length; i++) st.notes[i] = st.val[i] ? 0 : L.cand[i];
    this.say('Notes filled: every digit that does not clash with its row, column and box.'); this.paint(); this.store();
  };
  G.pause = function (on) {
    this.paused = on; this.board.classList.toggle('paused', on);
    var b = $('[data-act=pause]', this.root); if (b) b.textContent = on ? 'Resume' : 'Pause';
    if (on) this.say('Paused. The clock has stopped and the grid is hidden.'); else if (this.msg.textContent.indexOf('Paused') === 0) this.say('');
  };
  G.check = function () {
    var st = this.st; if (!st || st.done) return;
    var bad = []; st.val.forEach(function (v, i) { if (v && v !== st.solution[i]) bad.push(i); });
    this.wrong = bad; this.paint();
    this.say(bad.length ? bad.length + (bad.length > 1 ? ' cells do' : ' cell does') + ' not match the solution. They are marked in red.' : 'No mistakes so far. ' + st.val.filter(function (v) { return !v; }).length + ' cells to go.');
  };
  G.hint = function () {
    var st = this.st, g = this.g; if (!st || st.done || this.paused) return;
    if (st.val.some(function (v, i) { return v && v !== st.solution[i]; })) { this.check(); return; }
    if (!this.hintStep) {
      var L = new S.Logic(this.n, st.val), chain = [], s;
      while ((s = L.next())) { chain.push(s); if (s.place) break; L.apply(s); }
      if (!chain.length || !chain[chain.length - 1].place) {   // cannot happen for our own puzzles; a safe fallback
        var e = st.val.indexOf(0); chain = [{ t: 'ns', place: [e, st.solution[e]], cells: [e], digits: 1 << (st.solution[e] - 1) }];
      }
      this.hintStep = chain; this.hintStage = 0;
    }
    var ch = this.hintStep, last = ch[ch.length - 1], link = function (t) { var w = t === 'xw' || t === 'xy', nm = w ? S.NAMES[t] : S.NAMES[t].toLowerCase(); return (w ? 'an ' : 'a ') + (this.n === 9 ? '<a href="/techniques/' + S.SLUG[t] + '/">' + nm + '</a>' : nm); }.bind(this);
    this.hintStage++; if (this.hintStage === 1) st.hints++;
    if (this.hintStage === 1) {
      var where = last.unit != null ? S.unitName(g, last.unit) : S.unitName(g, g.cu[last.cells[0]][0]);
      this.say('<b>Hint:</b> ' + (ch.length > 1 ? 'first you need ' + ch.slice(0, -1).map(function (x) { return link(x.t); }).join(', then ') + '. After that, look' : 'look') +
        ' for ' + link(last.t) + ' in ' + where + '. <span class="hint">Tap Hint again to see it.</span>', true);
      this.hl = { units: [last.unit != null ? last.unit : g.cu[last.cells[0]][0]] };
    } else {
      this.say('<b>Hint:</b><ol class="sdk-steps">' + ch.map(function (x) { return '<li>' + S.describe(g, x) + '</li>'; }).join('') + '</ol><button class="btn sm" type="button" data-act="place">Put ' + last.place[1] + ' in ' + S.cellName(g, last.place[0]) + '</button>', true);
      this.hl = { cells: [].concat.apply([], ch.map(function (x) { return x.cells; })), target: last.place[0] };
      this.sel = last.place[0];
    }
    this.paint(true); this.store();
  };
  G.placeHint = function () {
    var ch = this.hintStep; if (!ch) return; var p = ch[ch.length - 1].place;
    this.sel = p[0]; var nm = this.noteMode; this.noteMode = false; if (this.st.val[p[0]] !== p[1]) this.input(p[1]); this.noteMode = nm;
  };
  G.paint = function (keepHl) {
    var st = this.st, n = this.n, g = this.g, sel = this.sel, self = this; if (!st) return;
    if (!keepHl) this.hl = null;
    var hl = this.hl || {}, selV = sel >= 0 ? st.val[sel] : 0, left = new Array(n + 1).fill(n), clash = {};
    g.units.forEach(function (U) { var seen = {}; U.forEach(function (c) { var v = st.val[c]; if (v) { if (seen[v] != null) { clash[c] = clash[seen[v]] = 1; } else seen[v] = c; } }); });
    st.val.forEach(function (v) { if (v) left[v]--; });
    this.cells.forEach(function (b, i) {
      var v = st.val[i], cls = 'c' + (b.className.indexOf(' br') > 0 ? ' br' : '') + (b.className.indexOf(' bb') > 0 ? ' bb' : '');
      if (st.puzzle[i]) cls += ' giv';
      if (i === sel) cls += ' sel'; else if (sel >= 0 && g.peers[sel].indexOf(i) >= 0) cls += ' peer';
      if (v && v === selV && i !== sel) cls += ' same';
      if (clash[i] && !st.puzzle[i] || (self.wrong && self.wrong.indexOf(i) >= 0) || (self.opts.live && v && !st.puzzle[i] && v !== st.solution[i])) cls += ' bad';
      if (hl.cells && hl.cells.indexOf(i) >= 0) cls += ' hl';
      if (hl.target === i) cls += ' tg';
      if (hl.units && hl.units.some(function (u) { return g.cu[i].indexOf(u) >= 0; })) cls += ' hu';
      b.className = cls;
      if (v) b.textContent = v; else if (st.notes[i]) b.innerHTML = notesHtml(n, st.notes[i]); else b.textContent = '';
    });
    [].forEach.call(this.pad.children, function (b) { var k = +b.getAttribute('data-d'); b.querySelector('small').textContent = left[k] > 0 ? left[k] + ' left' : 'done'; b.classList.toggle('full', left[k] <= 0); });
  };

  /* best times and counts, shown wherever a page has <div data-sdk-stats> */
  function stat() {
    var box = $('[data-sdk-stats]'); if (!box) return;
    var best = load('sdk-best', {}), stats = load('sdk-stats', {}), rows = '';
    Object.keys(LEVELS).forEach(function (k) { if (stats['9-' + k]) rows += '<tr><td>' + LEVELS[k] + '</td><td>' + stats['9-' + k] + '</td><td>' + (best['9-' + k] ? clock(best['9-' + k]) : 'not yet') + '</td></tr>'; });
    box.innerHTML = rows ? '<div class="tbl"><table><thead><tr><th>Level</th><th>Solved</th><th>Best time without hints</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="hint">Kept only in this browser. <button class="btn sm ghost" type="button" id="sdk-clear">Clear my times</button></p>' : '<p class="hint">Your solved puzzles and best times will appear here. They are kept only in this browser.</p>';
    var c = $('#sdk-clear'); if (c) c.onclick = function () { if (window.confirm('Clear your saved times and counts?')) { save('sdk-best', {}); save('sdk-stats', {}); stat(); } };
  }

  /* ---------------- solver page ---------------- */
  function Solver(root) {
    var n = 9, g = S.geo(n), val = new Array(81).fill(0), given = new Array(81).fill(0), sel = 0, out = $('.sdk-out', root), board = $('.sdk-board', root), pad = $('.sdk-pad', root);
    var cells = drawBoard(board, n, function (i) { sel = i; paint(); });
    function paint() {
      var clash = {}; g.units.forEach(function (U) { var seen = {}; U.forEach(function (c) { var v = given[c]; if (v) { if (seen[v] != null) clash[c] = clash[seen[v]] = 1; else seen[v] = c; } }); });
      cells.forEach(function (b, i) { b.className = 'c' + (b.className.indexOf(' br') > 0 ? ' br' : '') + (b.className.indexOf(' bb') > 0 ? ' bb' : '') + (given[i] ? ' giv' : '') + (i === sel ? ' sel' : '') + (clash[i] ? ' bad' : ''); b.textContent = val[i] || ''; });
      return Object.keys(clash).length;
    }
    function set(k) { given[sel] = k; val = given.slice(); out.hidden = true; if (k && sel < 80) sel++; paint(); }
    for (var k = 1; k <= 9; k++) { var b = el('button', '', ''); b.type = 'button'; b.setAttribute('data-d', k); b.innerHTML = '<b>' + k + '</b>'; pad.appendChild(b); }
    pad.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) set(+b.getAttribute('data-d')); });
    d.addEventListener('keydown', function (e) {
      if (e.target.closest && e.target.closest('input,textarea') || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      if (k >= '1' && k <= '9') set(+k); else if (k === '0' || k === ' ' || k === '.') { set(0); if (sel < 80) sel++; paint(); }
      else if (k === 'Backspace') { if (!given[sel] && sel > 0) sel--; set(0); } else if (k === 'Delete') set(0);
      else if (k === 'ArrowUp') sel = (sel + 72) % 81; else if (k === 'ArrowDown') sel = (sel + 9) % 81; else if (k === 'ArrowLeft') sel = (sel + 80) % 81; else if (k === 'ArrowRight') sel = (sel + 1) % 81; else return;
      e.preventDefault(); paint();
    });
    function show(h) { out.hidden = false; out.innerHTML = h; }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var a = b.getAttribute('data-act');
      if (a === 'erase') set(0);
      else if (a === 'clear') { given.fill(0); val.fill(0); sel = 0; out.hidden = true; paint(); }
      else if (a === 'paste') {
        var t = ($('#sdk-paste', root).value || '').replace(/[^0-9.]/g, '');
        if (t.length !== 81) { show('<p>Please paste exactly 81 characters: the digits row by row, with 0 or a dot for an empty cell. You pasted ' + t.length + '.</p>'); return; }
        for (var i = 0; i < 81; i++) given[i] = t[i] === '.' ? 0 : +t[i]; val = given.slice(); out.hidden = true; paint();
      } else if (a === 'solve') {
        val = given.slice();
        var clues = given.filter(Boolean).length;
        if (paint()) { show('<h2>This grid breaks the rules</h2><p>The cells marked in red repeat a digit in a row, column or box. Correct them and try again.</p>'); return; }
        if (clues < 17) { show('<h2>Too few clues</h2><p>You have entered ' + clues + ' clues. A 9 by 9 sudoku needs at least 17 clues to have a single solution, so this grid has many answers. Please check that you copied every number.</p>'); return; }
        var res = S.solve(9, given, 2);
        if (!res.count) { show('<h2>No solution</h2><p>No way of filling this grid obeys the rules. One of the clues is probably mistyped. Compare the grid with your puzzle, row by row.</p>'); return; }
        var L = new S.Logic(9, given), run = L.run(true), names = [], seen = {};
        run.steps.forEach(function (s) { if (!seen[s.t]) { seen[s.t] = 1; names.push('<a href="/techniques/' + S.SLUG[s.t] + '/">' + S.NAMES[s.t] + '</a>'); } });
        val = res.solution.slice(); cells.forEach(function (c, i) { c.textContent = val[i]; });
        var grade = ['', 'Easy or Medium (singles only)', 'Hard (needs pairs or box and line work)', 'Expert (needs triples, wings or fish)'][run.level];
        var h = '<h2>' + (res.count > 1 ? 'More than one solution' : 'Solved') + '</h2>';
        if (res.count > 1) h += '<p>This grid has more than one valid answer, so it is not a proper sudoku. One answer is shown above. A clue may be missing or mistyped.</p>';
        else {
          h += '<p>The grid has exactly one solution, shown above in the lighter digits. ' + (run.solved ? 'It can be solved by logic alone. Our grade: <b>' + grade + '</b>. Techniques used: ' + names.join(', ') + '.' :
            'Our step-by-step solver got ' + run.steps.filter(function (s) { return s.place; }).length + ' cells with the techniques taught on this site and then stopped: the rest needs harder methods (or trial and error), which the search finished.') + '</p>';
          h += '<details><summary>Show the ' + run.steps.length + ' logic steps</summary><ol class="sdk-steps">' + run.steps.map(function (s) { return '<li><b>' + S.NAMES[s.t] + '.</b> ' + S.describe(g, s) + '</li>'; }).join('') + '</ol></details>';
        }
        show(h);
      }
    });
    paint();
  }

  /* ---------------- print page ---------------- */
  function Printer(root) {
    var out = $('.sdk-sheets', root), busy = false;
    function table(n, cells, cls) {
      var g = S.geo(n), h = '<table class="pz ' + (cls || '') + ' n' + n + '">';
      for (var r = 0; r < n; r++) { h += '<tr>'; for (var c = 0; c < n; c++) h += '<td class="' + ((c + 1) % g.bw === 0 && c < n - 1 ? 'br ' : '') + ((r + 1) % g.bh === 0 && r < n - 1 ? 'bb' : '') + '">' + (cells[r * n + c] || '') + '</td>'; h += '</tr>'; }
      return h + '</table>';
    }
    $('[data-act=make]', root).addEventListener('click', function () {
      if (busy) return; busy = true;
      var level = $('#pr-level', root).value, count = +$('#pr-count', root).value, per = +$('#pr-per', root).value, ans = $('#pr-ans', root).checked, n = level === 'kids4' ? 4 : level === 'kids6' ? 6 : 9, lv = n < 9 ? 'easy' : level, list = [];
      out.innerHTML = '<p class="hint">Making ' + count + ' puzzles...</p>';
      (function next() {
        if (list.length < count) { make(n, lv, Math.floor(Math.random() * 4294967296), function (o) { if (o) list.push(o); next(); }); return; }
        var name = n < 9 ? n + ' by ' + n : LEVELS[lv], h = '<div class="sheet per' + per + '">';
        list.forEach(function (o, i) { h += '<figure><figcaption>' + name + ' ' + (i + 1) + '</figcaption>' + table(n, o.puzzle) + '</figure>'; if ((i + 1) % per === 0 && i + 1 < list.length) h += '</div><div class="sheet per' + per + '">'; });
        h += '</div>';
        if (ans) { h += '<div class="sheet answers"><h2>Answers</h2>'; list.forEach(function (o, i) { h += '<figure><figcaption>' + name + ' ' + (i + 1) + '</figcaption>' + table(n, o.solution, 'sm') + '</figure>'; }); h += '</div>'; }
        out.innerHTML = h; busy = false; $('[data-act=print]', root).hidden = false;
      })();
    });
    $('[data-act=print]', root).addEventListener('click', function () { window.print(); });
  }

  function init() {
    [].forEach.call(d.querySelectorAll('[data-sdk]'), function (r) {
      var k = r.getAttribute('data-sdk');
      if (k === 'play') new Game(r); else if (k === 'solver') Solver(r); else if (k === 'print') Printer(r);
    });
    stat();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
