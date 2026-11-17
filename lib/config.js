// lib/config.js — paths, port and tunables (env-overridable via .env)
const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

// Asset folder: <app>/assets (ASSETS_DIR in .env overrides it).
function resolveAssetsDir() {
  if (process.env.ASSETS_DIR) return path.resolve(ROOT, process.env.ASSETS_DIR);
  return path.join(ROOT, 'assets');
}

module.exports = {
  ROOT,
  PORT:              parseInt(process.env.PORT, 10) || 7788,
  FETCH_INTERVAL_MS: parseInt(process.env.FETCH_INTERVAL_MS, 10) || 1000,
  DATA_DIR:          path.join(ROOT, process.env.DATA_DIR || 'data'),
  HTML_DIR:          path.join(ROOT, 'html'),
  ASSETS_DIR:        resolveAssetsDir(),
  STATE_FILE:        path.join(ROOT, 'server_state.json'),
  STATUS_FILE:       path.join(ROOT, 'status.json'),
  STYLES_FILE:       path.join(ROOT, 'overlay_styles.json'),
};
