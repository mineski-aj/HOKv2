// html/js/overlay-shared-worker.js — ONE real EventSource('/overlay/events')
// for the whole browser, shared by every tab / iframe / browser source of
// this origin. Pages talk to it through createOverlaySSE() (overlay-sse-shim.js).
//
// Why: browsers allow only ~6 concurrent HTTP/1.1 connections per host. Each
// page holding its own EventSource keeps one slot busy forever; a dashboard
// plus a few overlays and preview iframes is enough to exhaust the pool and
// make requests hang with no error. With this worker, N pages = 1 connection.
//
// KNOWN_EVENTS must list every named event the server broadcasts — an
// EventSource only delivers named events it explicitly listens for.
// After ANY change to this file, bump OVERLAY_WORKER_VERSION in
// overlay-sse-shim.js (a running worker is reused by exact URL, so open
// pages would otherwise keep the old copy).
const KNOWN_EVENTS = [
  // checkOverlays (routes/overlay.js) — one event per key
  'topbar', 'itemcheck', 'damagerank', 'goldrank', 'testbg', 'draftpick', 'draftled', 'led_pickbox', 'posthexagon', 'poststats', 'postgoldgraph', 'postitems', 'versusslide', 'headtohead', 'fsbg',
  // feature toggles, test events, dashboard config, styles
  'featuretoggle', 'debugevent', 'appstate', 'csv', 'reload',
];

const ports = [];
let es = null;
let connected = false;

function broadcast(msg) {
  for (let i = ports.length - 1; i >= 0; i--) {
    try { ports[i].postMessage(msg); } catch (e) { ports.splice(i, 1); }
  }
}

function ensureConnection() {
  if (es) return;
  const mine = es = new EventSource('/overlay/events');
  es.onopen = () => { connected = true; broadcast({ type: 'sse-status', ok: true }); };
  es.onerror = () => {
    connected = false;
    broadcast({ type: 'sse-status', ok: false });
    // Closed for good (e.g. server restarting answered non-200) → rebuild,
    // otherwise every open page would stay silent until all tabs closed.
    if (mine.readyState === 2) {
      try { mine.close(); } catch (e) {}
      if (es === mine) es = null;
      setTimeout(ensureConnection, 2000);
    }
  };
  KNOWN_EVENTS.forEach((name) => {
    es.addEventListener(name, (e) => broadcast({ type: 'sse-event', event: name, data: e.data }));
  });
}

self.onconnect = (connectEvent) => {
  const port = connectEvent.ports[0];
  ports.push(port);
  ensureConnection();
  port.postMessage({ type: 'sse-status', ok: connected });
  port.onmessage = (e) => {
    if (e.data && e.data.type === 'disconnect') {
      const i = ports.indexOf(port);
      if (i !== -1) ports.splice(i, 1);
    }
  };
  port.start();
};
