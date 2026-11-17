// lib/micCheck.js — data for Mic Check Home / Mic Check Away (html/michcheck.html).
// One team per page: HOME = Match Board Team 1, AWAY = Team 2 (lib/versusSlide.js
// supplies players + heroes). `michcheck_swap` (dashboard Control) flips which team
// each page shows. The per-page photo/background switches are saved dashboard config
// (server_state.json), delivered here so the page needs one fetch.
const appState = require('./appState');

function build(side) {
  side = side === 'away' ? 'away' : 'home';
  const s = appState.get();
  const vs = require('./versusSlide').build();
  const swap = !!s.michcheck_swap;
  const team = (side === 'home') !== swap ? vs.home : vs.away;
  const heroName = require('./postHexagon').csvMaps().heroName;
  const mi = require('./matchInfo').build(s);
  return {
    side, swap,
    photo: !s[`michcheck_${side}_photo_off`],
    photoForce: [0, 1, 2, 3, 4].map((i) => !!(s[`michcheck_${side}_photo_force`] || [])[i]),   // per player: cam down -> photo shown even while Photo is OFF
    stageText: mi.stageText,
    matchLine: `${mi.matchText} | ${mi.bestOfText}`,
    team: {
      abbr: team.abbr, fullName: team.fullName, country: team.country,
      players: team.players.map((p) => Object.assign({}, p, { heroName: heroName[p.heroId] || '' })),
    },
  };
}

module.exports = { build };
