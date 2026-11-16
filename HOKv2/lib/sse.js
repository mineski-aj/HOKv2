// lib/sse.js — broadcast one named event to every /overlay/events client.
const state = require('./state');

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  state.overlayClients.forEach((c) => { try { c.write(msg); } catch (e) {} });
}

module.exports = { broadcast };
