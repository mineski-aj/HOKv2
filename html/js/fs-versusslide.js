// html/js/fs-versusslide.js — Versus Slide scene for fullscreen.html.
// Data: GET /api/versus-slide (lib/versusSlide.js): Match Board teams,
// scores, stage/series text, players in Match Board order, heroes from the
// draft. HOME frame left (Clash → Roam, left to right), AWAY frame right
// (mirrored frame art; same left-to-right order as the Match Board).
//   VersusSlide.show()  VersusSlide.hide()  VersusSlide.refresh()
var VersusSlide = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('vsl-page');
  var FRAME_SRC = '/assets/images/versus_slide/versus_background_orange.png';   // = versus_background.png with the black interior turned frame orange
  // Card columns between the frame art's gold dividers: [left, width].
  var COLS_H = [[24, 150], [176, 149], [327, 150], [478, 150], [629, 151]];
  var COLS_A = COLS_H.map(function (c) { return [803 - c[0] - c[1], c[1]]; }).reverse(); // mirrored frame
  var active = false, token = 0, hideTimer = null;

  (function build() {
    [['h', COLS_H], ['a', COLS_A]].forEach(function (t) {
      var side = t[0], html = '<img class="vsl-frame" src="' + FRAME_SRC + '" alt="">';
      t[1].forEach(function (c, i) {
        var id = 'vsl-' + side + i;
        var rank = side === 'h' ? 4 - i : i; // reveal centre-out (next to the VS first)
        html += '<div class="vsl-card" id="' + id + '" style="left:' + c[0] + 'px;width:' + c[1] + 'px;--d:' + (rank * 80) + 'ms">' +
          '<img class="vsl-hero" id="' + id + '-hero" alt="">' +
          '<img class="vsl-photo" id="' + id + '-photo" alt="">' +
          '<div class="vsl-shade"></div>' +
          '<div class="vsl-name" id="' + id + '-name"></div>' +
        '</div>';
      });
      $('vsl-team-' + side).innerHTML = html;
    });
  })();

  function setChain(img, urls) {
    var key = urls.join('|');
    if (img.dataset.chain === key) return;
    img.dataset.chain = key;
    var i = 0;
    img.style.visibility = urls.length ? '' : 'hidden';
    if (!urls.length) { img.removeAttribute('src'); return; }
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; img.style.visibility = 'hidden'; if (img.classList.contains('vsl-hero')) img.parentNode.classList.add('vsl-empty'); } };
    img.src = urls[0];
  }
  function squeeze(el) {
    el.style.transform = 'none';
    var w = el.clientWidth;
    if (w && el.scrollWidth > w) el.style.transform = 'scaleX(' + (w / el.scrollWidth) + ')';
  }
  // Fit names after Radikal has really loaded (it only starts loading once the
  // scene is displayed, so document.fonts.ready alone can resolve too early).
  function squeezeAll() {
    var go = function () { page.querySelectorAll('.vsl-name').forEach(squeeze); };
    go();
    if (document.fonts && document.fonts.load) document.fonts.load('500 19px Radikal').then(go, go);
  }
  // "BTR.Zannnn" → "BTR. ZANNNN" (uppercase via CSS)
  function displayName(n) { return (n || '').replace(/^([^.\s]+)\.\s*/, '$1. '); }

  function fillCard(id, p) {
    var name = p && p.name;
    $(id + '-name').textContent = name ? displayName(name) : '';
    $(id).classList.toggle('vsl-empty', !(p && p.heroId));   // no hero (yet) → frame-orange card
    setChain($(id + '-hero'), p && p.heroId ? [hokAsset('hero/full/' + p.heroId + '_FHD.png'), hokAsset('hero/draftpick/' + p.heroId + '_TINGGI.png')] : []);
    var hb = function (f) { return hokAsset('images/photo/' + f + '.png'); };
    setChain($(id + '-photo'), name ? [hb(name + (id.charAt(4) === 'h' ? '_RIGHT' : '_LEFT')), hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO] : [HOK_DEFAULT_PHOTO]);
  }

  function apply(data) {
    [['h', data.home || {}], ['a', data.away || {}]].forEach(function (t) {
      var s = t[0], team = t[1];
      hokSetText($('vsl-abbr-' + s), team.abbr || '');
      hokSetText($('vsl-score-' + s), team.score || 0);
      setChain($('vsl-logo-' + s), team.abbr ? [hokLogo(team.abbr)] : []);
      setChain($('vsl-flag-' + s), team.country ? [hokAsset('images/flags/' + team.country + '.png')] : []);
      var players = team.players || [];
      for (var i = 0; i < 5; i++) fillCard('vsl-' + s + i, players[i]);
    });
    hokSetText($('vsl-stage'), data.stageText || '');
    hokSetText($('vsl-series'), data.seriesText || '');
    if (page.classList.contains('vsl-on')) squeezeAll();
  }

  function fetchData() {
    return fetch('/api/versus-slide', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
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
    FsShared.claim('versusslide', { ownHeader: true });
    return fetchData().then(function (data) {
      if (my !== token) return;
      apply(data);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('vsl-on');
        squeezeAll();
        void page.offsetWidth;
        page.classList.add('vsl-visible');
        FsShared.reveal('versusslide', null, { ownHeader: true });
        page.classList.remove('vsl-enter');               // replay the entry animation every show
        void page.offsetWidth;
        requestAnimationFrame(function () { if (my === token) page.classList.add('vsl-enter'); });
      });
    });
  }

  // Re-read the data while on air (Match Board / draft changed) — no animation.
  function refresh() {
    if (!active) return;
    var my = token;
    fetchData().then(function (data) { if (my === token && active) apply(data); });
  }

  function hide() {
    ++token;
    active = false;
    page.classList.remove('vsl-visible');
    FsShared.release('versusslide');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('vsl-on', 'vsl-enter'); }, 420);
  }

  return { show: show, hide: hide, refresh: refresh, isActive: function () { return active; } };
})();
