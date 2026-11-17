// html/js/overlay-knc.js — kill & objective event renderer for overlay.html
// using the knckill video set (assets/webm/knckill/<TYPE>.webm: 1920x1080,
// transparent, 3 s). Every video has three empty slots baked in, in a
// different place per event (banner length differs):
//   square  yellow parallelogram  → player half-body photo (ACE: team logo)
//   plate   orange plate on top   → player name (ACE: full team name)
//   tab     small blue tab right  → team logo (not on ACED)
// Slot positions below were measured from the videos (frames 0.9–2.4 s).
// Slots settle at ~0.65 s and leave at ~2.65 s; content fades with them.
//   HokKnc.play(event, done)   HokKnc.hold(event)  (Edit/preview: freeze at 1.5 s)
var HokKnc = (function () {
  var $ = function (id) { return document.getElementById(id); };

  var IN_MS = 650, OUT_MS = 2600, END_MS = 3000;
  // file name per event type (ACE's video is called ACED)
  var FILE = { 'ACE': 'ACED' };
  // [squareX, squareY, plateX, plateY, plateW, plateH, hasTab]
  var GEOM = {
    'FIRST BLOOD':     [1060, 874, 634, 849, 261, 55, 1],
    'DOUBLE KILL':     [1060, 874, 634, 850, 261, 54, 1],
    'TRIPLE KILL':     [1060, 874, 643, 849, 253, 55, 1],
    'QUADRA KILL':     [1058, 874, 643, 848, 251, 56, 1],
    'PENTA KILL':      [1058, 874, 643, 848, 252, 56, 1],
    'ACE':             [988,  874, 772, 850, 249, 54, 0],
    'TYRANT':          [990,  832, 760, 808, 253, 52, 1],
    'OVERLORD':        [990,  832, 755, 808, 242, 52, 1],
    'FIRST TYRANT':    [1110, 840, 630, 816, 251, 55, 1],
    'FIRST OVERLORD':  [1110, 840, 630, 816, 254, 50, 1],
    'SHADOW TYRANT':   [1110, 840, 630, 816, 254, 50, 1],
    'SHADOW OVERLORD': [1110, 840, 635, 816, 249, 55, 1],
    'TEMPEST DRAGON':  [1110, 840, 636, 816, 247, 50, 1],
  };
  var timers = [];

  function videoUrl(type) { return hokAsset('webm/knckill/' + (FILE[type] || type) + '.webm'); }
  function photoUrls(name) {
    var hb = function (f) { return hokAsset('images/photo/HALF BODY/' + f + '.png'); };
    return [hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO];
  }
  function setChain(img, urls) {
    var i = 0;
    img.style.visibility = '';
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; img.style.visibility = 'hidden'; } };
    img.src = urls[0];
  }
  function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

  // Fill the slots for this event type. Inline left/top come from GEOM;
  // sizes/look are in overlay-events.css.
  function fill(ev) {
    var g = GEOM[ev.type] || GEOM['DOUBLE KILL'];
    var isAce = ev.type === 'ACE';
    var c = $('knc-container');
    c.classList.toggle('knc-ace', isAce);

    place($('knc-square'), g[0], g[1]);
    if (isAce) setChain($('knc-sqlogo'), [hokLogo(ev.logo)]);
    else setChain($('knc-photo'), photoUrls(ev.photo || ev.name));

    var name = $('knc-name');
    name.style.left = (g[2] + 8) + 'px';
    name.style.top = g[3] + 'px';
    name.style.width = (g[4] - 16) + 'px';
    name.style.height = name.style.lineHeight = g[5] + 'px';
    name.textContent = ev.name || '';

    $('knc-tablogo').style.display = g[6] ? '' : 'none';
    if (g[6]) { place($('knc-tablogo'), g[0] + 215, g[1] + 43); setChain($('knc-tablogo'), [hokLogo(ev.logo)]); }
  }

  // Shrink the name to its plate (call while laid out).
  function squeeze() {
    var el = $('knc-name');
    el.style.transform = 'none';
    var w = el.clientWidth;
    if (w && el.scrollWidth > w) el.style.transform = 'scaleX(' + (w / el.scrollWidth) + ')';
  }

  function clear() { timers.forEach(clearTimeout); timers = []; }

  function play(ev, done) {
    clear();
    var c = $('knc-container'), v = $('knc-vid');
    c.classList.remove('knc-in');
    v.src = videoUrl(ev.type);
    c.classList.add('show');
    fill(ev);
    squeeze();
    v.currentTime = 0;
    v.play().catch(function () {});
    timers.push(setTimeout(function () { c.classList.add('knc-in'); }, IN_MS));
    timers.push(setTimeout(function () { c.classList.remove('knc-in'); }, OUT_MS));
    timers.push(setTimeout(function () { c.classList.remove('show'); done && done(); }, END_MS));
  }

  // Freeze an event mid-animation with everything visible (Edit tab / checks).
  function hold(ev) {
    clear();
    var c = $('knc-container'), v = $('knc-vid');
    v.src = videoUrl(ev.type);
    v.addEventListener('loadeddata', function () { v.pause(); v.currentTime = 1.5; }, { once: true });
    c.classList.add('show');
    fill(ev);
    squeeze();
    c.classList.add('knc-in');
  }

  return { play: play, hold: hold, GEOM: GEOM };
})();
