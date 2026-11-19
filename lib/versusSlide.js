// lib/versusSlide.js — data for the Versus Slide (fullscreen.html), usually
// shown after the draft, before the game. Everything comes from the Match
// Board + the draft:
//   teams   team_1 (left) / team_2 (right): abbr, full name, series score
//   texts   lib/matchInfo.js (Match Board → Match Info): stage + "MATCH m - GAME g · BEST OF n"
//   players team_N_players in Match Board order (Clash → Roam)
//   heroes  LIVE API FIRST (operator's rule, also for Mic Check): each player's HeroID
//           from player_list.json (HOKPlayerList) of the CURRENT battle (s.battle_id —
//           the previous game's list is ignored), matched by nickname (exact, then
//           one name a prefix of the other, e.g. Match Board "KAGE.Senkoo" = live
//           "KAGE.Senkooo"). Only when the live list has no hero for a player: the
//           Draft Pick rule — dashboard pick-order override (role swap) once the draft
//           is complete / in MANUAL mode, else the camp's i-th pick in the ban/pick list.
//           opts.draftOnly (LED Events) skips the live list entirely.
//           opts.matchBoard (Mic Check MANUAL) = players are the Match Board rosters, never the game's player panel.
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

// opts.draftOnly: heroes come ONLY from the draft (picks / dashboard overrides) — no fallback to the live
// player list, so a cleared draft stays empty (LED Events would otherwise "pick" last game's heroes).
function build(opts) {
  opts = opts || {};
  const s = appState.get();
  const fullNames = dataStore.teamNameMap();
  const manual = (s.draft_mode || 'API') === 'MANUAL';
  const picks = draftPicks();
  const complete = picks[1].filter(Boolean).length + picks[2].filter(Boolean).length >= 10;

  // Live heroes (current battle only) — the primary source.
  const liveRows = opts.draftOnly ? [] : (dataStore.readJSON('player_list.json').HOKPlayerList || []).filter((p) =>
    p.NickName && parseInt(p.HeroID, 10) && (!s.battle_id || !p.BattleID || p.BattleID === s.battle_id));
  const liveHeroes = (abbr, names) => {
    const prefix = (n) => (n.split('.')[0] || '').toUpperCase();
    let rows = liveRows.filter((p) => prefix(p.NickName) === abbr);
    if (!rows.length) rows = liveRows;
    const used = new Set();
    const out = names.map(() => 0);
    const take = (i, p) => { out[i] = parseInt(p.HeroID, 10); used.add(p); };
    names.forEach((n, i) => {          // pass 1: exact nickname
      const p = n && rows.find((r) => !used.has(r) && r.NickName.toLowerCase() === n.toLowerCase());
      if (p) take(i, p);
    });
    names.forEach((n, i) => {          // pass 2: one name is a prefix of the other (typos / truncation), unique only
      if (out[i] || !n) return;
      const a = n.toLowerCase();
      const hits = rows.filter((r) => { if (used.has(r)) return false; const b = r.NickName.toLowerCase(); return a.startsWith(b) || b.startsWith(a); });
      if (hits.length === 1) take(i, hits[0]);
    });
    return out;
  };

  // opts.camps = [camp of Team 1, camp of Team 2] (default [1, 2]); LED Events passes the First Pick mapping.
  const camps = opts.camps || [1, 2];
  // Players + heroes come from the GAME API (player panel / list of the current battle, role by the game's Pos),
  // whatever teams the Match Board holds — it only supplies team name / score / flag. HOME = Match Board Team 1 (the
  // camp postHexagon matched). Falls back to the Match Board roster only while the game has no players yet.
  let game = null;
  if (!opts.draftOnly && !opts.camps && !opts.matchBoard) {
    const ph = require('./postHexagon').build();
    const any = ph.roles.some((r) => r.home || r.away);
    if (any && (!s.battle_id || !ph.gameBattleId || ph.gameBattleId === s.battle_id)) game = ph;
  }
  const team = (n, camp, swap) => {
    const abbr = (s[`team_${n}_abbr`] || '').toUpperCase();
    if (game) {
      const side = n === 1 ? 'home' : 'away';
      const sidePicks2 = picks[n === 1 ? game.homeCamp : 3 - game.homeCamp];
      const players = game.roles.map((r, i) => {
        const p = r[side];
        return { name: p ? p.name : '', heroId: manual ? (parseInt(swap[i], 10) || 0) : ((p && p.heroId) || sidePicks2[i] || 0) };   // MANUAL: Draft tab picks only
      });
      return { abbr, fullName: fullNames[abbr] || abbr, country: dataStore.teamCountryMap()[abbr] || '', score: s[`team_${n}_score`] || 0, players };
    }
    const names = s[`team_${n}_players`] || [];
    const sidePicks = picks[camp];
    const live = liveHeroes(abbr, [0, 1, 2, 3, 4].map((i) => names[i] || ''));
    const players = [0, 1, 2, 3, 4].map((i) => {
      const name = names[i] || '';
      let heroId = manual ? 0 : (live[i] || 0);   // MANUAL: Draft tab picks win over the live game
      if (!heroId) {
        if ((manual || complete) && parseInt(swap[i], 10)) heroId = parseInt(swap[i], 10);
        else if (!manual) heroId = sidePicks[i] || 0;
      }
      return { name, heroId };
    });
    return { abbr, fullName: fullNames[abbr] || abbr, country: dataStore.teamCountryMap()[abbr] || '', score: s[`team_${n}_score`] || 0, players };
  };

  return {
    stageText: require('./matchInfo').build(s).stageText,
    seriesText: require('./matchInfo').build(s).fullText,
    home: team(1, camps[0], s.home_role_swap || []),
    away: team(2, camps[1], s.away_role_swap || []),
  };
}

module.exports = { build };
