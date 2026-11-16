// lib/state.js — all in-memory runtime state (resets on server restart,
// except led_pickbox which is restored from server_state.json at boot).

const state = {
  // Every open /overlay/events response (in practice one per browser —
  // pages share a single connection through the SharedWorker).
  overlayClients: [],

  // Independent on/off panels — GET /overlay/<key>/show|hide.
  // Default matters: keys that are normally ON (draft pages) start true.
  checkOverlays: {
    topbar:      false, // In-Game Overlay top bar      (TOP quadrant)
    itemcheck:   false, // In-Game Overlay Item Check   (BOTTOM quadrant)
    damagerank:  false, // In-Game Overlay Damage Rank  (RIGHT quadrant)
    goldrank:    false, // In-Game Overlay Gold Rank    (RIGHT quadrant)
    testbg:      false, // In-Game Overlay test background (rehearsal only)
    draftpick:   true,  // Draft Pick page, whole scene
    draftled:    true,  // Draft LED page, whole scene
    led_pickbox: true,  // Draft LED pick boxes + photos (hidden = POV cam mode)
    posthexagon: false, // fullscreen.html Post Hexagon scene  } fullscreen scenes are
    poststats:   false, // fullscreen.html Post Stats scene    } mutually exclusive
    postgoldgraph: false, // fullscreen.html Post Gold Graph scene }
    postitems:   false, // fullscreen.html Post Items scene        }
    versusslide: false, // fullscreen.html Versus Slide scene      }
    headtohead:  false, // fullscreen.html Head to Head scene      }
    fsbg:        true,  // fullscreen.html background video behind every scene (persisted as fullscreen_bg_off)
  },

  // Post Hexagon: which role pair is compared (clash|jungler|mid|farm|roamer).
  postHexagon: { role: 'clash' },
  // Head to Head: which role pair is compared.
  headToHead: { role: 'clash' },

  // Armable auto-trigger features — GET /overlay/feature/<feature>/enable|disable.
  featureToggles: {
    killevents: true,  // First Blood … Penta Kill, ACE
    objectives: true,  // Tyrant, Overlord, Shadow *, Tempest Dragon
    rttf:       false, // Real-Time Team Fight (state only — no overlay built yet)
  },

  // HOK API puller (lib/poller.js)
  worker: {
    isSleeping: false,
    lastConsoleStatus: 'INITIALIZING',
  },
};

module.exports = state;
