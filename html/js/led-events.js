// html/js/led-events.js — LED Events. Always live.
// Synced with Draft Pick: data = GET /api/versus-slide (same hero rule as Draft Pick: dashboard
// role-swap override once the draft is complete / MANUAL, else the camp's i-th pick), re-read at most
// once a second. A hero that ENTERS a side's picked set plays across that side's WHOLE LED table: flat colour sweeps + hero slam-in ->
// hold ~2 s -> matte out (reverse of MATTE 2.mov). The first read after load is a baseline (a reload
// mid-draft stays silent); swaps/reorders never replay. No show/hide.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var HOLD_MS = 2000;               // time the hero stays after it has landed
  var IN_MS = 770;                  // longest in-animation end (delay + duration)
  var OUT_MS = 1500;                // matte-out length (46 frames @ 30 fps)
  var SAMPLE_HEROES = [142, 141, 111, 119, 521, 547];
  var LOOK = ['y', 'c', 'o'];       // sweep bars: yellow, cyan, orange (flat brand colours)

  (function build() {
    ['home', 'away'].forEach(function (side) {
      $('le-' + side).innerHTML = '<div class="le-inner" id="' + side + '-inner">' +
        '<img class="le-hero" id="' + side + '-hero" alt="">' +
        LOOK.map(function (k) { return '<div class="le-bar ' + k + '"></div>'; }).join('') +
        '<div class="le-edge"></div></div>';
    });
  })();

  var tokens = {};                  // side -> latest play token (a newer pick cancels an older one)

  function decoded(img, ms) {
    return Promise.race([img.decode ? img.decode().catch(function () {}) : Promise.resolve(), new Promise(function (r) { setTimeout(r, ms); })]);
  }
  function anim(el, frames, opts) {
    try { return el.animate(frames, Object.assign({ fill: 'both' }, opts)); } catch (e) { return null; }
  }

  // The hero's FHD art spans the whole LED table of that side.
  function play(side, heroId) {
    var table = $('le-' + side), inner = $(side + '-inner'), img = $(side + '-hero');
    var my = (tokens[side] = (tokens[side] || 0) + 1);
    inner.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
    inner.classList.remove('out');
    table.classList.remove('on');
    img.src = hokAsset('hero/full/' + heroId + '_FHD.png');
    decoded(img, 200).then(function () {
      if (tokens[side] !== my) return;
      table.classList.add('on');
      void table.offsetWidth;
      var bars = inner.querySelectorAll('.le-bar');
      // flat colour blocks sweep left -> right across the table, 70 ms apart
      for (var b = 0; b < bars.length; b++) {
        anim(bars[b], [
          { transform: 'translateX(-120%) skewX(-18deg)', opacity: 1 },
          { transform: 'translateX(310%) skewX(-18deg)', opacity: 1 },
        ], { duration: 600, delay: b * 70, easing: 'cubic-bezier(.6,0,.3,1)' });
      }
      // hero lands from a big, skewed, blurred start (overshoots a touch, then settles)
      anim(img, [
        { opacity: 0, transform: 'translateX(-60px) scale(1.3) skewX(7deg)', filter: 'blur(7px)', offset: 0 },
        { opacity: 1, filter: 'blur(0px)', offset: 0.34 },
        { opacity: 1, transform: 'translateX(6px) scale(0.975) skewX(-1deg)', filter: 'blur(0px)', offset: 0.74 },
        { opacity: 1, transform: 'translateX(0) scale(1) skewX(0)', filter: 'blur(0px)', offset: 1 },
      ], { duration: 650, delay: 120, easing: 'cubic-bezier(.16,1,.3,1)' });
      // impact: short shake + edge pulse as it lands
      anim(inner.querySelector('.le-edge'), [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 0.75 }, { opacity: 0 }], { duration: 560, delay: 330 });
      anim(inner, [
        { transform: 'translate(0,0)' }, { transform: 'translate(-9px,4px)' }, { transform: 'translate(7px,-4px)' },
        { transform: 'translate(-4px,2px)' }, { transform: 'translate(0,0)' },
      ], { duration: 280, delay: 400 });
      // hold, then matte out
      setTimeout(function () {
        if (tokens[side] !== my) return;
        inner.getAnimations().forEach(function (a) { a.cancel(); });
        inner.classList.add('out');
        setTimeout(function () {
          if (tokens[side] !== my) return;
          table.classList.remove('on');
          inner.classList.remove('out');
          inner.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
        }, OUT_MS + 60);
      }, IN_MS + HOLD_MS);
    });
  }

  // ── Draft sync ──
  var warm = {}, seen = { home: {}, away: {} };
  var GONE_MS = 6000;               // a hero must be absent this long before re-entering counts as a new pick
  var prev = null, busy = false, again = false, lastFetch = 0;
  function apply(data) {
    var cur = { home: {}, away: {} }, heroes = { home: [], away: [] };
    [['home', data.home], ['away', data.away]].forEach(function (t) {
      ((t[1] && t[1].players) || []).forEach(function (p, i) {
        var h = parseInt(p.heroId, 10) || 0;
        heroes[t[0]][i] = h;
        if (h) cur[t[0]][h] = true;
      });
    });
    if (prev) {
      ['home', 'away'].forEach(function (side) {
        heroes[side].forEach(function (h, i) { if (h && !prev[side][h]) play(side, h); });
      });
    }
    // warm the cache for heroes already in the draft; and for every NEW hero the 2.4 MB FHD is the slowest part
    ['home', 'away'].forEach(function (side) { heroes[side].forEach(function (h) { if (h && !warm[h]) { warm[h] = new Image(); warm[h].src = hokAsset('hero/full/' + h + '_FHD.png'); } }); });
    prev = cur;
  }
  function fetchData() {
    if (busy) { again = true; return; }   // a save arrived mid-request: re-read right after it
    busy = true; lastFetch = Date.now();
    fetch('/api/versus-slide?draftOnly=1', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(apply).catch(function () {}).then(function () {
      busy = false;
      if (again) { again = false; fetchData(); }
    });
  }
  // Same cadence as Draft Pick (every 500 ms poll) + an immediate re-read the moment the dashboard saves
  // (MANUAL mode picks arrive as a dashboard save, so waiting for the next tick was the visible delay).
  HokPoll.register(function (data) {
    $('le-guide').classList.toggle('on', !!(data.state && data.state.ledevents_guide));   // crop guide (dashboard toggle)
    fetchData();
  });
  HokPoll.start({ sources: ['state'], interval: 500 });
  var sse = createOverlaySSE();
  sse.addEventListener('reload', function () { location.reload(); });
  sse.addEventListener('appstate', function () { fetchData(); });

  // Dashboard ◈ test: previewTrigger('ledpick', 'home:2') plays a sample hero across the HOME table (the number only picks which sample).
  window.previewTrigger = function (event, action) {
    if (event !== 'ledpick') return;
    var p = String(action || '').split(':'), side = p[0] === 'away' ? 'away' : 'home', i = Math.max(0, Math.min(4, parseInt(p[1], 10) || 0));
    play(side, SAMPLE_HEROES[(i + (side === 'away' ? 1 : 0)) % SAMPLE_HEROES.length]);
  };
})();
