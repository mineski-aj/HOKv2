// lib/goldTimeline.js — records both camps' team gold over game time, because
// the HOK API only reports the CURRENT gold (no history). Fed by lib/poller.js
// on every successful tick; one sample per game second while the game runs.
// Persisted to data/gold_timeline.json (survives restarts); a new battle id
// starts a fresh timeline. Read by the Post Gold Graph scene.
const fs   = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'gold_timeline.json');
let tl = load();          // { battleId, samples: [[t, gold1, gold2], ...] }
let dirty = false;

function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (d && Array.isArray(d.samples)) return d; } catch (e) {}
  return { battleId: '', samples: [] };
}

// Throttled write (the poller ticks every second).
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try { fs.writeFileSync(FILE, JSON.stringify(tl)); } catch (e) {}
}, 5000);

function record(battleId, teams) {
  if (!battleId || !Array.isArray(teams) || !teams.length) return;
  if (tl.battleId !== battleId) { tl = { battleId, samples: [] }; dirty = true; }
  const c1 = teams.find((t) => t.Camp === 1) || {};
  const c2 = teams.find((t) => t.Camp === 2) || {};
  const t = Math.max(c1.CurrentGameTime || 0, c2.CurrentGameTime || 0);
  if (!t) return;
  const last = tl.samples[tl.samples.length - 1];
  if (last && t <= last[0]) return;   // one sample per game second; ignore replays/pauses
  tl.samples.push([t, c1.Gold || 0, c2.Gold || 0]);
  dirty = true;
}

function get(battleId) { return tl.battleId === battleId ? tl.samples : []; }

function clear() { tl = { battleId: '', samples: [] }; try { fs.unlinkSync(FILE); } catch (e) {} }

module.exports = { record, get, clear };
