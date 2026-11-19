// html/js/fs-postitems.js — Post Items scene for fullscreen.html.
// Data: GET /api/post-items (lib/postHexagon.js). Ten player cards: HOME left
// in role order Clash → Roam, AWAY right mirrored (Roam → Clash). Each card:
// hero splash, player cutout fading out downward, spell, role, name, K/D/A,
// gold, 6 item slots (assets/items/<code>.png).
//   PostItems.show()  PostItems.hide()
var PostItems = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('pit-page');
  var ROLE_ICON = { clash: 'clash-lane', jungler: 'jungler', mid: 'mid-lane', farm: 'farm-lane', roamer: 'roamer' };
  var active = false, token = 0, hideTimer = null;

  function fmtNum(v) { return Math.round(v || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); } // 14203 → 14.203

  (function build() {
    ['h', 'a'].forEach(function (side) {
      var html = '';
      for (var i = 0; i < 5; i++) {
        var id = 'pit-' + side + i;
        // Entry stagger: centre-out (home card 4 and away card 0 sit next to the VS).
        var rank = side === 'h' ? 4 - i : i;
        html += '<div class="pit-card" id="' + id + '" style="--d:' + (rank * 90) + 'ms">' +
          '<img class="pit-hero" id="' + id + '-hero" alt="">' +
          '<img class="pit-photo" id="' + id + '-photo" alt="">' +
          '<img class="pit-spell" id="' + id + '-spell" alt="">' +
          '<div class="pit-role" id="' + id + '-role"></div>' +
          '<div class="pit-name" id="' + id + '-name"></div>' +
          '<div class="pit-kda" id="' + id + '-kda"></div>' +
          '<div class="pit-gold"><span class="pit-coin">$</span><span id="' + id + '-gold"></span></div>' +
          '<div class="pit-items" id="' + id + '-items">' + [0, 1, 2, 3, 4, 5].map(function (j) { return '<div class="pit-item" style="--i:' + j + '"><img alt=""></div>'; }).join('') + '</div>' +
        '</div>';
      }
      $('pit-cards-' + side).innerHTML = html;
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

  function fillCard(id, roleKey, p) {
    $(id + '-role').style.setProperty('--icon', "url('/assets/images/role/" + ROLE_ICON[roleKey] + ".png')");
    $(id + '-name').textContent = p ? p.name : '—';
    $(id + '-kda').textContent = p ? p.k + ' / ' + p.d + ' / ' + p.a : '';
    $(id + '-gold').textContent = p ? fmtNum(p.gold) : '';
    if (p && p.heroId) setChain($(id + '-hero'), [hokAsset('hero/full/' + p.heroId + '_FHD.png'), hokAsset('hero/draftpick/' + p.heroId + '_TINGGI.png')]);
    if (p) {
      var hb = function (f) { return hokAsset('images/photo/' + f + '.png'); };
      setChain($(id + '-photo'), [hb(p.name + '_FRONT'), hb(p.name), hokPhoto(p.name), HOK_DEFAULT_PHOTO]);
    }
    var spell = $(id + '-spell');
    if (p && p.skillId) setChain(spell, [hokAsset('images/spells/' + p.skillId + '.png')]); else spell.style.visibility = 'hidden';
    var slots = $(id + '-items').children;
    for (var i = 0; i < 6; i++) {
      var code = p && p.equips[i], img = slots[i].firstChild;
      slots[i].classList.toggle('empty', !code);
      if (code) setChain(img, [hokAsset('items/' + code + '.png')]);
      else { img.dataset.chain = ''; img.removeAttribute('src'); img.style.visibility = 'hidden'; }
    }
  }

  function apply(data) {
    var roles = data.roles || [];
    roles.forEach(function (r, i) {
      fillCard('pit-h' + i, r.key, r.home);          // HOME: Clash → Roam
      fillCard('pit-a' + (4 - i), r.key, r.away);    // AWAY: mirrored, Roam → Clash
    });
  }

  function fetchData() {
    return fetch('/api/post-items', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
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
    FsShared.claim('postitems', { matchInfo: true });
    return fetchData().then(function (data) {
      if (my !== token) return;
      apply(data);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('pit-on');
        page.querySelectorAll('.pit-name').forEach(squeeze);
        void page.offsetWidth;
        page.classList.add('pit-visible');
        FsShared.reveal('postitems', data, { matchInfo: true });
        page.classList.remove('pit-enter');                 // replay the entry animation every show
        void page.offsetWidth;
        requestAnimationFrame(function () { if (my === token) page.classList.add('pit-enter'); });
      });
    });
  }

  function hide() {
    ++token;
    active = false;
    page.classList.remove('pit-visible');
    FsShared.release('postitems');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('pit-on', 'pit-enter'); }, 420);
  }

  return { show: show, hide: hide, isActive: function () { return active; } };
})();
