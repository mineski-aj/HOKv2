// html/js/fs-posthexagon.js — Post Hexagon scene for fullscreen.html.
// Data: GET /api/post-hexagon (lib/postHexagon.js). Two players of one role,
// HOME left / AWAY right, 8 role-specific stats (data.roles[].axes, built
// server-side); each axis scales to the best of all 10 players (rates: fixed).
//   PostHexagon.show(role?)  PostHexagon.hide()  PostHexagon.setRole(role)
var PostHexagon = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('phx-page');

  // 8 positional stat slots (#phx-stat-0..7), clockwise from the top. WHICH
  // stats fill them depends on the compared role (lib/postHexagon.js ROLE_AXES);
  // the server sends labels, formatted values and scales per role.
  var SLOTS = 8;
  var ROLE_ICON = { clash: 'clash-lane', jungler: 'jungler', mid: 'mid-lane', farm: 'farm-lane', roamer: 'roamer' };
  var CX = 210, CY = 210, R = 190, RINGS = 4, MIN_R = 0.12;

  var role = 'clash';
  var active = false;   // scene requested on
  var token = 0;        // bumps on every show/hide/role change (supersedes in-flight work)
  var hideTimer = null;

  function pt(i, f) {
    var a = (-90 + i * 360 / SLOTS) * Math.PI / 180;
    return (CX + Math.cos(a) * R * f).toFixed(1) + ',' + (CY + Math.sin(a) * R * f).toFixed(1);
  }

  /* ── Static build: radar grid, stat blocks, ticker ── */
  (function build() {
    var svg = '';
    for (var r = 1; r <= RINGS; r++) {
      var ring = [];
      for (var k = 0; k < SLOTS; k++) ring.push(pt(k, r / RINGS));
      svg += '<polygon class="phx-ring" points="' + ring.join(' ') + '"/>';
    }
    for (var i = 0; i < SLOTS; i++) svg += '<line class="phx-axis" x1="' + CX + '" y1="' + CY + '" x2="' + pt(i, 1).split(',')[0] + '" y2="' + pt(i, 1).split(',')[1] + '"/>';
    svg += '<polygon class="phx-poly home" id="phx-poly-home"/><polygon class="phx-poly away" id="phx-poly-away"/>';
    $('phx-radar').innerHTML = svg;

    for (var n = 0; n < SLOTS; n++) {
      $('phx-stat-' + n).innerHTML = '<div class="vals"><span class="v home" id="phx-v-' + n + '-h">0</span><span class="v away" id="phx-v-' + n + '-a">0</span></div><div class="k" id="phx-k-' + n + '"></div>';
    }
  })();

  /* ── Image helpers ── */
  // Try each URL in turn; hide the image if none load.
  function setChain(img, urls) {
    var key = urls.join('|');
    if (img.dataset.chain === key) return;
    img.dataset.chain = key;
    var i = 0;
    img.style.visibility = '';
    img.onerror = function () {
      i++;
      if (i < urls.length) img.src = urls[i];
      else { img.onerror = null; img.style.visibility = 'hidden'; }
    };
    img.src = urls[0];
  }
  function photoUrls(name, pose) {
    var hb = function (f) { return hokAsset('images/photo/' + f + '.png'); };
    return [hb(name + '_' + pose), hb(name + '_FRONT'), hb(name), hokPhoto(name), HOK_DEFAULT_PHOTO];
  }
  function heroUrls(id) { return [hokAsset('hero/full/' + id + '_FHD.png'), hokAsset('hero/draftpick/' + id + '_TINGGI.png')]; }

  // Shrink a single-line text to its box width (call only while the scene is laid out).
  function squeeze(el) {
    el.style.transform = 'none';
    var w = el.clientWidth;
    if (w && el.scrollWidth > w) el.style.transform = 'scaleX(' + (w / el.scrollWidth) + ')';
  }

  /* ── Fill ── */
  // Header (result, logos, codes, scores) is the shared layer — FsShared.reveal() fills it.
  function applySide(side, team, p, roleKey) {
    setChain($('phx-roleicon-' + side), ['/assets/images/role/' + ROLE_ICON[roleKey] + '.png']);
    $('phx-name-' + side).textContent = p ? p.name : '—';
    $('phx-heroname-' + side).textContent = p ? (p.heroName || '') : '';
    $('phx-herolbl-' + side).textContent = 'HERO USED';
    if (p && p.heroId) setChain($('phx-hero-' + side + '-img'), heroUrls(p.heroId));
    if (p) setChain($('phx-photo-' + side), photoUrls(p.name, 'FRONT'));

    var items = $('phx-items-' + side).children;
    for (var i = 0; i < items.length; i++) {
      var img = items[i].firstChild, id = p && p.equips[i];
      items[i].classList.toggle('empty', !id);
      if (id) setChain(img, [hokAsset('items/' + id + '.png')]);
      else { img.dataset.chain = ''; img.removeAttribute('src'); img.style.visibility = 'hidden'; }
    }
  }

  function pairFor(data) { return (data.roles || []).find(function (r) { return r.key === role; }) || { home: null, away: null, key: role }; }

  /* What each swappable element WILL show for this data — compared against
     el.dataset.sig on a role change so only elements whose content differs
     fade out and back in; everything identical stays perfectly still. */
  function signatures(data) {
    var pair = pairFor(data), out = [];
    [['l', pair.home], ['r', pair.away]].forEach(function (t) {
      var s = t[0], p = t[1];
      out.push([$('phx-hero-' + s + '-img'), p ? 'hero' + p.heroId : '-']);
      out.push([$('phx-photo-' + s), p ? 'photo' + p.name : '-']);
      out.push([$('phx-roleicon-' + s), 'role' + role]);
      out.push([$('phx-name-' + s), p ? p.name : '—']);
      out.push([$('phx-heroname-' + s), p ? (p.heroName || '') : '']);
      var items = $('phx-items-' + s).children;
      for (var i = 0; i < items.length; i++) out.push([items[i], 'item' + ((p && p.equips[i]) || 0)]);
    });
    var axes = pair.axes || [];
    for (var i = 0; i < SLOTS; i++) {
      var ax = axes[i] || {};
      out.push([$('phx-k-' + i), ax.label || '']);
      out.push([$('phx-v-' + i + '-h'), pair.home ? ax.homeText : '—']);
      out.push([$('phx-v-' + i + '-a'), pair.away ? ax.awayText : '—']);
    }
    return out;
  }

  // Radar target shapes for this data: [homePts, awayPts] as [[x,y]...].
  function shapes(data) {
    var pair = pairFor(data), axes = pair.axes || [], home = [], away = [];
    for (var i = 0; i < SLOTS; i++) {
      var ax = axes[i] || { home: 0, away: 0, scale: 0 };
      var max = ax.scale || Math.max(ax.home, ax.away);
      var f = function (v) { return max > 0 ? Math.max(MIN_R, Math.min(1, v / max)) : MIN_R; };
      home.push(pt(i, f(ax.home)).split(',').map(Number));
      away.push(pt(i, f(ax.away)).split(',').map(Number));
    }
    return [home, away];
  }
  var curShapes = null, morphRaf = null;
  function setShapes(sh) {
    curShapes = sh;
    $('phx-poly-home').setAttribute('points', sh[0].map(function (p) { return p.join(','); }).join(' '));
    $('phx-poly-away').setAttribute('points', sh[1].map(function (p) { return p.join(','); }).join(' '));
  }
  // Smoothly morph the two radar shapes to new values (no fade, no regrow).
  function morphTo(target, ms) {
    cancelAnimationFrame(morphRaf);
    var from = curShapes || target, t0 = performance.now();
    var ease = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
    (function step(now) {
      var k = ease(Math.min(1, (now - t0) / ms));
      setShapes([0, 1].map(function (s) { return target[s].map(function (p, i) { return [from[s][i][0] + (p[0] - from[s][i][0]) * k, from[s][i][1] + (p[1] - from[s][i][1]) * k]; }); }));
      if (k < 1) morphRaf = requestAnimationFrame(step);
    })(t0);
  }

  function apply(data, opts) {
    var pair = pairFor(data);
    applySide('l', data.home || {}, pair.home, role);
    applySide('r', data.away || {}, pair.away, role);
    var axes = pair.axes || [];
    for (var i = 0; i < SLOTS; i++) {
      var ax = axes[i] || { label: '', homeText: '', awayText: '' };
      hokSetText($('phx-k-' + i), ax.label);
      hokSetText($('phx-v-' + i + '-h'), pair.home ? ax.homeText : '—');
      hokSetText($('phx-v-' + i + '-a'), pair.away ? ax.awayText : '—');
    }
    signatures(data).forEach(function (e) { e[0].dataset.sig = e[1]; });
    if (opts && opts.morph) morphTo(shapes(data), 650);
    else { cancelAnimationFrame(morphRaf); setShapes(shapes(data)); }
  }

  // New image URLs this data needs (first choice of each chain) — decoded during the fade-out.
  function newImageUrls(data) {
    var pair = pairFor(data), urls = [];
    [['l', pair.home], ['r', pair.away]].forEach(function (t) {
      var p = t[1];
      if (!p) return;
      urls.push(heroUrls(p.heroId)[0], photoUrls(p.name, 'FRONT')[0]);
      p.equips.forEach(function (c) { if (c) urls.push(hokAsset('items/' + c + '.png')); });
    });
    return urls;
  }
  function warm(urls, ms) {
    var loads = urls.map(function (u) { var im = new Image(); im.src = u; return im.decode ? im.decode().catch(function () {}) : null; });
    return Promise.race([Promise.all(loads), new Promise(function (r) { setTimeout(r, ms); })]);
  }

  function fetchData() {
    return fetch('/api/post-hexagon', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
  }

  function preload(ms) {
    var imgs = Array.prototype.slice.call(page.querySelectorAll('img')).filter(function (i) { return i.getAttribute('src') && i.style.visibility !== 'hidden'; });
    var waits = imgs.map(function (i) { return i.decode ? i.decode().catch(function () {}) : null; });
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready); // text is measured for squeezing
    var all = Promise.all(waits);
    return Promise.race([all, new Promise(function (r) { setTimeout(r, ms); })]);
  }

  function regrow() {
    page.classList.remove('phx-grown');
    void page.offsetWidth;
    setTimeout(function () { page.classList.add('phx-grown'); }, 60);
  }

  function show(newRole) {
    if (newRole) role = newRole;
    var my = ++token;
    active = true;
    clearTimeout(hideTimer);
    FsShared.claim('posthexagon', { matchInfo: true });   // keep the shared layer up if switching from another scene
    return fetchData().then(function (data) {
      if (my !== token) return;
      apply(data);
      return preload(1500).then(function () {
        if (my !== token) return;
        page.classList.add('phx-on');
        ['l', 'r'].forEach(function (s) { squeeze($('phx-name-' + s)); squeeze($('phx-heroname-' + s)); });
        void page.offsetWidth;
        page.classList.add('phx-visible');
        FsShared.reveal('posthexagon', data, { matchInfo: true });
        regrow();
      });
    });
  }

  function hide() {
    ++token;
    active = false;
    page.classList.remove('phx-visible');
    FsShared.release('posthexagon');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) page.classList.remove('phx-on', 'phx-grown'); }, 420);
  }

  /* Ghost = a frozen copy of an element's CURRENT look, laid exactly over it
     (same offset parent, offsets, size and computed text/image styles), used
     to crossfade old → new without a gap. */
  var GHOST_STYLES = ['fontSize', 'fontFamily', 'fontWeight', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'whiteSpace', 'textTransform', 'objectFit', 'objectPosition', 'filter'];
  function makeGhost(el) {
    var parent = el.offsetParent;
    if (!parent) return null;
    var cs = getComputedStyle(el), g = el.cloneNode(true);
    g.removeAttribute('id');
    g.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    GHOST_STYLES.forEach(function (k) { g.style[k] = cs[k]; });
    g.style.position = 'absolute';
    g.style.margin = '0';
    g.style.left = el.offsetLeft + 'px';
    g.style.top = el.offsetTop + 'px';
    g.style.width = el.offsetWidth + 'px';
    g.style.height = el.offsetHeight + 'px';
    g.style.opacity = '1';
    g.style.pointerEvents = 'none';
    g.classList.remove('phx-out');
    g.classList.add('phx-ghost');
    parent.appendChild(g);
    return g;
  }

  var swapTimers = [];

  /* Quick "in" motion for an element whose content just changed (role switch).
     Web Animations on the individual translate/scale properties, so it
     composes with existing transforms (name squeeze, mirrored AWAY card) and
     leaves no inline style behind. Opacity is still handled by the classes. */
  var EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.25, 1)', EASE_POP = 'cubic-bezier(0.3, 1.5, 0.5, 1)';
  function playIn(el) {
    if (!el.animate) return;
    var id = el.id || '', side = /-r(-|$)/.test(id) ? 1 : -1;   // AWAY slides in from the right
    var kf, ms = 420, delay = 0, easing = EASE_OUT;
    if (el.classList.contains('phx-photo')) { kf = { translate: [side * 40 + 'px 24px', '0 0'] }; ms = 520; }
    else if (/^phx-hero-[lr]-img$/.test(id)) { kf = { scale: [1.14, 1] }; ms = 600; }
    else if (el.classList.contains('phx-item')) {
      kf = { scale: [0.35, 1] }; easing = EASE_POP; ms = 380;
      delay = 60 + Array.prototype.indexOf.call(el.parentNode.children, el) * 35;
    }
    else if (el.classList.contains('phx-roleicon')) { kf = { scale: [0.4, 1] }; easing = EASE_POP; ms = 400; delay = 40; }
    else if (el.classList.contains('phx-name') || el.classList.contains('phx-heroname')) { kf = { translate: [side * 26 + 'px 0', '0 0'] }; delay = el.classList.contains('phx-heroname') ? 70 : 30; }
    else if (/^phx-[vk]-\d/.test(id)) { kf = { translate: ['0 12px', '0 0'] }; delay = parseInt(id.split('-')[2], 10) * 25; }
    else if (el.classList.contains('phx-poly')) { kf = { transform: ['scale(0.55)', 'scale(1)'] }; easing = EASE_POP; ms = 520; delay = el.classList.contains('away') ? 60 : 0; }
    if (kf) el.animate(kf, { duration: ms, delay: delay, easing: easing, fill: 'backwards' });
  }

  /* Role change while on air:
       • player photos + the radar shapes: fade OUT, swap, fade IN
       • hero art, items, role icons, names, hero names, stat labels/values:
         CROSSFADE straight from the old content into the new (no gap)
       • every changed element also plays a quick "in" motion (playIn): photos
         slide in from their side, hero art settles from a zoom, items + role
         icons pop (items staggered), names slide in, stats rise, radar regrows
       • anything whose content is identical in both matchups stays still
     New images are decoded before anything moves, so nothing pops in blank. */
  function setRole(newRole) {
    if (!newRole || newRole === role) { role = newRole || role; return; }
    role = newRole;
    if (!active || !page.classList.contains('phx-visible')) return;
    var my = ++token;
    swapTimers.forEach(clearTimeout); swapTimers = [];
    page.querySelectorAll('.phx-ghost').forEach(function (g) { g.remove(); });
    fetchData().then(function (data) {
      if (my !== token) return;
      return warm(newImageUrls(data), 1200).then(function () {
        if (my !== token) return;
        var changed = signatures(data).filter(function (e) { return e[0].dataset.sig !== e[1]; }).map(function (e) { return e[0]; });
        var outIn = changed.filter(function (el) { return el.classList.contains('phx-photo'); });
        var cross = changed.filter(function (el) { return !el.classList.contains('phx-photo'); });
        var polys = [$('phx-poly-home'), $('phx-poly-away')];

        // 1) photos + radar shapes fade out
        outIn.concat(polys).forEach(function (el) { el.classList.add('phx-out'); });

        swapTimers.push(setTimeout(function () {
          if (my !== token) return;
          // 2) freeze the old look of the crossfading elements, then swap content underneath
          var ghosts = cross.map(makeGhost).filter(Boolean);
          cross.forEach(function (el) { el.classList.add('phx-instant', 'phx-out'); });
          apply(data);
          ['l', 'r'].forEach(function (s) { squeeze($('phx-name-' + s)); squeeze($('phx-heroname-' + s)); });
          void page.offsetWidth;
          // 3) crossfade (old ghost out, new in) + photos/shapes fade back in
          cross.forEach(function (el) { el.classList.remove('phx-instant'); });
          requestAnimationFrame(function () {
            ghosts.forEach(function (g) { g.style.opacity = '0'; });
            cross.concat(outIn, polys).forEach(function (el) { el.classList.remove('phx-out'); playIn(el); });
            swapTimers.push(setTimeout(function () { ghosts.forEach(function (g) { g.remove(); }); }, 450));
          });
        }, 240));
      });
    });
  }

  return { show: show, hide: hide, setRole: setRole, getRole: function () { return role; }, isActive: function () { return active; } };
})();
