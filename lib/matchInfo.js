// lib/matchInfo.js — on-air stage / match / series text, from the Match Board's
// Match Info dropdowns (server_state.json):
//   match_stage    'GROUP STAGE' | 'KNOCKOUTS' | 'GRAND FINALS'   (default GROUP STAGE)
//   match_number   match of the day, 1–10                          (default 1)
//   match_best_of  3 | 5 | 7                                       (default 3)
//   match_day      1–15 — dashboard info only, not on air yet
// GAME n = series score total + 1 while a game is live (or the given
// gameNumber, e.g. Post Hexagon's "after the game" rule), capped at best-of.
// Every overlay reads these strings (/api/state → match_info, and the
// post-hexagon / versus-slide payloads) — no overlay builds its own.
const STAGES = ['GROUP STAGE', 'KNOCKOUTS', 'GRAND FINALS'];

function build(s, gameNumber) {
  s = s || {};
  const bestOf = [3, 5, 7].includes(+s.match_best_of) ? +s.match_best_of : 3;
  const stage = STAGES.includes(s.match_stage) ? s.match_stage : 'GROUP STAGE';
  const match = Math.min(10, Math.max(1, parseInt(s.match_number, 10) || 1));
  const day = Math.min(15, Math.max(1, parseInt(s.match_day, 10) || 1));
  const live = (s.team_1_score || 0) + (s.team_2_score || 0) + 1;
  const game = Math.min(bestOf, Math.max(1, gameNumber || live));
  return {
    stage, day, match, game, bestOf,
    stageText: stage,                                   // "GROUP STAGE"
    matchText: `MATCH ${match}`,                        // "MATCH 1"
    gameText: `GAME ${game}`,                           // "GAME 3"
    matchGameText: `MATCH ${match} - GAME ${game}`,     // "MATCH 1 - GAME 3"
    bestOfText: `BEST OF ${bestOf}`,                    // "BEST OF 5"
    gameBestOfText: `GAME ${game} · BEST OF ${bestOf}`, // "GAME 3 · BEST OF 5"
    fullText: `MATCH ${match} - GAME ${game} · BEST OF ${bestOf}`,
    matchBoText: `MATCH ${match} - BO ${bestOf}`,       // "MATCH 3 - BO 5" (Draft Pick badge)
  };
}

module.exports = { build, STAGES };
