// html/js/michcheck.js — Mic Check Home / Away. Always live (no show/hide).
// Data: GET /api/michcheck?side=home|away (lib/micCheck.js), re-read at most every 2 s
// and whenever the dashboard saved. The photo/background switches come with it AND from
// the 500 ms /api/state poll so a dashboard click lands within half a second.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qs = /[?&]side=(home|away)/.exec(location.search);
  var SIDE = qs ? qs[1] : (/away/i.test(location.pathname) ? 'away' : 'home');
  var ROW_TOP = [208, 368, 527, 686, 846];        // photo cells (hero cells are 0/-1/0/+2/+1 px off the art — measured)
  var HERO_TOP = [208, 367, 527, 688, 847];
  var ROLE_ICON = ['clash-lane', 'jungler', 'mid-lane', 'farm-lane', 'roamer'];

  (function build() {
    var html = '';
    for (var i = 0; i < 5; i++) {
      html += '<div class="mc-hero empty" id="mc-hero-' + i + '" style="top:' + HERO_TOP[i] + 'px"><img id="mc-heroimg-' + i + '" alt=""></div>' +
        '<div class="mc-hname" id="mc-hname-' + i + '" style="bottom:' + (1080 - HERO_TOP[i] - 156 + 3) + 'px"></div>' +
        '<div class="mc-pcell" id="mc-pcell-' + i + '" style="top:' + ROW_TOP[i] + 'px"><div class="mc-pbg"></div><img class="mc-photo" id="mc-photo-' + i + '" alt=""></div>' +
        '<div class="mc-strip" style="top:' + (ROW_TOP[i] + 128) + 'px"><div class="mc-role" id="mc-role-' + i + '" style="--icon:url(\'/assets/images/role/' + ROLE_ICON[i] + '.png\')"></div>' +
        '<div class="mc-pname" id="mc-pname-' + i + '"></div></div>';
    }
    $('mc-rows').innerHTML = html;
  })();

  // HERO's colour logo is all yellow (invisible on the frame) → white version. Add a team code here to do the same.
  var WHITE_LOGO_ON_YELLOW = { HERO: true };

  function setChain(img, urls) {
    var key = urls.join('|');
    if (img.dataset.chain === key) return;
    img.dataset.chain = key;
    var i = 0;
    img.style.visibility = urls.length ? '' : 'hidden';
    if (!urls.length) { img.removeAttribute('src'); return; }
    img.onerror = function () { i++; if (i < urls.length) img.src = urls[i]; else { img.onerror = null; img.style.visibility = 'hidden'; if (img.parentNode.classList.contains('mc-hero')) img.parentNode.classList.add('empty'); } };
    img.src = urls[0];
  }
  function squeeze(el) {
    el.style.transform = 'none';
    var w = el.clientWidth;
    if (w && el.scrollWidth > w) el.style.transform = 'scaleX(' + (w / el.scrollWidth) + ')';
  }
  // "BTR.Zannnn" → "BTR. ZANNNN"? Reference shows the full nickname ("TAGG.NAME"): keep as is.
  // Team name: one line at full size; too wide → two lines at a smaller size; a single huge word still squeezes.
  function fitTeam() {
    var t = $('mc-team');
    t.classList.remove('two'); t.style.transform = 'none';
    if (t.scrollWidth > t.clientWidth) t.classList.add('two');
    squeeze(t);
  }
  function squeezeAll() {
    var go = function () {
      document.querySelectorAll('.mc-hname, .mc-pname').forEach(squeeze);
      fitTeam(); squeeze($('mc-stage'));
    };
    go();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 19px Radikal'), document.fonts.load('700 51px KIC2025')]).then(go, go);
  }

  // Cell shows photo + background when the page switch is ON, or when that player's cam is marked down (force).
  function setSwitch(photo, force) {
    force = force || [];
    for (var i = 0; i < 5; i++) $('mc-pcell-' + i).classList.toggle('nophoto', !(photo || force[i]));
  }

  function apply(d) {
    var t = d.team || {};
    hokSetText($('mc-team'), t.fullName || t.abbr || '');
    hokSetText($('mc-stage'), d.stageText || '');
    hokSetText($('mc-match'), d.matchLine || '');
    // The logo sits on the frame's yellow. Teams whose colour logo vanishes there use their WHITE logo (<ABBR>_2.png,
    // operator's choice); everyone else keeps the colour <ABBR>.png. Missing white file → colour logo.
    var abbr = t.abbr || '';
    var logos = abbr ? [hokAsset('images/logo/' + abbr + '.png')] : [];
    if (WHITE_LOGO_ON_YELLOW[abbr.toUpperCase()]) logos.unshift(hokAsset('images/logo/' + abbr + '_2.png'));
    setChain($('mc-logo'), logos);
    setChain($('mc-flag'), t.country ? [hokAsset('images/flags/' + t.country + '.png')] : []);
    var players = t.players || [];
    for (var i = 0; i < 5; i++) {
      var p = players[i] || {}, name = p.name || '';
      var hero = $('mc-hero-' + i);
      hero.classList.toggle('empty', !p.heroId);
      setChain($('mc-heroimg-' + i), p.heroId ? [hokAsset('hero/full/' + p.heroId + '_FHD.png'), hokAsset('hero/square/' + p.heroId + '_KOTAK.png'), hokAsset('hero/draftpick/' + p.heroId + '_TINGGI.png')] : []);
      hokSetText($('mc-hname-' + i), (p.heroName || '').replace(/\s*\(([^)]*)\)\s*/, '\n$1'));   // "Flowborn (Assassin)" → two lines
      hokSetText($('mc-pname-' + i), name);
      var hb = function (f) { return hokAsset('images/photo/' + f + '.png'); };
      setChain($('mc-photo-' + i), name ? [hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO] : [HOK_DEFAULT_PHOTO]);
    }
    setSwitch(d.photo !== false, d.photoForce);
    squeezeAll();
  }

  var busy = false, lastFetch = 0, lastSaved = -1;
  function fetchData() {
    if (busy) return;
    busy = true; lastFetch = Date.now();
    fetch('/api/michcheck?side=' + SIDE, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(apply).catch(function () {}).then(function () { busy = false; });
  }

  HokPoll.register(function (data) {
    var s = data.state || {};
    if (s.last_updated !== undefined) setSwitch(!s['michcheck_' + SIDE + '_photo_off'], s['michcheck_' + SIDE + '_photo_force']);
    var saved = s.last_updated || 0;
    if (saved !== lastSaved || Date.now() - lastFetch > 2000) { lastSaved = saved; fetchData(); }
  });
  HokPoll.start({ sources: ['state'], interval: 500 });
  createOverlaySSE().addEventListener('reload', function () { location.reload(); });
})();
