// lib/ledEvents.js — data for LED Events (html/led-events.html). HOME = Match Board Team 1 ALWAYS, on the
// top table, whichever side (camp) they play: the camp comes from the dashboard's First Pick setting (the
// first-pick team is camp 1 — same rule Companion uses). `ledevents_swap` (dashboard Control → LED Events) flips
// that mapping by hand (in MANUAL mode it just exchanges the two tables). Heroes come from the draft only (no live fallback).
const appState = require('./appState');

function build() {
  const s = appState.get();
  const manual = (s.draft_mode || 'API') === 'MANUAL';
  const swap = !!s.ledevents_swap;
  if (manual) {
    // MANUAL: heroes come from the dashboard's HOME / AWAY inputs (per team, no camps), so First Pick doesn't
    // apply — Swap simply exchanges the two tables.
    const vs = require('./versusSlide').build({ draftOnly: true });
    return { homeCamp: swap ? 2 : 1, swap, manual, firstPick: null, home: swap ? vs.away : vs.home, away: swap ? vs.home : vs.away };
  }
  const firstPickHome = (s.draft_first_pick || 'HOME') !== 'AWAY';
  let homeCamp = firstPickHome ? 1 : 2;
  if (swap) homeCamp = 3 - homeCamp;
  const vs = require('./versusSlide').build({ draftOnly: true, camps: [homeCamp, 3 - homeCamp] });
  return { homeCamp, swap, manual, firstPick: firstPickHome ? 'HOME' : 'AWAY', home: vs.home, away: vs.away };
}

module.exports = { build };
