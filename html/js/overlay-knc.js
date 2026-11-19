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
  // The plate leans right, so its visual centre sits right of the measured box centre (measured from the videos at 1.5 s).
  var NAME_DX = 8;
  var timers = [];

  function videoUrl(type) { return hokAsset('webm/knckill/' + (FILE[type] || type) + '.webm'); }
  function photoUrls(name) {
    var hb = function (f) { return hokAsset('images/photo/' + f + '.png'); };
    return [hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO];
  }
  function setChain(img, urls) {
    var i = 0;
    img.style.visibility = '';
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; img.style.visibility = 'hidden'; } };
    img.src = urls[0];
  }
  // ACE shows the team logo on the YELLOW square. Of a team's logo variants (LIGA / _2 / plain) pick the one
  // that sinks into yellow least: share of opaque pixels whose colour is close to the square's yellow.
  var YEL = [255, 205, 15], aceCache = {};
  function sinkScore(img) {
    try {
      var n = 48, c = document.createElement('canvas'); c.width = c.height = n;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
      var d = x.getImageData(0, 0, n, n).data, op = 0, bad = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        op++;
        var dr = d[i] - YEL[0], dg = d[i + 1] - YEL[1], db = d[i + 2] - YEL[2];
        if (Math.sqrt(dr * dr + dg * dg + db * db) < 110) bad++;
      }
      return op ? bad / op : 1;
    } catch (e) { return 1; }
  }
  function aceLogoUrls(abbr) {
    var f = (typeof HOK_LOGO_FILES !== 'undefined' && HOK_LOGO_FILES) || {}, out = [];
    var add = function (key, path) { if (!f || !Object.keys(f).length || f[key]) out.push(hokAsset('images/logo/' + path)); };
    add('LIGA/' + abbr + '.png', 'LIGA/' + abbr + '.png');
    add(abbr + '_2.png', abbr + '_2.png');
    add(abbr + '.png', abbr + '.png');
    return out;
  }
  function pickAceLogo(abbr, img) {
    if (aceCache[abbr]) { img.src = aceCache[abbr]; return; }
    var urls = aceLogoUrls(abbr), best = null, left = urls.length;
    if (!left) return;
    var settle = function () { if (--left === 0 && best) { aceCache[abbr] = best.url; if ($('knc-sqlogo') === img) img.src = best.url; } };
    urls.forEach(function (u, idx) {
      var t = new Image();
      t.onload = function () {
        var sc = sinkScore(t) + idx * 0.001;   // tie → earlier (LIGA, then _2) wins
        if (!best || sc < best.score) best = { url: u, score: sc };
        settle();
      };
      t.onerror = settle;
      t.src = u;
    });
  }
  // Logo PNGs often carry uneven transparent padding, so a "centred" box looks off-centre. On every load, shift the
  // image so the centre of its OPAQUE pixels sits on the centre of its box.
  function centerLogo(img) {
    img.style.transform = '';
    try {
      var w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
      var n = 96, c = document.createElement('canvas'); c.width = c.height = n;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
      var d = x.getImageData(0, 0, n, n).data, x0 = n, x1 = -1, y0 = n, y1 = -1;
      for (var i = 0; i < n * n; i++) {
        if (d[i * 4 + 3] < 40) continue;
        var px = i % n, py = (i / n) | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
      if (x1 < 0) return;
      // canvas was stretched to n x n: its centre offset (fraction of the image) → box pixels via the contain scale
      var k = Math.min(img.clientWidth / w, img.clientHeight / h);
      var dx = ((x0 + x1 + 1) / 2 / n - 0.5) * w * k, dy = ((y0 + y1 + 1) / 2 / n - 0.5) * h * k;
      img.style.transform = 'translate(' + (-dx).toFixed(1) + 'px,' + (-dy).toFixed(1) + 'px)';
    } catch (e) {}
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
    $('knc-sqlogo').onload = $('knc-tablogo').onload = function () { centerLogo(this); };
    if (isAce) { setChain($('knc-sqlogo'), [hokLogo(ev.logo)]); pickAceLogo(ev.logo, $('knc-sqlogo')); }
    else setChain($('knc-photo'), photoUrls(ev.photo || ev.name));

    var name = $('knc-name');
    name.style.left = (g[2] + 8 + NAME_DX) + 'px';
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
