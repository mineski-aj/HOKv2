// html/js/fs-postgoldgraph.js — Post Gold Graph scene for fullscreen.html.
// Data: GET /api/post-gold-graph (lib/postGoldGraph.js). Gold-difference
// curve from HOME's side (orange above the line = HOME ahead, grey below =
// AWAY ahead), team objective/gold/KDA/tower totals above (HOME) and below (AWAY).
//   PostGoldGraph.show()  PostGoldGraph.hide()
var PostGoldGraph = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('pgg-page');
  var NS = 'http://www.w3.org/2000/svg';

  var COLS = [
    { key: 'tyrant',         label: 'TYRANT',                cx: 284 },
    { key: 'shadowTyrant',   label: 'SHADOW<br>TYRANT',      cx: 481 },
    { key: 'tempestDragon',  label: 'TEMPEST<br>DRAGON',     cx: 681 },
    { key: 'overlord',       label: 'OVERLORD',              cx: 888 },
    { key: 'shadowOverlord', label: 'SHADOW<br>OVERLORD',    cx: 1096 },
    { key: 'gold',           label: 'GOLD',                  cx: 1289, fmt: fmtK },
    { key: 'kda',            label: 'KDA',                   cx: 1461 },
    { key: 'towers',         label: 'TOWERS',                cx: 1641 },
  ];
  // Graph geometry in SVG units (SVG box = canvas x 210..1860, y 515..755).
  var W = 1650, H = 240, MID = 120, AMP = 110;
  var X0 = 80, X1 = 1424;            // t = 0 → canvas x 290, t = end → canvas x 1634
  var TICKS = 4;                     // 0, 1/3, 2/3, end

  // Stand-in icons until real art is dropped at assets/images/icons/<key>.png
  var ORANGE = '#ff8a1a';
  function svgIcon(body) { return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' + body + '</svg>'); }
  var FLAME = '<path fill="' + ORANGE + '" d="M16 2c2 6 9 9 9 17a9 9 0 0 1-18 0c0-4 2-7 4-9 0 3 1 5 3 6-1-5 0-10 2-14z"/>';
  var ICONS = {
    tyrant: svgIcon(FLAME), shadowTyrant: svgIcon(FLAME), tempestDragon: svgIcon(FLAME), overlord: svgIcon(FLAME), shadowOverlord: svgIcon(FLAME),
    gold: svgIcon('<circle cx="16" cy="16" r="13" fill="' + ORANGE + '"/><text x="16" y="22" font-size="17" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">$</text>'),
    kda: svgIcon('<circle cx="16" cy="7" r="4" fill="' + ORANGE + '"/><path fill="' + ORANGE + '" d="M7 13h18v4h-6v13h-6V17H7z"/>'),
    towers: svgIcon('<path fill="' + ORANGE + '" d="M8 4h4v4h3V4h2v4h3V4h4v8l-3 3v13H11V15l-3-3z"/>'),
  };

  var active = false, token = 0, hideTimer = null;

  function fmtK(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(Math.round(v)); }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }

  /* ── Static build: stat columns, graph skeleton ── */
  (function build() {
    ['h', 'a'].forEach(function (side) {
      $('pgg-stats-' + side).innerHTML = COLS.map(function (c) {
        return '<div class="pgg-col" style="left:' + (c.cx - 194 - 90) + 'px">' +
          '<img id="pgg-' + side + '-' + c.key + '-icon" alt="">' +
          '<div class="k">' + c.label + '</div>' +
          '<div class="v" id="pgg-' + side + '-' + c.key + '">0</div></div>';
      }).join('');
      COLS.forEach(function (c) {
        var img = $('pgg-' + side + '-' + c.key + '-icon');
        img.onerror = function () { img.onerror = null; img.src = ICONS[c.key]; };
        img.src = '/assets/images/icons/' + c.key + '.png';
      });
    });

    var svg = $('pgg-graph');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var defs = el('defs');
    var reveal = el('clipPath', { id: 'pgg-clip-reveal' });
    reveal.appendChild(el('rect', { class: 'pgg-reveal', x: 0, y: -20, width: W, height: H + 40 }));
    var top = el('clipPath', { id: 'pgg-clip-top' }); top.appendChild(el('rect', { x: 0, y: -20, width: W, height: MID + 20 }));
    var bot = el('clipPath', { id: 'pgg-clip-bot' }); bot.appendChild(el('rect', { x: 0, y: MID, width: W, height: H - MID + 20 }));
    defs.appendChild(reveal); defs.appendChild(top); defs.appendChild(bot);
    svg.appendChild(defs);
    var g = el('g', { 'clip-path': 'url(#pgg-clip-reveal)' });
    var gTop = el('g', { 'clip-path': 'url(#pgg-clip-top)' });   gTop.appendChild(el('path', { class: 'pgg-area-home', id: 'pgg-area-home' }));
    var gBot = el('g', { 'clip-path': 'url(#pgg-clip-bot)' });   gBot.appendChild(el('path', { class: 'pgg-area-away', id: 'pgg-area-away' }));
    g.appendChild(gTop); g.appendChild(gBot);
    svg.appendChild(g);
    for (var i = 0; i < TICKS; i++) {
      var x = X0 + (X1 - X0) * i / (TICKS - 1);
      svg.appendChild(el('line', { class: 'pgg-tick', x1: x, y1: MID - AMP, x2: x, y2: MID + AMP }));
    }
    svg.appendChild(el('line', { class: 'pgg-base', x1: 10, y1: MID, x2: W - 10, y2: MID }));
    svg.appendChild(el('path', { class: 'pgg-diamond', d: 'M2 ' + MID + ' l8 -6 l8 6 l-8 6z' }));
    svg.appendChild(el('path', { class: 'pgg-diamond', d: 'M' + (W - 18) + ' ' + MID + ' l8 -6 l8 6 l-8 6z' }));
  })();

  // Nice scale: round the biggest lead up to a step so the labels read cleanly.
  function niceMax(v) {
    v = Math.max(v, 1000);
    var steps = [1000, 2000, 2500, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 10000) * 10000;
  }

  function apply(data) {
    [['h', data.homeStats || {}], ['a', data.awayStats || {}]].forEach(function (t) {
      COLS.forEach(function (c) {
        var v = t[1][c.key];
        hokSetText($('pgg-' + t[0] + '-' + c.key), c.fmt ? c.fmt(v || 0) : (v === undefined ? 0 : v));
      });
    });
    var logo = function (img, abbr) { if (!abbr) return; img.onerror = function () { img.style.visibility = 'hidden'; }; img.style.visibility = ''; hokSetSrc(img, hokLogo(abbr)); };
    logo($('pgg-logo-h'), (data.home || {}).abbr);
    logo($('pgg-logo-a'), (data.away || {}).abbr);

    var tl = (data.timeline || []).slice();
    var T = Math.max(data.gameTime || 0, tl.length ? tl[tl.length - 1][0] : 0, 1);
    var max = niceMax(tl.reduce(function (m, s) { return Math.max(m, Math.abs(s[1])); }, 0));
    var px = function (t) { return X0 + (X1 - X0) * Math.min(1, t / T); };
    var py = function (d) { return MID - Math.max(-1, Math.min(1, d / max)) * AMP; };

    // One closed area to the centre line; the top half is clipped orange, the bottom grey.
    var d = 'M' + px(tl.length ? tl[0][0] : 0).toFixed(1) + ' ' + MID;
    tl.forEach(function (s) { d += ' L' + px(s[0]).toFixed(1) + ' ' + py(s[1]).toFixed(1); });
    d += ' L' + px(tl.length ? tl[tl.length - 1][0] : T).toFixed(1) + ' ' + MID + ' Z';
    $('pgg-area-home').setAttribute('d', d);
    $('pgg-area-away').setAttribute('d', d);

    var times = '';
    for (var i = 0; i < TICKS; i++) times += '<span style="left:' + (X0 + (X1 - X0) * i / (TICKS - 1)) + 'px">' + fmtTime(T * i / (TICKS - 1)) + '</span>';
    $('pgg-times').innerHTML = times;
    var lbl = function (v, y) { return '<span style="top:' + y + 'px">' + fmtK(v) + '</span>'; };
    $('pgg-ylabels').innerHTML = lbl(max, MID - AMP) + lbl(max / 2, MID - AMP / 2) + lbl(max / 2, MID + AMP / 2) + lbl(max, MID + AMP);
  }

  function fetchData() {
    return fetch('/api/post-gold-graph', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
  }
  function preload(ms) {
    var imgs = Array.prototype.slice.call(page.querySelectorAll('img')).filter(function (i) { return i.getAttribute('src') && i.style.visibility !== 'hidden'; });
    var waits = imgs.map(function (i) { return i.decode ? i.decode().catch(function () {}) : null; });
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    return Promise.race([Promise.all(waits), new Promise(function (r) { setTimeout(r, ms); })]);
  }

  function show() {
    var my = ++token;
    active = true;
    clearTimeout(hideTimer);
    FsShared.claim('postgoldgraph', { gameInfo: true });
    return fetchData().then(function (data) {
      if (my !== token) return;
      apply(data);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('pgg-on');
        void page.offsetWidth;
        page.classList.add('pgg-visible');
        FsShared.reveal('postgoldgraph', data, { gameInfo: true });
        page.classList.remove('pgg-grown');
        void page.offsetWidth;
        setTimeout(function () { if (my === token) page.classList.add('pgg-grown'); }, 300);
      });
    });
  }

  function hide() {
    ++token;
    active = false;
    page.classList.remove('pgg-visible');
    FsShared.release('postgoldgraph');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('pgg-on', 'pgg-grown'); }, 420);
  }

  return { show: show, hide: hide, isActive: function () { return active; } };
})();
