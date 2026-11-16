// lib/hokApi.js — signed requests to the HOK match API and the HOK Data
// Center (third-party) API.
const crypto = require('crypto');
const axios  = require('axios');
const appState = require('./appState');

/* ── Match API ────────────────────────────────────────────────────
   One timestamp+nonce pair is reused and renewed every 30 minutes
   (per the HOK API guidelines). */
let cachedTimestamp = Math.floor(Date.now() / 1000).toString();
let cachedNonce     = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

setInterval(() => {
  cachedTimestamp = Math.floor(Date.now() / 1000).toString();
  cachedNonce     = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
  console.log(`[${new Date().toLocaleTimeString()}] 🔑 Refreshing HOK API signature (valid for 30 min)`);
}, 30 * 60 * 1000);

function sign(uri, appId, secret, timestamp, nonce) {
  const signStr = `${uri}\n${appId}\n${timestamp}\n${nonce}`;
  return crypto.createHmac('sha256', secret).update(signStr).digest('hex');
}

function getAuthHeaders(uri, s) {
  if (!s.app_id || !s.app_secret) return null;
  return {
    'Content-type': 'application/json',
    'X-AUTH-Appkey': s.app_id,
    'X-AUTH-Sign': sign(uri, s.app_id, s.app_secret, cachedTimestamp, cachedNonce),
    'X-AUTH-Timestamp': cachedTimestamp,
    'X-AUTH-Nonce': cachedNonce,
  };
}

async function fetchFromHOK(uri, payload, s) {
  s = s || appState.get();
  if (!s.base_url || !s.app_id) return { error: 'Credentials missing' };
  const headers = getAuthHeaders(uri, s);
  if (!headers) return { error: 'APP_ID/APP_SECRET is empty' };
  try {
    const response = await axios.post(`${s.base_url}${uri}`, payload, { headers, timeout: 5000 });
    return response.data;
  } catch (error) {
    return { error: error.message };
  }
}

/* ── Data Center API ──────────────────────────────────────────────
   Separate credentials (dc_app_id / dc_app_secret); fresh timestamp and
   random nonce per request. */
function getDataCenterAuthHeaders(uri, s) {
  if (!s.dc_app_id || !s.dc_app_secret) return null;
  const timestamp = (Math.floor(Date.now() / 1000) - 1).toString();
  const nonce = crypto.randomBytes(4).toString('hex');
  return {
    'Content-type': 'application/json',
    'X-AUTH-Appkey': s.dc_app_id,
    'X-AUTH-Sign': sign(uri, s.dc_app_id, s.dc_app_secret, timestamp, nonce),
    'X-AUTH-Timestamp': timestamp,
    'X-AUTH-Nonce': nonce,
  };
}

async function fetchFromDataCenter(methodName, payload) {
  const s = appState.get();
  const base = s.datacenter_url || 'https://hok-esports.playerinfinite.com';
  const uri = `/datacenter/admin/api/${methodName}`;
  const headers = getDataCenterAuthHeaders(uri, s);
  if (!headers) return { ret: -1, error: 'APP_ID/APP_SECRET empty' };
  try {
    const response = await axios.post(`${base}${uri}`, payload, { headers, timeout: 5000 });
    return response.data;
  } catch (error) {
    console.error(`[DataCenter Error] ${methodName}:`, error.response ? error.response.data : error.message);
    return { ret: -1, error: error.message, details: error.response ? error.response.data : null };
  }
}

module.exports = { fetchFromHOK, fetchFromDataCenter };
