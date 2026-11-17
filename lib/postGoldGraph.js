// lib/postGoldGraph.js — data for the Post Gold Graph scene (fullscreen.html):
// shared header data (lib/postHexagon.js build), per-team objective/gold/KDA/
// tower totals, and the gold-difference timeline from HOME's point of view
// (positive = HOME ahead).
const dataStore    = require('./dataStore');
const postHexagon  = require('./postHexagon');
const goldTimeline = require('./goldTimeline');

function teamStats(t) {
  t = t || {};
  return {
    tyrant:         t.KillBigDragonCnt || 0,
    shadowTyrant:   t.KillDarkBigDragonCnt || 0,
    tempestDragon:  t.KillYuanGuBaoJunCnt || 0,
    overlord:       t.KillXiaoZhuzaiCnt || 0,
    shadowOverlord: t.KillBaronCnt || 0,
    gold:           t.Gold || 0,
    kda:            `${t.K || 0}/${t.D || 0}/${t.A || 0}`,
    towers:         t.KillTowerNumber || 0,
  };
}

function build() {
  const base = postHexagon.build();
  const teams = dataStore.readJSON('team_list.json').HOKTeamList || [];
  const homeCamp = base.homeCamp, awayCamp = homeCamp === 1 ? 2 : 1;
  const team = (c) => teams.find((t) => t.Camp === c);
  const battleId = (teams[0] && teams[0].BattleID) || base.battleId;

  // [t, homeGold - awayGold]
  let timeline = goldTimeline.get(battleId).map((s) => [s[0], homeCamp === 1 ? s[1] - s[2] : s[2] - s[1]]);
  const finalDiff = ((team(homeCamp) || {}).Gold || 0) - ((team(awayCamp) || {}).Gold || 0);
  let recorded = true;
  if (timeline.length < 2) {
    // Nothing recorded for this battle (e.g. the server wasn't running during
    // the game): straight line from 0 to the final difference, flagged.
    recorded = false;
    timeline = [[0, 0], [base.gameTime || 1, finalDiff]];
  } else if (timeline[0][0] > 0) {
    timeline.unshift([0, 0]);
  }

  return Object.assign({}, base, {
    homeStats: teamStats(team(homeCamp)),
    awayStats: teamStats(team(awayCamp)),
    timeline,
    timelineRecorded: recorded,
    timelineSamples: recorded ? timeline.length : 0,
  });
}

module.exports = { build };
