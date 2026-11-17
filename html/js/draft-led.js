// html/js/draft-led.js — Draft LED data. Same 18-step draft as Draft Pick,
// but: hero art is the square ban art, players/teams come from the LED-only
// selection (LED & Companion tab), and FIRST PICK decides which side of the
// wall camp 1 is drawn on. Dashboard HOME inputs are ALWAYS camp 1 (first
// pick) and AWAY inputs camp 2 — only the rendering side flips.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ROLE_ICONS = ['clash-lane', 'jungler', 'mid-lane', 'farm-lane', 'roamer'];
  var SEQ = [
    { type: 'B', c: 1 }, { type: 'B', c: 2 }, { type: 'B', c: 1 }, { type: 'B', c: 2 },
    { type: 'P', c: 1 }, { type: 'P', c: 2 }, { type: 'P', c: 2 }, { type: 'P', c: 1 },
    { type: 'P', c: 1 }, { type: 'P', c: 2 },
    { type: 'B', c: 2 }, { type: 'B', c: 1 }, { type: 'B', c: 2 }, { type: 'B', c: 1 },
    { type: 'P', c: 2 }, { type: 'P', c: 1 }, { type: 'P', c: 1 }, { type: 'P', c: 2 },
  ];
  var MANUAL_MAP = [
    ['hb', 0], ['ab', 0], ['hb', 1], ['ab', 1],
    ['hp', 0], ['ap', 0], ['ap', 1], ['hp', 1], ['hp', 2], ['ap', 2],
    ['ab', 2], ['hb', 2], ['ab', 3], ['hb', 3],
    ['ap', 3], ['hp', 3], ['hp', 4], ['ap', 4],
  ];
  var revealedHeroes = {};

  function initUI() {
    var hb = '', ab = '', hp = '', ap = '';
    for (var i = 0; i < 4; i++) {
      hb += '<div class="ban-box" id="hb-box-' + i + '"><img class="ban-hero" id="hb-' + i + '"><div class="ban-fg"></div></div>';
      ab += '<div class="ban-box" id="ab-box-' + i + '"><img class="ban-hero" id="ab-' + i + '"><div class="ban-fg"></div></div>';
    }
    var box = function (side, i) {
      return '<div class="pick-box" id="' + side + '-box-' + i + '">' +
        '<img class="pick-photo" id="' + side + '-photo-' + i + '" src="' + HOK_DEFAULT_PHOTO + '">' +
        '<img class="pick-hero" id="' + side + '-hero-' + i + '">' +
        '<div class="pick-fg"></div>' +
        '<img class="role-icon" src="/assets/images/role/' + ROLE_ICONS[i] + '.png">' +
        '<div class="player-name" id="' + side + '-name-' + i + '">PLAYER</div>' +
      '</div>';
    };
    for (i = 0; i < 5; i++) { hp += box('home', i); ap += box('away', i); }
    $('home-bans').innerHTML = hb; $('away-bans').innerHTML = ab;
    $('home-picks').innerHTML = hp; $('away-picks').innerHTML = ap;
    document.querySelectorAll('.pick-photo').forEach(function (img) {
      img.addEventListener('error', function () { if (img.getAttribute('src') !== HOK_DEFAULT_PHOTO) img.src = HOK_DEFAULT_PHOTO; });
    });
  }

  HokPoll.register(function (data) {
    var state = data.state || {}, draft = data.draft || {};
    var firstPick = state.draft_first_pick || 'HOME';
    var seq = SEQ.map(function (d) {
      var side = d.c === 1 ? 'home' : 'away';
      if (firstPick !== 'HOME') side = side === 'home' ? 'away' : 'home';
      return { type: d.type, side: side };
    });

    for (var i = 0; i < 5; i++) {
      var h = (state.led_home_players && state.led_home_players[i]) || 'PLAYER ' + (i + 1);
      var a = (state.led_away_players && state.led_away_players[i]) || 'PLAYER ' + (i + 1);
      hokSetText($('home-name-' + i), h);
      hokSetText($('away-name-' + i), a);
      hokSetSrc($('home-photo-' + i), hokPhoto(h));
      hokSetSrc($('away-photo-' + i), hokPhoto(a));
    }

    var mode = state.draft_mode || 'API';
    var bpList = [];
    var currentLength = 0;
    if (mode === 'API') {
      var apiList = (draft.response && draft.response.BanPickList) || [];
      currentLength = apiList.filter(function (x) { return x.HeroID > 0; }).length;
      for (i = 0; i < 18; i++) bpList.push((apiList[i] && apiList[i].HeroID > 0) ? apiList[i].HeroID : 0);
    } else {
      var src = { hb: state.home_ban_override || [], ab: state.away_ban_override || [], hp: state.home_role_swap || [], ap: state.away_role_swap || [] };
      for (i = 0; i < 18; i++) {
        var v = parseInt(src[MANUAL_MAP[i][0]][MANUAL_MAP[i][1]], 10) || 0;
        bpList.push(v);
        if (v > 0 && currentLength === i) currentLength = i + 1;
      }
    }

    var hb = 0, ab = 0, hp = 0, ap = 0;
    for (i = 0; i < 18; i++) {
      var act = seq[i];
      var heroId = bpList[i];
      var active = i === currentLength || ((currentLength === 5 || currentLength === 7 || currentLength === 15) && i === currentLength + 1);

      if (act.type === 'B') {
        var bIdx = act.side === 'home' ? hb++ : ab++;
        var bSide = act.side === 'home' ? 'hb' : 'ab';
        var img = $(bSide + '-' + bIdx);
        var key = bSide + '-' + bIdx;
        if (heroId > 0) {
          hokSetSrc(img, hokAsset('hero/square/' + heroId + '_KOTAK.png'));
          if (revealedHeroes[key] !== heroId) {
            revealedHeroes[key] = heroId;
            img.classList.remove('banned', 'grayscale');
            (function (el) {
              setTimeout(function () { el.classList.add('banned'); }, 50);
              setTimeout(function () { el.classList.add('grayscale'); }, 2000);
            })(img);
          }
        } else {
          revealedHeroes[key] = 0;
          img.classList.remove('banned', 'grayscale');
          hokSetSrc(img, '');
        }
      } else {
        var pIdx = act.side === 'home' ? hp++ : ap++;
        var heroEl = $(act.side + '-hero-' + pIdx);
        $(act.side + '-box-' + pIdx).classList.toggle('picking', active);
        if (heroId > 0) {
          hokSetSrc(heroEl, hokAsset('hero/draftpick/' + heroId + '_TINGGI.png'));
          heroEl.classList.add('picked');
        } else {
          heroEl.classList.remove('picked');
          hokSetSrc(heroEl, '');
        }
      }
    }
  });

  initUI();
})();
