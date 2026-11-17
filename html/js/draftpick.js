// html/js/draftpick.js — Draft Pick data. 18-step HOK draft:
//   B1 B2 B1 B2 | P1 P2 P2 P1 P1 P2 | B2 B1 B2 B1 | P2 P1 P1 P2
// MODE 'API' reads /api/draft_phase; MODE 'MANUAL' reads the dashboard's
// ban/pick overrides. After the draft (or in MANUAL) the dashboard's pick
// order (role swap) decides which hero sits in which player slot.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ROLE_ICONS = ['clash-lane', 'jungler', 'mid-lane', 'farm-lane', 'roamer'];
  var SEQ = [
    { type: 'B', camp: 1 }, { type: 'B', camp: 2 }, { type: 'B', camp: 1 }, { type: 'B', camp: 2 },
    { type: 'P', camp: 1 }, { type: 'P', camp: 2 }, { type: 'P', camp: 2 }, { type: 'P', camp: 1 },
    { type: 'P', camp: 1 }, { type: 'P', camp: 2 },
    { type: 'B', camp: 2 }, { type: 'B', camp: 1 }, { type: 'B', camp: 2 }, { type: 'B', camp: 1 },
    { type: 'P', camp: 2 }, { type: 'P', camp: 1 }, { type: 'P', camp: 1 }, { type: 'P', camp: 2 },
  ];
  // MANUAL mode: which dashboard input feeds each step.
  var MANUAL_MAP = [
    ['hb', 0], ['ab', 0], ['hb', 1], ['ab', 1],
    ['hp', 0], ['ap', 0], ['ap', 1], ['hp', 1], ['hp', 2], ['ap', 2],
    ['ab', 2], ['hb', 2], ['ab', 3], ['hb', 3],
    ['ap', 3], ['hp', 3], ['hp', 4], ['ap', 4],
  ];

  var currentStepCount = -1;

  /* ── Turn countdown (replaces the old BANNING/PICKING videos): 25 s ban,
        40 s pick (their lengths). Synced to the previous action's event time
        when the API gives one that makes sense, else counts from now. ── */
  var TURN_SECONDS = { B: 25, P: 40 };
  var turn = null; // { type, camp, endsAt }

  // Turn videos (full-frame, transparent), both started with the countdown and
  // seeked to the same elapsed time; they hold their last frame at the end:
  //   bar   BAR_<25|40>_<L|R>.webm         line running outward on that side
  //   timer TIMER_<BAN|PICK>_<L|R>.webm    animated countdown + arrows + label
  // If the timer video can't load, the HTML countdown is shown instead.
  function playOne(cls, id, elapsedMs) {
    document.querySelectorAll('.' + cls).forEach(function (v) {
      if (v.id === id) return;
      v.classList.remove('on');
      v.pause();
    });
    var v = $(id);
    if (!v) return;
    var seek = Math.max(0, elapsedMs / 1000);
    var go = function () {
      try { v.currentTime = Math.min(seek, Math.max(0, (v.duration || 999) - 0.05)); } catch (e) {}
      v.classList.add('on');
      v.play().catch(function () {});
    };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  }
  function playBar(act, elapsedMs) {
    var side = act.camp === 1 ? 'L' : 'R';
    playOne('turn-bar', 'turn-bar-' + TURN_SECONDS[act.type] + '-' + side, elapsedMs);
    // Grey wake: the full-bar silhouette sits under the shrinking bar, so the path it leaves turns grey.
    document.querySelectorAll('.turn-track').forEach(function (t) { t.classList.toggle('on', t.id === 'turn-track-' + side); });
    var timerId = 'turn-timer-' + (act.type === 'B' ? 'BAN' : 'PICK') + '-' + side;
    $('front-overlay').classList.toggle('timer-fallback', !!$(timerId).error);
    playOne('turn-timer', timerId, elapsedMs);
  }
  function stopBars() {
    document.querySelectorAll('.turn-track').forEach(function (t) { t.classList.remove('on'); });
    document.querySelectorAll('.turn-bar, .turn-timer').forEach(function (v) { v.classList.remove('on'); v.pause(); });
  }
  document.querySelectorAll('.turn-timer').forEach(function (v) {
    v.addEventListener('error', function () { if (v.classList.contains('on')) $('front-overlay').classList.add('timer-fallback'); });
  });

  function parseEventTime(s) {
    if (!s) return NaN;
    var t = Date.parse(String(s).replace(' ', 'T'));
    if (isNaN(t) && /^\d{10,13}$/.test(s)) t = Number(s) * (String(s).length === 10 ? 1000 : 1);
    return t;
  }
  function startTurn(act, eventTime) {
    var dur = TURN_SECONDS[act.type] * 1000;
    var start = parseEventTime(eventTime);
    var now = Date.now();
    if (isNaN(start) || start > now || now - start > dur) start = now;
    turn = { type: act.type, camp: act.camp, endsAt: start + dur };
    playBar(act, now - start);
    $('front-overlay').classList.remove('draft-done');
    $('turn-status').textContent = act.type === 'B' ? 'BANNING' : 'PICKING';
    $('turn-arrow-l').classList.toggle('on', act.camp === 1);
    $('turn-arrow-r').classList.toggle('on', act.camp === 2);
    renderTurn();
  }
  function endTurns() {
    turn = null;
    stopBars();
    $('front-overlay').classList.add('draft-done');
    $('turn-arrow-l').classList.remove('on');
    $('turn-arrow-r').classList.remove('on');
  }
  function renderTurn() {
    if (!turn) return;
    hokSetText($('turn-num'), Math.max(0, Math.ceil((turn.endsAt - Date.now()) / 1000)));
  }
  setInterval(renderTurn, 250);
  var csvDatabase = {};
  var revealedHeroes = {};
  var voicedHeroes = {};      // hero id -> true for every hero currently picked (voice already played)
  var heroAudioPrimed = false; // first render after load = baseline (no voice for old picks)

  // Hero voice line = assets/voice/<CSV hero name>.mp3. Files whose name differs from the
  // CSV "Hero" column are listed here by hero id.
  var VOICE_FILE = {
    119: 'Dr. Bian', 146: 'luna', 168: 'lapulapu', 152: 'Princess Frost', 153: 'Prince of Lanling',
    163: 'Ukyo', 519: 'Loong', 581: 'Flowborn Tank', 582: 'Flowborn Mage', 583: 'Flowborn Assassin',
    584: 'Flowborn Marksman', 585: 'Flowborn Roamer'
  };
  function playHeroVoice(id) {
    var name = VOICE_FILE[id] || (csvDatabase[id] && csvDatabase[id].name);
    if (!name || HOK_PREVIEW) return; // never from dashboard preview/edit iframes
    var voice = new Audio(hokAsset('voice/' + name.trim() + '.mp3'));
    voice.volume = 0.8;
    voice.play().catch(function () {});
  }

  var heroImg = function (id) { return hokAsset('hero/draftpick/' + id + '_TINGGI.png'); };
  var heroVid = function (id) { return hokAsset('hero/webm/' + id + '.webm'); };

  // Picked hero = looping webm (assets/hero/webm/<id>.webm, 202x450, opaque) over the
  // static _TINGGI.png, which stays underneath as the fallback for heroes with no video.
  // The video only shows once it has a frame (.ready), so a missing file never blanks the slot.
  function setHeroVideo(vid, src) {
    if (!vid || (vid.dataset.src || '') === src) return;
    vid.dataset.src = src;
    vid.classList.remove('ready');
    if (src) {
      vid.src = src;
      var p = vid.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    }
  }

  hokCsv.onChange(function (text) {
    var lines = text.split(/\r?\n/);
    if (lines.length < 2) return;
    var header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
    var idx = function (name, fallback) { var i = header.indexOf(name); return i === -1 ? fallback : i; };
    var noIdx = idx('no', 9), heroIdx = idx('hero', 10), banIdx = idx('ban rate', 12), pickIdx = idx('pick rate', 13), winIdx = idx('win rate', 14);
    var db = {};
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',');
      if (cols.length <= winIdx) continue;
      var id = parseInt(cols[noIdx], 10);
      if (!isNaN(id)) db[id] = { name: cols[heroIdx] || 'HERO', banRate: cols[banIdx] || '0%', pickRate: cols[pickIdx] || '0%', winRate: cols[winIdx] || '0%' };
    }
    csvDatabase = db;
  });

  function playerBox(i, side) {
    return '<div class="player-box" id="' + side + '-box-' + i + '">' +
      '<video class="pick-element" id="' + side + '-pickel-' + i + '" src="/assets/webm/draftpick/PICK_ELEMENT.webm?v=2" muted loop playsinline preload="auto"></video>' +
      '<img class="player-photo" id="' + side + '-photo-' + i + '" src="' + HOK_DEFAULT_PHOTO + '">' +
      // Two layers, each with its own gradient: PLAYER (photo + orange) underneath, HERO (art + dark)
      // on top — the matte reveals the hero layer with its dark fade over the player + orange.
      '<img class="player-front" id="' + side + '-front-' + i + '" src="/assets/images/0.draft-phase/pick-front.png">' +
      '<div class="hero-pick" id="' + side + '-hero-' + i + '">' +
        '<img class="hero-pick-img" id="' + side + '-heroimg-' + i + '">' +
        '<video class="hero-pick-vid" id="' + side + '-herovid-' + i + '" muted loop playsinline autoplay></video>' +
        '<img class="hero-front" src="/assets/images/0.draft-phase/standby-front.png">' +
      '</div>' +
      '<div class="stats-box" id="' + side + '-statsbox-' + i + '">' +
        '<div class="stats-hero-name" id="' + side + '-sname-' + i + '">HERO</div>' +
        '<div class="stats-rate-value r0" id="' + side + '-sbr-' + i + '">0%</div>' +
        '<div class="stats-rate-value r1" id="' + side + '-spr-' + i + '">0%</div>' +
        '<div class="stats-rate-value r2" id="' + side + '-swr-' + i + '">0%</div>' +
      '</div>' +
      '<div class="player-name" id="' + side + '-name-' + i + '">PLAYER</div>' +
    '</div>';
  }

  function initUI() {
    var hb = '', ab = '', hp = '', ap = '';
    for (var i = 0; i < 4; i++) {
      hb += '<div class="ban-box"><img class="ban-hero" id="hb-' + i + '"></div>';
      ab += '<div class="ban-box"><img class="ban-hero" id="ab-' + i + '"></div>';
    }
    for (i = 0; i < 5; i++) { hp += playerBox(i, 'home'); ap += playerBox(i, 'away'); }
    $('home-bans').innerHTML = hb; $('away-bans').innerHTML = ab;
    $('home-players').innerHTML = hp; $('away-players').innerHTML = ap;

    // Role icons are static markup (positioned by CSS ids) — set their art once.
    for (i = 0; i < 5; i++) {
      $('hr-icon-' + i).src = '/assets/images/role/' + ROLE_ICONS[i] + '.png';
      $('ar-icon-' + i).src = '/assets/images/role/' + ROLE_ICONS[i] + '.png';
    }

    document.querySelectorAll('.hero-pick-vid').forEach(function (vid) {
      vid.addEventListener('loadeddata', function () { if (vid.dataset.src) vid.classList.add('ready'); });
      vid.addEventListener('error', function () { vid.classList.remove('ready'); });
    });

    // Photo fallback for every slot
    document.querySelectorAll('.player-photo').forEach(function (img) {
      img.addEventListener('error', function () { if (img.getAttribute('src') !== HOK_DEFAULT_PHOTO) img.src = HOK_DEFAULT_PHOTO; });
    });

  }

  // Shrink text until it fits its box (values: one line in 66px; name: ≤ 2 lines in 114x40).
  function shrinkToFit(el, maxPx, minPx, fits) {
    for (var px = maxPx; px >= minPx; px--) {
      el.style.fontSize = px + 'px';
      el.style.lineHeight = Math.round(px * 1.13) + 'px';
      if (fits()) return;
    }
  }
  function fitStats(side, index) {
    ['sbr', 'spr', 'swr'].forEach(function (k) {
      var v = $(side + '-' + k + '-' + index);
      v.style.fontSize = '';
      for (var px = 40; px >= 20 && v.scrollWidth > v.clientWidth; px--) v.style.fontSize = px + 'px';
    });
    var n = $(side + '-sname-' + index);
    shrinkToFit(n, 15, 10, function () { return n.scrollHeight <= n.clientHeight + 1 && n.scrollWidth <= n.clientWidth + 1; });
  }

  function triggerStatsAnimation(side, index, heroId) {
    var data = csvDatabase[heroId] || { name: 'UNKNOWN', banRate: '-', pickRate: '-', winRate: '-' };
    $(side + '-sname-' + index).innerText = data.name;
    $(side + '-sbr-' + index).innerText = data.banRate;
    $(side + '-spr-' + index).innerText = data.pickRate;
    $(side + '-swr-' + index).innerText = data.winRate;
    fitStats(side, index);
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 40px KIC2025'), document.fonts.load('700 15px Radikal')]).then(function () { fitStats(side, index); });
    var box = $(side + '-statsbox-' + index);
    setTimeout(function () {
      box.classList.add('show-stats');
      setTimeout(function () { box.classList.remove('show-stats'); }, 4000);
    }, 1700);   // after the 1.5 s matte reveal (css .hero-pick.picked) so the hero is seen first
  }

  HokPoll.register(function (data) {
    var state = data.state || {}, draft = data.draft || {};

    // Match Board → Match Info (lib/matchInfo.js): GROUP STAGE / MATCH 3 - BO 5
    var mi = state.match_info || {};
    hokSetText($('phase-text'), mi.stageText || '');
    hokSetText($('match-text'), mi.matchBoText || '');
    hokSetText($('home-score'), state.team_1_score || 0);
    hokSetText($('away-score'), state.team_2_score || 0);
    hokSetText($('home-abbr'), state.team_1_abbr || 'HOME');
    hokSetText($('away-abbr'), state.team_2_abbr || 'AWAY');
    if (state.team_1_abbr) hokSetSrc($('home-logo'), hokLogo(state.team_1_abbr));
    if (state.team_2_abbr) hokSetSrc($('away-logo'), hokLogo(state.team_2_abbr));
    // Country flags (assets/images/flags/<COUNTRY>.png) — hidden while there's no country or no art.
    var tc = state.team_countries || {};
    [['home-flag', state.team_1_abbr], ['away-flag', state.team_2_abbr]].forEach(function (f) {
      var fl = $(f[0]), c = f[1] && tc[String(f[1]).toUpperCase()];
      if (!c) { fl.style.visibility = 'hidden'; return; }
      fl.onerror = function () { fl.style.visibility = 'hidden'; };
      fl.onload = function () { fl.style.visibility = ''; };
      hokSetSrc(fl, hokAsset('images/flags/' + c + '.png'));
      if (fl.complete && fl.naturalWidth) fl.style.visibility = '';
    });

    var mode = state.draft_mode || 'API';
    var hSwap = state.home_role_swap || [];
    var aSwap = state.away_role_swap || [];

    for (var i = 0; i < 5; i++) {
      var hName = (state.team_1_players && state.team_1_players[i]) || 'PLAYER ' + (i + 1);
      var aName = (state.team_2_players && state.team_2_players[i]) || 'PLAYER ' + (i + 1);
      hokSetText($('home-name-' + i), hName);
      hokSetText($('away-name-' + i), aName);
      hokSetSrc($('home-photo-' + i), hokPhoto(hName));
      hokSetSrc($('away-photo-' + i), hokPhoto(aName));
    }

    var bpList = [];
    var currentLength = 0;
    var apiList = null;
    if (mode === 'API') {
      apiList = (draft.response && draft.response.BanPickList) || [];
      currentLength = apiList.filter(function (x) { return x.HeroID > 0; }).length;
      for (i = 0; i < 18; i++) bpList.push((apiList[i] && apiList[i].HeroID > 0) ? apiList[i].HeroID : 0);
    } else {
      var src = { hb: state.home_ban_override || [], ab: state.away_ban_override || [], hp: hSwap, ap: aSwap };
      for (i = 0; i < 18; i++) {
        var heroId = parseInt(src[MANUAL_MAP[i][0]][MANUAL_MAP[i][1]], 10) || 0;
        bpList.push(heroId);
        if (heroId > 0 && currentLength === i) currentLength = i + 1;
      }
    }

    var hBan = 0, aBan = 0, hPick = 0, aPick = 0;
    var pickedNow = {};
    for (i = 0; i < 18; i++) {
      var act = SEQ[i];
      var hid = bpList[i];
      if (act.type === 'B') {
        var bIdx = act.camp === 1 ? hBan++ : aBan++;
        var img = $((act.camp === 1 ? 'hb' : 'ab') + '-' + bIdx);
        if (hid > 0) {
          hokSetSrc(img, heroImg(hid));
          if (!img.classList.contains('banned')) {
            img.classList.add('banned');
            (function (el) { setTimeout(function () { if (el.classList.contains('banned')) el.classList.add('grayscale'); }, 2000); })(img);
          }
        } else {
          img.classList.remove('banned', 'grayscale');
          hokSetSrc(img, '');
        }
        continue;
      }

      var pIdx = act.camp === 1 ? hPick++ : aPick++;
      var side = act.camp === 1 ? 'home' : 'away';
      var show = hid;
      if ((mode === 'API' && currentLength >= 18) || mode === 'MANUAL') {
        if (act.camp === 1 && hSwap[pIdx]) show = hSwap[pIdx];
        if (act.camp === 2 && aSwap[pIdx]) show = aSwap[pIdx];
      }

      var heroEl = $(side + '-hero-' + pIdx);
      var boxEl = $(side + '-box-' + pIdx);
      var doubleStart = currentLength === 5 || currentLength === 7 || currentLength === 15;
      var active = i === currentLength || (doubleStart && i === currentLength + 1);
      boxEl.classList.toggle('picking', active);
      // Flame element behind the player: only decode/play on the slot that's picking.
      var pickEl = $(side + '-pickel-' + pIdx);
      if (active && pickEl.paused) pickEl.play().catch(function () {});
      else if (!active && !pickEl.paused) pickEl.pause();

      var key = side + '-' + pIdx;
      if (show > 0) {
        if (revealedHeroes[key] !== show) { revealedHeroes[key] = show; triggerStatsAnimation(side, pIdx, show); }
        // Collect picked heroes; the voice plays below only for heroes new to the set.
        if (hid > 0) pickedNow[hid] = true;
        hokSetSrc($(side + '-heroimg-' + pIdx), heroImg(show));
        setHeroVideo($(side + '-herovid-' + pIdx), heroVid(show));
        heroEl.classList.add('picked');
      } else {
        revealedHeroes[key] = 0;
        heroEl.classList.remove('picked');
        hokSetSrc($(side + '-heroimg-' + pIdx), '');
        setHeroVideo($(side + '-herovid-' + pIdx), '');
      }
    }

    // Baseline taken once real draft data has rendered: picks from now on get their voice line.
    // Voice only for a hero that wasn't picked before — swaps/reorders keep the same set, so no replay.
    // A poll with no draft data is skipped, so a hiccup doesn't re-voice every hero on the next one.
    if (data.state && (mode === 'MANUAL' || data.draft)) {
      for (var vh in pickedNow) if (!voicedHeroes[vh] && heroAudioPrimed) playHeroVoice(+vh);
      voicedHeroes = pickedNow;
      heroAudioPrimed = true;
    }

    // Turn indicator, once per step change (not restarted on the 2nd pick of a double pick).
    if (currentLength !== currentStepCount) {
      var prevStep = currentStepCount;
      currentStepCount = currentLength;
      if (currentLength < 18) {
        var secondOfDouble = currentLength === 6 || currentLength === 8 || currentLength === 16;
        if (!secondOfDouble || prevStep === -1) {
          var cur = SEQ[secondOfDouble ? currentLength - 1 : currentLength];
          var lastEvent = mode === 'API' && apiList && apiList[currentLength - 1];
          startTurn(cur, lastEvent && lastEvent.Dteventtime);
        }
      } else {
        endTurns();
      }
    }
  });

  initUI();
})();
