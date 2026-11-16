// html/js/overlay-sse-shim.js — drop-in replacement for
// `new EventSource('/overlay/events')`. Every page calls createOverlaySSE()
// and gets the same addEventListener / onopen / onerror / close API, backed
// by the one shared connection in overlay-shared-worker.js.
//
// Bump on EVERY change to overlay-shared-worker.js (new KNOWN_EVENTS entry,
// logic change) so already-open pages pick up a fresh worker on reload.
const OVERLAY_WORKER_VERSION = 11; // 11: added 'headtohead' (fullscreen.html Head to Head); 10: added 'goldrank' (overlay.html Gold Rank); 9: added 'damagerank' (overlay.html Damage Rank); 8: added 'itemcheck' (overlay.html Item Check); 7: added 'versusslide' (fullscreen.html Versus Slide); 6: added 'postitems' (fullscreen.html Post Items); 5: added 'postgoldgraph' (fullscreen.html Post Gold Graph); 4: added 'poststats' (fullscreen.html Post Stats); 3: added 'fsbg' (fullscreen.html background on/off); 2: added 'posthexagon' (fullscreen.html Post Hexagon); 1: initial HOKv2 event set

function createOverlaySSE() {
  if (typeof SharedWorker === 'undefined') return new EventSource('/overlay/events');

  const listeners = {};
  let onopenFn = null;
  let onerrorFn = null;

  const worker = new SharedWorker('/html/js/overlay-shared-worker.js?v=' + OVERLAY_WORKER_VERSION);
  worker.port.onmessage = (e) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'sse-status') {
      if (msg.ok && typeof onopenFn === 'function') onopenFn();
      if (!msg.ok && typeof onerrorFn === 'function') onerrorFn();
    } else if (msg.type === 'sse-event') {
      (listeners[msg.event] || []).forEach((fn) => { try { fn({ data: msg.data }); } catch (err) {} });
    }
  };
  worker.port.start();

  window.addEventListener('beforeunload', () => {
    try { worker.port.postMessage({ type: 'disconnect' }); } catch (e) {}
  });

  return {
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      if (!listeners[name]) return;
      const i = listeners[name].indexOf(fn);
      if (i !== -1) listeners[name].splice(i, 1);
    },
    set onopen(fn) { onopenFn = fn; },
    get onopen() { return onopenFn; },
    set onerror(fn) { onerrorFn = fn; },
    get onerror() { return onerrorFn; },
    close() {}, // the connection is shared — one page must never close it for the others
  };
}
