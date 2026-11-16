// lib/postHexagon.js — post-game data for fullscreen.html's Post Hexagon and
// Post Stats scenes (GET /api/post-hexagon, /api/post-stats — same payload).
// Post Hexagon:
// two players of the same role, HOME (Match Board Team 1) on the left,
// compared on 8 axes. Built from the saved player/team lists, so it works
// after the game ends (the poller keeps the last good snapshot).
const appState  = require('./appState');
const dataStore = require('./dataStore');

const ROLES = [
  { key: 'clash',   label: 'Clash Lane' },
  { key: 'jungler', label: 'Jungler' },
  { key: 'mid',     label: 'Mid Lane' },
  { key: 'farm',    label: 'Farm Lane' },
  { key: 'roamer',  label: 'Roamer' },
];
const ROLE_KEYS = ROLES.map((r) => r.key);

// CSV: nickname → role label, hero id → hero name (same column rules as the dashboard).
function csvMaps() {
  const roleByNick = {}, heroName = {};
  const text = dataStore.readCsv();
  if (!text) return { roleByNick, heroName };
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  let noIdx = header.indexOf('no'); if (noIdx === -1) noIdx = 9;
  let heroIdx = header.indexOf('hero'); if (heroIdx === -1) heroIdx = 10;
  const labels = ROLES.map((r) => r.label);
  lines.slice(1).forEach((line) => {
    const cols = line.split(',');
    let nick = '', role = '';
    cols.forEach((c) => {
      const v = c.trim();
      if (v.includes('.') && !nick) nick = v;
      else if (labels.includes(v)) role = v;
    });
    if (nick && role) roleByNick[nick.toLowerCase()] = role;
    const id = parseInt(cols[noIdx], 10), name = (cols[heroIdx] || '').trim();
    if (!isNaN(id) && name && name.toLowerCase() !== 'hero') heroName[id] = name;
  });
  return { roleByNick, heroName };
}

function majorityPrefix(list) {
  const counts = {};
  list.forEach((p) => { const n = p.NickName || ''; if (n.includes('.')) { const a = n.split('.')[0].toUpperCase(); counts[a] = (counts[a] || 0) + 1; } });
  return Object.keys(counts).reduce((a, b) => (counts[a] >= (counts[b] || 0) ? a : b), '');
}

// Role per player: CSV role by nickname → Match Board order → whatever is left.
function assignRoles(players, savedOrder, roleByNick) {
  const out = {};
  const taken = new Set();
  const pending = [];
  players.forEach((p) => {
    const label = roleByNick[(p.NickName || '').toLowerCase()];
    const key = label ? ROLES.find((r) => r.label === label).key : null;
    if (key && !taken.has(key)) { out[key] = p; taken.add(key); } else pending.push(p);
  });
  const rest = [];
  pending.forEach((p) => {
    const i = (savedOrder || []).findIndex((n) => (n || '').toLowerCase() === (p.NickName || '').toLowerCase());
    const key = i >= 0 && i < 5 ? ROLE_KEYS[i] : null;
    if (key && !taken.has(key)) { out[key] = p; taken.add(key); } else rest.push(p);
  });
  rest.forEach((p) => { const key = ROLE_KEYS.find((k) => !taken.has(k)); if (key) { out[key] = p; taken.add(key); } });
  return out;
}

function playerStats(p, team) {
  const minutes = Math.max((p.CurrentGameTime || 0) / 60, 1 / 60);
  return {
    damage:   p.TotalHurtToHero || 0,                                                  // damage to heroes
    kp:       team.kills > 0 ? ((p.K || 0) + (p.A || 0)) / team.kills * 100 : 0,       // kill participation %
    assist:   p.A || 0,
    dmgTaken: team.taken > 0 ? (p.TotalBeHurtByHero || 0) / team.taken * 100 : 0,     // share of team damage taken %
    cc:       (p.HardCtrlTime || 0) / 1000,                                            // crowd control, seconds
    laning:   p.LastHit || 0,                                                          // last hits
    gpm:      (p.Gold || 0) / minutes,
    kills:    p.K || 0,
    taken:    p.TotalBeHurtByHero || 0,                                                // raw damage taken (Post Stats)
    gold:     p.Gold || 0,                                                             // total gold (Post Stats)
  };
}

/* ── Post Hexagon octagon: 8 stats PER ROLE (clockwise from the top) ──
   Most come from the Player Panel API (HOKPlayerPanelProxy, saved by the
   poller as data/player_panel.json and merged into each player by PlayerUID);
   player_list fallbacks where one exists. `fixed` = scale is that value
   (rates), otherwise each axis scales to the best of all 10 players. */
const pct = (v) => (v || 0) * 100;
const METRICS = {
  kp10:         { label: 'First 10 Mins Kill Participation Rate', get: (p) => pct(p.KillJoinR10M), fmt: 'pct0', fixed: 100 },
  tfDmgCarry:   { label: 'Teamfight Damage to Mid and Farm',      get: (p) => p.TfHurtToCC || 0, fmt: 'k' },
  lastHits:     { label: 'Minions Last Hit Counts',               get: (p) => p.LastHit || 0, fmt: 'int' },
  tfAssists:    { label: 'Teamfight Assists Count',               get: (p) => p.TfSupport || 0, fmt: 'int' },
  gpm:          { label: 'Gold Per Minute',                       get: (p) => p.GoldPerMin || (p.Gold || 0) / Math.max((p.CurrentGameTime || 0) / 60, 1 / 60), fmt: 'int' },
  cc:           { label: 'Crowd Control Duration',                get: (p) => (p.CtrlTime !== undefined ? p.CtrlTime : (p.HardCtrlTime || 0) / 1000), fmt: 'sec' },
  vision:       { label: 'Vision Value',                          get: (p) => p.HorizonValue || 0, fmt: 'int' },
  tfTakenShare: { label: 'Teamfight Damage Taken Share (%)',      get: (p) => pct(p.TfBeHurtR), fmt: 'pct1' },
  tfKills:      { label: 'Teamfight Kills',                       get: (p) => p.TfKill || 0, fmt: 'int' },
  invasions:    { label: 'Jungle Invasion Count',                 get: (p) => p.StealMonster || 0, fmt: 'int' },
  neutralCtrl:  { label: 'Neutral Resources Control Rate',        get: (p) => pct(p.NeutralCtrlR), fmt: 'pct0', fixed: 100 },
  tfDmg:        { label: 'Teamfight Damage',                      get: (p) => p.TfHurtToHero || 0, fmt: 'k' },
  kills:        { label: 'Kills',                                 get: (p) => p.K || 0, fmt: 'int' },
  goldToDmg:    { label: 'Gold to Damage Conversion Rate',        get: (p) => p.GoldToDmg || 0, fmt: 'dec2' },
  goldToDmgR:   { label: 'Gold to Damage Ratio',                  get: (p) => p.GoldToDmg || 0, fmt: 'dec2' },
  tfJoin:       { label: 'Teamfight Participation Count',         get: (p) => (p.TfKill || 0) + (p.TfSupport || 0), fmt: 'int' }, // no direct field: TF kills + TF assists
  towerDmg:     { label: 'Tower Damage',                          get: (p) => p.HurtToOrgan || 0, fmt: 'k' },
  deaths:       { label: 'Deaths',                                get: (p) => p.D || 0, fmt: 'int' },
  assists:      { label: 'Assists',                               get: (p) => p.A || 0, fmt: 'int' },
  dmg10:        { label: 'First 10 Mins Damage Percentage',       get: (p) => pct(p.HurtR10M), fmt: 'pct1' },
  healing:      { label: 'Healing Amount',                        get: (p) => p.HealCnt || 0, fmt: 'k' },
  riverShare:   { label: 'River Vision Share',                    get: (p) => pct(p.RiverTimeR), fmt: 'pct1' },
  tfTakenPct:   { label: 'Damage Taken Percentage in Teamfights', get: (p) => pct(p.TfBeHurtR), fmt: 'pct1' },
};
const ROLE_AXES = {
  clash:   ['kp10', 'tfDmgCarry', 'lastHits', 'tfAssists', 'gpm', 'cc', 'vision', 'tfTakenShare'],
  jungler: ['gpm', 'tfKills', 'invasions', 'tfDmgCarry', 'neutralCtrl', 'cc', 'tfAssists', 'tfTakenShare'],
  mid:     ['tfDmg', 'kills', 'goldToDmg', 'lastHits', 'cc', 'tfTakenShare', 'tfJoin', 'kp10'],
  farm:    ['tfDmg', 'towerDmg', 'goldToDmgR', 'lastHits', 'tfKills', 'tfTakenShare', 'deaths', 'gpm'],
  roamer:  ['cc', 'assists', 'dmg10', 'healing', 'tfJoin', 'riverShare', 'vision', 'tfTakenPct'],
};
function fmtMetric(v, f) {
  v = v || 0;
  if (f === 'k') return v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(Math.round(v));
  if (f === 'pct0') return Math.round(v) + '%';
  if (f === 'pct1') return v.toFixed(1) + '%';
  if (f === 'dec2') return v.toFixed(2);
  if (f === 'sec') return (v < 10 ? v.toFixed(1) : Math.round(v)) + 'S';
  return String(Math.round(v));
}

// Saved Player Panel rows for this battle, keyed by player uid.
function panelByUid(battleId) {
  const rows = (dataStore.readJSON('player_panel.json') || {}).data;
  const out = {};
  if (!Array.isArray(rows)) return out;
  rows.forEach((r) => { if (!battleId || r.BattleID === battleId) out[String(r.PlayerUID || r.openid)] = r; });
  return out;
}

function build() {
  const s = appState.get();
  const rawPlayers = dataStore.readJSON('player_list.json').HOKPlayerList || [];
  const panel = panelByUid(rawPlayers[0] && rawPlayers[0].BattleID);
  const panelFound = Object.keys(panel).length > 0;
  // Player list + Player Panel fields (panel adds teamfight/10-min/vision/... stats)
  const players = rawPlayers.map((p) => Object.assign({}, panel[String(p.PlayerUID || p.openid)] || {}, p));
  const teams = dataStore.readJSON('team_list.json').HOKTeamList || [];
  const { roleByNick, heroName } = csvMaps();

  const byCamp = { 1: players.filter((p) => p.Camp === 1), 2: players.filter((p) => p.Camp === 2) };
  const prefix = { 1: majorityPrefix(byCamp[1]), 2: majorityPrefix(byCamp[2]) };
  // HOME = Match Board Team 1: match the API TeamId suffix (e.g. IKL2026S2_dmt), then nickname prefix; default camp 1.
  const t1 = (s.team_1_abbr || '').toUpperCase();
  const teamIdAbbr = (c) => { const t = teams.find((x) => x.Camp === c); return t && t.TeamId ? String(t.TeamId).split('_').pop().toUpperCase() : ''; };
  let homeCamp = 1;
  if (t1 && teamIdAbbr(2) === t1 && teamIdAbbr(1) !== t1) homeCamp = 2;
  else if (t1 && !teamIdAbbr(1) && prefix[2] === t1 && prefix[1] !== t1) homeCamp = 2;
  const awayCamp = homeCamp === 1 ? 2 : 1;

  const totals = {};
  [1, 2].forEach((c) => {
    totals[c] = {
      kills: byCamp[c].reduce((n, p) => n + (p.K || 0), 0),
      taken: byCamp[c].reduce((n, p) => n + (p.TotalBeHurtByHero || 0), 0),
    };
  });
  const teamOf = (c) => teams.find((t) => t.Camp === c) || {};
  // IsWin: 0 = playing, 1 = victory, 2 = defeat (HOK protocol).
  const won = (c) => teamOf(c).IsWin === 1;
  const ended = (teamOf(1).IsWin || 0) > 0 || (teamOf(2).IsWin || 0) > 0;
  const result = (c) => (!ended ? '' : won(c) ? 'VICTORY' : 'DEFEAT');

  // Team codes come from the game itself (TeamId, then nickname prefix); Match Board is the fallback.
  const homeAbbr = teamIdAbbr(homeCamp) || prefix[homeCamp] || s.team_1_abbr || 'HOME';
  const awayAbbr = teamIdAbbr(awayCamp) || prefix[awayCamp] || s.team_2_abbr || 'AWAY';
  // Series score follows the team code when it matches a Match Board team.
  const scoreOf = (abbr, fallback) => (abbr === (s.team_1_abbr || '').toUpperCase() ? s.team_1_score || 0
    : abbr === (s.team_2_abbr || '').toUpperCase() ? s.team_2_score || 0 : fallback);
  const roles = {
    home: assignRoles(byCamp[homeCamp], s.team_1_players, roleByNick),
    away: assignRoles(byCamp[awayCamp], s.team_2_players, roleByNick),
  };

  const side = (p, camp, abbr) => (!p ? null : {
    name: p.NickName || '',
    abbr,
    heroId: parseInt(p.HeroID, 10) || 0,
    heroName: heroName[parseInt(p.HeroID, 10)] || p.HeroName || '',
    equips: (p.Equips || []).slice(0, 6).map((e) => parseInt(e, 10) || 0),
    k: p.K || 0, d: p.D || 0, a: p.A || 0,       // Post Items
    gold: p.Gold || 0,
    skillId: parseInt(p.SkillID, 10) || 0,       // summoner spell (icon: assets/images/spells/<id>.png)
    stats: playerStats(p, totals[camp]),
    raw: p,
  });

  // Octagon axes for one role: values + formatted text + scale (best of all 10 players, or fixed for rates).
  const roleAxes = (roleKey, h, a) => ROLE_AXES[roleKey].map((mk) => {
    const m = METRICS[mk];
    const hv = h ? m.get(h.raw) : 0, av = a ? m.get(a.raw) : 0;
    const scaleV = m.fixed || players.reduce((mx, p) => Math.max(mx, m.get(p) || 0), 0);
    return { key: mk, label: m.label.toUpperCase(), home: hv, away: av, homeText: fmtMetric(hv, m.fmt), awayText: fmtMetric(av, m.fmt), scale: scaleV };
  });

  // Radar scale: each axis = the best value among ALL players in the game,
  // so the shape reads "how this player ranks in the lobby". Kill
  // participation is already a 0–100% figure, so its scale is fixed at 100.
  const all = [1, 2].reduce((arr, c) => arr.concat(byCamp[c].map((p) => playerStats(p, totals[c]))), []);
  const scale = {};
  ['damage', 'assist', 'dmgTaken', 'cc', 'laning', 'gpm', 'kills', 'taken', 'gold'].forEach((k) => {
    scale[k] = all.reduce((m, st) => Math.max(m, st[k] || 0), 0);
  });
  scale.kp = 100;

  const s1 = s.team_1_score || 0, s2 = s.team_2_score || 0;
  // GAME n: once the game has ended the Match Board score already counts it.
  const info = require('./matchInfo').build(s, Math.max(1, ended ? s1 + s2 : s1 + s2 + 1));
  const fullNames = dataStore.teamNameMap();
  const gameTime = Math.max(...players.map((p) => p.CurrentGameTime || 0), ...teams.map((t) => t.CurrentGameTime || 0), 0);
  return {
    homeCamp,
    scale,
    gameTime,                                           // seconds
    gameNumber: info.game,
    battleId: s.battle_id || '',
    // Game number: the series score after this game when it has ended (Match Board updated), else the next game.
    matchInfo: info,                                    // lib/matchInfo.js strings (shared header blocks)
    home: { abbr: homeAbbr, fullName: fullNames[homeAbbr] || homeAbbr, score: scoreOf(homeAbbr, s1), result: result(homeCamp) },
    away: { abbr: awayAbbr, fullName: fullNames[awayAbbr] || awayAbbr, score: scoreOf(awayAbbr, s2), result: result(awayCamp) },
    panelFound,                                         // false = Player Panel not saved for this battle (panel-only stats read 0)
    roles: ROLES.map((r) => {
      const h = side(roles.home[r.key], homeCamp, homeAbbr), a = side(roles.away[r.key], awayCamp, awayAbbr);
      const axes = roleAxes(r.key, h, a);
      if (h) delete h.raw;
      if (a) delete a.raw;
      return { key: r.key, label: r.label, home: h, away: a, axes };
    }),
  };
}

module.exports = { build, ROLES, ROLE_KEYS, ROLE_AXES, METRICS };
