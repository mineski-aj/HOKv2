// html/js/overlay-eventqueue.js — one shared queue for kill and objective
// events so only one plays at a time, in arrival order.
//   HokEvents.register('kp', playFn)   playFn(event, done)
//   HokEvents.push({ category, type, name, logo, photo })
var HokEvents = (function () {
  var queue = [];
  var playing = false;
  var players = {};

  function done() { playing = false; process(); }

  function process() {
    if (playing || queue.length === 0) return;
    var ev = queue.shift();
    var play = players[ev.category];
    if (!play) { process(); return; }
    playing = true;
    try { play(ev, done); } catch (e) { console.error(e); done(); }
  }

  return {
    register: function (category, fn) { players[category] = fn; },
    push: function (ev) { queue.push(ev); process(); },
    clear: function () { queue.length = 0; },
  };
})();

// Squeeze a text element horizontally to fit maxWidth (keeps its own base transform).
function hokSqueeze(el, maxWidth, baseTransform) {
  if (!el) return;
  var base = baseTransform ? baseTransform + ' ' : '';
  el.style.transform = base + 'scaleX(1)';
  if (el.scrollWidth > maxWidth) el.style.transform = base + 'scaleX(' + (maxWidth / el.scrollWidth) + ')';
}

// Photo with default fallback.
function hokSetPhoto(img, name) {
  img.onerror = function () { this.onerror = null; this.src = HOK_DEFAULT_PHOTO; };
  img.src = hokPhoto(name);
}

// Event video: absolute path, URL-safe (names contain spaces).
function hokEventVideo(type) { return hokAsset('webm/' + type + '.webm'); }
