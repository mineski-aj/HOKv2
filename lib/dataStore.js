// lib/dataStore.js — live HOK API snapshots in data/*.json, the CSV
// database, and the worker status file.
const fs   = require('fs');
const path = require('path');
const { DATA_DIR, STATUS_FILE } = require('./config');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const BATTLE_FILES = ['battle_detail.json', 'team_list.json', 'player_list.json', 'event_list.json', 'ban_pick_list.json', 'player_panel.json'];
const CSV_FILE = path.join(DATA_DIR, 'database.csv');

// Only successful responses (ret === 0) overwrite the last good snapshot.
function saveData(filename, data) {
  if (data && !data.error && data.ret === 0) {
    const output = { fetched_at: new Date().toISOString(), timestamp: Math.floor(Date.now() / 1000), data };
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(output, null, 2));
  }
}

// Same wrapper as saveData, for responses that don't use `ret` (Player Panel).
function saveRaw(filename, data) {
  const output = { fetched_at: new Date().toISOString(), timestamp: Math.floor(Date.now() / 1000), data };
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(output, null, 2));
}

function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  try { return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).data || {}) : {}; }
  catch (e) { return {}; }
}

function clearBattleFiles() {
  BATTLE_FILES.forEach((f) => { const p = path.join(DATA_DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p); });
  if (fs.existsSync(STATUS_FILE)) fs.unlinkSync(STATUS_FILE);
}

function readCsv() {
  return fs.existsSync(CSV_FILE) ? fs.readFileSync(CSV_FILE, 'utf8') : null;
}
function writeCsv(text) { fs.writeFileSync(CSV_FILE, text, 'utf8'); }

// { ABBR: "Full Team Name" } from the CSV's first two columns.
function teamNameMap() {
  const map = {};
  const text = readCsv();
  if (!text) return map;
  text.split(/\r?\n/).slice(1).forEach((line) => {
    const cols = line.split(',');
    const name = (cols[0] || '').trim(), abbr = (cols[1] || '').trim();
    if (name && abbr) map[abbr] = name;
  });
  return map;
}

function writeStatus(obj) { fs.writeFileSync(STATUS_FILE, JSON.stringify(obj)); }
function readStatus() {
  try { return fs.existsSync(STATUS_FILE) ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) : { status: 'IDLE' }; }
  catch (e) { return { status: 'IDLE' }; }
}

module.exports = { saveData, saveRaw, readJSON, clearBattleFiles, readCsv, writeCsv, teamNameMap, writeStatus, readStatus };
