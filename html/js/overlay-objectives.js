// html/js/overlay-objectives.js — auto-detected objective events.
// Per player diff: Tyrant (first one = FIRST TYRANT), Overlord (first one =
// FIRST OVERLORD), Shadow Tyrant, Shadow Overlord, Tempest Dragon.
// Regular box for TYRANT/OVERLORD, epic box for the rest. Armed by 'objectives'.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var currentBattleId = '';
  var prevData = {};
  var firstTyrantTaken = false, firstOverlordTaken = false;
  var isFirstFetch = true;

  HokPoll.register(function (data) {
    var state = data.state || {}, ingame = data.ingame || {};
    window.hokLastState = state;

    if (state.battle_id !== currentBattleId) {
      currentBattleId = state.battle_id; prevData = {};
      firstTyrantTaken = false; firstOverlordTaken = false; isFirstFetch = true;
    }

    var abbrOf = function (camp) { return camp === 1 ? state.team_1_abbr : state.team_2_abbr; };
    var enabled = HokFeatures.objectives;

    (ingame.players || []).forEach(function (p) {
      var uid = p.PlayerUID || p.openid;
      var prev = prevData[uid] || (prevData[uid] = { tyr: 0, ov: 0, shTyr: 0, shOv: 0, temp: 0 });
      var cur = {
        tyr: p.KillBigDragonCnt || 0, ov: p.KillXiaoZhuzaiCnt || 0,
        shTyr: p.KillDarkBigDragonCnt || 0, shOv: p.KillBaronCnt || 0, temp: p.KillYuanGuBaoJunCnt || 0,
      };
      if (isFirstFetch || !enabled) {
        Object.assign(prev, cur);
        if (prev.tyr > 0) firstTyrantTaken = true;
        if (prev.ov > 0) firstOverlordTaken = true;
        return;
      }
      var push = function (type) { HokEvents.push({ category: 'obj', type: type, name: p.NickName, logo: abbrOf(p.Camp) }); };
      if (cur.tyr > prev.tyr) { push(firstTyrantTaken ? 'TYRANT' : 'FIRST TYRANT'); firstTyrantTaken = true; prev.tyr = cur.tyr; }
      if (cur.ov > prev.ov)   { push(firstOverlordTaken ? 'OVERLORD' : 'FIRST OVERLORD'); firstOverlordTaken = true; prev.ov = cur.ov; }
      if (cur.shTyr > prev.shTyr) { push('SHADOW TYRANT'); prev.shTyr = cur.shTyr; }
      if (cur.shOv > prev.shOv)   { push('SHADOW OVERLORD'); prev.shOv = cur.shOv; }
      if (cur.temp > prev.temp)   { push('TEMPEST DRAGON'); prev.temp = cur.temp; }
    });

    isFirstFetch = false;
  });

  // Rendering: js/overlay-knc.js (knckill videos, 3 s per event).
  HokEvents.register('obj', function (event, done) { HokKnc.play(event, done); });

  window.hokHoldObjectiveEvent = function (type) {
    var s = window.hokLastState || {};
    var abbr = s.team_1_abbr || 'TEAM';
    HokKnc.hold({ type: type, name: (s.team_1_players && s.team_1_players[0]) || abbr + '.Player1', logo: abbr });
  };
})();
