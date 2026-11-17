// html/js/hok-core.js — shared by every broadcast page:
//   HOK_PREVIEW      true when loaded with ?preview=1 (dashboard Control/Edit iframes)
//   HokPoll          ONE poll loop per page; modules register handlers instead of
//                    each running its own setInterval + fetches
//   HokStyles.load   applies the Edit tab's saved overrides (overlay_styles.json)
//   hokAsset/hokLogo/hokPhoto  absolute asset URLs (safe with spaces)
//   hokCsv           cached CSV database, refreshed every 10 s
var HOK_PREVIEW = /[?&]preview=1(?:&|$)/.test(location.search);

function hokAsset(p) { return '/assets/' + p.split('/').map(encodeURIComponent).join('/'); }
// Team logos. Default = the WHITE version (<ABBR>_2.png); Knockouts / Grand Finals (Match Board stage) use the
// LIGA one (LIGA/<ABBR>.png). Anything missing falls back: LIGA -> white -> the original <ABBR>.png.
// Which files exist comes from /api/logos (read once, synchronously, so the first logo is already right).
var HOK_LOGO_FILES = null, HOK_LOGO_LIGA = false, HOK_LOGO_STAGE_AT = 0;
(function () {
  function sync(url) {
    try { var x = new XMLHttpRequest(); x.open('GET', url, false); x.send(); return x.status === 200 ? JSON.parse(x.responseText) : null; } catch (e) { return null; }
  }
  var l = sync('/api/logos');
  if (l && l.files) { HOK_LOGO_FILES = {}; l.files.forEach(function (f) { HOK_LOGO_FILES[f] = true; }); }
})();
function hokLogoStage(stage) {
  HOK_LOGO_LIGA = /KNOCKOUT|GRAND\s*FINAL/i.test(stage || '');
  HOK_LOGO_STAGE_AT = Date.now();
}
function hokLogo(abbr) {
  // Pages without a state poll (fullscreen) re-read the stage here when it is stale (a show is rare, so a sync read is fine).
  if (Date.now() - HOK_LOGO_STAGE_AT > 3000) {
    HOK_LOGO_STAGE_AT = Date.now();
    try { var x = new XMLHttpRequest(); x.open('GET', '/api/state', false); x.send(); if (x.status === 200) hokLogoStage(JSON.parse(x.responseText).match_stage); } catch (e) {}
  }
  var f = HOK_LOGO_FILES;
  if (f) {
    if (HOK_LOGO_LIGA && f['LIGA/' + abbr + '.png']) return hokAsset('images/logo/LIGA/' + abbr + '.png');
    if (f[abbr + '_2.png']) return hokAsset('images/logo/' + abbr + '_2.png');
  }
  return hokAsset('images/logo/' + abbr + '.png');
}
function hokPhoto(name) { return hokAsset('images/photo/' + name + '.png'); }
var HOK_DEFAULT_PHOTO = '/assets/images/photo/default.png';

// Set an <img> src only when it actually changes (re-assigning every poll flickers).
function hokSetSrc(img, src) {
  if (!img) return;
  if ((img.dataset.src || '') === src) return;
  img.dataset.src = src;
  if (src) img.src = src; else img.removeAttribute('src');
}
function hokSetText(el, text) {
  if (el && el.textContent !== String(text)) el.textContent = text;
}

/* ── One poll loop per page ──────────────────────────────────────
   HokPoll.start({ sources: ['state', 'ingame', 'teams', 'draft'], interval: 500 })
   HokPoll.register(function (data) { data.state, data.ingame ... }) */
var HokPoll = (function () {
  var URLS = {
    state:  '/api/state',
    ingame: '/api/ingame_data',
    teams:  '/api/hokteamlist',
    draft:  '/api/draft_phase',
  };
  var handlers = [];
  var readyFns = [];
  var gotFirst = false;
  var opts = null;
  var busy = false;
  var last = {};

  function tick() {
    if (busy || !opts) return;
    busy = true;
    Promise.all(opts.sources.map(function (k) {
      return fetch(URLS[k], { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });
    })).then(function (results) {
      var data = {};
      opts.sources.forEach(function (k, i) { data[k] = results[i] || last[k] || {}; if (results[i]) last[k] = results[i]; });
      if (data.state && data.state.match_stage !== undefined) hokLogoStage(data.state.match_stage);   // keeps hokLogo's stage fresh
      handlers.forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } });
      if (!gotFirst) { gotFirst = true; readyFns.splice(0).forEach(function (fn) { try { fn(data); } catch (e) {} }); }
    }).finally(function () { busy = false; });
  }

  return {
    register: function (fn) { handlers.push(fn); },
    // Run fn once the first poll has landed (immediately if it already has).
    ready: function (fn) { if (gotFirst) fn(last); else readyFns.push(fn); },
    start: function (o) { opts = o; tick(); setInterval(tick, o.interval || 500); },
    now: tick,
  };
})();

/* ── Edit-tab overrides ──────────────────────────────────────── */
var HokStyles = {
  load: function (file) {
    return fetch('/api/overlay-styles?file=' + encodeURIComponent(file), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (styles) {
        var css = Object.keys(styles || {}).map(function (sel) {
          var props = styles[sel];
          return sel + '{' + Object.keys(props).map(function (p) {
            return (p === 'fontSize' ? 'font-size' : p) + ':' + props[p] + ' !important';
          }).join(';') + '}';
        }).join('\n');
        var s = document.getElementById('hok-saved-styles');
        if (!s) {
          s = document.createElement('style');
          s.id = 'hok-saved-styles';
          // Stay BEFORE the Edit tab's live style (#sb-live-edit) so unsaved
          // drags in the Edit iframe keep winning.
          document.head.insertBefore(s, document.getElementById('sb-live-edit'));
        }
        s.textContent = css;
      })
      .catch(function () {});
  },
};

/* ── CSV database (team names, players, heroes, rates) ───────── */
var hokCsv = (function () {
  var text = '';
  var subs = [];
  function load() {
    return fetch('/api/database_csv', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { if (t && t !== text) { text = t; subs.forEach(function (fn) { try { fn(text); } catch (e) {} }); } })
      .catch(function () {});
  }
  load();
  setInterval(load, 10000);
  return {
    onChange: function (fn) { subs.push(fn); if (text) fn(text); },
    reload: load,
  };
})();
