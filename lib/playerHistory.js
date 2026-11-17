// lib/playerHistory.js — per-game player stats, recorded locally, because the
// HOK APIs we have give no per-player season numbers (Data Center = hero win
// rates / team vs team only). Fed by lib/poller.js on every successful tick:
// the CURRENT battle's entry is overwritten each tick, so when the game ends
// it holds the final numbers. Read by Head to Head (lib/headToHead.js) for
// "per match" averages over every recorded game.
// Persisted to data/player_history.json. NOT cleared by Clear Match (it's the
// tournament history) — clear it from the dashboard (Head to Head → Clear
// history) e.g. after test games.
const fs   = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'player_history.json');
const MAX_GAMES = 300;
let hist = load();        // { battles: { [battleId]: { t, teamKills: {1, 2}, players: [{ uid, name, camp, k, d, a, dmg }] } } }
let dirty = false;

function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (d && d.battles) return d; } catch (e) {}
  return { battles: {} };
}

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try { fs.writeFileSync(FILE, JSON.stringify(hist)); } catch (e) {}
}, 5000);

// players = HOKPlayerList rows of one battle
function entryFrom(players) {
  const rows = (players || []).filter((p) => p && p.NickName);
  if (!rows.length) return null;
  const teamKills = { 1: 0, 2: 0 };
  rows.forEach((p) => { teamKills[p.Camp] = (teamKills[p.Camp] || 0) + (p.K || 0); });
  return {
    t: Date.now(),
    teamKills,
    players: rows.map((p) => ({
      uid: String(p.PlayerUID || ''), name: p.NickName, camp: p.Camp,
      k: p.K || 0, d: p.D || 0, a: p.A || 0, dmg: p.TotalHurtToHero || 0,
    })),
  };
}

function record(battleId, players) {
  if (!battleId) return;
  const e = entryFrom(players);
  if (!e) return;
  const prev = hist.battles[battleId];
  if (prev) e.t = prev.t;                                  // keep first-seen time
  hist.battles[battleId] = e;
  const ids = Object.keys(hist.battles);
  if (ids.length > MAX_GAMES) {
    ids.sort((x, y) => hist.battles[x].t - hist.battles[y].t).slice(0, ids.length - MAX_GAMES).forEach((id) => delete hist.battles[id]);
  }
  dirty = true;
}

// All recorded games (plus `extra` = { battleId, players } for a battle not recorded yet).
function battles(extra) {
  const out = Object.assign({}, hist.battles);
  if (extra && extra.battleId && !out[extra.battleId]) {
    const e = entryFrom(extra.players);
    if (e) out[extra.battleId] = e;
  }
  return out;
}

function count() { return Object.keys(hist.battles).length; }
function clear() { hist = { battles: {} }; dirty = false; try { fs.unlinkSync(FILE); } catch (e) {} }

module.exports = { record, battles, count, clear };
