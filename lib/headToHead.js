// lib/headToHead.js — Head to Head scene data (fullscreen.html).
// Two players of one role: Match Board Team 1 (HOME, left) vs Team 2 (AWAY,
// right), player = the team's Match Board slot for that role (Clash → Roam) —
// so it works before a game too. Stats = every game recorded in
// lib/playerHistory.js (+ the current player_list battle if not recorded yet),
// matched by nickname (case-insensitive):
//   KILL PARTICIPATION        Σ(K + A) / Σ team kills
//   AVERAGE KILLS PER MATCH   Σ K / games
//   TOTAL DAMAGE              Σ TotalHurtToHero
//   AVERAGE DEATHS PER MATCH  Σ D / games
// `high` marks the larger value of each row (shown yellow, as in the
// reference — for every row, deaths included).
const appState = require('./appState');
const dataStore = require('./dataStore');
const history = require('./playerHistory');
const { ROLES, ROLE_KEYS } = require('./postHexagon');

const ROLE_LABEL = { clash: 'CLASH LANE', jungler: 'JUNGLE', mid: 'MID LANE', farm: 'FARM LANE', roamer: 'ROAM' };

function statsFor(name, games) {
  const key = (name || '').toLowerCase();
  let n = 0, k = 0, d = 0, a = 0, dmg = 0, tk = 0;
  if (key) Object.values(games).forEach((g) => {
    const p = g.players.find((x) => (x.name || '').toLowerCase() === key);
    if (!p) return;
    n++; k += p.k; d += p.d; a += p.a; dmg += p.dmg; tk += (g.teamKills && g.teamKills[p.camp]) || 0;
  });
  return { games: n, kp: tk > 0 ? Math.min(100, (k + a) / tk * 100) : 0, avgKills: n ? k / n : 0, totalDamage: dmg, avgDeaths: n ? d / n : 0 };
}

const ROWS = [
  { key: 'kp',          label: 'KILL PARTICIPATION',       fmt: (v) => Math.round(v) + '%' },
  { key: 'avgKills',    label: 'AVERAGE KILLS<br>PER MATCH',  fmt: (v) => v.toFixed(1) },
  { key: 'totalDamage', label: 'TOTAL DAMAGE',             fmt: (v) => String(Math.round(v)) },
  { key: 'avgDeaths',   label: 'AVERAGE DEATHS<br>PER MATCH', fmt: (v) => v.toFixed(1) },
];

function build(role) {
  if (!ROLE_KEYS.includes(role)) role = 'clash';
  const s = appState.get();
  const idx = ROLE_KEYS.indexOf(role);
  const fullNames = dataStore.teamNameMap();
  const countries = dataStore.teamCountryMap();
  const live = dataStore.readJSON('player_list.json');
  const liveRows = live.HOKPlayerList || [];
  const games = history.battles({ battleId: (liveRows[0] && liveRows[0].BattleID) || s.battle_id, players: liveRows });

  const side = (n) => {
    const abbr = (s[`team_${n}_abbr`] || '').toUpperCase();
    const name = (s[`team_${n}_players`] || [])[idx] || '';
    return { abbr, fullName: fullNames[abbr] || abbr, country: countries[abbr] || '', name, stats: statsFor(name, games) };
  };
  const home = side(1), away = side(2);
  const rows = ROWS.map((r) => {
    const hv = home.stats[r.key], av = away.stats[r.key];
    return {
      key: r.key, label: r.label,
      home: home.stats.games ? r.fmt(hv) : '-', away: away.stats.games ? r.fmt(av) : '-',
      high: !home.stats.games || !away.stats.games || hv === av ? '' : hv > av ? 'home' : 'away',
    };
  });
  return {
    role, roleLabel: ROLE_LABEL[role], roles: ROLES.map((r) => ({ key: r.key, label: r.label, home: (s.team_1_players || [])[ROLE_KEYS.indexOf(r.key)] || '', away: (s.team_2_players || [])[ROLE_KEYS.indexOf(r.key)] || '' })),
    gamesRecorded: Object.keys(games).length,
    home, away, rows,
  };
}

module.exports = { build };
