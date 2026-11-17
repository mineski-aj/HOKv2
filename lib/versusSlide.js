// lib/versusSlide.js — data for the Versus Slide (fullscreen.html), usually
// shown after the draft, before the game. Everything comes from the Match
// Board + the draft:
//   teams   team_1 (left) / team_2 (right): abbr, full name, series score
//   texts   lib/matchInfo.js (Match Board → Match Info): stage + "MATCH m - GAME g · BEST OF n"
//   players team_N_players in Match Board order (Clash → Roam)
//   heroes  same rule as the Draft Pick page: slot i = the dashboard pick
//           order override (role swap) once the draft is complete / in MANUAL
//           mode, else the camp's i-th pick in the ban/pick list. If the draft
//           has nothing for a side, the live player list (nickname match) is used.
const appState  = require('./appState');
const dataStore = require('./dataStore');

function draftPicks() {
  let list = dataStore.readJSON('ban_pick_list.json').BanPickList || [];
  if (!list.length) {
    const d = dataStore.readJSON('battle_detail.json');
    list = (d.BattleDetail ? d.BattleDetail.BanPickList : d.BanPickList) || [];
  }
  const picks = { 1: [], 2: [] };
  list.forEach((bp) => {
    const camp = parseInt(bp.Camp, 10), hero = parseInt(bp.HeroID, 10) || 0;
    if (!bp.IsBan && picks[camp]) picks[camp].push(hero);
  });
  return picks;
}

function build() {
  const s = appState.get();
  const fullNames = dataStore.teamNameMap();
  const manual = (s.draft_mode || 'API') === 'MANUAL';
  const picks = draftPicks();
  const complete = picks[1].filter(Boolean).length + picks[2].filter(Boolean).length >= 10;

  // Live heroes by nickname (fallback only).
  const live = {};
  (dataStore.readJSON('player_list.json').HOKPlayerList || []).forEach((p) => {
    if (p.NickName && parseInt(p.HeroID, 10)) live[p.NickName.toLowerCase()] = parseInt(p.HeroID, 10);
  });

  const team = (n, camp, swap) => {
    const abbr = (s[`team_${n}_abbr`] || '').toUpperCase();
    const names = s[`team_${n}_players`] || [];
    const sidePicks = picks[camp];
    const players = [0, 1, 2, 3, 4].map((i) => {
      const name = names[i] || '';
      let heroId = 0;
      if ((manual || complete) && parseInt(swap[i], 10)) heroId = parseInt(swap[i], 10);
      else if (!manual) heroId = sidePicks[i] || 0;
      if (!heroId && name) heroId = live[name.toLowerCase()] || 0;
      return { name, heroId };
    });
    return { abbr, fullName: fullNames[abbr] || abbr, score: s[`team_${n}_score`] || 0, players };
  };

  return {
    stageText: require('./matchInfo').build(s).stageText,
    seriesText: require('./matchInfo').build(s).fullText,
    home: team(1, 1, s.home_role_swap || []),
    away: team(2, 2, s.away_role_swap || []),
  };
}

module.exports = { build };
