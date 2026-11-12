/* Sudoku engine for sudoku.shareyourgroup.com. Written for this site; runs in the browser and in Node (make_examples.js).
   Grid sizes 4 (2x2 boxes), 6 (2 rows x 3 columns boxes) and 9. Cells are numbered row by row from 0.
   - solve(): back-tracking search that counts solutions (used for the unique-solution check)
   - generate(): a full grid, then clues removed in mirror pairs while the solution stays unique
   - Logic: a step-by-step solver that uses only named techniques (for hints, grading and the solver page) */
(function (root) {
  'use strict';
  var POP = new Uint8Array(512);
  for (var i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);

  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bits(m) { var o = []; for (var d = 1; m; d++, m >>= 1) if (m & 1) o.push(d); return o; }

  var GEO = {};
  function geo(n) {
    if (GEO[n]) return GEO[n];
    var bh = n === 6 ? 2 : Math.sqrt(n), bw = n / bh, g = { n: n, bh: bh, bw: bw, full: (1 << n) - 1, units: [], cu: [], peers: [] }, r, c, b, i;
    for (r = 0; r < n; r++) { g.units.push([]); }
    for (c = 0; c < n; c++) { g.units.push([]); }
    for (b = 0; b < n; b++) { g.units.push([]); }
    for (i = 0; i < n * n; i++) {
      r = Math.floor(i / n); c = i % n; b = Math.floor(r / bh) * bh + Math.floor(c / bw);
      g.units[r].push(i); g.units[n + c].push(i); g.units[2 * n + b].push(i); g.cu.push([r, n + c, 2 * n + b]);
    }
    for (i = 0; i < n * n; i++) {
      var seen = {}, p = [];
      g.cu[i].forEach(function (u) { g.units[u].forEach(function (x) { if (x !== i && !seen[x]) { seen[x] = 1; p.push(x); } }); });
      g.peers.push(p);
    }
    return (GEO[n] = g);
  }
  function unitName(g, u) { var n = g.n; return u < n ? 'row ' + (u + 1) : u < 2 * n ? 'column ' + (u - n + 1) : 'box ' + (u - 2 * n + 1); }
  function cellName(g, c) { return 'R' + (Math.floor(c / g.n) + 1) + 'C' + (c % g.n + 1); }

  /* count solutions up to `limit`; with r (a random source) the digits are tried in random order, which makes random full grids */
  function solve(n, cells, limit, r) {
    var g = geo(n), v = cells.slice(), um = new Int32Array(3 * n), count = 0, sol = null, i, k;
    for (i = 0; i < n * n; i++) if (v[i]) {
      var bit = 1 << (v[i] - 1);
      for (k = 0; k < 3; k++) { if (um[g.cu[i][k]] & bit) return { count: 0, solution: null }; um[g.cu[i][k]] |= bit; }
    }
    (function rec() {
      var best = -1, bm = 0, bc = 99, i, m, pc;
      for (i = 0; i < n * n; i++) if (!v[i]) {
        m = g.full & ~(um[g.cu[i][0]] | um[g.cu[i][1]] | um[g.cu[i][2]]); pc = POP[m];
        if (!pc) return;
        if (pc < bc) { best = i; bm = m; bc = pc; if (pc === 1) break; }
      }
      if (best < 0) { count++; if (!sol) sol = v.slice(); return; }
      var ds = bits(bm); if (r) shuffle(ds, r);
      for (var j = 0; j < ds.length; j++) {
        var b = 1 << (ds[j] - 1), cu = g.cu[best];
        v[best] = ds[j]; um[cu[0]] |= b; um[cu[1]] |= b; um[cu[2]] |= b;
        rec();
        v[best] = 0; um[cu[0]] &= ~b; um[cu[1]] &= ~b; um[cu[2]] &= ~b;
        if (count >= limit) return;
      }
    })();
    return { count: count, solution: sol };
  }

  /* ---------- logic solver ---------- */
  function Logic(n, cells) {
    var g = this.g = geo(n); this.n = n; this.val = cells.slice(); this.cand = new Int32Array(n * n);
    for (var i = 0; i < n * n; i++) if (!this.val[i]) {
      var m = g.full; g.peers[i].forEach(function (p) { if (cells[p]) m &= ~(1 << (cells[p] - 1)); }); this.cand[i] = m;
    }
  }
  var LEVEL = { ns: 1, hs: 1, pt: 2, cl: 2, np: 2, hp: 2, nt: 3, ht: 3, xw: 3, xy: 3, sf: 3 };
  var ORDER = ['hsb', 'ns', 'hs', 'pt', 'cl', 'np', 'hp', 'nt', 'ht', 'xw', 'xy', 'sf'];
  var NAMES = { ns: 'Naked single', hs: 'Hidden single', pt: 'Pointing pair', cl: 'Box-line reduction', np: 'Naked pair', hp: 'Hidden pair', nt: 'Naked triple', ht: 'Hidden triple', xw: 'X-Wing', xy: 'XY-Wing', sf: 'Swordfish' };
  var SLUG = { ns: 'naked-single', hs: 'hidden-single', pt: 'pointing-pairs', cl: 'box-line-reduction', np: 'naked-pair', hp: 'hidden-pair', nt: 'naked-triple', ht: 'hidden-triple', xw: 'x-wing', xy: 'xy-wing', sf: 'swordfish' };
  var P = Logic.prototype;
  P.done = function () { for (var i = 0; i < this.val.length; i++) if (!this.val[i]) return false; return true; };
  P.place = function (c, d) { var b = 1 << (d - 1), cand = this.cand; this.val[c] = d; cand[c] = 0; this.g.peers[c].forEach(function (p) { cand[p] &= ~b; }); };
  P.apply = function (s) { if (s.place) this.place(s.place[0], s.place[1]); else for (var i = 0; i < s.elim.length; i++) this.cand[s.elim[i][0]] &= ~s.elim[i][1]; };
  P.broken = function () { for (var i = 0; i < this.val.length; i++) if (!this.val[i] && !this.cand[i]) return true; return false; };

  P.ns = function () { for (var c = 0; c < this.val.length; c++) if (!this.val[c] && POP[this.cand[c]] === 1) return { t: 'ns', place: [c, bits(this.cand[c])[0]], cells: [c], digits: this.cand[c] }; return null; };
  P.hsUnits = function (from, to) {
    var g = this.g, n = this.n;
    for (var u = from; u < to; u++) for (var d = 1; d <= n; d++) {
      var b = 1 << (d - 1), hit = -1, k = 0, U = g.units[u];
      for (var j = 0; j < n; j++) if (this.cand[U[j]] & b) { hit = U[j]; k++; }
      if (k === 1) return { t: 'hs', place: [hit, d], cells: [hit], digits: b, unit: u };
    }
    return null;
  };
  P.hsb = function () { return this.hsUnits(2 * this.n, 3 * this.n); };   // boxes first: the easiest place for a person to look
  P.hs = function () { return this.hsUnits(0, 2 * this.n); };
  P.elimStep = function (t, cells, digits, targets, mask, unit, unit2) {
    var el = [], cand = this.cand;
    targets.forEach(function (c) { if (cells.indexOf(c) < 0 && (cand[c] & mask)) el.push([c, cand[c] & mask]); });
    return el.length ? { t: t, elim: el, cells: cells, digits: digits, unit: unit, unit2: unit2 } : null;
  };
  P.locked = function (boxFirst) {
    var g = this.g, n = this.n, from = boxFirst ? 2 * n : 0, to = boxFirst ? 3 * n : 2 * n;
    for (var u = from; u < to; u++) for (var d = 1; d <= n; d++) {
      var b = 1 << (d - 1), cs = g.units[u].filter(function (c) { return this.cand[c] & b; }, this);
      if (cs.length < 2 || cs.length > Math.max(g.bh, g.bw)) continue;
      for (var k = 0; k < 3; k++) {
        var other = g.cu[cs[0]][k];
        if (other === u || (boxFirst ? other >= 2 * n : other < 2 * n)) continue;
        if (cs.every(function (c) { return g.cu[c][k] === other; })) {
          var s = this.elimStep(boxFirst ? 'pt' : 'cl', cs, b, g.units[other], b, u, other);
          if (s) return s;
        }
      }
    }
    return null;
  };
  P.pt = function () { return this.locked(true); };
  P.cl = function () { return this.locked(false); };
  function combos(arr, k, fn) {
    var pick = [];
    return (function rec(start) {
      if (pick.length === k) return fn(pick);
      for (var i = start; i < arr.length; i++) { pick.push(arr[i]); var r = rec(i + 1); pick.pop(); if (r) return r; }
      return null;
    })(0);
  }
  P.naked = function (k) {
    var g = this.g, self = this;
    for (var u = 3 * this.n - 1; u >= 0; u--) {
      var em = g.units[u].filter(function (c) { return self.cand[c] && POP[self.cand[c]] <= k; });
      if (em.length < k) continue;
      var free = g.units[u].filter(function (c) { return self.cand[c]; }).length;
      if (free <= k) continue;
      var s = combos(em, k, function (pk) {
        var m = 0; pk.forEach(function (c) { m |= self.cand[c]; });
        return POP[m] === k ? self.elimStep(k === 2 ? 'np' : 'nt', pk.slice(), m, g.units[u], m, u) : null;
      });
      if (s) return s;
    }
    return null;
  };
  P.hidden = function (k) {
    var g = this.g, self = this, n = this.n;
    for (var u = 3 * n - 1; u >= 0; u--) {
      var ds = [];
      for (var d = 1; d <= n; d++) { var cnt = 0; g.units[u].forEach(function (c) { if (self.cand[c] & (1 << (d - 1))) cnt++; }); if (cnt >= 1 && cnt <= k) ds.push(d); }
      if (ds.length < k) continue;
      var s = combos(ds, k, function (pk) {
        var m = 0; pk.forEach(function (d) { m |= 1 << (d - 1); });
        var cs = g.units[u].filter(function (c) { return self.cand[c] & m; });
        if (cs.length !== k) return null;
        var el = []; cs.forEach(function (c) { if (self.cand[c] & ~m) el.push([c, self.cand[c] & ~m]); });
        return el.length ? { t: k === 2 ? 'hp' : 'ht', elim: el, cells: cs, digits: m, unit: u } : null;
      });
      if (s) return s;
    }
    return null;
  };
  P.np = function () { return this.naked(2); }; P.nt = function () { return this.naked(3); };
  P.hp = function () { return this.hidden(2); }; P.ht = function () { return this.hidden(3); };
  P.fish = function (k) {
    var g = this.g, n = this.n, self = this;
    for (var d = 1; d <= n; d++) for (var o = 0; o < 2; o++) {   // o = 0: base sets are rows, 1: columns
      var b = 1 << (d - 1), lines = [];
      for (var l = 0; l < n; l++) {
        var m = 0; g.units[o * n + l].forEach(function (c, j) { if (self.cand[c] & b) m |= 1 << j; });
        if (POP[m] >= 2 && POP[m] <= k) lines.push([l, m]);
      }
      if (lines.length < k) continue;
      var s = combos(lines, k, function (pk) {
        var m = 0; pk.forEach(function (x) { m |= x[1]; });
        if (POP[m] !== k) return null;
        var cells = [], targets = [], base = pk.map(function (x) { return x[0]; });
        pk.forEach(function (x) { g.units[o * n + x[0]].forEach(function (c, j) { if ((x[1] >> j) & 1) cells.push(c); }); });
        bits(m).forEach(function (j1) { g.units[(1 - o) * n + j1 - 1].forEach(function (c) { targets.push(c); }); });
        var st = self.elimStep(k === 2 ? 'xw' : 'sf', cells, b, targets, b);
        if (st) { st.base = base.map(function (l) { return o * n + l; }); st.cover = bits(m).map(function (j1) { return (1 - o) * n + j1 - 1; }); }
        return st;
      });
      if (s) return s;
    }
    return null;
  };
  P.xw = function () { return this.fish(2); }; P.sf = function () { return this.fish(3); };
  P.xy = function () {
    var g = this.g, cand = this.cand;
    for (var p = 0; p < cand.length; p++) {
      if (POP[cand[p]] !== 2) continue;
      var w = g.peers[p].filter(function (c) { return POP[cand[c]] === 2 && cand[c] !== cand[p] && POP[cand[c] & cand[p]] === 1; });
      for (var i = 0; i < w.length; i++) for (var j = i + 1; j < w.length; j++) {
        var a = w[i], b = w[j], z = cand[a] & cand[b] & ~cand[p];
        if (POP[z] !== 1) continue;
        if ((cand[a] & cand[p]) === (cand[b] & cand[p])) continue;
        var targets = g.peers[a].filter(function (c) { return g.peers[b].indexOf(c) >= 0 && c !== p; });
        var s = this.elimStep('xy', [p, a, b], z, targets, z);
        if (s) return s;
      }
    }
    return null;
  };
  P.next = function (maxLevel) {
    for (var i = 0; i < ORDER.length; i++) {
      var t = ORDER[i]; if (LEVEL[t === 'hsb' ? 'hs' : t] > (maxLevel || 3)) break;
      var s = this[t](); if (s) return s;
    }
    return null;
  };
  /* run to the end; returns {solved, level, steps} */
  P.run = function (keep) {
    var level = 0, steps = [], s, count = {};
    while (!this.done() && (s = this.next())) { this.apply(s); level = Math.max(level, LEVEL[s.t]); count[s.t] = (count[s.t] || 0) + 1; if (keep) steps.push(s); }
    return { solved: this.done(), level: level, steps: steps, count: count };
  };

  /* a sentence for a step, in plain words */
  function describe(g, s) {
    var ds = bits(s.digits), dj = ds.join(ds.length === 2 ? ' and ' : ', '), cn = function (c) { return cellName(g, c); }, cs = s.cells.map(cn).join(', '),
      un = function (u) { return unitName(g, u); },
      el = s.elim ? s.elim.map(function (e) { return bits(e[1]).join('/') + ' from ' + cn(e[0]); }).join('; ') : '';
    switch (s.t) {
      case 'ns': return cn(s.cells[0]) + ' can only be ' + s.place[1] + ': every other digit already appears in its row, column or box.';
      case 'hs': return 'In ' + un(s.unit) + ', the digit ' + s.place[1] + ' fits in only one cell: ' + cn(s.cells[0]) + '.';
      case 'pt': return 'In ' + un(s.unit) + ', every place for ' + dj + ' lies in ' + un(s.unit2) + ' (' + cs + '). So ' + dj + ' cannot go anywhere else in ' + un(s.unit2) + '. Remove ' + el + '.';
      case 'cl': return 'In ' + un(s.unit) + ', every place for ' + dj + ' lies inside ' + un(s.unit2) + ' (' + cs + '). So ' + dj + ' cannot go anywhere else in ' + un(s.unit2) + '. Remove ' + el + '.';
      case 'np': case 'nt': return 'In ' + un(s.unit) + ', the cells ' + cs + ' hold only the digits ' + dj + ' between them. Those digits must go in those cells, so remove ' + el + '.';
      case 'hp': case 'ht': return 'In ' + un(s.unit) + ', the digits ' + dj + ' fit only in ' + cs + '. Those cells can hold nothing else, so remove ' + el + '.';
      case 'xw': case 'sf': return 'Look at digit ' + dj + ' in ' + s.base.map(un).join(', ') + '. Its possible places line up in ' + s.cover.map(un).join(', ') + ' only. So ' + dj + ' can be removed from the other cells of those lines: ' + el + '.';
      case 'xy': return 'The pivot ' + cn(s.cells[0]) + ' has two candidates, and it sees ' + cn(s.cells[1]) + ' and ' + cn(s.cells[2]) + ', which each share one of them and both also hold ' + dj + '. Whichever way the pivot goes, one of the two becomes ' + dj + ', so remove ' + el + '.';
    }
    return '';
  }

  /* ---------- generator ---------- */
  var CLUES = { 9: { easy: 38, medium: 0, hard: 0, expert: 0 }, 6: { easy: 18, medium: 12 }, 4: { easy: 8, medium: 5 } };
  function dig(n, full, target, r) {
    var v = full.slice(), N = n * n, order = shuffle(Array.from({ length: N }, function (_, i) { return i; }), r), left = N;
    for (var k = 0; k < N && left > target; k++) {
      var a = order[k], b = N - 1 - a; if (!v[a]) continue;
      var sa = v[a], sb = v[b]; v[a] = 0; v[b] = 0;
      if (solve(n, v, 2).count === 1) left -= a === b ? 1 : 2; else { v[a] = sa; v[b] = sb; }
    }
    return v;
  }
  /* one attempt: returns {puzzle, solution, level, clues} or null when the candidate does not match the wanted level */
  function attempt(n, level, r) {
    var full = solve(n, new Array(n * n).fill(0), 1, r).solution, puz = dig(n, full, (CLUES[n] || {})[level] || 0, r);
    var res = new Logic(n, puz).run();
    if (!res.solved) return null;
    var want = n < 9 ? 1 : { easy: 1, medium: 1, hard: 2, expert: 3 }[level];
    if (res.level !== want) return null;
    return { puzzle: puz, solution: full, level: level, clues: puz.filter(Boolean).length, count: res.count };
  }
  function generate(n, level, seed) {
    var r = rng(seed), out = null;
    for (var i = 0; i < 4000 && !out; i++) out = attempt(n, level, r);
    return out;
  }

  var API = { rng: rng, hash: hash, shuffle: shuffle, bits: bits, geo: geo, solve: solve, Logic: Logic, describe: describe, attempt: attempt, generate: generate,
    LEVEL: LEVEL, NAMES: NAMES, SLUG: SLUG, unitName: unitName, cellName: cellName, POP: POP };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SDK = API;
})(typeof window !== 'undefined' ? window : this);
