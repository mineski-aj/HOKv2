// routes/overlayStyles.js — Edit-tab position/size/font overrides.
// overlay_styles.json = { [styleFile]: { [selector]: { left, top, width, height, fontSize, display } } }
// Pages inject these as !important rules on load (html/js/hok-styles.js).
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const { STYLES_FILE } = require('../lib/config');
const { broadcast } = require('../lib/sse');

function load() {
  try { return JSON.parse(fs.readFileSync(STYLES_FILE, 'utf8')); }
  catch (e) { return {}; }
}

router.get('/api/overlay-styles', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(load()[req.query.file || ''] || {});
});

router.post('/api/overlay-styles', (req, res) => {
  const { file, styles } = req.body || {};
  if (!file || !styles || typeof styles !== 'object') return res.status(400).json({ error: 'missing file or styles' });
  const all = load();
  all[file] = styles;
  fs.writeFileSync(STYLES_FILE, JSON.stringify(all, null, 2));
  // Every open page reloads so the new positions apply immediately.
  broadcast('reload', {});
  res.json({ ok: true });
});

module.exports = router;
