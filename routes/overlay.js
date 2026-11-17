// routes/overlay.js — the live-control surface. Everything here is a plain
// GET so Bitfocus Companion / Stream Deck / vMix / curl can fire it, and
// every change is pushed to all open pages over ONE SSE stream
// (/overlay/events, shared per browser through html/js/overlay-shared-worker.js).
//
//   GET /overlay/events                       SSE stream
//   GET /overlay/check-overlays               { key: shown } restore snapshot
//   GET /overlay/<key>/show|hide              key ∈ CHECK_KEYS → SSE event <key>
//   GET /overlay/features                     { feature: enabled }
//   GET /overlay/feature/<feature>/enable|disable   → SSE 'featuretoggle'
//   GET /overlay/debugevent/<kp|obj>/<TYPE>   fire a test kill/objective event → SSE 'debugevent'
//   GET /overlay/force-reload                 hard-reload every open page → SSE 'reload'
//   GET /api/companion?target=&action=        legacy alias (v1 Companion buttons)
//   GET|POST /api/overlay_state               legacy alias (v1 shape)
const express   = require('express');
const router    = express.Router();
const state     = require('../lib/state');
const appState  = require('../lib/appState');
const dataStore = require('../lib/dataStore');
const { broadcast } = require('../lib/sse');

const noStore = (res) => res.set({ 'Cache-Control': 'no-store' });

// Restore the LED POV-cam mode saved by v1/v2 dashboards.
state.checkOverlays.led_pickbox = !appState.get().draft_hide_pick;
state.checkOverlays.fsbg = !appState.get().fullscreen_bg_off;

/* ── SSE ─────────────────────────────────────────────────────── */
setInterval(() => {
  state.overlayClients.forEach((c) => { try { c.write(': heartbeat\n\n'); } catch (e) {} });
}, 15000);

router.get('/overlay/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(200);
  res.write(': connected\n\n');
  state.overlayClients.push(res);
  req.on('close', () => {
    const i = state.overlayClients.indexOf(res);
    if (i !== -1) state.overlayClients.splice(i, 1);
  });
});

/* ── checkOverlays: independent on/off panels ───────────────── */
router.get('/overlay/check-overlays', (req, res) => noStore(res).json(state.checkOverlays));

function setCheck(key, shown) {
  state.checkOverlays[key] = shown;
  // led_pickbox is also persisted (survives restarts, same as v1's draft_hide_pick)
  if (key === 'led_pickbox') appState.update({ draft_hide_pick: !shown });
  if (key === 'fsbg') appState.update({ fullscreen_bg_off: !shown });
  broadcast(key, { action: shown ? 'show' : 'hide' });
}

// fullscreen.html scenes are full-frame: showing one hides the others.
const FULLSCREEN_SCENES = ['posthexagon', 'poststats', 'postgoldgraph', 'postitems', 'versusslide', 'headtohead'];
// In-Game Overlay quadrants: panels in DIFFERENT quadrants can be live
// together; showing a panel hides whatever else is up in ITS quadrant (the
// page animates that one out before animating the new one in). Keep in sync
// with HokQuadrants.register(...) calls in html/overlay.html.
const INGAME_QUADRANTS = { topbar: 'top', itemcheck: 'bottom', damagerank: 'right', goldrank: 'right' };
function showCheck(key) {
  if (FULLSCREEN_SCENES.includes(key)) FULLSCREEN_SCENES.forEach((k) => { if (k !== key && state.checkOverlays[k]) setCheck(k, false); });
  const q = INGAME_QUADRANTS[key];
  if (q) Object.keys(INGAME_QUADRANTS).forEach((k) => { if (k !== key && INGAME_QUADRANTS[k] === q && state.checkOverlays[k]) setCheck(k, false); });
  setCheck(key, true);
}

Object.keys(state.checkOverlays).forEach((key) => {
  router.get(`/overlay/${key}/show`, (req, res) => { showCheck(key); noStore(res).json({ ok: true, action: 'show' }); });
  router.get(`/overlay/${key}/hide`, (req, res) => { setCheck(key, false); noStore(res).json({ ok: true, action: 'hide' }); });
});

/* ── Post Hexagon (fullscreen.html) ─────────────────────────────
   /overlay/posthexagon/show|hide come from the loop above. Role changes
   ride the same SSE event with action 'role' (listeners ignore unknown
   actions). */
const postHexagon = require('../lib/postHexagon');

// Post Hexagon needs the Player Panel; if the poller hasn't saved one for this
// battle (e.g. server wasn't running during the game) fetch it on demand,
// at most every 30 s.
let lastPanelTry = 0;
router.get('/api/post-hexagon', async (req, res) => {
  let data = postHexagon.build();
  if (!data.panelFound && Date.now() - lastPanelTry > 30000) {
    lastPanelTry = Date.now();
    try {
      const pl = (require('../lib/dataStore').readJSON('player_list.json').HOKPlayerList || [])[0];
      if (await require('../lib/poller').savePlayerPanel(appState.get(), pl && pl.BattleID)) data = postHexagon.build();
    } catch (e) {}
  }
  noStore(res).json(data);
});
router.get('/api/post-stats', (req, res) => noStore(res).json(postHexagon.build()));
router.get('/api/post-items', (req, res) => noStore(res).json(postHexagon.build()));
router.get('/api/michcheck', (req, res) => noStore(res).json(require('../lib/micCheck').build(req.query.side)));
router.get('/api/versus-slide', (req, res) => noStore(res).json(require('../lib/versusSlide').build()));
router.get('/api/post-gold-graph', (req, res) => noStore(res).json(require('../lib/postGoldGraph').build()));
router.get('/overlay/posthexagon-state', (req, res) => noStore(res).json({ shown: state.checkOverlays.posthexagon, role: state.postHexagon.role }));

function setHexRole(role) {
  state.postHexagon.role = role;
  broadcast('posthexagon', { action: 'role', role });
}
router.get('/overlay/posthexagon/role/:role', (req, res) => {
  const role = req.params.role;
  if (!postHexagon.ROLE_KEYS.includes(role)) return res.status(400).json({ ok: false, error: 'unknown role', valid: postHexagon.ROLE_KEYS });
  setHexRole(role);
  noStore(res).json({ ok: true, role });
});
// One-press Companion button: pick the role and show.
router.get('/overlay/posthexagon/:role/show', (req, res) => {
  const role = req.params.role;
  if (!postHexagon.ROLE_KEYS.includes(role)) return res.status(400).json({ ok: false, error: 'unknown role', valid: postHexagon.ROLE_KEYS });
  setHexRole(role);
  showCheck('posthexagon');
  noStore(res).json({ ok: true, action: 'show', role });
});

/* ── Damage Rank / Gold Rank (overlay.html, RIGHT quadrant) — rank-change tester ──
   Fakes rank changes on every live overlay so the animation can be checked
   without a game: shuffle (one overtake + small bumps), climb (last → first),
   auto (shuffle every 2.5 s; send again to stop), live (back to real data).
   Rides SSE '<panel>' with action 'debug'; the seed keeps every output
   (OBS, vMix…) showing the same fake order. Hiding the panel ends a debug run. */
const DAMAGERANK_DEBUG = ['shuffle', 'climb', 'auto', 'live'];
const RANK_PANELS = ['damagerank', 'goldrank'];
router.get('/overlay/:panel/debug/:mode', (req, res, next) => {
  const { panel, mode } = req.params;
  if (!RANK_PANELS.includes(panel)) return next();
  if (!DAMAGERANK_DEBUG.includes(mode)) return res.status(400).json({ ok: false, error: 'unknown mode', valid: DAMAGERANK_DEBUG });
  const seed = Math.floor(Math.random() * 1e9) + 1;
  broadcast(panel, { action: 'debug', mode, seed });
  noStore(res).json({ ok: true, panel, mode });
});

/* ── Head to Head (fullscreen.html) ─────────────────────────────
   Same role mechanics as Post Hexagon: role changes ride SSE 'headtohead'
   with action 'role'. Stats = lib/playerHistory.js (every recorded game). */
const headToHead = require('../lib/headToHead');
const playerHistory = require('../lib/playerHistory');
router.get('/api/head-to-head', (req, res) => noStore(res).json(headToHead.build(req.query.role || state.headToHead.role)));
router.get('/overlay/headtohead-state', (req, res) => noStore(res).json({ shown: state.checkOverlays.headtohead, role: state.headToHead.role, gamesRecorded: playerHistory.count() }));
function setH2hRole(role) {
  state.headToHead.role = role;
  broadcast('headtohead', { action: 'role', role });
}
router.get('/overlay/headtohead/role/:role', (req, res) => {
  const role = req.params.role;
  if (!postHexagon.ROLE_KEYS.includes(role)) return res.status(400).json({ ok: false, error: 'unknown role', valid: postHexagon.ROLE_KEYS });
  setH2hRole(role);
  noStore(res).json({ ok: true, role });
});
router.get('/overlay/headtohead/:role/show', (req, res, next) => {
  const role = req.params.role;
  if (!postHexagon.ROLE_KEYS.includes(role)) return next();
  setH2hRole(role);
  showCheck('headtohead');
  noStore(res).json({ ok: true, action: 'show', role });
});
// Wipe the recorded game history (e.g. after test games). POST — not a Companion button.
router.post('/api/head-to-head/clear-history', (req, res) => {
  playerHistory.clear();
  broadcast('appstate', { last_updated: Date.now() });
  noStore(res).json({ ok: true });
});

/* ── Feature toggles: armable auto-triggers ─────────────────── */
router.get('/overlay/features', (req, res) => noStore(res).json(state.featureToggles));

function setFeature(feature, enabled) {
  state.featureToggles[feature] = enabled;
  broadcast('featuretoggle', { feature, enabled });
}

router.get('/overlay/feature/:feature/:action', (req, res) => {
  const { feature, action } = req.params;
  if (!(feature in state.featureToggles) || !['enable', 'disable'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'unknown feature or action' });
  }
  setFeature(feature, action === 'enable');
  noStore(res).json({ ok: true, feature, enabled: action === 'enable' });
});

/* ── Test events (replaces v1's same-browser BroadcastChannel, so a test
      fired from any machine reaches every overlay, OBS/vMix included) ── */
const DEBUG_TYPES = {
  kp:  ['FIRST BLOOD', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'PENTA KILL', 'ACE'],
  obj: ['FIRST TYRANT', 'TYRANT', 'SHADOW TYRANT', 'FIRST OVERLORD', 'OVERLORD', 'SHADOW OVERLORD', 'TEMPEST DRAGON'],
};

// Same mock payload v1's dashboard built: Team 1's logo, "<ABBR>.Player1",
// default photo; ACE uses the full team name from the CSV.
function mockEvent(category, type) {
  const s = appState.get();
  const abbr = s.team_1_abbr || 'TEAM';
  let name = `${s.team_1_abbr || 'PLAYER'}.Player1`;
  if (type === 'ACE') name = dataStore.teamNameMap()[abbr] || `${abbr} ESPORTS`;
  return { category, type, name, logo: abbr, photo: 'default' };
}

router.get('/overlay/debugevent/:category/:type', (req, res) => {
  const { category } = req.params;
  const type = String(req.params.type || '').toUpperCase();
  if (!DEBUG_TYPES[category] || !DEBUG_TYPES[category].includes(type)) {
    return res.status(400).json({ ok: false, error: 'unknown category or type', valid: DEBUG_TYPES });
  }
  const payload = mockEvent(category, type);
  broadcast('debugevent', payload);
  noStore(res).json({ ok: true, event: payload });
});

/* ── Hard-reload every open page ─────────────────────────────── */
router.get('/overlay/force-reload', (req, res) => {
  broadcast('reload', {});
  noStore(res).json({ ok: true, clients: state.overlayClients.length });
});

/* ── Legacy v1 aliases (existing Companion buttons keep working) ── */
const LEGACY_TARGETS = { topbar: ['check', 'topbar'], bg: ['check', 'testbg'], kp: ['feature', 'killevents'], obj: ['feature', 'objectives'], rttf: ['feature', 'rttf'] };

router.get('/api/companion', (req, res) => {
  const target = req.query.target;
  const show = req.query.action === 'show';
  const map = LEGACY_TARGETS[target] || (target in state.checkOverlays ? ['check', target] : null);
  if (!map) return res.status(400).json({ success: false, error: 'unknown target' });
  if (map[0] === 'check') setCheck(map[1], show); else setFeature(map[1], show);
  noStore(res).json({ success: true, message: `Successfully executed ${req.query.action} on ${target}`, state: legacyState() });
});

function legacyState() {
  return {
    top_bar_visible: state.checkOverlays.topbar,
    bg_visible: state.checkOverlays.testbg,
    kp_visible: state.featureToggles.killevents,
    obj_visible: state.featureToggles.objectives,
    rttf_visible: state.featureToggles.rttf,
  };
}

router.get('/api/overlay_state', (req, res) => noStore(res).json(legacyState()));

router.post('/api/overlay_state', (req, res) => {
  const b = req.body || {};
  if (b.visible      !== undefined) setCheck('topbar', !!b.visible);
  if (b.bg_visible   !== undefined) setCheck('testbg', !!b.bg_visible);
  if (b.kp_visible   !== undefined) setFeature('killevents', !!b.kp_visible);
  if (b.obj_visible  !== undefined) setFeature('objectives', !!b.obj_visible);
  if (b.rttf_visible !== undefined) setFeature('rttf', !!b.rttf_visible);
  res.json({ success: true, state: legacyState() });
});

module.exports = router;
