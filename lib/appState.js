// lib/appState.js — persisted dashboard configuration (server_state.json):
// API credentials, battle/OB ids, teams, scores, draft overrides, LED and
// Companion settings. Live data never goes here (see lib/dataStore.js).
const fs = require('fs');
const { STATE_FILE } = require('./config');

const DEFAULTS = {
  app_id: 'hok_met_ph_tournament',
  app_secret: 'mdaRyVtFemRYafsyUMmqcPQsPvhZkLgH',
  base_url: 'https://hok-sg-match.playerinfinite.com',
  dc_app_id: '',
  dc_app_secret: '',
  datacenter_url: 'https://hok-esports.playerinfinite.com',
  battle_id: '',
  ob_open_id: '14721625020824982866',
  csv_url: '',
  season_ids: '',
  team_1_abbr: '', team_1_score: 0, team_1_players: [],
  team_2_abbr: '', team_2_score: 0, team_2_players: [],
  last_updated: 0,
};

function get() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('[appState] server_state.json unreadable:', e.message);
  }
  return Object.assign({}, DEFAULTS);
}

function update(partial) {
  const merged = Object.assign({}, get(), partial || {});
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 4));
  return merged;
}

module.exports = { get, update };
