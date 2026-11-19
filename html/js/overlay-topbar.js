// html/js/overlay-topbar.js — In-Game Top Bar data (scores, logos, kills,
// Tyrant/tower counts, gold, gold-diff counter, anchored game timer).
// Show/hide is NOT polled — it arrives over SSE ('topbar'), see overlay.html.
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /* ── Gold-diff counter animation ─────────────────────────────── */
  var currentVals = {};
  var animFrames = {};

  function formatAnim(val, isGold, isDiff) {
    if (isGold || isDiff) {
      var s = val < 1000 ? Math.floor(val).toString() : (val / 1000).toFixed(1) + (isDiff ? 'k' : 'K');
      return isDiff ? '+' + s : s;   // gold "19.5K", lead tag "+10.5k" (as on the template)
    }
    return Math.floor(val);
  }

  function animateValue(id, endVal, isGold, isDiff) {
    var el = $(id);
    if (!el) return;
    var startVal = currentVals[id] !== undefined ? currentVals[id] : 0;
    if (startVal === endVal) { el.innerText = formatAnim(endVal, isGold, isDiff); return; }
    if (animFrames[id]) cancelAnimationFrame(animFrames[id]);
    var duration = 500;
    var startTime = performance.now();
    function update(now) {
      var progress = Math.min((now - startTime) / duration, 1);
      var current = startVal + (endVal - startVal) * progress;
      currentVals[id] = current;
      el.innerText = formatAnim(current, isGold, isDiff);
      if (progress < 1) animFrames[id] = requestAnimationFrame(update);
      else { currentVals[id] = endVal; el.innerText = formatAnim(endVal, isGold, isDiff); }
    }
    animFrames[id] = requestAnimationFrame(update);
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60).toString().padStart(2, '0');
    var s = (seconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  /* ── Anchored timer: ticks locally between API updates, re-anchors on
        >3 s drift, pauses when the API time is stuck for 5 polls ── */
  var anchorApiTime = 0, anchorLocalTime = 0, lastApiTime = -1, stuckCount = 0, isPaused = true, currentDisplayedTime = -1;

  /* Operator fine-tune (Dashboard → Control → In-Game Overlay → Timer Offset): seconds added to the
     displayed timer to make up for API delay. Saved as ingame_timer_offset in server_state.json. */
  var timerOffset = 0, lastBaseTime = -1;
  function renderTimer() {
    var t = lastBaseTime + timerOffset;
    if (lastBaseTime < 0 || t < 0) return;
    if (t !== currentDisplayedTime) { currentDisplayedTime = t; $('timer').innerText = formatTime(t); }
  }
  setInterval(function () {
    if (!isPaused && anchorLocalTime > 0) {
      lastBaseTime = anchorApiTime + Math.floor((performance.now() - anchorLocalTime) / 1000);
      renderTimer();
    }
  }, 100);

  function updateTimer(apiTime) {
    if (apiTime > 0) {
      if (apiTime === lastApiTime) {
        if (++stuckCount >= 5) isPaused = true;
      } else {
        stuckCount = 0;
        if (isPaused) {
          isPaused = false; anchorApiTime = apiTime; anchorLocalTime = performance.now();
        } else {
          var calc = anchorApiTime + Math.floor((performance.now() - anchorLocalTime) / 1000);
          if (anchorLocalTime === 0 || Math.abs(calc - apiTime) > 3) { anchorApiTime = apiTime; anchorLocalTime = performance.now(); }
        }
      }
    } else {
      isPaused = true; anchorApiTime = 0; anchorLocalTime = 0; currentDisplayedTime = -1; lastBaseTime = -1;
      hokSetText($('timer'), '00:00');
    }
    lastApiTime = apiTime;
  }

  /* ── Which team is on which side: majority nickname prefix per camp ── */
  function majorityTeam(list) {
    var counts = {};
    list.forEach(function (p) {
      var nick = p.NickName || '';
      if (nick.indexOf('.') !== -1) { var a = nick.split('.')[0].toUpperCase(); counts[a] = (counts[a] || 0) + 1; }
    });
    var best = '', max = 0;
    Object.keys(counts).forEach(function (t) { if (counts[t] > max) { max = counts[t]; best = t; } });
    return best;
  }

  HokPoll.register(function (data) {
    var state = data.state || {};
    var ingame = data.ingame || {};
    var teamData = data.teams || {};

    var off = parseInt(state.ingame_timer_offset, 10) || 0;
    if (off !== timerOffset) { timerOffset = off; renderTimer(); }   // also refreshes a paused (stuck / ended) timer

    var leftAbbr = state.team_1_abbr, rightAbbr = state.team_2_abbr;
    var leftScore = state.team_1_score || 0, rightScore = state.team_2_score || 0;

    if (ingame.players && ingame.players.length > 0) {
      var c1 = majorityTeam(ingame.players.filter(function (p) { return p.Camp === 1; }));
      var c2 = majorityTeam(ingame.players.filter(function (p) { return p.Camp === 2; }));
      if (c1 || c2) {
        leftAbbr = c1 || leftAbbr;
        rightAbbr = c2 || rightAbbr;
        if (c1 === state.team_2_abbr && c2 === state.team_1_abbr) {
          leftScore = state.team_2_score || 0; rightScore = state.team_1_score || 0;
        } else {
          if (c1 === state.team_1_abbr) leftScore = state.team_1_score || 0;
          else if (c1 === state.team_2_abbr) leftScore = state.team_2_score || 0;
          if (c2 === state.team_2_abbr) rightScore = state.team_2_score || 0;
          else if (c2 === state.team_1_abbr) rightScore = state.team_1_score || 0;
        }
      }
    }

    if (leftAbbr)  hokSetSrc($('home-logo'), hokLogo(leftAbbr));
    if (rightAbbr) hokSetSrc($('away-logo'), hokLogo(rightAbbr));
    // Flags: assets/images/flags/<COUNTRY>.png (team → country from /api/state team_countries) — hidden while missing
    var flagOf = function (abbr) { var tc = state.team_countries || {}, c = tc[abbr] || tc[String(abbr).toUpperCase()]; return c ? hokAsset('images/flags/' + c + '.png') : ''; };
    [['home-flag', leftAbbr], ['away-flag', rightAbbr]].forEach(function (t) {
      var img = $(t[0]);
      if (!img.dataset.wired) { img.dataset.wired = '1'; img.addEventListener('error', function () { img.style.visibility = 'hidden'; }); img.addEventListener('load', function () { img.style.visibility = ''; }); }
      var f = t[1] ? flagOf(t[1]) : '';
      if (f) hokSetSrc(img, f); else img.style.visibility = 'hidden';
    });
    // Right panel (Match Board → Match Info, built server-side by lib/matchInfo.js):
    // GROUP STAGE / MATCH 1 - GAME 3 / BEST OF 5
    var mi = state.match_info || {};
    hokSetText($('tb-stage'), mi.stageText || '');
    hokSetText($('tb-game'), mi.matchGameText || '');
    hokSetText($('tb-series'), mi.bestOfText || '');
    hokSetText($('home-score'), leftScore);
    hokSetText($('away-score'), rightScore);
    hokSetText($('home-abbr-ingame'), leftAbbr || '');
    hokSetText($('away-abbr-ingame'), rightAbbr || '');

    if (!teamData.response || !teamData.response.HOKTeamList) return;
    var blue = teamData.response.HOKTeamList[0] || {};
    var red  = teamData.response.HOKTeamList[1] || {};

    hokSetText($('home-kill'), blue.K || 0);
    hokSetText($('away-kill'), red.K || 0);
    hokSetText($('home-dragon'), blue.KillDragonNumber || 0);
    hokSetText($('away-dragon'), red.KillDragonNumber || 0);
    hokSetText($('home-tower'), blue.KillTowerNumber || 0);
    hokSetText($('away-tower'), red.KillTowerNumber || 0);

    updateTimer(blue.CurrentGameTime || 0);

    // Total gold = cut, gold difference = counter
    var homeGold = blue.Gold || 0, awayGold = red.Gold || 0;
    hokSetText($('home-gold'), formatAnim(homeGold, true, false));
    hokSetText($('away-gold'), formatAnim(awayGold, true, false));

    var diff = homeGold - awayGold;
    var hd = $('home-diff'), ad = $('away-diff');
    if (diff > 0)      { hd.style.opacity = 1; ad.style.opacity = 0; animateValue('home-diff', diff, false, true); }
    else if (diff < 0) { hd.style.opacity = 0; ad.style.opacity = 1; animateValue('away-diff', Math.abs(diff), false, true); }
    else               { hd.style.opacity = 0; ad.style.opacity = 0; }
  });
})();
