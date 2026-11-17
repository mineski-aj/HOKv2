// html/js/fs-headtohead.js — Head to Head scene for fullscreen.html.
// Data: GET /api/head-to-head?role=<role> (lib/headToHead.js): Match Board
// Team 1 (left) vs Team 2 (right), the role's Match Board players, stats over
// every recorded game (lib/playerHistory.js). Own header (FsShared ownHeader).
//   HeadToHead.show()  .hide()  .setRole(role)  .refresh()
var HeadToHead = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('h2h-page');
  var ROW_Y = [69, 195, 310, 438];          // row centres inside the box (reference: y 462 / 588 / 703 / 831)
  var DIV_Y = [128, 256, 377];              // dividers (reference: y 521 / 649 / 770)
  var VAL_MAX_W = 128, VAL_FONT = 90;
  var ROLE_ICON = { clash: 'clash-lane', jungler: 'jungler', mid: 'mid-lane', farm: 'farm-lane', roamer: 'roamer' };
  var role = 'clash', active = false, token = 0, hideTimer = null, inTimer = null;
  var OUT_MS = 300, IN_MS = 1100;

  (function build() {
    var tip = 'fill="rgba(235,242,255,0.95)"';
    var svg = '<svg viewBox="0 0 527 10" width="527" height="10"><rect x="8" y="5" width="511" height="1.6" ' + tip + '/>' +
      '<polygon points="0,6 30,1.5 30,6.6" ' + tip + '/><polygon points="527,6 497,1.5 497,6.6" ' + tip + '/></svg>';
    var html = '';
    ROW_Y.forEach(function (y, i) {
      html += '<div class="h2h-row" style="top:' + (y - 55) + 'px;--i:' + i + '">' +
        '<div class="h2h-val h" id="h2h-v' + i + 'h"></div><div class="h2h-label" id="h2h-l' + i + '"></div><div class="h2h-val a" id="h2h-v' + i + 'a"></div></div>';
    });
    DIV_Y.forEach(function (y) { html += '<div class="h2h-div" style="top:' + (y - 5) + 'px">' + svg + '</div>'; });
    $('h2h-box').innerHTML = html;
  })();

  function setChain(img, urls) {
    var key = urls.join('|');
    if (img.dataset.chain === key) return;
    img.dataset.chain = key;
    var i = 0;
    // Inside a name plate a missing image collapses (display none) so the flex group stays centred.
    var gone = function () { if (img.closest('.h2h-plate')) img.style.display = 'none'; else img.style.visibility = 'hidden'; };
    img.style.visibility = ''; img.style.display = '';
    if (!urls.length) { img.removeAttribute('src'); gone(); return; }
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; gone(); } };
    img.src = urls[0];
  }
  function photoUrls(name, side) {
    if (!name) return [];
    var hb = function (f) { return hokAsset('images/photo/HALF BODY/' + f + '.png'); };
    return [hb(name + (side === 'h' ? '_LEFT' : '_RIGHT')), hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO];
  }
  // Values shrink (font-size) to fit the column, like the reference's "25645".
  function fitVal(el) {
    el.style.fontSize = VAL_FONT + 'px';
    var w = el.scrollWidth;
    if (w > VAL_MAX_W) el.style.fontSize = Math.floor(VAL_FONT * VAL_MAX_W / w) + 'px';
  }
  function squeeze(span) {
    span.style.transform = 'none';
    var max = parseFloat(getComputedStyle(span.parentNode).maxWidth) || span.parentNode.clientWidth;
    if (max && span.scrollWidth > max) span.style.transform = 'scaleX(' + (max / span.scrollWidth).toFixed(3) + ')';
  }
  function fitAll() {
    var go = function () {
      page.querySelectorAll('.h2h-val').forEach(fitVal);
      page.querySelectorAll('.h2h-pname span').forEach(squeeze);
    };
    go();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 90px KIC2025'), document.fonts.load('500 31px Radikal')]).then(go, go);
  }

  function apply(d) {
    role = d.role || role;
    $('h2h-role-icon').style.setProperty('--icon', "url('/assets/images/role/" + (ROLE_ICON[role] || 'clash-lane') + ".png')");
    hokSetText($('h2h-role-text'), d.roleLabel || '');
    [['h', d.home || {}], ['a', d.away || {}]].forEach(function (t) {
      var s = t[0], p = t[1];
      setChain($('h2h-photo-' + s), photoUrls(p.name, s));
      setChain($('h2h-flag-' + s), p.country ? [hokAsset('images/flags/' + p.country + '.png')] : []);
      setChain($('h2h-logo-' + s), p.abbr ? [hokLogo(p.abbr)] : []);
      hokSetText($('h2h-name-' + s), p.name || '');
    });
    (d.rows || []).forEach(function (r, i) {
      $('h2h-l' + i).innerHTML = r.label;               // server constant (may contain <br>)
      hokSetText($('h2h-v' + i + 'h'), r.home);
      hokSetText($('h2h-v' + i + 'a'), r.away);
      $('h2h-v' + i + 'h').classList.toggle('high', r.high === 'home');
      $('h2h-v' + i + 'a').classList.toggle('high', r.high === 'away');
    });
    if (page.classList.contains('h2h-on')) fitAll();
  }

  function fetchData(r) {
    return fetch('/api/head-to-head?role=' + encodeURIComponent(r || role), { cache: 'no-store' })
      .then(function (x) { return x.json(); }).catch(function () { return {}; });
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
    FsShared.claim('headtohead', { ownHeader: true });
    return fetchData().then(function (d) {
      if (my !== token) return;
      apply(d);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('h2h-on');
        fitAll();
        void page.offsetWidth;
        page.classList.add('h2h-visible');
        FsShared.reveal('headtohead', null, { ownHeader: true });
        page.classList.remove('h2h-enter');
        void page.offsetWidth;
        requestAnimationFrame(function () { if (my === token) page.classList.add('h2h-enter'); });
      });
    });
  }

  // Role change on air: .h2h-out (slide/shrink away, OUT_MS) → swap data while
  // hidden (images decoded) → .h2h-in (sweep + slam-in keyframes, IN_MS). CSS
  // owns the motion (fs-headtohead.css). A newer change cancels an older one.
  var swapSeq = 0;
  function setRole(r) {
    if (!r || r === role) { role = r || role; return; }
    role = r;
    if (!active) return;
    var my = token, seq = ++swapSeq;
    clearTimeout(inTimer);
    page.classList.remove('h2h-in');
    page.classList.add('h2h-out');
    Promise.all([fetchData(r), new Promise(function (ok) { setTimeout(ok, OUT_MS); })]).then(function (res) {
      if (my !== token || seq !== swapSeq || !active) return;
      apply(res[0]);
      return preload(800).then(function () {
        if (my !== token || seq !== swapSeq || !active) return;
        page.classList.remove('h2h-out');
        void page.offsetWidth;                         // restart the keyframes
        page.classList.add('h2h-in');
        inTimer = setTimeout(function () { page.classList.remove('h2h-in'); }, IN_MS);
      });
    });
  }

  // Re-read while on air (Match Board saved / history cleared) — no animation.
  function refresh() {
    if (!active) return;
    var my = token;
    fetchData().then(function (d) { if (my === token && active) apply(d); });
  }

  function hide() {
    ++token;
    active = false;
    clearTimeout(inTimer);
    page.classList.remove('h2h-visible', 'h2h-out', 'h2h-in');
    FsShared.release('headtohead');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('h2h-on', 'h2h-enter'); }, 420);
  }

  return { show: show, hide: hide, setRole: setRole, refresh: refresh, isActive: function () { return active; } };
})();
