// routes/data.js — dashboard config, live HOK data shaped for the overlays,
// raw API snapshots, Data Center lookups, CSV database, vMix output.
const express   = require('express');
const axios     = require('axios');
const router    = express.Router();
const appState  = require('../lib/appState');
const dataStore = require('../lib/dataStore');
const poller    = require('../lib/poller');
const { fetchFromHOK, fetchFromDataCenter } = require('../lib/hokApi');
const { broadcast } = require('../lib/sse');

const readJSON = dataStore.readJSON;
const noStore = (res) => res.set({ 'Cache-Control': 'no-store' });

/* ── Dashboard configuration ─────────────────────────────────── */
// match_info = on-air stage / match / series strings (lib/matchInfo.js), computed — never saved.
router.get('/api/state', (req, res) => {
  const s = appState.get();
  noStore(res).json(Object.assign({}, s, { match_info: require('../lib/matchInfo').build(s), team_countries: dataStore.teamCountryMap() }));
});

router.post('/api/state', (req, res) => {
  const patch = req.body || {};
  delete patch.match_info;            // computed by GET /api/state, never persisted
  patch.last_updated = Date.now();
  appState.update(patch);
  poller.wake();
  // Lets every other open dashboard re-sync and overlays refresh at once.
  broadcast('appstate', { last_updated: patch.last_updated });
  res.json({ success: true, message: 'Data saved successfully!', last_updated: patch.last_updated });
});

router.get('/api/server_status', (req, res) => {
  const status = dataStore.readStatus();
  status.last_updated = appState.get().last_updated || 0;
  noStore(res).json(status);
});

router.post('/api/clear_battle', (req, res) => {
  try {
    appState.update({ battle_id: '' });
    dataStore.clearBattleFiles();
    require('../lib/goldTimeline').clear();
    poller.wake();
    broadcast('appstate', { last_updated: Date.now(), cleared: true });
    res.json({ success: true, message: 'Battle ID and previous match memory cleared successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ── CSV database (teams, players, heroes, hero rates) ──────── */
router.post('/api/update_csv', async (req, res) => {
  try {
    const csvUrl = (req.body || {}).url;
    if (!csvUrl) return res.status(400).json({ success: false, error: 'CSV URL not found' });
    const response = await axios.get(csvUrl);
    dataStore.writeCsv(response.data);
    broadcast('csv', {});
    res.json({ success: true, message: 'CSV database downloaded successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/database_csv', (req, res) => {
  const text = dataStore.readCsv();
  noStore(res);
  if (text !== null) res.type('text/plain').send(text);
  else res.status(404).send('');
});

/* ── Raw snapshots ───────────────────────────────────────────── */
['battle_detail', 'team_list', 'player_list', 'event_list', 'ban_pick_list'].forEach((name) => {
  router.get(`/api/raw/${name}`, (req, res) => noStore(res).json(readJSON(`${name}.json`)));
});

/* ── Overlay data ────────────────────────────────────────────── */

// Ban/pick list with penalty-ban + "currently picking" flags.
router.get('/api/draft_phase', (req, res) => {
  let banPicks = readJSON('ban_pick_list.json').BanPickList || [];
  if (banPicks.length === 0) {
    const d = readJSON('battle_detail.json');
    banPicks = (d.BattleDetail ? d.BattleDetail.BanPickList : d.BanPickList) || [];
  }
  noStore(res).json({
    status_code: 200,
    response: {
      ret: 0, msg: '', picking_index: null,
      BanPickList: banPicks.map((bp) => {
        const heroId = parseInt(bp.HeroID || 0, 10);
        const dte = bp.Dteventtime || '';
        return { Camp: parseInt(bp.Camp || 0, 10), Dteventtime: dte, HeroID: heroId, IsBan: bp.IsBan || false, picking: heroId === 0 && dte === '' };
      }),
    },
  });
});

// [camp1, camp2] team stats, keys sorted.
router.get('/api/hokteamlist', (req, res) => {
  const teams = readJSON('team_list.json').HOKTeamList || [];
  const transformed = [{}, {}];
  teams.forEach((t) => {
    const sorted = {};
    Object.keys(t).sort().forEach((k) => { sorted[k] = t[k]; });
    transformed[(t.Camp || 1) - 1] = sorted;
  });
  noStore(res).json({ status_code: 200, response: { HOKTeamList: transformed } });
});

router.get('/api/ingame_data', (req, res) => {
  noStore(res).json({
    status: 'success',
    battle_id: appState.get().battle_id,
    team_stats: readJSON('team_list.json').HOKTeamList || [],
    players: readJSON('player_list.json').HOKPlayerList || [],
  });
});

router.get('/api/player_list', (req, res) => {
  const players = readJSON('player_list.json').HOKPlayerList || [];
  noStore(res).json({ response: players.map((p) => parseInt(p.PlayerUID || p.openid, 10)) });
});

router.get('/api/event_list', (req, res) => {
  noStore(res).json({ status_code: 200, response: readJSON('event_list.json').HOKEventList || [] });
});

/* ── Live HOK lookups ────────────────────────────────────────── */
router.get('/api/battle_history', async (req, res) => {
  const s = appState.get();
  const obOpenId = req.query.ob_openid || s.ob_open_id;
  const limit = parseInt(req.query.limit, 10) || 10;
  if (!obOpenId) return res.status(400).json({ error: 'OB_OPEN_ID not found' });
  const bList = await fetchFromHOK('/match_data/api/HOKBattleList', { ObOpenId: obOpenId, page_offset: 0, page_size: limit }, s);
  noStore(res).json({ status_code: 200, ob_openid_used: obOpenId, history: bList });
});

// Raw player panel (hexagon / post-game). The body key is lowercase ob_openid.
router.get('/api/player_panel', async (req, res) => {
  const s = appState.get();
  if (!s.ob_open_id) return res.status(400).json({ error: 'OB_OPEN_ID is empty in the dashboard.' });
  noStore(res).json(await fetchFromHOK('/match_data/api/HOKPlayerPanelProxy', { ob_openid: s.ob_open_id }, s));
});

/* ── Data Center (GET so they open in a browser) ─────────────── */
const seasons = (q) => String(q).split(',').map((x) => x.trim());

router.get('/api/datacenter/hero_win_rate', async (req, res) => {
  const { hero_id, season_ids } = req.query;
  if (!hero_id || !season_ids) return res.status(400).json({ ret: 30055, error: 'hero_id and season_ids are required in the URL.' });
  res.json(await fetchFromDataCenter('GetHeroWinRate', { hero_id: parseInt(hero_id, 10), season_ids: seasons(season_ids) }));
});

router.get('/api/datacenter/player_hero_win_rate', async (req, res) => {
  const { openid, hero_id, season_ids } = req.query;
  if (!openid || !hero_id || !season_ids) return res.status(400).json({ ret: 30055, error: 'openid, hero_id and season_ids are required in the URL.' });
  res.json(await fetchFromDataCenter('GetPlayerHeroWinRate', { openid, hero_id: parseInt(hero_id, 10), season_ids: seasons(season_ids) }));
});

router.get('/api/datacenter/team_vs_team', async (req, res) => {
  const { team_a, team_b, season_ids } = req.query;
  if (!team_a || !team_b || !season_ids) return res.status(400).json({ ret: 30055, error: 'team_a, team_b and season_ids are required in the URL.' });
  res.json(await fetchFromDataCenter('GetTeamVsTeam', { team_a, team_b, season_ids: seasons(season_ids) }));
});

/* ── vMix data output (auto-calculated, alphabetical keys, role-ordered) ── */
function buildVmixOutput() {
  const s = appState.get();
  const playersData = readJSON('player_list.json').HOKPlayerList || [];
  if (playersData.length === 0) return { BattleID: s.battle_id, players: [] };

  const totals = { 1: { damage: 0, damageTaken: 0, gold: 0, kills: 0 }, 2: { damage: 0, damageTaken: 0, gold: 0, kills: 0 } };
  playersData.forEach((p) => {
    const t = totals[p.Camp || 1];
    if (!t) return;
    t.damage += p.TotalHurtToHero || 0;
    t.damageTaken += p.TotalBeHurtByHero || 0;
    t.gold += p.Gold || 0;
    t.kills += p.K || 0;
  });

  const players = playersData.map((p) => {
    const camp = p.Camp || 1;
    const t = totals[camp];
    const minutes = (p.CurrentGameTime || 1) / 60;
    const equips = [];
    const raw = p.Equips || [];
    for (let i = 0; i < 6; i++) equips.push(raw[i] && raw[i] !== '' && raw[i] !== '0' ? raw[i] : 0);
    const kda = `${p.K || 0}/${p.D || 0}/${p.A || 0}`;
    const obj = Object.assign({}, p, {
      Equips: equips,
      camp: `camp_${camp}`,
      damage_percent: t.damage > 0 ? Math.round((p.TotalHurtToHero || 0) / t.damage * 100) : 0,
      damage_taken_percent: t.damageTaken > 0 ? Math.round((p.TotalBeHurtByHero || 0) / t.damageTaken * 100) : 0,
      gold_percentage: t.gold > 0 ? Math.round((p.Gold || 0) / t.gold * 100) : 0,
      gpm: Math.round((p.Gold || 0) / minutes),
      hero_name: p.HeroName || '',
      'k/d/a': kda,
      kda,
      kill_participation: parseFloat(t.kills > 0 ? (((p.K || 0) + (p.A || 0)) / t.kills * 100).toFixed(1) : '0.0'),
    });
    const sorted = {};
    Object.keys(obj).sort().forEach((k) => { sorted[k] = obj[k]; });
    return sorted;
  });

  const order = [...(s.team_1_uids || []), ...(s.team_2_uids || [])];
  players.sort((a, b) => {
    const ia = order.indexOf(a.openid || a.PlayerUID);
    const ib = order.indexOf(b.openid || b.PlayerUID);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return (a.Camp || 1) - (b.Camp || 1);
  });

  return { BattleID: s.battle_id || playersData[0].BattleID, players };
}

router.get('/api/vmix-output', (req, res) => noStore(res).json(buildVmixOutput()));

// "Export match data (.csv)" — the vMix player rows as a CSV download.
router.get('/api/export_csv', (req, res) => {
  const { BattleID, players } = buildVmixOutput();
  const cols = [];
  players.forEach((p) => Object.keys(p).forEach((k) => {
    if (!cols.includes(k) && (p[k] === null || typeof p[k] !== 'object')) cols.push(k);
  }));
  if (players.length && !cols.includes('Equips')) cols.push('Equips');
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join('|') : (v === undefined || v === null ? '' : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...players.map((p) => cols.map((c) => esc(p[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="match_${BattleID || 'data'}.csv"`);
  res.send(csv);
});

// The dashboard's Companion auto-trigger echoes each fired path here so it
// shows up in the server console.
router.get('/api/companion_triggered', (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] 🎛  COMPANION TRIGGER: ${req.query.path || ''}`);
  noStore(res).json({ ok: true });
});

module.exports = router;
