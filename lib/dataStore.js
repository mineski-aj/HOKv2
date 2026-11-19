// lib/dataStore.js — live HOK API snapshots in data/*.json, the CSV
// database, and the worker status file.
const fs   = require('fs');
const path = require('path');
const { DATA_DIR, STATUS_FILE, ROOT } = require('./config');
const TEAM_COUNTRIES_FILE = path.join(ROOT, 'team_countries.json');

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

// { ABBR: 'ID' } — each team's country = the most common NATIONALITY (col 4)
// among CSV players whose nickname prefix ("KAGE.Fei" → KAGE) is the team
// code. Flags: assets/images/flags/<COUNTRY>.png (CN, ID, MY, PH drawn).
// Overridden per team by team_countries.json (committed) then server_state.json `team_countries`.
const COUNTRY_CODES = {
  INDONESIA: 'ID', MALAYSIA: 'MY', CHINA: 'CN', PHILIPPINES: 'PH', PHILIPPINE: 'PH', FILIPINA: 'PH',
  SINGAPORE: 'SG', SINGAPURA: 'SG', THAILAND: 'TH', VIETNAM: 'VN', 'VIET NAM': 'VN', MYANMAR: 'MM', CAMBODIA: 'KH',
};
function teamCountryMap() {
  const counts = {};
  const text = readCsv();
  if (text) text.split(/\r?\n/).slice(1).forEach((line) => {
    const cols = line.split(',');
    const nick = (cols[3] || '').trim(), nat = (cols[4] || '').trim().toUpperCase();
    if (!nick || !nat || nick.indexOf('.') < 1) return;
    const abbr = nick.split('.')[0].toUpperCase();
    const code = COUNTRY_CODES[nat] || nat.slice(0, 2);
    (counts[abbr] = counts[abbr] || {})[code] = (counts[abbr][code] || 0) + 1;
  });
  const map = {};
  Object.keys(counts).forEach((abbr) => {
    map[abbr] = Object.keys(counts[abbr]).sort((a, b) => counts[abbr][b] - counts[abbr][a])[0];
  });
  // Overrides, later wins: team_countries.json (committed config, survives state resets)
  // → server_state.json team_countries. Keys are matched case-insensitively.
  const addAll = (obj) => Object.keys(obj || {}).forEach((k) => {
    if (k.charAt(0) !== '_' && obj[k]) map[k.toUpperCase()] = String(obj[k]).toUpperCase();
  });
  try { addAll(JSON.parse(fs.readFileSync(TEAM_COUNTRIES_FILE, 'utf8'))); } catch (e) {}
  let s = {};
  try { s = require('./appState').get(); addAll(s.team_countries); } catch (e) {}
  // Also answer under every spelling in use (Match Board "Hero", CSV "HERO"), so callers can look up the abbr as-is.
  const spellings = Object.keys(teamNameMap()).concat([s.team_1_abbr, s.team_2_abbr]);
  spellings.forEach((a) => { if (a && map[a.toUpperCase()] && !map[a]) map[a] = map[a.toUpperCase()]; });
  return map;
}

function writeStatus(obj) { fs.writeFileSync(STATUS_FILE, JSON.stringify(obj)); }
function readStatus() {
  try { return fs.existsSync(STATUS_FILE) ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) : { status: 'IDLE' }; }
  catch (e) { return { status: 'IDLE' }; }
}

module.exports = { saveData, saveRaw, readJSON, clearBattleFiles, readCsv, writeCsv, teamNameMap, teamCountryMap, writeStatus, readStatus };
