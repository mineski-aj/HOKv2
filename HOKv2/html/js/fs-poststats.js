// html/js/fs-poststats.js — Post Stats scene for fullscreen.html.
// Data: GET /api/post-stats (lib/postHexagon.js, same payload as Post Hexagon).
// HOME team table on top, AWAY below; rows in role order (Clash, Jungle, Mid,
// Farm, Roam). Bars = distribution out of 100: each player's share of their
// TEAM's total for that column (a team's five bars add up to 100%).
// Teamfight Rate is already a percentage (kill participation) — shown as is.
//   PostStats.show()  PostStats.hide()
var PostStats = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('pst-page');
  var COLS = [
    { key: 'damage', label: 'DAMAGE DEALT',   fmt: fmtNum },
    { key: 'taken',  label: 'DAMAGE TAKEN',   fmt: fmtNum },
    { key: 'gold',   label: 'TOTAL GOLD',     fmt: fmtNum },
    { key: 'kp',     label: 'TEAMFIGHT RATE', fmt: function (v) { return Math.round(v) + '%'; } },
  ];
  var ROLE_ICON = { clash: 'clash-lane', jungler: 'jungler', mid: 'mid-lane', farm: 'farm-lane', roamer: 'roamer' };
  var active = false, token = 0, hideTimer = null;

  // 30000 → "30.000" (as on the template)
  function fmtNum(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  /* ── Static build: column headers + 2 x 5 rows ── */
  (function build() {
    ['h', 'a'].forEach(function (side) {
      $('pst-colhdr-' + side).innerHTML = COLS.map(function (c) { return '<span>' + c.label + '</span>'; }).join('');
      var html = '';
      for (var i = 0; i < 5; i++) {
        var id = 'pst-' + side + i;
        html += '<div class="pst-row" id="' + id + '">' +
          '<div class="pst-hero"><img id="' + id + '-hero" alt=""></div>' +
          '<div class="pst-namecell"><img class="pst-role" id="' + id + '-role" alt=""><span class="pst-pname" id="' + id + '-name"></span></div>' +
          COLS.map(function (c, ci) {
            return '<div class="pst-cell pst-c' + ci + '"><span class="pst-val" id="' + id + '-v' + ci + '">0</span>' +
              '<div class="pst-track"><div class="pst-fill" id="' + id + '-f' + ci + '" style="transition-delay:' + (i * 70 + ci * 40) + 'ms"></div></div></div>';
          }).join('') +
        '</div>';
      }
      $('pst-rows-' + side).innerHTML = html;
    });
  })();

  function setChain(img, urls) {
    var key = urls.join('|');
    if (img.dataset.chain === key) return;
    img.dataset.chain = key;
    var i = 0;
    img.style.visibility = '';
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; img.style.visibility = 'hidden'; } };
    img.src = urls[0];
  }
  function squeeze(el) {
    el.style.transform = 'none';
    var w = el.clientWidth;
    if (w && el.scrollWidth > w) el.style.transform = 'scaleX(' + (w / el.scrollWidth) + ')';
  }

  function apply(data) {
    var home = data.home || {}, away = data.away || {};
    // Header (result, logos, codes, scores) is the shared layer — FsShared.reveal() fills it.

    [['h', home, 'home'], ['a', away, 'away']].forEach(function (t) {
      var side = t[0], team = t[1], key = t[2];
      setChain($('pst-blogo-' + side), [hokLogo(team.abbr)]);
      $('pst-tname-' + side).textContent = (team.fullName || team.abbr || '').toUpperCase();
      // Team totals per column (share bars)
      var totals = {};
      COLS.forEach(function (c) {
        totals[c.key] = (data.roles || []).reduce(function (sum, r) { return sum + ((r[key] && r[key].stats[c.key]) || 0); }, 0);
      });
      (data.roles || []).forEach(function (r, i) {
        var p = r[key], id = 'pst-' + side + i;
        setChain($(id + '-role'), ['/assets/images/role/' + ROLE_ICON[r.key] + '.png']);
        $(id + '-name').textContent = p ? p.name : '—';
        if (p && p.heroId) setChain($(id + '-hero'), [hokAsset('images/hero-full/' + p.heroId + '_FHD.png'), hokAsset('images/hero_realteamfight/' + p.heroId + '_KOTAK.png'), hokAsset('images/hero-draftpick/' + p.heroId + '_TINGGI.png')]);
        COLS.forEach(function (c, ci) {
          var v = p ? p.stats[c.key] || 0 : 0;
          var pct = c.key === 'kp' ? v : (totals[c.key] > 0 ? v / totals[c.key] * 100 : 0);
          $(id + '-v' + ci).textContent = c.fmt(v);
          $(id + '-f' + ci).style.width = Math.max(0, Math.min(100, pct)) + '%';
        });
      });
    });
  }

  function fetchData() {
    return fetch('/api/post-stats', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
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
    FsShared.claim('poststats', { gameInfo: true });     // keep the shared layer up if switching from another scene
    return fetchData().then(function (data) {
      if (my !== token) return;
      apply(data);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('pst-on');
        squeeze($('pst-tname-h')); squeeze($('pst-tname-a'));
        void page.offsetWidth;
        page.classList.add('pst-visible');
        FsShared.reveal('poststats', data, { gameInfo: true });
        page.classList.remove('pst-grown');
        void page.offsetWidth;
        setTimeout(function () { if (my === token) page.classList.add('pst-grown'); }, 250);
      });
    });
  }

  function hide() {
    ++token;
    active = false;
    page.classList.remove('pst-visible');
    FsShared.release('poststats');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('pst-on', 'pst-grown'); }, 420);
  }

  return { show: show, hide: hide, isActive: function () { return active; } };
})();
