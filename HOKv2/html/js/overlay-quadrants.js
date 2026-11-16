// html/js/overlay-quadrants.js — In-Game Overlay quadrant manager.
// The 1920x1080 frame is split into four quadrants: top, bottom, left, right.
// Panels in DIFFERENT quadrants can be live at the same time. Panels in the
// SAME quadrant replace each other: the one that's up animates OUT first, then
// the new one animates IN (never both at once).
//   HokQuadrants.register(key, quadrant, element, { outMs, onShow })
//      outMs  = length of the panel's hide animation (CSS transition on .show)
//      onShow = optional fn run before animating in; may return a Promise
//               (e.g. fetch data) — the panel waits for it (max 800 ms)
//   HokQuadrants.set(key, shown)   show(key)   hide(key)
// Show/hide = toggling .show on the panel element; each panel's CSS owns its
// own in/out animation. The server applies the same rule (INGAME_QUADRANTS in
// routes/overlay.js), so live Control matches what the page does.
var HokQuadrants = (function () {
  var panels = {}, current = {}, busyUntil = {}, timers = {};

  function register(key, quadrant, el, opts) {
    opts = opts || {};
    panels[key] = { q: quadrant, el: el, outMs: opts.outMs || 500, onShow: opts.onShow };
  }
  function animateIn(key) {
    var p = panels[key];
    var ready = p.onShow ? p.onShow() : null;
    var go = function () { if (current[p.q] === key) p.el.classList.add('show'); };
    if (ready && ready.then) Promise.race([ready, new Promise(function (r) { setTimeout(r, 800); })]).then(go, go);
    else go();
  }
  function animateOut(key) {
    var p = panels[key];
    if (!p.el.classList.contains('show')) return;
    p.el.classList.remove('show');
    busyUntil[p.q] = Math.max(busyUntil[p.q] || 0, Date.now() + p.outMs);
  }
  function show(key) {
    var p = panels[key];
    if (!p) return;
    var q = p.q, cur = current[q];
    if (cur === key && p.el.classList.contains('show')) return;
    clearTimeout(timers[q]);
    if (cur && cur !== key) animateOut(cur);
    current[q] = key;
    var wait = (busyUntil[q] || 0) - Date.now();
    if (wait > 0) timers[q] = setTimeout(function () { if (current[q] === key) animateIn(key); }, wait);
    else animateIn(key);
  }
  function hide(key) {
    var p = panels[key];
    if (!p) return;
    if (current[p.q] === key) { current[p.q] = null; clearTimeout(timers[p.q]); }
    animateOut(key);
  }
  return {
    register: register, show: show, hide: hide,
    set: function (key, shown) { if (shown) show(key); else hide(key); },
    has: function (key) { return !!panels[key]; },
  };
})();
