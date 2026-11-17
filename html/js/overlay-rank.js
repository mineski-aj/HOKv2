// html/js/overlay-rank.js — In-Game Overlay RANK PANELS (RIGHT quadrant).
// HokRankPanel(opts) builds one ranking panel; two instances live here:
//   HokDamageRank  #dr-panel  'DAMAGE RANK'  stats.damage (TotalHurtToHero)
//   HokGoldRank    #gr-panel  'GOLD RANK'    gold (total gold) + gold coin icon
// All 10 players sorted by the metric. Data: /api/post-items
// (lib/postHexagon.js), fetched only while the panel is shown, piggy-backing on
// the page's single HokPoll loop (max once a second). Show/hide is
// HokQuadrants' job (overlay.html); this module fills/sorts rows.
//
// Rank change animation: every player keeps ONE row element (keyed by side +
// role), so a new order just moves rows to their new y — they glide, the one
// that climbed rides on top with a lift, thumbnail flash and a bar sweep; bars
// resize and numbers count to the new value at the same time.
//
// Debug (<panel>.debug(mode, seed)) — fake rank changes to test the
// animation; live data is ignored until mode 'live' or the panel is hidden:
//   shuffle  a player 1–4 places down overtakes, plus two small bumps
//   climb    last place jumps to first
//   auto     shuffle every 2.5 s (call again to stop)
//   live     back to real data
// Live:  GET /overlay/<damagerank|goldrank>/debug/<mode>   (SSE '<key>', action 'debug')
// Preview: previewTrigger('<damagerank|goldrank>_debug', '<mode>')
function HokRankPanel(opts) {
  var panel = document.getElementById(opts.id);
  var Y0 = 166, PITCH = 58.4, BAR_MAX = 257, BAR_MIN = 60, MOVE_MS = 800;
  var rows = {};              // key → { el, name, hero, bar, val, shown, rank }
  var list = [];              // current displayed order [{ key, side, name, heroId, dmg }] (dmg = the ranked value)
  var lastFetch = 0, busy = false;
  var debugMode = false, autoTimer = null, rng = Math.random;

  panel.classList.add('rk-panel');
  panel.innerHTML = '<div class="rk-title">' + opts.title + '</div>' + (opts.coin
    ? '<div class="rk-coin"><span>$</span><img src="/assets/images/damage_rank/gold_icon.png" alt="" onerror="this.remove()"></div>' : '');

  function heroUrl(id) { return id ? hokAsset('hero/square/' + id + '_KOTAK.png') : ''; }

  function rowFor(key) {
    if (rows[key]) return rows[key];
    var el = document.createElement('div');
    el.className = 'rk-row';
    el.innerHTML = '<div class="rk-inner"><img class="rk-hero" alt="">' +
      '<div class="rk-name-wrap"><span class="rk-name"></span></div>' +
      '<div class="rk-bar"><span class="rk-val"></span></div><div class="rk-sep"></div></div>';
    panel.appendChild(el);
    var r = rows[key] = { el: el, hero: el.querySelector('.rk-hero'), name: el.querySelector('.rk-name'),
      bar: el.querySelector('.rk-bar'), val: el.querySelector('.rk-val'), shown: 0, rank: -1, anim: null };
    r.hero.onerror = function () { r.hero.style.visibility = 'hidden'; };
    return r;
  }

  // Squeeze long names into the bar column (left-anchored).
  function fitName(r) {
    r.name.style.transform = '';
    var w = r.name.scrollWidth, max = 262;
    if (w > max) r.name.style.transform = 'scaleX(' + (max / w).toFixed(3) + ')';
  }

  // Count the number from what's on screen to the new value.
  function countTo(r, to) {
    if (r.anim) cancelAnimationFrame(r.anim);
    var from = r.shown, t0 = performance.now();
    if (from === to || !panel.classList.contains('show')) { r.shown = to; r.val.textContent = Math.round(to); return; }
    clearTimeout(r.endTimer);
    (function step() {
      var k = Math.max(0, Math.min(1, (performance.now() - t0) / MOVE_MS)), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      r.shown = from + (to - from) * e;
      r.val.textContent = Math.round(r.shown);
      r.anim = k < 1 ? requestAnimationFrame(step) : null;
    })();
    // rAF can stall (hidden browser source) — always land on the final value.
    r.endTimer = setTimeout(function () { if (r.anim) cancelAnimationFrame(r.anim); r.anim = null; r.shown = to; r.val.textContent = Math.round(to); }, MOVE_MS + 100);
  }

  function render(players) {
    // Stable sort: damage desc, ties keep the previous order.
    var prevRank = {};
    list.forEach(function (p, i) { prevRank[p.key] = i; });
    players = players.slice().sort(function (a, b) {
      return (b.dmg - a.dmg) || ((a.key in prevRank ? prevRank[a.key] : 99) - (b.key in prevRank ? prevRank[b.key] : 99)) || (a.key < b.key ? -1 : 1);
    });
    var top = players.length ? Math.max(players[0].dmg, 1) : 1;
    var live = {};
    players.forEach(function (p, i) {
      var r = rowFor(p.key), wasRank = r.rank;
      live[p.key] = true;
      r.el.classList.remove('rk-gone');
      r.el.classList.toggle('h', p.side === 'h');
      r.el.classList.toggle('a', p.side !== 'h');
      r.el.classList.toggle('rk-last', i === players.length - 1);
      r.el.style.setProperty('--r', i);
      if (r.name.textContent !== p.name) { r.name.textContent = p.name; fitName(r); }
      var url = heroUrl(p.heroId);
      if ((r.hero.dataset.src || '') !== url) { r.hero.style.visibility = url ? '' : 'hidden'; hokSetSrc(r.hero, url); }
      // A row's first placement (and any update while the panel is hidden, e.g.
      // the onShow fetch) SNAPS into place — otherwise new rows glide down from
      // y 0 and bars grow from 60px, the "compacted then spreads out" look.
      var snap = wasRank < 0 || !panel.classList.contains('show');
      if (snap) { r.el.style.transition = 'none'; r.bar.style.transition = 'none'; }
      r.bar.style.width = Math.max(BAR_MIN, Math.round(p.dmg / top * BAR_MAX)) + 'px';
      countTo(r, p.dmg);
      r.el.style.transform = 'translateY(' + (Y0 + i * PITCH).toFixed(1) + 'px)';
      if (snap) { void r.el.offsetWidth; r.el.style.transition = ''; r.bar.style.transition = ''; }
      // Rank change → climb / drop styling for the length of the move.
      if (wasRank >= 0 && wasRank !== i && panel.classList.contains('show')) {
        var cls = i < wasRank ? 'rk-up' : 'rk-down';
        r.el.classList.remove('rk-up', 'rk-down');
        void r.el.offsetWidth;                          // restart the climb animations
        r.el.classList.add(cls);
        clearTimeout(r.clsTimer);
        r.clsTimer = setTimeout(function () { r.el.classList.remove('rk-up', 'rk-down'); }, MOVE_MS + 300);
      }
      r.rank = i;
    });
    Object.keys(rows).forEach(function (k) { if (!live[k]) { rows[k].el.classList.add('rk-gone'); rows[k].rank = -1; } });
    list = players;
  }

  function fromApi(data) {
    var out = [];
    (data.roles || []).forEach(function (r) {
      [['h', r.home], ['a', r.away]].forEach(function (s) {
        var p = s[1];
        if (p) out.push({ key: s[0] + '-' + r.key, side: s[0], name: p.name || '', heroId: p.heroId, dmg: opts.value(p) || 0 });
      });
    });
    return out;
  }

  function refresh() {
    if (debugMode) { if (!list.length) render(sample()); return null; }
    if (busy) return busy;
    lastFetch = Date.now();
    busy = fetch('/api/post-items', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (d) { if (!debugMode) render(fromApi(d)); }).catch(function () {}).then(function () { busy = false; });
    return busy;
  }

  // Live while shown (or while sliding in): at most once per second.
  HokPoll.register(function () {
    if (panel.classList.contains('show') && Date.now() - lastFetch > 1000) refresh();
  });

  /* ── Debug ── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function sample() {
    var ids = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
    return ids.map(function (id, i) {
      var side = i % 2 ? 'a' : 'h';
      return { key: side + '-s' + i, side: side, name: 'PLAYER ' + (i + 1), heroId: id, dmg: 90000 - i * 7000 };
    });
  }
  function clone() { return (list.length ? list : sample()).map(function (p) { return Object.assign({}, p); }); }
  function rand(a, b) { return Math.round(a + rng() * (b - a)); }

  function shuffleStep() {
    var ps = clone();
    if (ps.length < 2) return render(ps);
    // One overtake of 1–4 places, guaranteed visible…
    var i = rand(1, ps.length - 1), jump = Math.min(i, rand(1, 4)), target = ps[i - jump];
    ps[i].dmg = target.dmg + rand(500, 4000);
    // …plus two small bumps elsewhere (may or may not reorder).
    for (var n = 0; n < 2; n++) { var j = rand(0, ps.length - 1); if (j !== i) ps[j].dmg += rand(300, 3000); }
    render(ps);
  }
  function climbStep() {
    var ps = clone();
    if (ps.length < 2) return render(ps);
    ps[ps.length - 1].dmg = ps[0].dmg + rand(2000, 6000);
    render(ps);
  }
  function stopAuto() { clearInterval(autoTimer); autoTimer = null; }
  function exitDebug() { debugMode = false; stopAuto(); lastFetch = 0; }

  function debug(mode, seed) {
    rng = seed ? mulberry32(seed) : Math.random;
    if (mode === 'live') { exitDebug(); refresh(); return; }
    debugMode = true;
    if (mode === 'climb') { stopAuto(); climbStep(); }
    else if (mode === 'auto') {
      if (autoTimer) { stopAuto(); return; }
      shuffleStep();
      autoTimer = setInterval(shuffleStep, 2500);
    } else { stopAuto(); shuffleStep(); }
  }

  // Hiding the panel ends any debug run, so the next show is real data.
  new MutationObserver(function () {
    if (!panel.classList.contains('show') && debugMode) exitDebug();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  return { refresh: refresh, debug: debug, isDebug: function () { return debugMode; } };
}

var HokDamageRank = HokRankPanel({ id: 'dr-panel', title: 'DAMAGE RANK', value: function (p) { return p.stats && p.stats.damage; } });
var HokGoldRank   = HokRankPanel({ id: 'gr-panel', title: 'GOLD RANK', coin: true, value: function (p) { return p.gold; } });
