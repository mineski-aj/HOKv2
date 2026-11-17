// server.js — HOK overlay server entry point.
const express = require('express');
const path    = require('path');
const { PORT, HTML_DIR, ASSETS_DIR } = require('./lib/config');

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS + request log (SSE and the 500 ms overlay polls are kept out of the console)
const QUIET = /^\/(overlay\/(events|check-overlays|features)|api\/(ingame_data|state|hokteamlist|draft_phase|server_status|database_csv|overlay-styles|overlay_state))/;
app.use((req, res, next) => {
  if (!QUIET.test(req.url) && !req.url.startsWith('/assets/') && !req.url.startsWith('/html/')) console.log('[REQ]', req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  next();
});

// Pages, page scripts and CSS are always served fresh; assets cached 1 day.
app.use('/html', express.static(HTML_DIR, {
  index: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'),
}));
app.use('/assets', express.static(ASSETS_DIR, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.split(path.sep).join('/').includes('/images/logo/')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Short page URLs (same as v1)
const page = (file) => (req, res) => res.sendFile(path.join(HTML_DIR, file));
app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', page('dashboard.html'));
app.get('/overlay', page('overlay.html'));
app.get('/draftpick', page('draftpick.html'));
app.get('/draft-led', page('draft-led.html'));
app.get('/fullscreen', page('fullscreen.html'));
app.get(['/michcheck-home', '/michcheck-away'], page('michcheck.html'));

app.use(require('./routes/overlay'));
app.use(require('./routes/data'));
app.use(require('./routes/overlayStyles'));

app.use((req, res) => { console.log('[404]', req.method, req.url); res.status(404).send('Not found'); });

require('./lib/poller').start();

app.listen(PORT, '0.0.0.0', () => {
  const u = `http://localhost:${PORT}`;
  console.log('=================================================');
  console.log(`  HOK Overlay Server v2 running on :${PORT}`);
  console.log(`  Dashboard   → ${u}/dashboard`);
  console.log(`  In-Game     → ${u}/overlay`);
  console.log(`  Draft Pick  → ${u}/draftpick`);
  console.log(`  Draft LED   → ${u}/draft-led   (1764x1024)`);
  console.log(`  Mic Check   → ${u}/michcheck-home | /michcheck-away   (always live)`);
  console.log(`  vMix Data   → ${u}/api/vmix-output`);
  console.log(`  Assets from → ${ASSETS_DIR}`);
  console.log('  ── Live control (GET) ──');
  console.log(`  Top Bar     → ${u}/overlay/topbar/show | hide`);
  console.log(`  Draft Pick  → ${u}/overlay/draftpick/show | hide`);
  console.log(`  Draft LED   → ${u}/overlay/draftled/show | hide`);
  console.log(`  LED POV cam → ${u}/overlay/led_pickbox/hide  (show = normal)`);
  console.log(`  Kill Events → ${u}/overlay/feature/killevents/enable | disable`);
  console.log(`  Objectives  → ${u}/overlay/feature/objectives/enable | disable`);
  console.log(`  Test event  → ${u}/overlay/debugevent/kp/DOUBLE%20KILL`);
  console.log('=================================================');
});
