// lib/poller.js — the HOK API puller. Every FETCH_INTERVAL_MS:
//   1. Ban/pick list via OB_OPEN_ID (always, even after the game ends).
//   2. No battle id (or sleeping) → ask the battle list for the newest one.
//   3. Battle detail / team list / player list / event list → data/*.json.
//   4. Game over (GameStatus 3, Status 4 or a team IsWin) → sleep until a
//      new battle appears, the dashboard saves, or the battle is cleared.
const appState  = require('./appState');
const dataStore = require('./dataStore');
const state     = require('./state');
const { fetchFromHOK } = require('./hokApi');
const goldTimeline = require('./goldTimeline');
const playerHistory = require('./playerHistory');
const { FETCH_INTERVAL_MS } = require('./config');

const w = state.worker;
let timer = null;
let busy  = false;

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

async function tick() {
  const s = appState.get();
  if (!s.app_id) return;

  let battleId = s.battle_id;
  const obOpenId = s.ob_open_id || battleId;

  if (obOpenId) {
    const banPick = await fetchFromHOK('/match_data/api/HOKBanPickList', { ObOpenId: obOpenId }, s);
    if (banPick && !banPick.error && banPick.ret === 0) dataStore.saveData('ban_pick_list.json', banPick);
  }

  if ((!battleId || w.isSleeping) && obOpenId) {
    const bList = await fetchFromHOK('/match_data/api/HOKBattleList', { ObOpenId: obOpenId, page_offset: 0, page_size: 1 }, s);
    if (bList && bList.BattleList && bList.BattleList.length > 0) {
      const newBattleId = bList.BattleList[0].BattleID;
      if (newBattleId !== battleId) {
        battleId = newBattleId;
        appState.update({ battle_id: battleId });
        w.isSleeping = false;
        log(`🚀 NEW MATCH DETECTED: [${battleId}]`);
      }
    }
  }

  if (!battleId) {
    if (w.lastConsoleStatus !== 'WAITING') {
      log('⏳ WAITING: Searching for a new match via OB_OPEN_ID...');
      w.lastConsoleStatus = 'WAITING';
    }
    return;
  }
  if (w.isSleeping) return;

  const [detail, teams, players, events] = await Promise.all([
    fetchFromHOK('/match_data/api/HOKBattleDetail', { BattleID: battleId }, s),
    fetchFromHOK('/match_data/api/HOKTeamList',     { BattleID: battleId }, s),
    fetchFromHOK('/match_data/api/HOKPlayerList',   { BattleID: battleId }, s),
    fetchFromHOK('/match_data/api/HOKEventList',    { BattleID: battleId }, s),
  ]);

  let currentStatus = 'DISCONNECTED';
  let errMsg = '';
  if (detail && !detail.error && detail.ret === 0) currentStatus = 'CONNECTED';
  else errMsg = detail ? (detail.error || detail.msg || 'API Connection Failed') : 'No Response';

  if (currentStatus !== w.lastConsoleStatus) {
    if (currentStatus === 'CONNECTED') log(`✅ CONNECTED: Receiving in-game data from Battle ID [${battleId}]`);
    else if (w.lastConsoleStatus === 'CONNECTED') log(`❌ DISCONNECTED: HOK API connection lost. (${errMsg})`);
    w.lastConsoleStatus = currentStatus;
  }

  if (currentStatus !== 'CONNECTED') return;

  dataStore.saveData('battle_detail.json', detail);
  dataStore.saveData('team_list.json', teams);
  dataStore.saveData('player_list.json', players);
  dataStore.saveData('event_list.json', events);
  if (teams && teams.ret === 0) goldTimeline.record(battleId, teams.HOKTeamList);
  if (players && players.HOKPlayerList) playerHistory.record(battleId, players.HOKPlayerList);   // Head to Head averages
  await savePlayerPanel(s, battleId);

  let matchEnded = false;
  if (detail.BattleDetail) {
    const gs = detail.BattleDetail.GameStatus;
    const st = detail.BattleDetail.Status;
    if (gs === 3 || st === 4) matchEnded = true;
  }
  if (teams && teams.HOKTeamList) {
    const t1 = teams.HOKTeamList.find((t) => t.Camp === 1);
    const t2 = teams.HOKTeamList.find((t) => t.Camp === 2);
    if ((t1 && t1.IsWin > 0) || (t2 && t2.IsWin > 0)) matchEnded = true;
  }

  if (matchEnded) {
    w.isSleeping = true;
    log('💤 GAME ENDED: Standby mode active. (Draft pick still running)');
    w.lastConsoleStatus = 'SLEEP';
    dataStore.writeStatus({ status: 'SLEEP', battleId });
  } else {
    w.isSleeping = false;
    dataStore.writeStatus({ status: 'RUNNING', battleId });
  }
}

// Player Panel (teamfight / first-10-min / vision stats for Post Hexagon).
// Response shape is { result: 0, data: [...] } (raw passthrough, not ret).
async function savePlayerPanel(s, battleId) {
  if (!s.ob_open_id) return false;
  const panel = await fetchFromHOK('/match_data/api/HOKPlayerPanelProxy', { ob_openid: s.ob_open_id }, s);
  if (!panel || panel.error || panel.result !== 0 || !Array.isArray(panel.data) || !panel.data.length) return false;
  if (battleId && panel.data[0].BattleID && panel.data[0].BattleID !== battleId) return false;
  dataStore.saveRaw('player_panel.json', panel);
  return true;
}

function start() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (busy) return; // never stack ticks if the API is slow
    busy = true;
    try { await tick(); } catch (e) { console.error('[poller]', e.message); }
    busy = false;
  }, FETCH_INTERVAL_MS);
}

function wake() { w.isSleeping = false; }

module.exports = { start, wake, savePlayerPanel };
