// html/js/overlay-killevents.js — auto-detected kill events.
// Detects per player (diff against the previous poll): First Blood, Double,
// Triple, Quadra, Penta Kill, ACE (VSTAllDeadCnt). The first poll of a battle
// (and every poll while the feature is disabled) only records a baseline, so
// nothing old ever fires. Armed by feature toggle 'killevents'.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var currentBattleId = '';
  var prevData = {};
  var isFirstFetch = true;
  var csvTeamMap = {};

  hokCsv.onChange(function (text) {
    var map = {};
    text.split(/\r?\n/).slice(1).forEach(function (line) {
      var cols = line.split(',');
      var name = (cols[0] || '').trim(), abbr = (cols[1] || '').trim();
      if (abbr && name) map[abbr] = name;
    });
    csvTeamMap = map;
  });
  window.hokTeamFullName = function (abbr) { return csvTeamMap[abbr] || null; };

  HokPoll.register(function (data) {
    var state = data.state || {}, ingame = data.ingame || {}, teamData = data.teams || {};

    if (state.battle_id !== currentBattleId) { currentBattleId = state.battle_id; prevData = {}; isFirstFetch = true; }

    var abbrOf = function (camp) { return camp === 1 ? state.team_1_abbr : state.team_2_abbr; };
    var fullNameOf = function (camp) {
      var abbr = abbrOf(camp);
      if (csvTeamMap[abbr]) return csvTeamMap[abbr];
      var list = teamData.response && teamData.response.HOKTeamList;
      if (list) { var t = list.find(function (x) { return x.Camp === camp; }); if (t && t.TeamName) return t.TeamName; }
      return abbr;
    };

    var enabled = HokFeatures.killevents;

    (ingame.players || []).forEach(function (p) {
      var uid = p.PlayerUID || p.openid;
      var prev = prevData[uid] || (prevData[uid] = { fb: 0, d: 0, t: 0, q: 0, p: 0, ace: 0 });
      var cur = {
        d: p.VTDoubleKill || 0, t: p.VTTripleKill || 0, q: p.VTQuataryKill || 0, p: p.VTPentaKill || 0,
        fb: p.FirstBloodTime > 0 ? 1 : 0, ace: p.VSTAllDeadCnt || 0,
      };
      if (isFirstFetch || !enabled) { Object.assign(prev, cur); return; }

      var push = function (type, name) { HokEvents.push({ category: 'kp', type: type, name: name, logo: abbrOf(p.Camp) }); };
      if (cur.d > prev.d) { push('DOUBLE KILL', p.NickName); prev.d = cur.d; }
      if (cur.t > prev.t) { push('TRIPLE KILL', p.NickName); prev.t = cur.t; }
      if (cur.q > prev.q) { push('QUADRA KILL', p.NickName); prev.q = cur.q; }
      if (cur.p > prev.p) { push('PENTA KILL', p.NickName); prev.p = cur.p; }
      if (cur.fb > 0 && prev.fb === 0) { push('FIRST BLOOD', p.NickName); prev.fb = 1; }
      if (cur.ace > prev.ace) { push('ACE', fullNameOf(p.Camp)); prev.ace = cur.ace; }
    });

    isFirstFetch = false;
  });

  // Rendering: js/overlay-knc.js (knckill videos, 3 s per event).
  HokEvents.register('kp', function (event, done) { HokKnc.play(event, done); });

  // Edit/preview: hold one event on screen with sample data.
  window.hokHoldKillEvent = function (type) {
    var s = window.hokLastState || {};
    var abbr = s.team_1_abbr || 'TEAM';
    var name = type === 'ACE' ? (csvTeamMap[abbr] || abbr + ' ESPORTS') : ((s.team_1_players && s.team_1_players[0]) || abbr + '.Player1');
    HokKnc.hold({ type: type, name: name, logo: abbr });
  };
})();
