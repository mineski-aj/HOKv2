// html/js/led-events.js — LED Events. Always live.
// Synced with Draft Pick: data = GET /api/versus-slide (same hero rule as Draft Pick: dashboard
// role-swap override once the draft is complete / MANUAL, else the camp's i-th pick), re-read at most
// once a second. A hero that ENTERS a side's picked set plays across that side's WHOLE LED table: MATTE 6 reveal ->
// hold ~2 s -> matte out (reverse of MATTE 2.mov). The first read after load is a baseline (a reload
// mid-draft stays silent); swaps/reorders never replay. No show/hide.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var HOLD_MS = 2000;               // time the hero stays after it has landed
  var IN_MS = 1000;                 // MATTE 6 is fully open at ~0.75 s; the hold starts here
  var ZOOM_TO = 1.1;                // slow push-in over the hero's whole time on screen
  var SHAKE_AT_MS = 800;            // small shake as the MATTE 6 reveal completes
  var OUT_MS = 1500;                // matte-out length (46 frames @ 30 fps)
  var SAMPLE_HEROES = [142, 141, 111, 119, 521, 547];

  (function build() {
    ['home', 'away'].forEach(function (side) {
      $('le-' + side).innerHTML = '<div class="le-inner" id="' + side + '-inner"><div class="le-shake" id="' + side + '-shake"><img class="le-hero" id="' + side + '-hero" alt=""></div></div>';
    });
  })();

  var tokens = {};                  // side -> latest play token (a newer pick cancels an older one)

  function decoded(img, ms) {
    return Promise.race([img.decode ? img.decode().catch(function () {}) : Promise.resolve(), new Promise(function (r) { setTimeout(r, ms); })]);
  }

  // The hero's FHD art spans the whole LED table of that side: revealed by MATTE 6, held, wiped by MATTE 2 (reversed).
  function play(side, heroId, done) {
    var table = $('le-' + side), inner = $(side + '-inner'), shake = $(side + '-shake'), img = $(side + '-hero');
    var my = (tokens[side] = (tokens[side] || 0) + 1);
    inner.getAnimations().forEach(function (a) { a.cancel(); });
    shake.getAnimations().forEach(function (a) { a.cancel(); });
    img.getAnimations().forEach(function (a) { a.cancel(); });
    inner.classList.remove('in', 'out');
    table.classList.remove('on');
    img.src = hokAsset('hero/full/' + heroId + '_FHD.png');
    decoded(img, 200).then(function () {
      if (tokens[side] !== my) return;
      void inner.offsetWidth;                 // restart the mask animation from its first frame
      inner.classList.add('in');
      table.classList.add('on');
      // Not-still: a slow push-in on the hero for its whole time on screen (reveal + hold + wipe),
      // and one small shake as the reveal completes.
      try {
        img.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + ZOOM_TO + ')' }], { duration: IN_MS + HOLD_MS + OUT_MS, easing: 'linear', fill: 'both' });
        shake.animate([   // shakes the IMAGE only (its wrapper), never the table / matte
          { transform: 'translate(0,0)' }, { transform: 'translate(-7px,3px)' }, { transform: 'translate(6px,-4px)' },
          { transform: 'translate(-4px,2px)' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(0,0)' },
        ], { duration: 360, delay: SHAKE_AT_MS, easing: 'ease-out', fill: 'both' });
      } catch (e) {}
      setTimeout(function () {                // hold, then matte out
        if (tokens[side] !== my) return;
        inner.classList.remove('in');
        inner.classList.add('out');
        setTimeout(function () {
          if (tokens[side] !== my) return;
          table.classList.remove('on');
          inner.classList.remove('out');
          inner.getAnimations().forEach(function (a) { a.cancel(); });
          shake.getAnimations().forEach(function (a) { a.cancel(); });
          img.getAnimations().forEach(function (a) { a.cancel(); });
          if (done) done();
        }, OUT_MS + 60);
      }, IN_MS + HOLD_MS);
    });
  }

  // ── Queue: one hero at a time per LED table. Two picks at once (same side) play one after the other. ──
  var queue = { home: [], away: [] }, running = { home: false, away: false };
  function next(side) {
    var h = queue[side].shift();
    if (!h) { running[side] = false; return; }
    running[side] = true;
    play(side, h, function () { next(side); });
  }
  function enqueue(side, heroId) {
    if (queue[side].indexOf(heroId) < 0) queue[side].push(heroId);
    if (!running[side]) next(side);
  }

  // ── Draft sync ──
  var warm = {}, seen = { home: {}, away: {} };   // (seen/queue are re-created when the camp mapping changes)
  var GONE_MS = 6000;               // a hero must be absent this long before re-entering counts as a new pick
  var prev = null, busy = false, again = false, lastFetch = 0;
  var mapKey = null;
  function apply(data) {
    // First Pick / swap changed = the heroes just moved between tables, not new picks: re-baseline silently.
    if (mapKey !== null && mapKey !== (data.homeCamp + ':' + data.manual)) { prev = null; seen = { home: {}, away: {} }; queue = { home: [], away: [] }; }
    mapKey = data.homeCamp + ':' + data.manual;
    var cur = { home: {}, away: {} }, heroes = { home: [], away: [] };
    [['home', data.home], ['away', data.away]].forEach(function (t) {
      ((t[1] && t[1].players) || []).forEach(function (p, i) {
        var h = parseInt(p.heroId, 10) || 0;
        heroes[t[0]][i] = h;
        if (h) cur[t[0]][h] = true;
      });
    });
    // A hero only counts as NEW if it hasn't been in the set for GONE_MS. A single bad read (file mid-write,
    // a slot briefly empty) used to drop a hero and then "re-pick" it on the next read = the animation replayed.
    var now = Date.now();
    ['home', 'away'].forEach(function (side) {
      heroes[side].forEach(function (h) {
        if (!h) return;
        if (prev && !(now - (seen[side][h] || 0) < GONE_MS)) enqueue(side, h);
        seen[side][h] = now;
      });
    });
    // warm the cache for heroes already in the draft; and for every NEW hero the 2.4 MB FHD is the slowest part
    ['home', 'away'].forEach(function (side) { heroes[side].forEach(function (h) { if (h && !warm[h]) { warm[h] = new Image(); warm[h].src = hokAsset('hero/full/' + h + '_FHD.png'); } }); });
    prev = cur;
  }
  function fetchData() {
    if (busy) { again = true; return; }   // a save arrived mid-request: re-read right after it
    busy = true; lastFetch = Date.now();
    fetch('/api/led-events', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(apply).catch(function () {}).then(function () {
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
    enqueue(side, SAMPLE_HEROES[(i + (side === 'away' ? 1 : 0)) % SAMPLE_HEROES.length]);
  };
})();
