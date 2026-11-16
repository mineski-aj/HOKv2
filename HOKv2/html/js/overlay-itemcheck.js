// html/js/overlay-itemcheck.js — In-Game Overlay Item Check (BOTTOM quadrant).
// Data: /api/post-items (lib/postHexagon.js — live player list, roles,
// home/away camps, items, K/D/A, gold). Fetched only while the panel is
// shown, piggy-backing on the page's single HokPoll loop (max once a second).
// Show/hide is HokQuadrants' job (overlay.html); this module only fills rows.
var HokItemCheck = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var panel = $('ic-panel');
  var ROLE_ICON = { clash: 'clash-lane', jungler: 'jungler', mid: 'mid-lane', farm: 'farm-lane', roamer: 'roamer' };
  var ITEM_LEFT_H = [137, 172, 208, 243, 278, 314];           // item 1 → 6, left to right
  var ITEM_LEFT_A = [722, 687, 651, 616, 581, 545];           // AWAY mirrored: item 1 rightmost
  var lastFetch = 0, busy = false;

  (function build() {
    var html = '';
    for (var i = 0; i < 5; i++) {
      html += '<div class="ic-row" id="ic-row-' + i + '" style="top:' + (i * 41) + 'px">' +
        '<img class="ic-hero h" alt=""><div class="ic-coin h">$</div><div class="ic-gold h"></div>' +
        ITEM_LEFT_H.map(function (x) { return '<div class="ic-item h" style="left:' + x + 'px"><img alt=""></div>'; }).join('') +
        '<div class="ic-kda h"></div><div class="ic-role"></div><div class="ic-kda a"></div>' +
        ITEM_LEFT_A.map(function (x) { return '<div class="ic-item a" style="left:' + x + 'px"><img alt=""></div>'; }).join('') +
        '<div class="ic-gold a"></div><div class="ic-coin a">$</div><img class="ic-hero a" alt="">' +
      '</div>';
    }
    panel.innerHTML = html;
  })();

  function fmtGold(v) { v = v || 0; return v < 1000 ? String(Math.round(v)) : (v / 1000).toFixed(1) + 'k'; }   // 10.3k
  function setImg(img, url) {
    if ((img.dataset.src || '') === url) return;
    img.dataset.src = url;
    img.style.visibility = url ? '' : 'hidden';
    if (!url) { img.removeAttribute('src'); return; }
    img.onerror = function () {
      img.style.visibility = 'hidden';
      img.dataset.bad = url;                                                                      // remembered across refreshes
      if (img.parentNode.classList.contains('ic-item')) img.parentNode.classList.add('empty');   // no icon file → empty art
    };
    img.src = url;
  }
  function heroUrl(id) { return id ? hokAsset('images/hero_realteamfight/' + id + '_KOTAK.png') : ''; }

  function fillSide(row, side, p) {
    var q = function (sel) { return row.querySelector(sel + '.' + side); };
    setImg(q('.ic-hero'), p ? heroUrl(p.heroId) : '');
    hokSetText(q('.ic-gold'), p ? fmtGold(p.gold) : '');
    hokSetText(q('.ic-kda'), p ? p.k + '/' + p.d + '/' + p.a : '');
    var slots = row.querySelectorAll('.ic-item.' + side);
    for (var i = 0; i < 6; i++) {
      var code = p && p.equips[i], url = code ? hokAsset('items/' + code + '.png') : '';
      setImg(slots[i].firstChild, url);
      slots[i].classList.toggle('empty', !code || slots[i].firstChild.dataset.bad === url);
    }
  }

  function apply(data) {
    (data.roles || []).forEach(function (r, i) {
      var row = $('ic-row-' + i);
      if (!row) return;
      row.querySelector('.ic-role').style.setProperty('--icon', "url('/assets/images/role/" + ROLE_ICON[r.key] + ".png')");
      fillSide(row, 'h', r.home);
      fillSide(row, 'a', r.away);
    });
  }

  function refresh() {
    if (busy) return busy;
    lastFetch = Date.now();
    busy = fetch('/api/post-items', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(apply).catch(function () {}).then(function () { busy = false; });
    return busy;
  }

  // Live while shown (or while sliding in): at most once per second.
  HokPoll.register(function () {
    if (panel.classList.contains('show') && Date.now() - lastFetch > 1000) refresh();
  });

  return { refresh: refresh };
})();
