/* ============================================================
   ROOMS v2 — the room
   Gabriel Meyer / g-magination

   ONE renderer, ONE canvas, fixed behind the whole page, from the
   first pixel to the last. It is a single dark gallery: a long wall
   (z = 0, running along +x), a floor, a ceiling, a soft low room
   light. The lamps are installed along the wall and each one lights
   its own patch of it:

     x = 0      01 Lichtschreiber (the pen; id kugelschreiber), leaning on the wall, cord running off
     x = 8.5    02 Bubblegum, hanging 1.15 m off the wall on its red cord
     x = 16.5   03 LR01 · Light Reflector One (id sr01): dark steel, its halo round it
     x = 24.5   04 Light Box: a square of lit veneer on the wall
     x = 32.5   05 Bulb Studies, hand-sized, on the sill of a window
     x = 40.5   06 Folded Chair, on the floor, off the wall
     x = 48.5   07 Pulls, three canvases, each under a picture light
     x = 56.5   08 EIN HORNY, the poster, no frame
     x = 64.5   09 Glass Ball: a faceted ball, an RGB torch pointed into it
     x = 71     the walk ends; the camera turns and looks back at the lamps

   06 to 09 are not lamps: the room lights them, each with its own
   gallery light (see "06 - 10" below for how that is kept free).

   MOTION ON (the default): scroll position IS the position along one
   camera path down the room. No cuts, no fades: entrance, along the
   wall to a lamp, the lamp does its thing while its writing passes,
   on down the room to the next. At each lamp the camera frames it in
   the middle of the FREE half of the viewport (camera.setViewOffset,
   a lens shift, so verticals stay vertical); the writing has the
   other half, alternating sides.

   MOTION OFF ("Keep it still" at the entrance, or the header
   control): the room is still there, lit and draggable. Nothing
   moves by itself and nothing is driven by scroll: the camera CUTS
   (a short dip through black) to each lamp when it becomes current,
   and what scroll does with motion on becomes a control in the strip
   under the object. The two modes switch live ("rooms:motion").

   LAMPS ARE ALWAYS ON. There is no switch, no off state, no code
   path that darkens one.

   ONLY WHAT EMITS LIGHT GLOWS. See draw(): the glow is made from the
   emitting meshes alone, and it is cut away wherever any other part
   of a lamp is in front of it, so a clip, a socket, a steel panel
   stays crisp and unhazed.

   DRAG — read this before adding anything to the page:
   the canvas sits behind the document, so a drag can only work if
   nothing above it takes the pointer. Two independent guards:
     1. rooms.css: every wrapper in <main> is pointer-events:none;
        only real content (.panel etc.) takes the pointer.
     2. here: pointerdown is caught on WINDOW in the capture phase and
        starts a drag unless it began inside real content (SOLID).
        So even a stray invisible layer cannot swallow it.
   ============================================================ */

(function () {
  "use strict";

  var root = document.documentElement;
  var host = document.getElementById("scene");
  var veil = document.getElementById("veil");
  var hud = document.getElementById("hud");
  /* On a phone the head script hides the stills while the room is coming
     ("gl-soon", rooms.css), so their photographs are not fetched for
     nothing. Any way out of this file without a room brings them back:
     an early return below leaves `booting` false. */
  var booting = false;
  Promise.resolve().then(function () {
    if (!booting) root.classList.remove("gl-soon");
  });
  if (!host) return;

  /* switchable while the page is open: see the "rooms:motion" listener */
  var REDUCED = root.getAttribute("data-motion") === "reduced";
  var Q;
  try {
    Q = new URLSearchParams(location.search);
  } catch (e) {
    Q = { get: function () { return null; } };
  }
  /* dev aid only: ?focus=<beat> holds one beat (tip, top, apart, knot, gap,
     grain, filament, fold, fronts, row, print, draw, turn) at its station,
     for close-ups; for 06 - 10, ?q=0..1 says how far through it */
  var FOCUS = Q.get("focus");
  var FQ = Q.get("q") == null ? null : clamp(parseFloat(Q.get("q")) || 0, 0, 1);
  /* dev aid only: ?spin=<degrees> turns the oak block on the sill, to look
     at each of its four sides in turn */
  var SPIN = parseFloat(Q.get("spin")) || 0;
  /* dev aid only: ?level=0..1 holds the room's light at one level for the
     whole walk (0: as dark as the entrance, which is how the whole room used
     to be; 1: the room as it is now), for comparing the two */
  var LV = Q.get("level") == null ? null : clamp(parseFloat(Q.get("level")) || 0, 0, 1);

  /* the camera's views (views.json), written into the page by the
     generator; fetched if a page was made without them */
  var VIEWS = null;
  try {
    var vEl = document.getElementById("rooms-views");
    if (vEl) VIEWS = JSON.parse(vEl.textContent);
  } catch (e) {
    VIEWS = null;
  }
  /* ?tune=1: the artist's tool for setting every view by hand. Nothing of
     it exists unless asked for (see "Tune") */
  var TUNING = Q.get("tune") === "1";
  var TUNE = null;

  try {
    var probe = document.createElement("canvas");
    if (!probe.getContext("webgl2")) return; /* stills stay; page is complete */
  } catch (e) {
    return;
  }

  var CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/";
  var COARSE = window.matchMedia("(pointer: coarse)").matches;
  /* THE PHONE LAYOUT ("stage and dossier", rooms.css): a portrait screen no
     wider than 820 px. Landscape phones and anything wider keep the desk
     layout. The same query is in rooms.css and rooms.js. */
  var PHQ = window.matchMedia("(max-width: 820px) and (orientation: portrait)");
  /* a phone as a device (also in landscape, where it has the desk layout):
     a touch screen whose short side is a phone's */
  var PHONE_DEV = COARSE && Math.min(screen.width || 9999, screen.height || 9999) <= 500;
  var TALL = 4000; /* a "viewport" taller than this is a full-page screenshot */

  /* which GLBs exist in media/models/ — written into the page by the
     generator, so a model that has not arrived yet is never requested */
  var MODELS = (root.getAttribute("data-models") || "").split(/\s+/);
  function has(name) {
    return MODELS.indexOf(name) >= 0;
  }
  /* ...and which of the room's own source pictures exist in
     media/extra/rooms-v2/ (the same rule: never ask for a file that is not
     there) */
  var EXTRA = (root.getAttribute("data-extra") || "").split(/\s+/);
  function hasExtra(name) {
    return EXTRA.indexOf(name) >= 0;
  }

  /* what counts as content: a drag never starts here */
  var SOLID =
    "a, button, input, select, textarea, label, video, summary, " +
    ".panel, .open__text, .ask, .more__card, .hud, .skip, .cap, .sheet";

  /* ---------- small maths ---------- */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  /* smoothstep that also runs backwards (e0 > e1) */
  function sstep(x, e0, e1) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function ease(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function hash(i) {
    var s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  var RAD = Math.PI / 180;

  /* ============================================================
     The stations, in walking order. One record each.
     ============================================================ */

  /* where each lamp stands along the wall (metres) */
  var X = { pen: 0, cl: 8.5, sr: 16.5, bx: 24.5, bs: 32.5, fc: 40.5, pu: 48.5, eh: 56.5, gf: 64.5 };
  var END_X = 71; /* where the walk ends and the camera turns round */
  /* for checking only (__rooms.camAt): a rough box round each work,
     [x0, x1, y0, y1, z] */
  var WORKBOX = {
    pen: [-0.3, 0.3, 0.05, 1.85, 0.3], cl: [8.15, 8.85, 1.35, 2.05, 1.15], sr: [16.0, 17.0, 0.95, 2.0, 0.1],
    bx: [24.15, 24.85, 1.1, 1.8, 0.1], bs: [31.8, 33.2, 0.95, 1.9, 0.0], fc: [40.2, 41.0, 0.05, 0.8, 1.55],
    pu: [47.3, 49.7, 1.3, 1.75, 0.05], eh: [56.15, 56.85, 1.0, 2.0, 0.03], gf: [64.1, 64.9, 0.1, 1.15, 1.0]
  };

  /* hint: what a drag does. slider/main: with motion off, the control that
     stands in for what scroll does (it drives the beat named `main`). */
  var CFG = {
    pen: { hint: "Drag to walk around it", slider: "Take apart", aria: "Take the pen apart", main: "apart", yaw: 68, views: true },
    cl: { hint: "Drag to turn it", slider: "Loosen", aria: "Loosen the cluster", main: "knot", yaw: 0 },
    sr: { hint: "Drag to look behind it", slider: "Look behind", aria: "Move to the side and look into the slot", main: "gap", yaw: 72 },
    bx: { hint: "Drag to walk around it", slider: "Walk round it", aria: "Walk round the Light Box, from one side to the other", main: "round", yaw: 60 },
    bs: { hint: "Drag to walk around them", slider: "Filaments", aria: "Come close to one filament, then the other", main: "filament", yaw: 74 },
    /* 06 - 10, the short stations: at most one moment each, named by `main`.
       The chair's is the camera walking round it (no beat in the page: it
       runs with the writing); the poster has none, and so no control. */
    fc: { short: true, hint: "Drag to walk around it", slider: "Walk round it", aria: "Walk a little way round the chair", main: "round", yaw: 74 },
    pu: { short: true, hint: "Drag to look along the row", slider: "Walk the row", aria: "Walk along the row of canvases", main: "row", yaw: 52 },
    eh: { short: true, hint: "Drag to look across it", yaw: 58 },
    gf: { short: true, hint: "Drag to turn the ball", slider: "Colour", aria: "Change the colour of the torch", main: "turn", yaw: 0 }
  };

  var STN = [];
  Object.keys(CFG).forEach(function (k) {
    var sec = document.querySelector('[data-chapter="' + k + '"]');
    if (!sec) return;
    STN.push({
      key: k, cfg: CFG[k], sec: sec, geo: null,
      left: /work--l/.test(sec.className), /* the writing is on the left */
      hand: { yaw: 0, pitch: 0, t: 0 }, /* what the visitor's drag has done */
      v: 0, /* motion off: the hand-operated control, 0..1 */
      u: 0, /* motion on: progress through this station's writing */
      w: {} /* beat weights */
    });
  });
  var N = STN.length;
  var by = {};
  STN.forEach(function (s, i) {
    s.i = i;
    by[s.key] = s;
  });
  var secMore = document.querySelector('[data-chapter="more"]');
  if (!N || !secMore) return;

  function wt(st, name) {
    return (st && st.w[name]) || 0;
  }
  /* how far an object has gone with its act: by the plan with motion on
     (only while the camera holds), by the slider with motion off */
  function actW(st, name) {
    if (!st) return 0;
    return REDUCED || FOCUS || !st.plan ? wt(st, name) : st.act || 0;
  }

  /* ============================================================
     Geometry of the page, cached. Scroll never measures the DOM.
     ============================================================ */

  var G = { W: 1, H: 1, Hc: 1, narrow: false, tall: false, more: 0 };

  function docTop(el) {
    return el.getBoundingClientRect().top + window.scrollY;
  }

  function measureWork(sec) {
    var free = sec.querySelector(".work__free");
    var fr = free.getBoundingClientRect();
    var top = docTop(sec);
    var o = {
      top: top,
      bottom: top + sec.offsetHeight,
      freeX: fr.left + fr.width / 2,
      freeW: fr.width,
      beats: {},
      bm: {}, /* the height of each beat's clear moment (narrow) */
      clear: [] /* stretches of page where the object has the screen (narrow) */
    };
    if (G.narrow) {
      /* THE PHONE: the scroll walks the track (.walk), not the column, which
         is the dossier and not in the page. The object has the screen the
         whole way; the caption says which part of it you are in. */
      o.freeX = G.W / 2;
      o.freeW = G.W;
      o.pb = [];
      o.far = {}; /* a beat's extra track, in screens, where its move is a long one (rooms-build.mjs, "THE PHONE'S PACE") */
      var H = G.H;
      [].forEach.call(sec.querySelectorAll(".walk [data-pbeat]"), function (b) {
        var t = docTop(b), nm = b.getAttribute("data-pbeat");
        o.beats[nm] = [t, t + b.offsetHeight];
        o.bm[nm] = b.offsetHeight;
        o.far[nm] = +b.getAttribute("data-far") || 0;
        o.pb.push({ name: nm, label: b.getAttribute("data-label") || "", line: b.getAttribute("data-line") || "", s: t - 0.15 * H });
      });
      var tail = sec.querySelector(".walk__tail");
      o.tail = tail ? docTop(tail) : o.bottom - 0.5 * H;
      o.capEnd = o.tail - 0.15 * H;
      o.colTop = o.colBot = top;
      o.clear.push([top, o.tail]);
      return o;
    }
    [].forEach.call(sec.querySelectorAll("[data-beat]"), function (b) {
      var t = docTop(b), mo = b.querySelector(".moment");
      o.beats[b.getAttribute("data-beat")] = [t, t + b.offsetHeight];
      o.bm[b.getAttribute("data-beat")] = mo ? mo.offsetHeight : 0;
    });
    /* where its writing starts and ends: its band is up between the two
       (rooms.js), and covers the half of the frame on its side */
    var ps = sec.querySelectorAll(".work__col .panel");
    o.colTop = ps.length ? docTop(ps[0]) : top;
    o.colBot = ps.length ? docTop(ps[ps.length - 1]) + ps[ps.length - 1].offsetHeight : o.bottom;
    o.clear.push([top, top + G.H * (/work--short/.test(sec.className) ? 0.52 : 0.7)]); /* (a short station's own screen is a shorter one on a phone) */
    [].forEach.call(sec.querySelectorAll(".moment"), function (m) {
      if (!m.offsetHeight) return;
      var t = docTop(m);
      o.clear.push([t, t + m.offsetHeight]);
    });
    return o;
  }

  function measure() {
    G.W = window.innerWidth;
    G.H = window.innerHeight;
    G.Hc = host.clientHeight || G.H;
    G.narrow = PHQ.matches; /* the phone layout (see PHQ) */
    G.tall = G.H > TALL;
    for (var i = 0; i < N; i++) STN[i].geo = measureWork(STN[i].sec);
    G.more = docTop(secMore);
    var mc = secMore.querySelector(".more__card");
    G.moreCol = mc ? docTop(mc) : G.more;
    for (i = 0; i < N; i++) STN[i].plan = plan(STN[i]);
    if (G.narrow) for (i = 0; i < N; i++) capSecond(STN[i]);
  }

  /* THE PHONE'S CAPTION follows the stage: where a beat has a second move
     (Bulb Studies: from the block's filament to the man's head), the
     caption's line changes half-way through that move to the beat panel's
     next caption (its own words, nothing new), so it never names what has
     left the stage */
  function capSecond(st) {
    var L = MOVES[st.key] || [], g = st.geo;
    for (var k = 0; k < L.length; k++) {
      var m = L[k], first = null;
      if (!m.second || !g.pb) continue;
      for (var j = 0; j < g.pb.length; j++) if (g.pb[j].name === m.beat) first = g.pb[j];
      var mv = st.plan.moves.filter(function (x) { return x.v === m.v; })[0];
      /* (read once: while the dossier is open the column is in the sheet) */
      var fc = st.sec.querySelectorAll('[data-beat="' + m.beat + '"] figcaption');
      if (st.cap2 == null && fc.length > 1) {
        var c = fc[1].cloneNode(true);
        [].forEach.call(c.querySelectorAll(".eyebrow"), function (e) { e.remove(); });
        st.cap2 = c.textContent.trim();
      }
      if (!first || !mv || !st.cap2) continue;
      g.pb.push({ name: m.beat + ":" + m.v, label: first.label, line: st.cap2, s: (mv.s + mv.e) / 2 });
      g.pb.sort(function (a, b) { return a.s - b.s; });
    }
  }

  /* ============================================================
     State
     ============================================================ */

  var live = false; /* the room is drawing */
  var dirty = true;
  var raf = 0;
  var lastT = 0;
  var sy = window.scrollY; /* scroll, eased a little with motion on */

  var roomHand = { yaw: 0, pitch: 0, t: 0 }; /* a drag at the entrance / the end */
  var dragging = false;
  var HOLD = 1.7; /* seconds a pose is held after release before easing home */

  /* motion off: which chapter is current (0 entrance, 1..N the lamps,
     N+1 further along), and the one the room is drawn for */
  var chapter = 0;
  var shown = 0;
  var penView = "whole"; /* motion off, pen only: whole | tip | top */

  var spinAuto = 0; /* the cluster turning on its cord, motion on only */

  /* Ask for a frame. requestAnimationFrame is the normal route, but it is
     not a promise: a browser may starve it (an embedded or background view,
     a throttled tab) while timers still run. So every request also arms a
     short timer that draws the frame itself if rAF has not got there. In an
     ordinary visible tab rAF always wins and the timer is cancelled. Without
     this, a cut in the still mode could leave the black veil down. */
  var dog = 0;
  function tick() {
    if (!raf) raf = requestAnimationFrame(frame);
    if (!dog)
      dog = setTimeout(function () {
        dog = 0;
        if (!raf) return;
        cancelAnimationFrame(raf);
        raf = 0;
        frame(performance.now(), true);
      }, 150);
  }
  function invalidate() {
    dirty = true;
    if (live && !document.hidden) tick();
  }

  /* ============================================================
     Timeline: scroll position -> what everything should be doing
     ============================================================ */

  /* t[k], r[k]: the crossing INTO station k (k = N: into the end), eased and
     raw. cur: the station you are at, or -1 at the entrance and the end. */
  var T = { t: [], r: [], cur: -1, gather: 1, y: 0, mv: false };

  function beatW(b, y) {
    if (!b) return 0;
    if (G.narrow) return sstep(y, b[0] - 0.15 * G.H, b[0] + 0.25 * G.H) * (1 - sstep(y, b[1] - 0.35 * G.H, b[1] - 0.05 * G.H));
    var topV = (b[0] - y) / G.H;
    var botV = (b[1] - y) / G.H;
    var a = G.narrow ? sstep(topV, 0.62, -0.12) : sstep(topV, 0.95, 0.3);
    var z = G.narrow ? sstep(botV, 0.3, 0.95) : sstep(botV, 0.15, 0.8);
    return a * z;
  }

  /* how far through a beat the page is, 0..1, running one way only (a
     weight rises and falls; this does not). On a desk: from its block
     coming up into the screen until its foot is a quarter of the way up.
     On a phone: over its clear moment, done by the time the writing that
     follows has come half-way up the screen. */
  function beatQ(b, hm, y) {
    if (!b) return 0;
    var H = G.H;
    if (G.narrow) return clamp((y - b[0] + 0.15 * H) / Math.max(1, (hm || H) - 0.2 * H), 0, 1);
    return clamp((0.9 * H - (b[0] - y)) / (b[1] - b[0] + 0.65 * H), 0, 1);
  }
  /* out quickly, held, back slowly: the coming back is the thing to watch */
  function hump(q) {
    return sstep(q, 0.03, 0.3) * (1 - sstep(q, 0.5, 0.97));
  }

  function timeline(y) {
    var H = G.H, i, st, name;
    T.y = y;
    T.mv = false;
    for (i = 0; i <= N; i++) {
      if (REDUCED) {
        T.r[i] = T.t[i] = shown >= i + 1 ? 1 : 0;
        continue;
      }
      var a = i === 0 ? 0 : STN[i - 1].geo.bottom - 0.5 * H;
      var b = i < N ? STN[i].geo.top : G.more - 0.15 * H;
      T.r[i] = clamp((y - a) / Math.max(1, b - a), 0, 1);
      T.t[i] = ease(T.r[i]);
    }
    for (i = 0; i < N; i++) {
      st = STN[i];
      st.p = {};
      if (REDUCED) {
        /* motion off: the slider does by hand what scroll does otherwise */
        var v = st.v;
        st.u = 0;
        st.w = {};
        if (st.cfg.main) st.w[st.cfg.main] = v;
        if (st.key === "pen" && v <= 0 && penView !== "whole") st.w[penView] = 1;
        if (st.key === "sr" && st.cfg.apart) {
          /* first to the side to see the slot, then it comes apart */
          st.w.gap = sstep(v, 0, 0.3);
          st.w.apart = sstep(v, 0.3, 1);
        }
        if (st.key === "bs") {
          st.w.filament = sstep(v, 0, 0.45);
          st.p.filament = sstep(v, 0.55, 1);
        }
      } else {
        var g = st.geo;
        st.u = clamp((y - g.top) / Math.max(1, g.bottom - g.top - H), 0, 1);
        for (name in g.beats) st.w[name] = beatW(g.beats[name], y);
        /* the plan: is the camera on its way somewhere, and how far has the
           object gone with its act (only ever while the camera holds) */
        var pl = st.plan, mk;
        for (mk = 0; pl && mk < pl.moves.length; mk++) if (y > pl.moves[mk].s && y < pl.moves[mk].e) T.mv = true;
        /* (Bubblegum's knot follows its own, quicker scroll: see T.ky) */
        var ay = st.key === "cl" && T.ky != null ? T.ky : y;
        st.act = pl && pl.act ? sstep(ay, pl.act.r0, pl.act.r1) * (1 - sstep(ay, pl.act.f0, pl.act.f1)) : 0;
        var fb = g.beats.filament;
        if (fb)
          st.p.filament = G.narrow
            ? sstep(y, fb[0] + 0.62 * (fb[1] - fb[0]) - 0.45 * H, fb[0] + 0.62 * (fb[1] - fb[0]))
            : sstep((y + 0.5 * H - fb[0]) / Math.max(1, fb[1] - fb[0]), 0.4, 0.62);
      }
      if (FOCUS && (st.geo.beats[FOCUS] || st.cfg.main === FOCUS || (FOCUS === "stand" && st.key === "bs"))) {
        for (name in st.w) st.w[name] = 0;
        st.w[FOCUS === "stand" ? "filament" : FOCUS] = 1;
        st.p.filament = FOCUS === "stand" ? 1 : 0;
      }
      if (st.cfg.short) {
        /* 06 - 10. q: how far through the moment; ex: how far the thing has
           come apart (0 whole). With motion off the slider is ex itself. */
        var mn = st.cfg.main, held = !!mn && FOCUS === mn, q;
        if (held) q = FQ == null ? -1 : FQ;
        else if (REDUCED) {
          q = mn ? st.v : 0;
          if (mn) st.w[mn] = sstep(st.v, 0, 0.2);
        } else q = mn ? beatQ(st.geo.beats[mn], st.geo.bm[mn], y) : 0;
        st.ex = held ? (q < 0 ? 1 : q) : REDUCED ? q : hump(q);
        st.walk = held && q < 0 ? 0.5 : q;
        if (st.key === "gf") {
          /* the ball turns on its ring: with the writing and by itself
             (motion on), and under the hand; the torch goes round the colour
             wheel by itself (motion on) or by the control (motion off) */
          st.turn = (held ? (q < 0 ? 0.5 : q) * 2.6 : REDUCED ? 0 : GF.t * 0.16) + st.hand.yaw * RAD;
          st.hue = REDUCED ? st.v : held && FQ != null ? FQ : GF.t / 28;
        }
      }
    }
    for (i = 0; i <= N; i++) if (T.r[i] > 0 && T.r[i] < 1) T.mv = true;
    T.cur = -1;
    for (i = 0; i < N; i++) if (T.t[i] >= 0.5) T.cur = i;
    if (T.t[N] >= 0.5) T.cur = -1;

    /* The cluster is whole when you see it from the entrance. It lets go
       only once you are standing at the pen with your back to it, and is
       pulled together again in front of you on the way over. */
    T.gather = 1;
    if (!REDUCED && by.cl && by.pen) {
      var loosed = sstep((y - by.pen.geo.top) / H, 0.3, 1.2);
      /* ...and drawn together again once you stand in front of it: the
         camera has arrived and holds while the globes come in */
      var back = sstep(y, by.cl.geo.top + 0.05 * H, by.cl.geo.top + 0.8 * H);
      T.gather = 1 - loosed * (1 - back);
    }
  }

  /* how much a station is "the one you are at", 0..1 */
  function presence(st) {
    return T.t[st.i] * (1 - T.t[st.i + 1]);
  }

  /* motion off: which chapter is current. Only ever causes a cut. */
  function whichChapter(y) {
    var m = 0.45 * G.H, c = 0, F = Math.max(60, G.H * 0.1);
    /* on a desk the cut comes no later than the moment the next column's
       band begins to rise (rooms.js, bands()): held any longer, that band
       covers the work still shown and the free half is bare wall */
    var cutAt = function (top, col) {
      return G.narrow ? top - m : Math.min(top - m, col - G.H - F);
    };
    for (var i = 0; i < N; i++) if (y >= cutAt(STN[i].geo.top, STN[i].geo.colTop)) c = i + 1;
    if (y >= cutAt(G.more, G.moreCol)) c = N + 1;
    if (c === chapter) return;
    chapter = c;
    if (!REDUCED) return;
    if (!live) {
      shown = c;
      return;
    }
    /* THE CUT. The new framing is drawn in this same frame (frame() calls
       timeline() and pose() right after this), and the veil restarts a CSS
       animation that begins fully black and fades up: a dip through black
       with no timer and no second frame to wait for, so it cannot be left
       hanging dark however starved the page is of frames. */
    shown = chapter;
    dirty = true;
    if (veil) {
      veil.classList.remove("is-cut");
      void veil.offsetWidth;
      veil.classList.add("is-cut");
    }
  }

  /* ============================================================
     Control strip
     ============================================================ */

  var hudHint = hud && hud.querySelector(".hud__hint");
  var hudViews = hud && hud.querySelector(".hud__views");
  var hudRange = hud && hud.querySelector(".hud__range");
  var hudRangeLabel = hudRange && hudRange.querySelector("span");
  var hudInput = hudRange && hudRange.querySelector("input");
  var hudFor = null;
  var used = false;

  function hudSync() {
    if (!hud || !live || G.narrow) return; /* a phone: the caption has them */
    var st = T.cur >= 0 ? STN[T.cur] : null;
    var y = REDUCED ? window.scrollY : sy;
    var on = false;
    if (st) {
      var w = st.geo;
      if (G.narrow) {
        var best = 0;
        for (var i = 0; i < w.clear.length; i++) {
          var a = Math.max(w.clear[i][0], y), b = Math.min(w.clear[i][1], y + G.H);
          if (b - a > best) best = b - a;
        }
        on = best > G.H * 0.5;
      } else {
        on = y > w.top - 0.4 * G.H && y < w.bottom - 0.8 * G.H;
      }
    }
    if (on && hudFor !== st) {
      hudFor = st;
      hudHint.textContent = st.cfg.hint;
      if (REDUCED) {
        hudViews.hidden = !st.cfg.views;
        hudRange.hidden = !st.cfg.slider; /* (the poster has nothing to operate) */
        if (st.cfg.slider) {
          hudRangeLabel.textContent = st.cfg.slider;
          hudInput.setAttribute("aria-label", st.cfg.aria);
          hudInput.value = String(Math.round(st.v * 100));
        }
        hud.classList.toggle("has-controls", !!st.cfg.slider);
      }
      hud.style.setProperty("--hud-x", (G.narrow ? G.W / 2 : st.geo.freeX) + "px");
    }
    hud.classList.toggle("is-on", on);
    hud.classList.toggle("is-used", used);
  }

  function setView(v) {
    penView = v;
    if (!hudViews) return;
    [].forEach.call(hudViews.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === v));
    });
  }

  if (hud) {
    if (hudInput)
      hudInput.addEventListener("input", function () {
        if (!hudFor) return;
        hudFor.v = clamp(parseFloat(hudInput.value) / 100, 0, 1);
        if (hudFor.key === "pen" && hudFor.v > 0) setView("whole");
        invalidate();
      });
    if (hudViews)
      hudViews.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-view]");
        if (!b || !by.pen) return;
        by.pen.v = 0;
        if (hudFor === by.pen && hudInput) hudInput.value = "0";
        setView(b.getAttribute("data-view"));
        invalidate();
      });
  }

  /* Motion switched on or off (entrance prompt or the header control).
     Everything hand-operated goes back to rest so neither mode inherits a
     pose it has no way to undo. */
  window.addEventListener("rooms:motion", function (e) {
    REDUCED = e.detail === "reduced";
    setView("whole");
    for (var i = 0; i < N; i++) {
      STN[i].v = 0;
      STN[i].hand.yaw = STN[i].hand.pitch = 0;
      STN[i].hand.to = null;
    }
    roomHand.yaw = roomHand.pitch = 0;

    if (veil) veil.classList.remove("is-cut");
    shown = chapter;
    sy = window.scrollY;
    hudFor = null;
    if (hud) {
      hud.classList.remove("has-controls");
      if (hudViews) hudViews.hidden = true;
      if (hudRange) hudRange.hidden = true;
      if (hudInput) hudInput.value = "0";
    }
    phoneMode();
    lastT = 0;
    invalidate();
  });

  /* ============================================================
     Drag. Listens on window, so nothing layered over the canvas can
     swallow it; pointer capture keeps it alive outside the window.
     ============================================================ */

  var canvas = null;
  var pid = null, lx = 0, ly = 0, ptype = "";
  /* touch: a turn only begins after 10 px of sideways travel that is
     clearly sideways (|dx| > 1.2 |dy|); before that nothing happens, and a
     vertical swipe is left to the browser, which scrolls (touch-action:
     pan-y on the canvas; nothing here ever prevents a touchmove). A touch
     that starts within 24 px of either edge is the browser's own back /
     forward swipe and is ignored. */
  var armed = false, tx0 = 0, ty0 = 0;
  var EDGE = 24, SLOP = 10;

  function target() {
    return T.cur >= 0 ? STN[T.cur].hand : roomHand;
  }

  function limit(st, h) {
    if (!st) h.yaw = clamp(h.yaw, -14, 14);
    else if (st.cfg.yaw) h.yaw = clamp(h.yaw, -st.cfg.yaw, st.cfg.yaw);
    h.pitch = clamp(h.pitch, -9, 15);
  }

  function onDown(e) {
    if (!live || pid !== null || TUNE) return; /* (?tune=1 has its own) */
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.isPrimary === false) return;
    var t = e.target;
    if (t && t.closest && t.closest(SOLID)) return;
    if (e.pointerType === "touch") {
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      pid = e.pointerId;
      ptype = "touch";
      armed = true;
      tx0 = lx = e.clientX;
      ty0 = ly = e.clientY;
      return;
    }
    pid = e.pointerId;
    ptype = e.pointerType;
    lx = e.clientX;
    ly = e.clientY;
    dragging = true;
    try {
      canvas.setPointerCapture(pid);
    } catch (err) {}
    if (ptype === "mouse") {
      root.classList.add("dragging");
      e.preventDefault(); /* no text selection, no image drag */
    }
  }

  function onMove(e) {
    if (e.pointerId !== pid) return;
    if (armed) {
      var ax = e.clientX - tx0, ay = e.clientY - ty0;
      if (Math.abs(ay) > SLOP && Math.abs(ay) >= Math.abs(ax)) {
        armed = false; /* a scroll: not ours */
        pid = null;
        return;
      }
      if (Math.abs(ax) < SLOP || Math.abs(ax) <= 1.2 * Math.abs(ay)) return;
      armed = false;
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      try {
        canvas.setPointerCapture(pid);
      } catch (err) {}
      return;
    }
    var dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    if (!dx && !dy) return;
    var st = T.cur >= 0 ? STN[T.cur] : null;
    var h = target();
    /* degrees per width of the free half: the same gesture turns it the
       same amount on a phone and on a desk */
    h.yaw += (dx / Math.max(340, st ? st.geo.freeW : G.W)) * 135;
    if (ptype === "mouse") h.pitch += (dy / Math.max(400, G.H)) * 44;
    limit(st, h);
    h.t = performance.now();
    h.to = null;
    if (!used && Math.abs(h.yaw) > 6) used = true;
    invalidate();
  }

  function onUp(e) {
    if (e.pointerId !== pid) return;
    if (armed) {
      armed = false;
      pid = null;
      return;
    }
    try {
      canvas.releasePointerCapture(pid);
    } catch (err) {}
    pid = null;
    dragging = false;
    root.classList.remove("dragging");
    target().t = performance.now();
    invalidate();
  }

  function onKey(e) {
    if (!live) return;
    var st = by[e.currentTarget.getAttribute("data-scene")];
    var d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d || !st) return;
    e.preventDefault();
    st.hand.yaw += d * 12;
    limit(st, st.hand);
    st.hand.t = performance.now();
    used = true;
    invalidate();
  }

  /* ============================================================
     PHONE: STAGE AND DOSSIER (research/mobile.md, "recommended design")
     On a portrait phone the scroll is only the walk; the room and the
     object own the screen. One caption over the dark floor says where you
     are (the work at its arrival, a beat's label and one line during the
     beat, nothing during a walk) and holds two buttons: the dossier (the
     station's column, in a sheet) and a turn by one step. Everything here
     is inert unless G.narrow (the phone layout) and the room is live.
     ============================================================ */

  var cap = document.getElementById("cap");
  var capN = cap && cap.querySelector(".cap__n");
  var capT = cap && cap.querySelector(".cap__t");
  var capS = cap && cap.querySelector(".cap__s");
  var capCtl = cap && cap.querySelector(".cap__ctl");
  var capOpen = cap && cap.querySelector(".cap__open");
  var capTh = cap && cap.querySelector(".cap__th");
  var capL = cap && cap.querySelector(".cap__l");
  var capTurn = cap && cap.querySelector(".cap__turn");
  var capHint = document.getElementById("cap-hint");
  var sheet = document.getElementById("sheet");
  var sheetDim = document.getElementById("sheet-dim");
  var sheetBody = sheet && sheet.querySelector(".sheet__body");
  var sheetT = sheet && sheet.querySelector(".sheet__t");
  var sheetX = sheet && sheet.querySelector(".sheet__x");
  var sheetNext = sheet && sheet.querySelector(".sheet__next");
  var TOTALN = N;
  var capKey = "";
  var capSt = null; /* the station the caption is for */
  var sheetOpen = false;
  var openSt = null, openY = 0, opener = null, pushed = false, pendingJump = null;
  var hintDone = false;
  try {
    hintDone = sessionStorage.getItem("rooms-hint") === "1";
  } catch (e) {}

  /* what each station's caption holds, read once from its column */
  STN.forEach(function (st) {
    var col = st.sec.querySelector(".work__col");
    var sub = col && col.querySelector(".whead__s");
    var imgs = col ? [].slice.call(col.querySelectorAll(".fig img")).slice(0, 3) : [];
    st.capInfo = {
      n: st.sec.getAttribute("data-n") || "",
      title: st.sec.getAttribute("data-title") || "",
      sub: sub ? sub.textContent : "",
      thumbs: imgs.map(function (im) { return im.getAttribute("src"); }),
      film: !!(col && col.querySelector("video")),
      col: col
    };
  });

  function phoneOn() {
    return G.narrow && live && !G.tall;
  }

  /* which station and which part of it the caption is for, at scroll y */
  function capAt(y) {
    var H = G.H;
    if (REDUCED) {
      var c = chapter - 1;
      return c >= 0 && c < N ? { st: STN[c], beat: null } : null;
    }
    for (var i = 0; i < N; i++) {
      var st = STN[i], g = st.geo;
      if (!g || !g.pb || y < g.top - 0.1 * H || y >= g.capEnd) continue;
      var beat = null;
      for (var k = 0; k < g.pb.length; k++) if (y >= g.pb[k].s) beat = g.pb[k];
      return { st: st, beat: beat };
    }
    return null;
  }

  function capFill(st, beat) {
    var ci = st.capInfo;
    capN.textContent = beat ? beat.label : ci.n + " / " + TOTALN;
    capT.textContent = beat ? "" : ci.title;
    capS.textContent = beat ? beat.line : ci.sub;
    capT.hidden = !!beat;
    cap.setAttribute("data-state", beat ? "beat" : "arrive");
    capL.textContent = ci.film ? "Photos, film & text" : "Photos & text";
    capOpen.setAttribute("aria-label", "Open " + ci.title + ": " + (ci.film ? "photographs, film and text" : "photographs and text"));
    capTurn.setAttribute("aria-label", "Turn " + ci.title + " by one step");
    if (capTh.getAttribute("data-for") !== st.key) {
      capTh.setAttribute("data-for", st.key);
      capTh.innerHTML = "";
      ci.thumbs.forEach(function (src) {
        var im = document.createElement("img");
        im.src = src;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
        capTh.appendChild(im);
      });
    }
    /* a short cross-fade on a change (none with motion off: a cut) */
    if (!REDUCED) {
      cap.classList.remove("is-swap");
      void cap.offsetWidth;
      cap.classList.add("is-swap");
    }
  }

  function capSync() {
    if (!cap) return;
    if (!phoneOn() || sheetOpen) {
      if (!phoneOn()) {
        cap.hidden = true;
        if (capHint) capHint.hidden = true;
      }
      return;
    }
    cap.hidden = false;
    var y = window.scrollY, a = capAt(y);
    var key = a ? a.st.key + ":" + (a.beat ? a.beat.name : "") : "";
    if (key !== capKey) {
      capKey = key;
      capSt = a ? a.st : null;
      if (a) capFill(a.st, a.beat);
      else cap.setAttribute("data-state", "off");
      cap.toggleAttribute("inert", !a);
      if (REDUCED) stillCtl();
    }
    root.style.setProperty("--cap-h", (cap.offsetHeight || 0) + "px");
    /* the drag hint: at the first work only, once, on the floor above the
       caption; gone after the first turn or once you leave the arrival */
    if (capHint) {
      var show = !hintDone && !used && !!a && a.st.i === 0 && !a.beat;
      if (!show && !capHint.hidden && !hintDone) {
        hintDone = true;
        try {
          sessionStorage.setItem("rooms-hint", "1");
        } catch (e) {}
      }
      capHint.hidden = !show;
    }
  }

  var capRaf = 0;
  window.addEventListener("scroll", function () {
    if (capRaf) return;
    capRaf = requestAnimationFrame(function () {
      capRaf = 0;
      capSync();
    });
  }, { passive: true });

  /* motion off: what scroll does with motion on is a control, and on a
     phone it sits in the caption, in reach of the thumb */
  function stillCtl() {
    if (!capCtl || !hudViews || !hudRange) return;
    var inCap = G.narrow && REDUCED;
    if (inCap && hudViews.parentNode !== capCtl) {
      capCtl.appendChild(hudViews);
      capOpen.parentNode.insertBefore(hudRange, capOpen); /* one row: control, dossier, turn */
    } else if (!inCap && hudViews.parentNode === capCtl) {
      hud.appendChild(hudViews);
      hud.appendChild(hudRange);
    }
    if (inCap) {
      var st = capSt;
      hudFor = st;
      hudViews.hidden = !(st && st.cfg.views);
      hudRange.hidden = !(st && st.cfg.slider);
      if (st && st.cfg.slider) {
        hudRangeLabel.textContent = st.cfg.slider;
        hudInput.setAttribute("aria-label", st.cfg.aria);
        hudInput.value = String(Math.round(st.v * 100));
      }
      capCtl.hidden = !(st && st.cfg.views);
      cap.classList.toggle("has-views", !!(st && st.cfg.views));
    } else {
      capCtl.hidden = true;
      cap.classList.remove("has-views");
    }
  }

  /* ---- the turn button: one step per tap (45 degrees), the way a drag
     turns it and within the same limits; at a limit it turns back. A long
     press repeats every 300 ms. With motion on the turn is eased and the
     object comes home after the usual hold; with motion off it is a cut and
     stays. ---- */
  function turnStep() {
    var st = capSt;
    if (!st || !live) return;
    var h = st.hand, lim = st.cfg.yaw || 0, cur = h.to != null ? h.to : h.yaw;
    var d = h.dir || 1, nx = cur + 45 * d;
    if (lim) {
      if ((d > 0 && cur >= lim - 0.5) || (d < 0 && cur <= -lim + 0.5)) {
        d = -d;
        nx = cur + 45 * d;
      }
      nx = clamp(nx, -lim, lim);
    }
    h.dir = d;
    if (REDUCED) {
      h.yaw = nx;
      h.to = null;
    } else h.to = nx;
    h.t = performance.now();
    used = true;
    invalidate();
    capSync();
  }
  var turnRep = 0;
  if (capTurn) {
    capTurn.addEventListener("click", function (e) {
      if (capTurn.getAttribute("data-held") === "1") {
        capTurn.removeAttribute("data-held");
        return;
      }
      turnStep();
    });
    capTurn.addEventListener("pointerdown", function () {
      clearInterval(turnRep);
      var n0 = 0;
      turnRep = setInterval(function () {
        n0++;
        if (n0 < 2) return; /* the first 600 ms: a tap */
        capTurn.setAttribute("data-held", "1");
        turnStep();
      }, 300);
    }, { passive: true });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
      capTurn.addEventListener(t, function () {
        clearInterval(turnRep);
      }, { passive: true });
    });
  }

  /* ---- the dossier ---- */
  function nextOf(st) {
    return st && st.i + 1 < N ? STN[st.i + 1] : null;
  }

  function focusables() {
    return [].filter.call(sheet.querySelectorAll("a[href], button, video, [tabindex]:not([tabindex='-1'])"), function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
  }

  function setInert(on) {
    ["main", ".bar", ".cap", ".hud", ".skip"].forEach(function (q) {
      var el = document.querySelector(q);
      if (el) el.toggleAttribute("inert", on);
    });
  }

  function openSheet(st) {
    if (sheetOpen || !st || !phoneOn() || !sheet) return;
    var ci = st.capInfo, col = ci.col;
    if (!col) return;
    sheetOpen = true;
    openSt = st;
    openY = window.scrollY;
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : capOpen;
    st.colHome = col.nextSibling;
    sheetBody.appendChild(col);
    sheet.scrollTop = 0;
    sheetT.textContent = ci.n + " / " + TOTALN;
    sheet.style.setProperty("--accent", st.sec.style.getPropertyValue("--accent") || "");
    var h2 = col.querySelector("h2");
    if (h2) sheet.setAttribute("aria-labelledby", h2.id);
    var nx = nextOf(st);
    sheetNext.textContent = nx ? "Next: " + nx.capInfo.n + " " + nx.capInfo.title : "The index and contact";
    sheetNext.setAttribute("href", nx ? "#" + nx.sec.id : "#more");
    /* films in the dossier are tap-to-play: they keep their controls and
       nothing starts by itself (rooms.js leaves films in the sheet alone) */
    [].forEach.call(col.querySelectorAll("video"), function (v) {
      v.setAttribute("controls", "");
      if (!v.paused) v.pause();
    });
    root.classList.add("sheet-open");
    sheet.hidden = false;
    sheetDim.hidden = false;
    setInert(true);
    void sheet.offsetWidth;
    sheet.classList.add("is-open");
    sheetDim.classList.add("is-open");
    if (h2) {
      h2.setAttribute("tabindex", "-1");
      h2.focus({ preventScroll: true });
    }
    /* the browser must not put the scroll anywhere itself when the entry is
       popped again: we restore it (and Next jumps) by hand */
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    } catch (e) {}
    try {
      history.pushState({ roomsSheet: st.key }, "", "#" + st.sec.id + "/notes");
      pushed = true;
    } catch (e) {
      pushed = false;
    }
    /* the room stops drawing (frame() returns at once): the last picture
       stays, dimmed, above the sheet */
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /* fromPop: the browser's back button (or our own history.back()) */
  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    if (!fromPop && pushed) {
      history.back(); /* popstate comes back here */
      return;
    }
    pushed = false;
    var st = openSt, col = st.capInfo.col;
    sheet.classList.remove("is-open");
    sheetDim.classList.remove("is-open");
    sheet.style.transform = "";
    [].forEach.call(col.querySelectorAll("video"), function (v) {
      if (!v.paused) v.pause();
    });
    var h2 = col.querySelector("h2");
    if (h2) h2.removeAttribute("tabindex");
    st.sec.insertBefore(col, st.colHome && st.colHome.parentNode === st.sec ? st.colHome : null);
    sheet.hidden = true;
    sheetDim.hidden = true;
    setInert(false);
    root.classList.remove("sheet-open");
    sheetOpen = false;
    openSt = null;
    if (Math.abs(window.scrollY - openY) > 0.5) window.scrollTo(0, openY);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    lastT = 0;
    capKey = "";
    capSync();
    invalidate();
    var j = pendingJump;
    pendingJump = null;
    requestAnimationFrame(function () {
      if (j) jumpTo(j);
      try {
        if ("scrollRestoration" in history) history.scrollRestoration = "auto";
      } catch (e) {}
    });
  }

  window.addEventListener("popstate", function () {
    if (sheetOpen) closeSheet(true);
  });

  if (capOpen)
    capOpen.addEventListener("click", function () {
      openSheet(capSt);
    });
  if (sheetX)
    sheetX.addEventListener("click", function () {
      closeSheet(false);
    });
  if (sheetNext)
    sheetNext.addEventListener("click", function (e) {
      e.preventDefault();
      pendingJump = sheetNext.getAttribute("href");
      closeSheet(false);
    });
  if (sheetDim)
    sheetDim.addEventListener("click", function () {
      closeSheet(false);
    });

  document.addEventListener("keydown", function (e) {
    if (!sheetOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeSheet(false);
      return;
    }
    if (e.key === "Tab") {
      /* the focus stays in the sheet (inert does this too where it exists) */
      var f = focusables();
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && (document.activeElement === z || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        a.focus();
      }
    }
  });

  /* swipe down on the sheet's head closes it; swipe up starting on the
     dossier button opens it. Passive listeners: nothing is prevented. */
  function swipe(el, onEnd, onMoveY) {
    var y0 = null, x0 = 0, dy = 0;
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (onMoveY) onMoveY(dy, Math.abs(e.touches[0].clientX - x0));
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (y0 == null) return;
      var t = e.changedTouches[0], dx = Math.abs(t.clientX - x0);
      dy = t.clientY - y0;
      y0 = null;
      onEnd(dy, dx);
    }, { passive: true });
    el.addEventListener("touchcancel", function () {
      y0 = null;
      if (onMoveY) onMoveY(0, 0);
    }, { passive: true });
  }
  if (sheet) {
    var head = sheet.querySelector(".sheet__head");
    swipe(head, function (dy, dx) {
      if (dy > 70 && dy > dx) closeSheet(false);
      else sheet.style.transform = "";
    }, function (dy) {
      sheet.style.transform = dy > 0 && !REDUCED ? "translateY(" + dy + "px)" : "";
    });
  }
  if (capOpen)
    swipe(capOpen, function (dy, dx) {
      if (dy < -30 && -dy > dx) openSheet(capSt);
    });

  /* ---- jumps: on a phone the index, the header's Index and the dossier's
     Next CUT to where they lead (no fly-through of the whole room) ---- */
  function jumpTo(href) {
    var id = (href || "").replace(/^#/, "");
    var el = id && document.getElementById(id);
    if (!el) return;
    var y;
    var st = null;
    for (var i = 0; i < N; i++) if (STN[i].sec === el) st = STN[i];
    /* a work that is not in the room yet is fetched first, and the cut
       waits for it under the black (lzVeil) */
    if (st && !lzReady(st.key)) {
      LZ.jump = st.key;
      lzWant(st.key);
      lzVeil();
    }
    if (st) y = st.geo.top;
    else if (el === secMore) y = (G.moreCol || G.more) - G.H * 0.12;
    else y = docTop(el);
    y = Math.max(0, Math.round(y));
    window.scrollTo(0, y);
    sy = y;
    if (veil) {
      veil.classList.remove("is-cut");
      void veil.offsetWidth;
      veil.classList.add("is-cut");
    }
    dirty = true;
    capKey = "";
    capSync();
    invalidate();
    var f = st ? st.sec.querySelector("[data-3d]") : el === secMore ? secMore.querySelector("h2") : null;
    if (f) {
      if (!f.hasAttribute("tabindex")) f.setAttribute("tabindex", "-1");
      f.focus({ preventScroll: true });
    }
  }
  document.addEventListener("click", function (e) {
    if (!phoneOn() || sheetOpen || e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a[href^="#w-"], a[href="#more"]');
    if (!a) return;
    e.preventDefault();
    jumpTo(a.getAttribute("href"));
  });

  /* the closing card covers the screen: the room need not draw under it */
  function cardCovers() {
    return G.narrow && G.moreCol > 0 && G.moreCol - window.scrollY < 40;
  }

  /* the phone layout came or went (rotation): put everything back */
  function phoneMode() {
    if (!G.narrow && sheetOpen) closeSheet(true);
    capKey = "";
    stillCtl();
    capSync();
  }

  /* ============================================================
     Build
     ============================================================ */

  var THREE, renderer, composer, glowComposer, bloom, scene, camera;
  /* Only what actually emits light is allowed to bloom. Emitters and every
     other solid part of a lamp are on this layer; see draw(). */
  var GLOW = 1;
  var BLACK = null;
  var occluders = [], emitters = [], blackMat = null, whiteMat = null, whiteLine = null, blackLine = null;
  var maskRT = null, Utils = null;
  var RIG = {}; /* per-station update functions */
  var moreRig = null;
  var focusBulb = null; /* where the filament close-up looks */
  var pr = 1;

  function asOccluder(o) {
    o.layers.enable(GLOW);
    occluders.push(o);
    return o;
  }
  function asEmitter(o) {
    o.layers.enable(GLOW);
    emitters.push(o);
    return o;
  }
  /* A BLOCKER is a piece of the room an emitter can be behind: the cheeks,
     head and sill of the window recess. It is drawn black (both sides) in
     the glow source, so a filament hidden behind it sends no glow through
     it; and black in the mask, so the glow of a filament you CAN see may
     lie on it, as it may on any wall. (An occluder is a part of a lamp, and
     never takes a halo at all.) */
  var blockers = [], blockMat = null;
  function asBlocker(o) {
    o.layers.enable(GLOW);
    blockers.push(o);
    return o;
  }

  /* value noise, shared by the two veneers that have light behind them */
  var GLSL_NOISE =
    "float vH(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }\n" +
    "float vN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);\n" +
    " return mix(mix(mix(vH(i), vH(i+vec3(1,0,0)), f.x), mix(vH(i+vec3(0,1,0)), vH(i+vec3(1,1,0)), f.x), f.y),\n" +
    "            mix(mix(vH(i+vec3(0,0,1)), vH(i+vec3(1,0,1)), f.x), mix(vH(i+vec3(0,1,1)), vH(i+vec3(1,1,1)), f.x), f.y), f.z); }\n";

  function noiseCanvas(size, fn) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    fn(g, size);
    return c;
  }

  /* plaster / trowelled concrete: blotches plus fine speckle, tileable enough */
  function mottled(size, base, amp, speck) {
    return noiseCanvas(size, function (g, s) {
      g.fillStyle = "rgb(" + base + "," + base + "," + base + ")";
      g.fillRect(0, 0, s, s);
      var i, x, y, r, v;
      for (i = 0; i < 260; i++) {
        x = hash(i * 3.1) * s;
        y = hash(i * 7.7 + 2) * s;
        r = (0.03 + hash(i * 1.3 + 5) * 0.16) * s;
        v = hash(i * 9.1 + 1) > 0.5 ? 255 : 0;
        var rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, "rgba(" + v + "," + v + "," + v + "," + amp + ")");
        rg.addColorStop(1, "rgba(" + v + "," + v + "," + v + ",0)");
        g.fillStyle = rg;
        /* draw wrapped so the tile repeats without a seam */
        for (var ox = -1; ox <= 1; ox++)
          for (var oy = -1; oy <= 1; oy++) {
            g.setTransform(1, 0, 0, 1, ox * s, oy * s);
            g.fillRect(x - r, y - r, r * 2, r * 2);
          }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      /* grain, but soft: noise made small and drawn large, so it reads as
         trowelled plaster and not as woven cloth */
      var q = Math.round(s / 3);
      var nc = document.createElement("canvas");
      nc.width = nc.height = q;
      var ng = nc.getContext("2d");
      var id = ng.createImageData(q, q), d = id.data;
      for (i = 0; i < d.length; i += 4) {
        v = 128 + (Math.random() - 0.5) * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ng.putImageData(id, 0, 0);
      g.globalAlpha = speck / 255;
      g.imageSmoothingEnabled = true;
      g.drawImage(nc, 0, 0, s, s);
      g.globalAlpha = 1;
    });
  }

  /* ------------------------------------------------------------
     Polished stainless is only ever a picture of its surroundings:
     in a dim room it renders black, in an even one grey paint. What
     makes it read as chrome is CONTRAST — dark walls and a ring of
     narrow, very bright softboxes, which draws hard light/dark bands
     along a polished tube. The lamps here are always on, so there is
     only the lit studio: dim cold strips for the bands, and warm
     panels so the metal reflects the lamp's own orange.
     (After studioEnv() in tools/viewer.html, which is not deployed.)
     ------------------------------------------------------------ */
  function studioEnv() {
    var s = new THREE.Scene();
    s.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(30, 48, 24),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          vertexShader:
            "varying vec3 p;\nvoid main(){ p = position;" +
            " gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader:
            "varying vec3 p;\nvoid main(){" +
            " float h = normalize(p).y;" +
            " vec3 top = vec3(0.30,0.28,0.26);" +
            " vec3 wall = vec3(0.022,0.020,0.019);" +
            " vec3 low = vec3(0.040,0.024,0.015);" +
            " vec3 c = h > 0.0 ? mix(wall, top, smoothstep(0.4,0.95,h))" +
            " : mix(wall, low, smoothstep(-0.04,-0.45,h));" +
            " gl_FragColor = vec4(c, 1.0); }"
        })
      )
    );
    function strip(bearing, w, hex, power, h, y) {
      var a = bearing * RAD, d = 10;
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h || 16),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(hex).multiplyScalar(power),
          side: THREE.DoubleSide
        })
      );
      m.position.set(Math.sin(a) * d, y == null ? 3 : y, Math.cos(a) * d);
      m.lookAt(0, y == null ? 3 : y, 0);
      s.add(m);
    }
    /* Bearing 0 is the room side (+z, where the visitor stands). A few
       broad soft boxes and a few hairlines, with DARK between them: on a
       turned surface that reads as polished metal. Many equal strips read
       as pleats. */
    strip(-42, 2.6, 0xffffff, 3.0);
    strip(-15, 0.28, 0xffffff, 6.0);
    strip(21, 1.9, 0xff6a1e, 3.2); /* the lit lamp, seen in its own chrome */
    strip(50, 0.45, 0xffffff, 3.2);
    strip(98, 2.8, 0xff6418, 2.1);
    strip(150, 0.8, 0xdde8ff, 3.0);
    strip(-168, 2.2, 0xffffff, 1.6);
    strip(-118, 0.7, 0xdde8ff, 3.2);
    strip(-80, 1.6, 0xff7222, 2.4);
    /* Horizontal bars on the room side. A flat mirror — the pocket clip —
       reflects one small patch of its surroundings, so with only vertical
       strips it is one flat colour. These give it bands along its length,
       which slide as you move. */
    function bar(y, h, hex, power, w) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w || 19, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(hex).multiplyScalar(power),
          side: THREE.DoubleSide
        })
      );
      m.position.set(0, y, 9.4);
      m.lookAt(0, y, 0);
      s.add(m);
    }
    bar(-3.6, 0.7, 0xff6a1e, 2.4);
    bar(-1.6, 0.4, 0xffffff, 3.6);
    bar(0.9, 0.5, 0xffffff, 4.4);
    bar(2.7, 1.0, 0xff6a1e, 3.1);
    bar(4.6, 0.35, 0xffffff, 5.2);
    bar(6.3, 0.9, 0xff7a2a, 2.6);
    bar(8.6, 0.5, 0xffffff, 3.4);
    bar(11.5, 1.6, 0xff6a1e, 2.2);
    bar(16, 1.2, 0xffffff, 2.6);
    /* a low warm band all round: the lit wall and floor near the lamp */
    strip(0, 7, 0xff5a14, 0.55, 2.2, -2.4);
    strip(180, 9, 0xff5a14, 0.8, 2.2, -2.2);
    var bank = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffffff).multiplyScalar(2.2),
        side: THREE.DoubleSide
      })
    );
    bank.position.set(0, 13, 2);
    bank.lookAt(0, 0, 0);
    s.add(bank);
    var spill = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff6a1e).multiplyScalar(0.6),
        side: THREE.DoubleSide
      })
    );
    spill.position.set(0, -7, 0);
    spill.lookAt(0, 0, 0);
    s.add(spill);

    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(s, 0).texture; /* sharp: a mirror wants detail */
    pm.dispose();
    return tex;
  }

  /* The three materials Blender's node graphs could not carry across, plus
     the polished metals. NAME FIRST, always: glTF defaults metallicFactor to
     1, so the oak veneer and the LED strips arrive claiming to be metal. */
  /* A lamp's own light sits centimetres from its own parts. Left alone, a
     point light at that range turns a white printed cup or a nickel cap
     into something that looks like a second light source. Scale and cap
     what the punctual lights do to a material; reflections of the studio
     (which is what polished metal is) are untouched. */
  function tame(mat, scale, cap, warm) {
    if (mat.userData.tamed) return;
    mat.userData.tamed = true;
    /* warm: light arriving from all round, as at the middle of sixteen lit
       globes. It is light falling ON the part (it scales with the part's own
       colour); the part emits nothing and stays out of the glow. */
    var extra = warm
      ? "reflectedLight.indirectDiffuse += material.diffuseColor * vec3(" +
        warm[0].toFixed(3) + "," + warm[1].toFixed(3) + "," + warm[2].toFixed(3) + ");\n"
      : "";
    mat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <lights_fragment_end>",
        "#include <lights_fragment_end>\n" +
          "reflectedLight.directDiffuse = min(reflectedLight.directDiffuse * " + scale.toFixed(4) + ", vec3(" + cap.toFixed(3) + "));\n" +
          "reflectedLight.directSpecular = min(reflectedLight.directSpecular * " + scale.toFixed(4) + ", vec3(" + cap.toFixed(3) + "));\n" +
          extra
      );
    };
    mat.customProgramCacheKey = function () {
      return "tame:" + scale + ":" + cap + ":" + (warm ? warm.join("/") : "");
    };
  }

  /* The pocket clip is modelled dead flat, and a dead-flat mirror shows one
     small patch of its surroundings: one flat colour, which next to a lit
     body reads as a glowing slab. A pressed steel clip is never flat; it is
     crowned across its width and bowed a little along its length. Giving the
     blade's normals that crown (geometry untouched) makes it do what the
     real one does: long hard-edged reflections running down it. */
  function crown(geo) {
    geo.computeBoundingBox();
    var bb = geo.boundingBox;
    var halfW = Math.max(1, (bb.max.z - bb.min.z) / 2), midZ = (bb.max.z + bb.min.z) / 2;
    var halfL = Math.max(1, (bb.max.y - bb.min.y) / 2), midY = (bb.max.y + bb.min.y) / 2;
    var p = geo.attributes.position, nrm = geo.attributes.normal;
    for (var i = 0; i < p.count; i++) {
      var nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
      if (Math.abs(nx) < 0.6) continue; /* only the broad faces of the blade */
      var sgn = nx > 0 ? 1 : -1;
      nz += 0.3 * ((p.getZ(i) - midZ) / halfW);
      ny += 0.1 * sgn * ((p.getY(i) - midY) / halfL);
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nrm.setXYZ(i, nx / l, ny / l, nz / l);
    }
    nrm.needsUpdate = true;
  }

  function fixMaterials(obj, selfScale, warm) {
    var out = { glass: [], veneer: [], led: [] };
    var done = {};
    var smoothed = {};
    obj.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var n = o.material.name;
      /* The export is flat-shaded: every facet of the spun cone and the knob
         carries its own normal, so a mirror finish shows them as pleats.
         Rebuild the normals, smooth across the facets of a turned surface
         (a few degrees apart) but still hard at a real edge. */
      if (/chrome|nickel|copper|veneer/.test(n)) {
        var gid = o.geometry.uuid;
        if (!smoothed[gid]) {
          smoothed[gid] = Utils.toCreasedNormals(o.geometry, 34 * RAD);
          if (o.name === "GEO-clip") crown(smoothed[gid]);
        }
        o.geometry = smoothed[gid];
      }
      /* everything that is not itself a light source hides the glow behind
         it, and is never hazed by it */
      o.layers.enable(GLOW);
      if (/globe_amber|veneer|led_1800k/.test(n)) emitters.push(o);
      else occluders.push(o);
      if (n === "MAT-globe_amber_1800K") {
        if (!done[n]) {
          var gm = new THREE.MeshPhysicalMaterial({
            name: n, color: 0x8a4a3a, roughness: 0.2,
            clearcoat: 1, clearcoatRoughness: 0.09, envMapIntensity: 0.42,
            emissive: 0xff5a14, emissiveIntensity: 0.96
          });
          /* lit opal glass: hot in the middle of each globe, deeper and
             redder toward its edge, the way the photographs show it */
          gm.onBeforeCompile = function (sh) {
            /* lit opal glass is its own light: the lamp inside must not
               also floodlight it from ten centimetres */
            sh.fragmentShader = sh.fragmentShader.replace(
              "#include <lights_fragment_end>",
              "#include <lights_fragment_end>\n" +
                "reflectedLight.directDiffuse *= 0.0;\nreflectedLight.directSpecular *= 0.0;\n" +
                /* ...nor put a white highlight on the clearcoat of the globes
                   across the cluster, seen through the gaps */
                "#ifdef USE_CLEARCOAT\nclearcoatSpecularDirect *= 0.0;\n#endif\n"
            );
            sh.fragmentShader = sh.fragmentShader.replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\n" +
                "float gNdv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\n" +
                "totalEmissiveRadiance *= mix(0.42, 1.0, pow(gNdv, 1.3));\n" +
                "totalEmissiveRadiance.g *= mix(0.74, 1.04, gNdv * gNdv);\n"
            );
          };
          done[n] = gm;
          /* sixteen overlapping emitters would otherwise stack their own
             glow onto themselves until the glass clips to white */
          glowDim.push({ m: gm, k: 0.24 });
          out.glass.push(gm);
        }
        o.material = done[n];
      } else if (n === "MAT-veneer_phys") {
        var vm = new THREE.MeshStandardMaterial({
          name: n, color: 0xb0814d, roughness: 0.72, envMapIntensity: 0.4,
          /* with the photograph's strip (VENEER_MAP) the colour is the
             map's own, so the emissive is white; without it, the old deep
             red-orange and the drawn grain */
          emissive: VENEER_MAP ? 0xffffff : 0xff3c00, emissiveIntensity: VENEER
        });
        /* Oak over acrylic, lit from inside. No UVs in the export, so
           everything is done on the geometry's own coordinates
           (millimetres, the pen's axis is y through x = z = 0). */
        o.geometry.computeBoundingBox();
        var bb = o.geometry.boundingBox;
        var vmap = VENEER_MAP;
        vm.onBeforeCompile = function (sh) {
          sh.uniforms.uAxis = { value: new THREE.Vector2(bb.min.y, bb.max.y) };
          if (vmap) {
            sh.uniforms.uVen = { value: vmap };
            sh.uniforms.uVenK = VEN.u; /* gain, mean, contrast: live (__rooms.ven) */
          }
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
          sh.fragmentShader = sh.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vObj;\nuniform vec2 uAxis;\n" +
                (vmap ? "uniform sampler2D uVen;\nuniform vec3 uVenK;\n#define VEN_GAIN uVenK.x\n#define VEN_MEAN uVenK.y\n#define VEN_CONTRAST uVenK.z\n#define VEN_COPIES " + VEN.copies.toFixed(1) + "\n" : "") +
                GLSL_NOISE +
                "float vGrain(){ vec3 q = vObj;\n" +
                " float a = vN(vec3(q.x * 0.21, q.y * 0.0042, q.z * 0.21));\n" +
                " float b = vN(vec3(q.x * 0.62 + 7.0, q.y * 0.011, q.z * 0.62));\n" +
                " float c = vN(vec3(q.x * 0.05, q.y * 0.0016 + 3.0, q.z * 0.05));\n" +
                " return clamp(a * 0.55 + b * 0.25 + c * 0.35, 0.0, 1.0); }\n" +
                (vmap
                  ? /* THE PHOTOGRAPH'S VENEER (lichtschreiber-veneer-lit.jpg):
                       its clip-free lower part (rows 0.47 .. 0.92 of the
                       strip, columns 0.05 .. 0.95), stretched once along the
                       whole body (grain runs along it, so a longer streak
                       is still oak and there is no seam or repeat along
                       the length), and mirrored four times round it (an
                       even count: the last copy meets the first mirrored,
                       so there is no seam round it either; u is
                       continuous, so mip selection has no seam). */
                    "vec3 vVen(float ax){\n" +
                    " float ang = atan(vObj.z, vObj.x) / 6.2831853 + 0.5;\n" +
                    " float tri = abs(fract(ang * VEN_COPIES * 0.5) * 2.0 - 1.0);\n" +
                    " vec2 uv = vec2(mix(0.05, 0.95, tri), mix(0.08, 0.53, ax));\n" +
                    " return texture2D(uVen, uv).rgb; }\n"
                  : "")
            )
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\nfloat vG = vGrain();\n" +
                "float vAx = clamp((vObj.y - uAxis.x) / max(uAxis.y - uAxis.x, 0.001), 0.0, 1.0);\n" +
                (vmap
                  ? "vec3 vT = vVen(vAx);\n" +
                    "diffuseColor.rgb *= mix(0.75, 1.1, clamp((vT.g - 0.08) * 6.0, 0.0, 1.0));\n"
                  : "diffuseColor.rgb *= mix(0.7, 1.12, vG);\n")
            )
            .replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\n" +
                (vmap
                  ? /* even along the length, as in the photograph: only the
                       last few centimetres dim a little where the fade cup
                       and the cap insert sit behind the veneer, and right at
                       the foot the fade cup's white makes the light paler */
                    "float vFall = smoothstep(0.0, 0.07, vAx) * (1.0 - 0.3 * smoothstep(0.9, 1.0, vAx));\n" +
                    /* The strip is a photograph: already tone-mapped, and its
                       red is clipped, so the grain lives in its green. Undo
                       the tone map (a fit of ACES inverted at three of the
                       photo's own colours: deep, mean, streak) so that after
                       ACES the body comes out the photo's colour, not the
                       yellow a second tone map would make of it. CONTRAST
                       lifts the streaks a little so the grain reads from the
                       station's distance. */
                    "float vGg = max(VEN_MEAN + (vT.g - VEN_MEAN) * VEN_CONTRAST, 0.02);\n" +
                    "vec3 vE = vec3(0.5 + 3.6 * vGg, 0.42 * vGg + 0.006, 0.0) * VEN_GAIN;\n" +
                    "vE = mix(vE, vec3(dot(vE, vec3(0.6, 0.35, 0.05))) * vec3(1.0, 0.62, 0.36), 0.35 * (1.0 - smoothstep(0.0, 0.05, vAx)));\n" +
                    "totalEmissiveRadiance *= vE * mix(0.55, 1.0, vFall);\n"
                  : "float vFall = smoothstep(0.0, 0.3, vAx) * (1.0 - 0.62 * smoothstep(0.6, 1.0, vAx));\n" +
                    "totalEmissiveRadiance *= mix(0.24, 1.0, vFall) * mix(0.5, 1.3, vG);\n" +
                    "totalEmissiveRadiance.g *= mix(0.5, 0.95, vG);\n")
            )
            .replace(
              "#include <lights_fragment_end>",
              "#include <lights_fragment_end>\n" +
                "reflectedLight.directDiffuse = min(reflectedLight.directDiffuse, vec3(0.85));\n" +
                "reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.06));\n"
            );
        };
        vm.customProgramCacheKey = function () {
          return "veneer:" + (vmap ? "map" : "drawn");
        };
        o.material = vm;
        out.veneer.push(vm);
        /* its own bloom at full strength adds half again to the body and
           the tone map turns that to yellow: the body keeps the photo's
           orange only if it blooms less (as the sixteen globes do) */
        if (vmap && !done.venGlow) {
          done.venGlow = true;
          glowDim.push({ m: vm, k: VEN.glow });
        }
      } else if (n === "MAT-led_1800k") {
        o.material = new THREE.MeshStandardMaterial({
          name: n, color: 0x2a2018, envMapIntensity: 0.2,
          emissive: 0xffa050, emissiveIntensity: 3.2
        });
        out.led.push(o.material);
      } else if (n === "MAT-chrome" || n === "MAT-chrome_paint") {
        /* SATIN stainless, as in the photographs (kugelschreiber/04, 05:
           soft, broad highlights and a quiet reflection, not a mirror with
           hard black-and-white bands). The rough blur of the studio map is
           what softens it; it stays metal and takes the lamp's orange. */
        o.material.metalness = 1;
        o.material.roughness = 0.32;
        o.material.envMapIntensity = 0.55;
        o.material.color.setHex(0x9c9893); /* stainless is a grey metal, not a white one */
      } else if (o.material.metalness > 0.9) {
        /* nickel caps, the copper bus ring: plain metal, as modelled. Not a
           mirror, and nothing in them may read as a light. */
        o.material.metalness = 1;
        o.material.envMapIntensity = 0.1;
        tame(o.material, selfScale, 0.22);
      } else {
        /* black sockets, white printed cups, the knot: enough of the studio
           in them that their shape reads in the room light */
        o.material.envMapIntensity = 0.7;
        tame(o.material, selfScale, 0.8, warm);
      }
    });
    return out;
  }

  function partsParent(obj) {
    var n = obj;
    while (n.children.length === 1 && !n.children[0].isMesh && n.children[0].children.length)
      n = n.children[0];
    return n;
  }

  function loadModel(Loader, url) {
    /* fetched already, while three.js was still on its way (PRE) */
    var pre = PRE[url];
    if (pre) {
      delete PRE[url];
      return pre.then(function (buf) {
        if (!buf) return loadModel(Loader, url);
        return new Promise(function (res, rej) {
          new Loader().parse(buf, url.replace(/[^/]*$/, ""), res, rej);
        });
      });
    }
    return new Promise(function (res, rej) {
      new Loader().load(url, res, null, rej);
    });
  }

  /* LOADING ON A PHONE (see "Loading on a phone" before boot()): the room
     goes live with what the entrance shows; every other work comes when the
     visitor nears it. LAZY: the phone layout or a phone, on a touch screen.
     The models the first picture needs are asked for now, in parallel with
     three.js and its loaders (they used to wait for them): the same files,
     sooner, on every screen. */
  var LAZY = COARSE && (PHQ.matches || PHONE_DEV);
  var LZ_BOOT = { pen: 1, cl: 1, sr: 1, gf: 1 }; /* what the entrance shows */
  var PRE = {};
  [["pen", "kugelschreiber"], ["cl", "bubblegum"], ["sr", "sr01"]].forEach(function (g) {
    if (!by[g[0]] || (g[0] === "sr" && !has("sr01")) || !window.fetch) return;
    var url = "media/models/" + g[1] + ".glb";
    PRE[url] = fetch(url)
      .then(function (r) {
        return r.ok ? r.arrayBuffer() : null;
      })
      .catch(function () {
        return null;
      });
  });
  /* Pictures larger than a phone can show: a smaller copy next to the
     originals in media/extra/rooms-v2/ (the originals stay for the desk) */
  var MTEX = {
    "media/paintings/tex-04-framed.jpg": "media/extra/rooms-v2/tex-04-framed-m.jpg",
    "media/ein-horny/05.jpg": "media/extra/rooms-v2/ein-horny-05-m.jpg",
    "media/extra/rooms-v2/oak-sill.jpg": "media/extra/rooms-v2/oak-sill-m.jpg",
    "media/extra/rooms-v2/lightbox-face.jpg": "media/extra/rooms-v2/lightbox-face-m.jpg"
  };
  function texUrl(url) {
    return LAZY && MTEX[url] ? MTEX[url] : url;
  }

  /* ---------- the room itself ---------- */

  var WALL_L = 176, ROOM_D = 16, CEIL = 3.4, X0 = 48; /* from x = -40 to x = 136: its ends are lost in the dark */

  /* THE ROOM (notes/room-test.md). The artist decided: "room=white and
     lum=0.5 but for the Lichtschreiber 0.1 and then a transition when
     scrolling to the bubblegum". So the WHITE GALLERY below is the room,
     with no parameter: white paint, a white 4.4 m ceiling, pale concrete,
     the room's soft light at 0.1 from the door to the pen, rising to 0.5 on
     the walk to Bubblegum (ROOMT.walk). For comparing: ?room=warm, the old
     warm room exactly as it was (none of this exists then); ?room=pale, the
     night test; ?room=white0, the first white room. ?room=white is the
     default. Every number is here, live as window.__rooms.room (edit, then
     __rooms.roomApply()); ?ceil=<m>, ?lum=, ?lumpen= override. */
  var ROOMT = null, ROOMQ = Q.get("room");
  if (ROOMQ !== "warm" && ROOMQ !== "pale" && ROOMQ !== "white0") ROOMQ = "white";
  if (ROOMQ === "pale" || ROOMQ === "white" || ROOMQ === "white0") {
    ROOMT = {
      preset: ROOMQ,
      lum: 1, /* x the room's soft light past the entrance (?lum=0..2): night <-> evening, live */
      grain: 0.6, /* x the film grain: plaster grain + film grain read as grit in the dark */
      pen: { inner: 1.7, wash: 0.3 }, /* x PEN_LIGHT: the wash gathers at the pen and falls off, as in the photograph */
      clCeil: { color: 0xffb070, power: 2.4, range: 7 }, /* Bubblegum's light on the ceiling over it (a local light) */
      gfFar: 2.4, /* Glass Ball: a mark that travels further than this and lands at a slant (or any that lands grazing) is not laid: with the higher ceiling such rays reach the wall high up as long streaks */
      ceil: 4.4, /* m (was 3.4); geometry, so not live: ?ceil= */
      /* [the entrance, the room], as LEVEL (roomLevel()) */
      level: {
        wall: [0xd7d2ca, 0xddd8d0], /* pale warm plaster, LR01's */
        floor: [0x2a2725, 0x4a4541], /* mid-dark polished concrete */
        hemi: [0.16, 0.42], ground: [0x3a3631, 0x8a8178], soft: [0.1, 0.3],
        fog: [0x060504, 0x0f0d0c], density: [0.04, 0.03]
      },
      /* the room's own soft light, a touch cooler than today's: night
         outside, so the lamps' pools are the only warm light */
      sky: 0xc8cacc, softCol: 0xd2d3d4,
      ceilCol: 0xe6e3de, /* white, matt */
      skirt: 0xcdc8c0, /* painted in the wall's colour (it catches more light: kept a shade lower), as in sr01/06 */
      floorRough: 0.5, /* x the concrete's own map: a satin polish that shows the lamps */
      lr01Pale: 0, /* the soft paleness round LR01: none, the wall is pale */
      mottle: 0.05, /* +- albedo, world space, metres-wide: no repeat along 176 m */
      wave: 0.018, /* the wall is not dead flat: gentle waves at grazing light */
      bump: 0.32, /* x the plaster's relief */
      mapK: 0.85, /* contrast of the plaster's colour map (0: one flat tone) */
      gfDim: 0, /* Glass Ball's corner: this much less of the room's soft light there (a Gaussian round it, gfSigma m) */
      gfSigma: 3.2,
      ao: { floor: 0.5, floorR: 0.18, ceil: 0.45, ceilR: 0.45 }, /* the corners */
      /* light the works send round the room (one bounce, roughly): where
         [x, y, z], colour, strength, reach (m). No light is added by it to
         a work; it only lifts wall, floor and ceiling near a lamp. */
      bounceK: [0.35, 1],
      bounce: [
        [[X.pen, 0.9, 0.45], 0xff5a1a, 0.15, 1.1],
        [[X.cl, 1.72, 1.15], 0xffa060, 0.55, 2.4],
        [[X.sr, 1.5, 0.3], 0xffe4c6, 0.4, 2.0],
        [[X.bx, 1.4, 0.5], 0xff8c38, 0.35, 1.8],
        [[X.bs, 1.5, 0.3], 0xff9a3c, 0.3, 1.8],
        [[X.fc, 0.4, 1.5], 0xfff0dc, 0.12, 2.0],
        [[X.pu, 1.5, 0.3], 0xffe9cf, 0.1, 2.2],
        [[X.eh, 1.5, 0.3], 0xffe9cf, 0.1, 1.8],
        [[X.gf, 0.8, 1.0], 0xffffff, 0.12, 2.0]
      ]
    };
    /* THE EVENING PRESET (?room=white): the same room, past the entrance
       a white-walled room with its soft light on; the door stays night */
    /* ?room=white0: the white room as first shown (second pass), kept to
       compare; ?room=white is the gallery below */
    if (ROOMQ === "white" || ROOMQ === "white0") {
      var LW = ROOMT.level;
      LW.wall = [0xd7d2ca, 0xe2ddd5];
      LW.floor = [0x2a2725, 0x8a827a]; /* pale polished concrete */
      LW.hemi = [0.16, 1.45];
      LW.ground = [0x3a3631, 0xc9bca9];
      LW.soft = [0.1, 0.75];
      LW.fog = [0x060504, 0x2b2622];
      LW.density = [0.04, 0.022];
      ROOMT.sky = 0xeee2d0;
      ROOMT.softCol = 0xf0e4d2;
      ROOMT.floorRough = 0.6;
      ROOMT.grain = 0.8;
      ROOMT.clCeil.power = 0.9; /* the ceiling has the room's light already */
    }
    /* THE GALLERY (?room=white, third pass). The artist: "even less lumen on
       the white room, less texture on the white wall (whiter and less
       texture basically, maybe still a tiny bit but should look more like a
       gallery!)". Neutral white paint, rolled smooth; the room's soft light
       at about 0.6 of the first white room (lum 1 is this; the dial still
       works both ways); the door unchanged. */
    if (ROOMQ === "white") {
      LW.wall = [0xd7d2ca, 0xeceae6];
      LW.hemi = [0.16, 0.85];
      LW.soft = [0.1, 0.42];
      LW.ground = [0x3a3631, 0xb9b4ac];
      LW.floor = [0x2a2725, 0x7a7671]; /* the pale concrete a shade darker and cooler */
      LW.fog = [0x060504, 0x22211f];
      ROOMT.sky = 0xe6e6e4;
      ROOMT.softCol = 0xe9e8e5;
      ROOMT.ceilCol = 0xefeeeb;
      ROOMT.skirt = 0xdedcd8;
      ROOMT.floorRough = 0.75; /* less gloss: reflections do not compete */
      ROOMT.mottle = 0.012;
      ROOMT.wave = 0.004;
      ROOMT.bump = 0.08;
      ROOMT.mapK = 0.25;
      ROOMT.gfDim = 0.6;
      ROOMT.pen = { inner: 0.8, wash: 0.08 }; /* the wash gathers at the pen; the wall a metre off stays white */
      ROOMT.bounce[0] = [[X.pen, 0.9, 0.45], 0xff5a1a, 0.06, 0.9];
      ROOMT.bounce[1] = [[X.cl, 1.72, 1.15], 0xffa060, 0.3, 1.6]; /* Bubblegum's glow on the room: closer */
      ROOMT.clLight = 0.55; /* Bubblegum's real light on the wall: the wall a metre off stays white; the globes glow as before */
      /* THE WALK (fourth pass, the room as decided). One paint from the door
         to the end (no darker plaster at the door: the night there is the
         light, not the wall), and the room's soft light as one number along
         the walk: lumPen (0.15) at the entrance and the pen, rising while
         the camera crosses from the pen to Bubblegum (from / to: the share
         of that crossing, smoothstep) to lum (0.5) at Bubblegum and on. It
         replaces the door -> pen ramp of the other rooms (level[0] is then
         only the fog's night colour and density at the start of the walk),
         so the two never act together. Both levels x the gallery's 0.85 /
         0.42 (hemisphere / directional). */
      LW.wall = [0xeceae6, 0xeceae6];
      LW.ground = [0xb9b4ac, 0xb9b4ac];
      LW.floor = [0x7a7671, 0x7a7671];
      LW.fog = [0x060504, 0x1a1917];
      ROOMT.lum = 0.5;
      ROOMT.walk = { lumPen: 0.15, from: 0, to: 1 }; /* the artist: "0.15 ist auch okay" (was 0.1) */
      var lumPenQ = parseFloat(Q.get("lumpen"));
      if (lumPenQ >= 0 && lumPenQ <= 2) ROOMT.walk.lumPen = lumPenQ;
    }
    var lumQ = parseFloat(Q.get("lum"));
    if (lumQ >= 0 && lumQ <= 2) ROOMT.lum = lumQ;
    var ceilQ = parseFloat(Q.get("ceil"));
    if (ceilQ >= 2.6 && ceilQ <= 9) ROOMT.ceil = ceilQ;
    CEIL = ROOMT.ceil;
  }
  /* THE ROOM CLOSED (notes/room-back.md). The artist: the back of the room
     "wirkt wie kein realer raum": a smaller, real room. A BACK WALL facing
     the art wall (d m out), a START WALL just behind the first view with
     the door the visitor came in by (dark beyond), an END WALL a few metres
     past the end of the walk. Floor, ceiling, skirting and the art wall end
     at them. The new walls are the art wall's paint and plaster; nothing
     hangs on them and no spot is aimed at them: they have the room's own
     soft light and, faintly, what the works throw that far (far: [x, y, z],
     colour, strength (linear, square on at d), as LEVEL's bounce, and like
     it x bounceK: less at the dark entrance). ?back=off:
     the open room exactly as before; ?depth=<m> (6..16) tries another depth
     (then every camera position is kept 0.6 m off the back wall). Live as
     window.__rooms.back (far / corner: edit, then __rooms.roomApply()). */
  var RB = null;
  if (ROOMT && Q.get("back") !== "off") {
    RB = {
      xs: -15, /* the start wall's face (the phone's first view stands at x = -13) */
      xe: 78, /* the end wall's face (the walk ends at x = 71) */
      d: 12, /* the back wall's face, metres from the art wall */
      t: 0.3, /* how thick the walls are: the door's reveal */
      door: { z: 3.0, w: 1.6, h: 2.75 }, /* its middle (z), its clear width and height */
      keep: 0.5, /* no camera position nearer than this to any wall */
      corner: { k: 0.3, r: 0.4 }, /* the soft dark where two walls meet (the art wall's foot has 0.5 / 0.18) */
      far: [
        [[X.pen, 0.9, 0.45], 0xff5a1a, 0.05], /* the pen */
        [[X.cl, 1.72, 1.15], 0xffa060, 0.06], /* Bubblegum's globes */
        [[X.bx, 1.4, 0.5], 0xffb070, 0.04], /* the Light Box */
        [[X.gf, 0.95, 1.05], 0xff00ff, 0.05] /* the Glass Ball's torch (its colour follows the torch's) */
      ]
    };
    var depthQ = parseFloat(Q.get("depth"));
    if (depthQ >= 6 && depthQ <= 16) {
      RB.d = depthQ;
      RB.keep = 0.6;
    }
    RB.xc = (RB.xs + RB.xe) / 2;
    RB.len = RB.xe - RB.xs;
  }
  /* the depth the camera keeps inside of (its guard): the back wall, or the
     open room's 16 m as before */
  var ROOM_IN = RB ? RB.d - RB.keep : ROOM_D - 0.3;
  var RT_CL = null; /* Bubblegum's ceiling light in the test room */
  var RTU = null; /* the test room's uniforms, shared by wall, floor, ceiling and their patches */
  function roomApply() {
    if (!ROOMT) return;
    var R = ROOMT, i;
    if (!RTU) {
      RTU = { uRT: { value: new THREE.Vector4() }, uRT2: { value: new THREE.Vector4() }, uRT3: { value: new THREE.Vector4() }, uBP: { value: [] }, uBC: { value: [] } };
      for (i = 0; i < 10; i++) {
        RTU.uBP.value.push(new THREE.Vector4(0, -99, 0, 1));
        RTU.uBC.value.push(new THREE.Color(0, 0, 0));
      }
      if (RB) {
        RTU.uRB = { value: new THREE.Vector4() };
        RTU.uRB2 = { value: new THREE.Vector4() };
        RTU.uFP = { value: [] };
        RTU.uFC = { value: [] };
        for (i = 0; i < 4; i++) {
          RTU.uFP.value.push(new THREE.Vector4());
          RTU.uFC.value.push(new THREE.Color(0, 0, 0));
        }
      }
    }
    if (RB) {
      /* the new walls' faces, and the soft dark in the corners they make */
      RTU.uRB.value.set(RB.xs, RB.xe, RB.d, 0);
      RTU.uRB2.value.set(RB.corner.k, RB.corner.r, 0, 0);
      for (i = 0; i < 4; i++) {
        var fq = RB.far[i];
        if (!fq) {
          RTU.uFC.value[i].setRGB(0, 0, 0);
          continue;
        }
        RTU.uFP.value[i].set(fq[0][0], fq[0][1], fq[0][2], Math.max(1, RB.d - fq[0][2]));
        if (i !== 3 || !RB.gfLive) RTU.uFC.value[i].setHex(fq[1]).multiplyScalar(fq[2]);
      }
    }
    RTU.uRT.value.set(R.mottle, R.wave, R.ao.floor, R.ao.ceil);
    RTU.uRT3.value.set(R.mapK, R.gfDim, R.gfSigma, X.gf);
    RTU.uRT2.value.set(R.ao.floorR, R.ao.ceilR, CEIL, lerp(R.bounceK[0], R.bounceK[1], levelNow < 0 ? 0 : levelNow));
    for (i = 0; i < 10; i++) {
      var b = R.bounce[i];
      if (b) {
        RTU.uBP.value[i].set(b[0][0], b[0][1], b[0][2], b[3]);
        RTU.uBC.value[i].setHex(b[1]).multiplyScalar(b[2]);
      } else RTU.uBC.value[i].setRGB(0, 0, 0);
    }
    if (RT_CL) RT_CL.uCol.value.setHex(R.clCeil.color).multiplyScalar(R.clCeil.power * Math.PI);
    if (wallMat) {
      ceilMat.color.setHex(R.ceilCol);
      roomHemi.color.setHex(R.sky);
      roomSoft.color.setHex(R.softCol);
      skirtMat.color.setHex(R.skirt);
      floorMat.roughness = R.floorRough;
      wallMat.bumpScale = 0.55 * R.bump;
      if (RB && RB.mat) RB.mat.bumpScale = wallMat.bumpScale;
      levelNow = -1; /* roomLevel() lays the level again */
    }
    if (typeof invalidate === "function") invalidate();
  }
  /* the test room's plaster on a material: kind 0 wall, 1 floor, 2 ceiling,
     3 skirting; patch: a patch() of light over it (no bounce of its own) */
  function roomMod(m, kind, patch) {
    roomApply();
    var prev = !patch && typeof m.onBeforeCompile === "function" && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? m.onBeforeCompile : null;
    var prevKey = prev && m.customProgramCacheKey ? m.customProgramCacheKey() : "";
    var fn = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (sh.uniforms.uPale) sh.uniforms.uPale.value.y = ROOMT.lr01Pale;
      for (var k in RTU) sh.uniforms[k] = RTU[k];
      sh.defines = sh.defines || {};
      sh.defines.RT_KIND = kind;
      if (patch) sh.defines.RT_PATCH = 1;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      if (RB)
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vRN;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvRN = normalize(mat3(modelMatrix) * objectNormal);");
      var bp = THREE.ShaderChunk.bumpmap_pars_fragment
        .replace("uniform float bumpScale;", "uniform float bumpScale;\nfloat rtBump(vec2 u) { return 0.5 * (texture2D(bumpMap, u).x + texture2D(bumpMap, u * 0.383 + vec2(0.37, 0.11)).x); }")
        .replace(/texture2D\( bumpMap, ([^)]*)\)\.x/g, "rtBump( $1 )");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", [
          "#include <common>",
          "varying vec3 vRW;\nuniform vec4 uRT;\nuniform vec4 uRT2;\nuniform vec4 uRT3;\nuniform vec4 uBP[10];\nuniform vec3 uBC[10];",
          "float rtH(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }",
          "float rtN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
          " return mix(mix(rtH(i), rtH(i + vec2(1.0, 0.0)), f.x), mix(rtH(i + vec2(0.0, 1.0)), rtH(i + vec2(1.0, 1.0)), f.x), f.y); }",
          "float rtF(vec2 p) { return 0.5 * rtN(p) + 0.3 * rtN(p * 2.13 + 7.1) + 0.2 * rtN(p * 4.7 + 3.3); }",
          RB ? "varying vec3 vRN;\nuniform vec4 uRB;\nuniform vec4 uRB2;\nuniform vec4 uFP[4];\nuniform vec3 uFC[4];\n" +
            "float rtC(float d, float k, float r) { return d < -0.01 ? 1.0 : 1.0 - k * exp(-max(d, 0.0) / r); }" : "",
          "vec2 rtP() {",
          "#if RT_KIND == 4",
          " return abs(vRN.x) > 0.5 ? vRW.zy : abs(vRN.y) > 0.5 ? vRW.xz : vRW.xy;",
          "#elif RT_KIND == 0",
          " return vRW.xy;",
          "#else",
          " return vRW.xz;",
          "#endif",
          "}"
        ].join("\n"))
        .replace("#include <bumpmap_pars_fragment>", bp)
        .replace("#include <map_fragment>", [
          "#ifdef USE_MAP",
          " vec4 sampledDiffuseColor = 0.5 * (texture2D(map, vMapUv) + texture2D(map, vMapUv * 0.383 + vec2(0.37, 0.11)));",
          " sampledDiffuseColor.rgb = max(vec3(0.0), mix(vec3(0.76), sampledDiffuseColor.rgb, uRT3.x));",
          " diffuseColor *= sampledDiffuseColor;",
          "#endif"
        ].join("\n"))
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "{ vec2 p = rtP(); float n = rtF(p * 0.45) * 0.65 + rtF(p * 1.7 + 11.0) * 0.35;",
          "  diffuseColor.rgb *= 1.0 + uRT.x * 2.0 * (n - 0.5); }"
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "#if RT_KIND == 0",
          "{ vec2 p = vRW.xy * 0.8; float e = 0.04;",
          "  float h0 = rtF(p), hx = rtF(p + vec2(e, 0.0)), hy = rtF(p + vec2(0.0, e));",
          "  vec2 g = vec2(hx - h0, hy - h0) / e;",
          "  vec3 tX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), tY = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);",
          "  normal = normalize(normal - uRT.y * (g.x * tX + g.y * tY)); }",
          "#elif RT_KIND == 4",
          "if (abs(vRN.y) < 0.5) { bool rtE = abs(vRN.x) > 0.5; vec2 p = (rtE ? vRW.zy : vRW.xy) * 0.8; float e = 0.04;",
          "  float h0 = rtF(p), hx = rtF(p + vec2(e, 0.0)), hy = rtF(p + vec2(0.0, e));",
          "  vec2 g = vec2(hx - h0, hy - h0) / e;",
          "  vec3 tX = normalize((viewMatrix * vec4(rtE ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), 0.0)).xyz), tY = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);",
          "  normal = normalize(normal - uRT.y * (g.x * tX + g.y * tY)); }",
          "#endif"
        ].join("\n"))
        .replace("#include <lights_fragment_end>", [
          "#include <lights_fragment_end>",
          "{ float ao = 1.0;",
          "#if RT_KIND == 0 || RT_KIND == 4",
          "  ao *= 1.0 - uRT.z * exp(-max(vRW.y, 0.0) / uRT2.x);",
          "  ao *= 1.0 - uRT.w * exp(-max(uRT2.z - vRW.y, 0.0) / uRT2.y);",
          "#elif RT_KIND == 1",
          "  ao *= 1.0 - uRT.z * exp(-max(vRW.z, 0.0) / uRT2.x);",
          "#elif RT_KIND == 2",
          "  ao *= 1.0 - uRT.w * exp(-max(vRW.z, 0.0) / uRT2.y);",
          "#endif",
          /* the closed room's corners: where a floor, a ceiling or a wall
             meets a new wall, as where they meet the art wall */
          RB ? [
            "#if RT_KIND == 0",
            "  ao *= rtC(vRW.x - uRB.x, uRB2.x, uRB2.y) * rtC(uRB.y - vRW.x, uRB2.x, uRB2.y);",
            "#elif RT_KIND == 4",
            "  if (abs(vRN.z) > 0.5) ao *= rtC(vRW.x - uRB.x, uRB2.x, uRB2.y) * rtC(uRB.y - vRW.x, uRB2.x, uRB2.y);",
            "  if (abs(vRN.x) > 0.5) ao *= rtC(vRW.z, uRB2.x, uRB2.y) * rtC(uRB.z - vRW.z, uRB2.x, uRB2.y);",
            "#elif RT_KIND == 1",
            "  ao *= rtC(uRB.z - vRW.z, uRT.z, uRT2.x) * rtC(vRW.x - uRB.x, uRT.z, uRT2.x) * rtC(uRB.y - vRW.x, uRT.z, uRT2.x);",
            "#elif RT_KIND == 2",
            "  ao *= rtC(uRB.z - vRW.z, uRT.w, uRT2.y) * rtC(vRW.x - uRB.x, uRT.w, uRT2.y) * rtC(uRB.y - vRW.x, uRT.w, uRT2.y);",
            "#endif"
          ].join("\n") : "",
          "  { float gq = (vRW.x - uRT3.w) / uRT3.z; reflectedLight.indirectDiffuse *= 1.0 - uRT3.y * exp(-0.5 * gq * gq); }",
          "  reflectedLight.indirectDiffuse *= ao;",
          "  reflectedLight.directDiffuse *= mix(1.0, ao, 0.4);",
          "#ifndef RT_PATCH",
          "  vec3 rb = vec3(0.0);",
          "  for (int i = 0; i < 10; i++) { vec3 d = uBP[i].xyz - vRW; rb += uBC[i] / (1.0 + dot(d, d) / (uBP[i].w * uBP[i].w)); }",
          "  reflectedLight.indirectDiffuse += rb * uRT2.w * ao * BRDF_Lambert(material.diffuseColor);",
          "#endif",
          /* the new walls: what the works throw that far, faintly */
          RB ? [
            "#if RT_KIND == 4",
            "  vec3 rf = vec3(0.0);",
            "  for (int i = 0; i < 4; i++) { vec3 d = uFP[i].xyz - vRW; float r2 = max(dot(d, d), 0.01);",
            "    rf += uFC[i] * (uFP[i].w * uFP[i].w / r2) * max(dot(vRN, d) * inversesqrt(r2), 0.0); }",
            "  reflectedLight.indirectDiffuse += rf * uRT2.w * ao * BRDF_Lambert(material.diffuseColor);",
            "#endif"
          ].join("\n") : "",
          "}"
        ].join("\n"));
    };
    var key = prevKey + "|rt" + kind + (patch ? "p" : "");
    if (patch) {
      m.userData.obc = fn;
      m.userData.obcKey = key;
    }
    m.onBeforeCompile = fn;
    m.customProgramCacheKey = function () {
      return key;
    };
    m.needsUpdate = true;
    return m;
  }
  /* a ceiling spot hangs CEIL - 3.4 m higher than it did: as bright where it lands */
  function roomSpotGain(o) {
    var dy = o.pos[1] - o.at[1], h = Math.pow(o.pos[0] - o.at[0], 2) + Math.pow(o.pos[2] - o.at[2], 2);
    return (h + dy * dy) / (h + Math.pow(dy - (CEIL - 3.4), 2));
  }
  function roomPale() {
    roomApply();
    /* Bubblegum's globes on the white ceiling over them: a local light on
       ceiling and wall only (CL: the knot) */
    var cc = ROOMT.clCeil, CS = localLight({ pos: [CL.x, CL.y + 0.15, CL.z], color: cc.color, power: cc.power, decay: 2, range: cc.range });
    RT_CL = CS;
    patch(CS, "ceil", CL.x - cc.range, CL.x + cc.range, 0, cc.range + CL.z);
    roomMod(wallMat, 0);
    roomMod(floorMat, 1);
    roomMod(ceilMat, 2);
    roomMod(skirtMat, 3);
    roomApply();
  }

  /* THE WINDOW at 05, Bulb Studies: an opening w wide from y0 (the top of
     its sill, which is the seat) to y1; the sill's nose stands `nose` proud of
     the wall, is t thick and runs `horn` past the opening on either side.
     d, the depth of the recess, is set by buildBulbs() from the figure. */
  var WIN = { w: 1.6, y0: 0.9, y1: 2.9, nose: 0.03, t: 0.036, horn: 0.045, d: 0.5 };
  /* (the artist: "make the window behind bulb studies higher") A tall
     window: 2.0 m of opening in the 3.4 m room, under a 0.5 m lintel. In a
     higher room (?room=, ?ceil=) it is taller with the room, as tall rooms
     have tall windows: up to 2.6 m (3.5 m to its head in the 4.4 m room,
     under a 0.9 m lintel). The sill does not move. */
  WIN.y1 = WIN.y0 + clamp(CEIL - 1.4, 1.9, 2.6);

  function wallGeometry() {
    var L = X0 - WALL_L / 2, R = L + WALL_L, xs = [], ys = [0, CEIL], x, i, j;
    var hole = !!by.bs, hx0 = X.bs - WIN.w / 2, hx1 = X.bs + WIN.w / 2;
    /* (the closed room: from the start wall to the end wall; the plaster
       stays in register, its coordinates are still the 176 m wall's) */
    var gx0 = RB ? RB.xs : L, gx1 = RB ? RB.xe : R;
    for (x = gx0; x < gx1 - 0.01; x += 4) xs.push(x);
    xs.push(gx1);
    if (hole) {
      xs.push(hx0, hx1);
      ys = [0, WIN.y0, WIN.y1, CEIL];
    }
    xs.sort(function (a, b) {
      return a - b;
    });
    xs = xs.filter(function (v, k) {
      return !k || v - xs[k - 1] > 1e-6;
    });
    var nx = xs.length, ny = ys.length, pos = [], uv = [], nrm = [], idx = [];
    for (j = 0; j < ny; j++)
      for (i = 0; i < nx; i++) {
        pos.push(xs[i], ys[j], 0);
        nrm.push(0, 0, 1);
        uv.push((xs[i] - L) / WALL_L, ys[j] / CEIL);
      }
    for (j = 0; j < ny - 1; j++)
      for (i = 0; i < nx - 1; i++) {
        if (hole && j === 1 && xs[i] >= hx0 - 1e-6 && xs[i + 1] <= hx1 + 1e-6) continue; /* the opening */
        var a = j * nx + i;
        idx.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx);
      }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /* ---- the closed room (RB): its surfaces, laid as grids of panels (as the
     art wall is) so the plaster's coordinates interpolate finely, and kept
     in register with the open room's (the 176 m wall's u, the 16 m floor's
     v), so the plaster and concrete are the same wherever both exist ---- */
  function rbSteps(a, b, step, extra) {
    var r = [], v;
    for (v = a; v < b - 0.01; v += step) r.push(v);
    r.push(b);
    (extra || []).forEach(function (e) {
      if (e > a + 1e-6 && e < b - 1e-6) r.push(e);
    });
    r.sort(function (p, q) {
      return p - q;
    });
    return r.filter(function (v, k) {
      return !k || v - r[k - 1] > 1e-6;
    });
  }
  /* a grid from o along U (us, metres) and V (vs), facing n; skip(u, v):
     leave that cell open */
  function rbGrid(G, o, U, V, n, us, vs, uvf, skip) {
    var base = G.pos.length / 3, nu = us.length, i, j, c, p = [0, 0, 0];
    for (j = 0; j < vs.length; j++)
      for (i = 0; i < nu; i++) {
        for (c = 0; c < 3; c++) p[c] = o[c] + U[c] * us[i] + V[c] * vs[j];
        G.pos.push(p[0], p[1], p[2]);
        G.nrm.push(n[0], n[1], n[2]);
        var t = uvf(p);
        G.uv.push(t[0], t[1]);
      }
    var flip = (U[1] * V[2] - U[2] * V[1]) * n[0] + (U[2] * V[0] - U[0] * V[2]) * n[1] + (U[0] * V[1] - U[1] * V[0]) * n[2] < 0;
    for (j = 0; j < vs.length - 1; j++)
      for (i = 0; i < nu - 1; i++) {
        if (skip && skip((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) continue;
        var a = base + j * nu + i, b = a + 1, cc = a + nu + 1, d = a + nu;
        if (flip) G.idx.push(a, cc, b, a, d, cc);
        else G.idx.push(a, b, cc, a, cc, d);
      }
  }
  function rbGeo(G) {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(G.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(G.uv, 2));
    g.setIndex(G.idx);
    return g;
  }
  var RB_LW = X0 - WALL_L / 2;
  function rbUx(p) {
    return [(p[0] - RB_LW) / WALL_L, p[1] / CEIL];
  }
  function rbUz(p) {
    return [(p[2] + 17.3) / WALL_L, p[1] / CEIL];
  }
  /* the floor (y = 0, with the door's threshold) or the ceiling (y = CEIL),
     from the start wall to the end wall and out to the back wall */
  function rbFloor(y) {
    var G = { pos: [], nrm: [], uv: [], idx: [] }, up = y < 0.01, dr = RB.door;
    var uvf = function (p) {
      return [(p[0] - RB_LW) / WALL_L, up ? 1 - p[2] / ROOM_D : p[2] / ROOM_D];
    };
    rbGrid(G, [RB.xs, y, 0], [1, 0, 0], [0, 0, 1], [0, up ? 1 : -1, 0], rbSteps(0, RB.len, 4), rbSteps(0, RB.d, 4), uvf);
    if (up) rbGrid(G, [RB.xs - RB.t, 0, dr.z - dr.w / 2], [1, 0, 0], [0, 0, 1], [0, 1, 0], [0, RB.t], [0, dr.w], uvf);
    return rbGeo(G);
  }
  /* one skirting round the room (the art wall's runs the whole room; the
     others stop at it and at the door's jambs), as one piece */
  function rbSkirting() {
    var H = 0.075, T = 0.014, z0 = RB.door.z - RB.door.w / 2, z1 = RB.door.z + RB.door.w / 2, parts = [];
    function run(x0, x1, za, zb) {
      var b = new THREE.BoxGeometry(x1 - x0, H, zb - za);
      b.translate((x0 + x1) / 2, H / 2, (za + zb) / 2);
      parts.push(b);
    }
    run(RB.xs, RB.xe, 0, T);
    run(RB.xs, RB.xe, RB.d - T, RB.d);
    run(RB.xe - T, RB.xe, T, RB.d - T);
    run(RB.xs, RB.xs + T, T, z0);
    run(RB.xs, RB.xs + T, z1, RB.d - T);
    var G = { pos: [], nrm: [], uv: [], idx: [] };
    parts.forEach(function (b) {
      var base = G.pos.length / 3;
      G.pos.push.apply(G.pos, b.attributes.position.array);
      G.nrm.push.apply(G.nrm, b.attributes.normal.array);
      G.uv.push.apply(G.uv, b.attributes.uv.array);
      b.index.array.forEach(function (k) {
        G.idx.push(base + k);
      });
      b.dispose();
    });
    return rbGeo(G);
  }
  /* the three new walls and the door's reveal: one mesh in the art wall's
     paint and plaster (its colour is the art wall's own colour object, so
     roomLevel() carries both); beyond the door, dark */
  function rbWalls() {
    var m = new THREE.MeshStandardMaterial({
      color: 0x9b9289, roughness: 0.93, metalness: 0, envMapIntensity: 0,
      map: wallMat.map, bumpMap: wallMat.bumpMap, bumpScale: wallMat.bumpScale
    });
    m.color = wallMat.color;
    RB.mat = m;
    roomMod(m, 4);
    var G = { pos: [], nrm: [], uv: [], idx: [] }, dr = RB.door, z0 = dr.z - dr.w / 2, z1 = dr.z + dr.w / 2, t = RB.t;
    var ys = rbSteps(0, CEIL, 4, [dr.h]);
    /* the back wall */
    rbGrid(G, [RB.xs, 0, RB.d], [1, 0, 0], [0, 1, 0], [0, 0, -1], rbSteps(0, RB.len, 4), ys, rbUx);
    /* the end wall */
    rbGrid(G, [RB.xe, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], rbSteps(0, RB.d, 4), ys, rbUz);
    /* the start wall, with the door */
    rbGrid(G, [RB.xs, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], rbSteps(0, RB.d, 4, [z0, z1]), ys, rbUz, function (u, v) {
      return u > z0 && u < z1 && v < dr.h;
    });
    /* the reveal: two jambs and the head, the wall's thickness deep */
    rbGrid(G, [RB.xs - t, 0, z0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, t], [0, dr.h], rbUx);
    rbGrid(G, [RB.xs - t, 0, z1], [1, 0, 0], [0, 1, 0], [0, 0, -1], [0, t], [0, dr.h], rbUx);
    rbGrid(G, [RB.xs - t, dr.h, z0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [0, t], [0, dr.w], function (p) {
      return [(p[0] - RB_LW) / WALL_L, p[2] / CEIL];
    });
    var walls = new THREE.Mesh(rbGeo(G), m);
    walls.matrixAutoUpdate = false;
    scene.add(walls);
    /* beyond the door: nothing lit. A box seen from inside, black (the
       room's haze still lies over it from afar, as over the wall round it),
       larger than anything the opening can show */
    var vb = new THREE.BoxGeometry(4, CEIL + 0.2, dr.w + 6);
    vb.translate(RB.xs - t - 2, (CEIL + 0.2) / 2 - 0.1, dr.z);
    var vm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    var vo = new THREE.Mesh(vb, vm);
    vo.matrixAutoUpdate = false;
    scene.add(vo);
  }

  function buildRoom() {
    var plaster = new THREE.CanvasTexture(mottled(512, 150, 0.05, 26));
    plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
    plaster.repeat.set(WALL_L / 2.6, CEIL / 2.6);
    var plasterC = new THREE.CanvasTexture(mottled(512, 226, 0.035, 10));
    plasterC.wrapS = plasterC.wrapT = THREE.RepeatWrapping;
    plasterC.repeat.set(WALL_L / 3.7, CEIL / 3.7);
    plasterC.colorSpace = THREE.SRGBColorSpace;

    wallMat = new THREE.MeshStandardMaterial({
      color: 0x9b9289, roughness: 0.93, metalness: 0, envMapIntensity: 0,
      map: plasterC, bumpMap: plaster, bumpScale: 0.55
    });
    /* LR01 hangs where the plaster is paler, as in his photographs of it
       (sr01/06): not a bay with an edge any more (the artist: "the wall
       should match the surrounding walls ... at least fade"), but the
       room's own wall growing paler toward it and back, over several
       metres, floor to ceiling. x: where; y: how much paler at the middle;
       z: how wide (metres, one standard deviation). */
    var PALE = { value: new THREE.Vector3(X.sr, 0.24, 2.4) };
    wallMat.onBeforeCompile = function (sh) {
      sh.uniforms.uPale = PALE;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vWX;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWX = (modelMatrix * vec4(transformed, 1.0)).x;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWX;\nuniform vec3 uPale;")
        .replace("#include <color_fragment>", "#include <color_fragment>\nfloat pD = (vWX - uPale.x) / uPale.z;\ndiffuseColor.rgb *= 1.0 + uPale.y * exp(-0.5 * pD * pD) * vec3(0.9, 1.0, 1.12);");
    };
    wallMat.customProgramCacheKey = function () {
      return "wall-pale";
    };
    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    plaster.anisotropy = plasterC.anisotropy = aniso;
    /* The wall is laid as a run of panels, not as two triangles 176 m long:
       across a triangle that size the plaster's texture coordinates are
       interpolated too coarsely, and as soon as there is light on the wall
       it shows fine ruled lines. And it has ONE OPENING, the window at Bulb
       Studies (WIN); buildBulbs() builds the recess behind it. The texture
       coordinates are what they were on the single plane (0..1 across the
       whole wall), so every patch() still lies in register. */
    scene.add(new THREE.Mesh(wallGeometry(), wallMat));

    var conc = new THREE.CanvasTexture(mottled(512, 150, 0.09, 18));
    conc.wrapS = conc.wrapT = THREE.RepeatWrapping;
    conc.repeat.set(WALL_L / 4.2, ROOM_D / 4.2);
    conc.anisotropy = aniso;
    floorMat = new THREE.MeshStandardMaterial({
      color: 0x2e2925, roughness: 0.62, metalness: 0, envMapIntensity: 0,
      roughnessMap: conc, bumpMap: conc, bumpScale: 0.25
    });
    var floor = new THREE.Mesh(RB ? rbFloor(0) : new THREE.PlaneGeometry(WALL_L, ROOM_D, 44, 4), floorMat);
    if (!RB) {
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(X0, 0, ROOM_D / 2);
    }
    scene.add(floor);

    ceilMat = new THREE.MeshStandardMaterial({
      color: 0x7d766e, roughness: 0.96, metalness: 0, envMapIntensity: 0
    });
    var ceil = new THREE.Mesh(RB ? rbFloor(CEIL) : new THREE.PlaneGeometry(WALL_L, ROOM_D, 44, 4), ceilMat);
    if (!RB) {
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(X0, CEIL, ROOM_D / 2);
    }
    scene.add(ceil);

    /* a skirting board: one line that tells you where wall meets floor */
    skirtMat = new THREE.MeshStandardMaterial({ color: 0x8a8279, roughness: 0.7, envMapIntensity: 0 });
    var skirt = new THREE.Mesh(RB ? rbSkirting() : new THREE.BoxGeometry(WALL_L, 0.075, 0.014), skirtMat);
    if (!RB) skirt.position.set(X0, 0.0375, 0.007);
    scene.add(skirt);

    /* THE ROOM LIGHT. Soft, neutral-warm, from everywhere: a hemisphere (no
       direction, no shadow side) plus a faint directional from the room side
       to give forms an edge. It has two states and roomLevel() moves between
       them: the ENTRANCE, which is night (wall, floor and ceiling only just
       there), and THE ROOM from the first work on, which is a dim evening
       interior: wall, floor, ceiling and skirting plainly visible everywhere
       and the parts of a lamp that do not glow easy to read, but still well
       under any lamp, so every pool and halo stands on the wall. */
    roomHemi = new THREE.HemisphereLight(0xd9cab6, 0x4a423a, LEVEL.hemi[0]);
    scene.add(roomHemi);
    roomSoft = new THREE.DirectionalLight(0xe2d3bf, LEVEL.soft[0]);
    roomSoft.position.set(-0.45, 0.8, 1);
    scene.add(roomSoft);
    if (ROOMT) roomPale(); /* (after the lights: it sets their colour) */
    if (RB) rbWalls();
  }

  /* k = 0: the entrance, exactly as dark as it always was. k = 1: the room.
     Nothing else in the picture is touched: no exposure change, no change to
     a lamp, to the glow or to a gallery light, so nothing that shines gets
     any nearer to clipping; only the floor everything starts from is higher.
     The bounce off the floor (the hemisphere's ground colour) rises most:
     that is what a ceiling is seen by. The floor itself is near-black
     concrete, which no amount of soft light lifts out of the dark, so at the
     door it is the wet-looking black it was and in the room it is the same
     concrete seen in light (its colour, which its patches share, comes up
     with the level). The far end of the room goes to a dark warm grey instead
     of to black, and a little less quickly. */
  var LEVEL = {
    hemi: [0.5, 1.5], ground: [0x4a423a, 0xb8a892], soft: [0.34, 0.95],
    floor: [0x2e2925, 0x4f463e], fog: [0x060504, 0x16120f], density: [0.04, 0.03],
    /* the plaster itself: as it was at the door, a paler plaster from the
       pen on (the artist: "make the wall everywhere brighter ... the hero
       should keep the current vibe") */
    wall: [0x9b9289, 0xb5ada3]
  };
  if (ROOMT) for (var lvK in ROOMT.level) LEVEL[lvK] = ROOMT.level[lvK];
  var roomHemi = null, roomSoft = null, levelNow = -1, lvA = null, lvB = null;
  function roomLevel(k) {
    k = clamp(k, 0, 1);
    if (k !== levelNow) {
      levelNow = k;
      if (!lvA) {
        lvA = new THREE.Color();
        lvB = new THREE.Color();
      }
      roomHemi.intensity = lerp(LEVEL.hemi[0], LEVEL.hemi[1], k);
      roomHemi.groundColor.copy(lvA.setHex(LEVEL.ground[0])).lerp(lvB.setHex(LEVEL.ground[1]), k);
      roomSoft.intensity = lerp(LEVEL.soft[0], LEVEL.soft[1], k);
      floorMat.color.copy(lvA.setHex(LEVEL.floor[0])).lerp(lvB.setHex(LEVEL.floor[1]), k);
      wallMat.color.copy(lvA.setHex(LEVEL.wall[0])).lerp(lvB.setHex(LEVEL.wall[1]), k);
      scene.fog.color.copy(lvA.setHex(LEVEL.fog[0])).lerp(lvB.setHex(LEVEL.fog[1]), k);
      scene.background.copy(scene.fog.color);
      if (RTU) RTU.uRT2.value.w = lerp(ROOMT.bounceK[0], ROOMT.bounceK[1], k);
      if (ROOMT && ROOMT.walk) { var lwk = lerp(ROOMT.walk.lumPen, ROOMT.lum, k); roomHemi.intensity = LEVEL.hemi[1] * lwk; roomSoft.intensity = LEVEL.soft[1] * lwk; }
      else if (ROOMT) { roomHemi.intensity *= lerp(1, ROOMT.lum, k); roomSoft.intensity *= lerp(1, ROOMT.lum, k); }
    }
    return lerp(LEVEL.density[0], LEVEL.density[1], k);
  }

  /* ---------- 01: the pen ---------- */

  var VENEER = 1.0; /* how hard the lit veneer glows (1.12 when it was yellower: a deeper orange must not be pushed to white by the tone map) */
  var PEN_Z = 0.375; /* the tip stands this far off the wall so the cap just touches it */

  /* THE VENEER IS THE PHOTOGRAPH'S (the artist's photo of the finished pen,
     lit: media/extra/rooms-v2/lichtschreiber-ref.jpg; the strip of its lit
     veneer, rectified: lichtschreiber-veneer-lit.jpg). The map is the
     emission: deep orange with the bright streaks of the grain. gain: how
     hard it glows; mean: the map's mean green (linear; its mean colour is
     (0.9, 0.145, 0.005)); contrast: how much the streaks are lifted above
     the photo's own. If the strip is
     missing the drawn grain and 0xff3c00 come back. */
  var VEN = { url: "media/extra/rooms-v2/lichtschreiber-veneer-lit.jpg", gain: 0.9, mean: 0.145, contrast: 1.6, copies: 4, glow: 0.45 };
  var VENEER_MAP = null;

  /* THE KNOB. "The rectangle will be the new solution but for right now
     it's the dome." The model's GEO-teacan is a straight cylinder (r 37.5,
     y 1579.75 .. 1698.75 mm); "dome" swaps its geometry in place for a
     turned cylinder with a round top, proportioned from the photograph
     (stands KNOB_DOME.h mm out of the cap ring: about 1.6 diameters).
     "cylinder" keeps the model's own. A third shape is one more case in
     knobGeometry(); the part object is the same either way, so the
     take-apart (LIFT["GEO-teacan"]) moves whichever is active. */
  var KNOB = "dome";
  var KNOB_DOME = { r: 37.5, base: 1579.75, top: 1720 };

  /* THE PEN'S STEEL, after the photograph: tip cone, clip, cap ring and knob
     are a darker, quieter satin grey than the shared chrome, with no white
     glare; along their edges (where the view grazes the metal, which is
     where the photograph shows it) they take the body's orange. Still a
     metal: metalness 1, the studio's bands still run along it, softly. */
  /* The light it throws (see buildPen). After the photograph the wash on
     the wall is a deeper orange and gathers closer round the pen: more from
     the three sources inside the body, less from the broad stand-in off the
     wall, so the station and the entrance are no brighter overall (measured:
     mean of the frame at y = 0 and at the station unchanged). Was 0xff6a24,
     inner 0.34, wash 2.3. */
  var PEN_LIGHT = { color: 0xff5a1a, inner: 0.46, wash: 1.75 };
  if (ROOMT) { PEN_LIGHT.inner *= ROOMT.pen.inner; PEN_LIGHT.wash *= ROOMT.pen.wash; } /* the test room (notes/room-test.md) */

  /* The artist, later: "die Chromteile vom Stift wieder etwas mehr reflektieren
     lassen": about half way back toward the mirror finish. Was color 0x8c8782,
     roughness 0.34, env 0.62, direct 0.35, face [0.78, 0.76, 0.74]. */
  var STEEL = { color: 0xa5a19d, roughness: 0.22, env: 1.0, direct: 0.5, face: [0.93, 0.91, 0.89], edge: [1.25, 0.5, 0.2] };
  function penSteel(m) {
    if (m.userData.penSteel) return;
    m.userData.penSteel = true;
    m.metalness = 1;
    m.roughness = STEEL.roughness;
    m.envMapIntensity = STEEL.env;
    m.color.setHex(STEEL.color);
    var v3 = function (a) { return "vec3(" + a.map(function (x) { return x.toFixed(3); }).join(",") + ")"; };
    m.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <lights_fragment_end>",
        "#include <lights_fragment_end>\n" +
          /* the pen's own lights centimetres away: no white glare */
          "reflectedLight.directSpecular *= " + STEEL.direct.toFixed(3) + ";\n" +
          "{ float stE = 1.0 - clamp(dot(normalize(geometryNormal), normalize(geometryViewDir)), 0.0, 1.0);\n" +
          "  reflectedLight.indirectSpecular *= mix(" + v3(STEEL.face) + ", " + v3(STEEL.edge) + ", smoothstep(0.35, 0.95, stE)); }\n"
      );
    };
    m.customProgramCacheKey = function () {
      return "pensteel";
    };
    m.needsUpdate = true;
  }

  function knobGeometry(kind, orig) {
    if (kind !== "dome") return orig;
    var r = KNOB_DOME.r, y0 = KNOB_DOME.base, y1 = KNOB_DOME.top, pts = [];
    pts.push(new THREE.Vector2(0, y0));
    pts.push(new THREE.Vector2(r * 0.96, y0));
    pts.push(new THREE.Vector2(r, y0 + 1.5));
    /* the dome: a full half-round, as in the photograph and the drawings */
    for (var i = 0; i <= 24; i++) {
      var a = (i / 24) * Math.PI / 2;
      pts.push(new THREE.Vector2(r * Math.cos(a), y1 - r + r * Math.sin(a)));
    }
    pts[pts.length - 1].x = 0;
    var g = new THREE.LatheGeometry(pts, 64);
    g.computeVertexNormals();
    return g;
  }

  /* exploded view: millimetres along the pen's own axis, tip stays put */
  var LIFT = {
    "GEO-nib": 0, "GEO-core_gap": 24, "GEO-contacto": 66,
    "INT-absorber": 150, "INT-tipadapter": 196, "INT-postbase": 250,
    "INT-fadecup": 324, "INT-post": 356, "INT-strips": 356,
    "INT-veneer": 356, "GEO-clip": 356,
    "INT-bus": 452, "INT-switchcup": 536, "INT-switch": 628, "INT-retainer": 700,
    "INT-knobfoot": 762, "INT-capinsert": 836, "GEO-valve": 898, "GEO-teacan": 980
  };
  /* The veneer body (and the clip that rides on it) slide aside: along the
     wall and OUT INTO THE ROOM (x, z in mm), never toward the wall. */
  var SIDE = { "INT-veneer": [300, 215], "GEO-clip": [372, 266] };
  var LEAN = -10 * RAD; /* tip down, cap against the wall */

  async function buildPen(Loader) {
    var res = await Promise.all([loadModel(Loader, "media/models/kugelschreiber.glb"), loadTex(VEN.url)]);
    var gl = res[0];
    VENEER_MAP = res[1];
    VEN.u = { value: new THREE.Vector3(VEN.gain, VEN.mean, VEN.contrast) };
    if (VENEER_MAP) {
      VENEER_MAP.wrapS = VENEER_MAP.wrapT = THREE.ClampToEdgeWrapping;
      VENEER_MAP.needsUpdate = true;
    }
    var model = gl.scene;
    var mats = fixMaterials(model, 0.3);
    model.traverse(function (o) {
      if (o.isMesh && o.name === "GEO-teacan") o.geometry = knobGeometry(KNOB, o.geometry);
      if (o.isMesh && /^MAT-chrome/.test(o.material.name)) penSteel(o.material);
    });
    var top = partsParent(model);
    var parts = top.children.map(function (o) {
      return {
        o: o, home: o.position.clone(),
        lift: LIFT[o.name] != null ? LIFT[o.name] : 356,
        side: SIDE[o.name] || null
      };
    });

    /* it leans about 10 degrees, tip down, cap against the wall */
    var pivot = new THREE.Group();
    pivot.position.set(0, 0.004, PEN_Z); /* leaning, the rim of the nib would otherwise dip 3 mm into the floor */
    pivot.rotation.x = LEAN;
    pivot.add(model);
    scene.add(pivot);

    /* the light it throws: a 1.1 m column is a line of light, so three small
       sources along the post, plus one soft one stood off the wall that
       stands in for the broad wash a real line source gives */
    var lights = [0.45, 0.92, 1.36].map(function (h) {
      var l = new THREE.PointLight(PEN_LIGHT.color, PEN_LIGHT.inner, 0, 2);
      l.position.set(0, h, 0.02); /* inside the body: no highlight on its own skin */
      l.userData.h = h;
      pivot.add(l);
      return l;
    });
    var wash = new THREE.PointLight(PEN_LIGHT.color, PEN_LIGHT.wash, 0, 2);
    wash.position.set(0.05, 0.95, 1.1);
    scene.add(wash);
    CONTACT.refs.pen = pivot;
    /* its light in the air: the column, in two soft lengths */
    hazeAt(lights[0], 0xff6a24, 0.014, 0.9, 0.2);
    hazeAt(lights[2], 0xff6a24, 0.014, 0.9, 0.2);

    /* the blue cord: leaves through the ball tip at floor level and runs
       off along the floor, back toward the entrance, to the wall */
    var pts = [
      [0, 0.012, PEN_Z], [-0.2, 0.0095, 0.47], [-0.62, 0.0095, 0.66], [-1.25, 0.0095, 0.6],
      [-1.9, 0.0095, 0.82], [-2.7, 0.0095, 0.72], [-3.5, 0.0095, 0.9], [-4.4, 0.0095, 0.62],
      [-5.1, 0.0095, 0.3], [-5.35, 0.0095, 0.06], [-5.38, 0.12, 0.022], [-5.38, 0.31, 0.02]
    ].map(function (p) {
      return new THREE.Vector3(p[0], p[1], p[2]);
    });
    var cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5), 220, 0.0085, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x1f4fbf, roughness: 0.62, envMapIntensity: 0.3 })
    );
    cord.layers.enable(GLOW);
    occluders.push(cord);
    scene.add(cord);
    var plug = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.075, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.5, envMapIntensity: 0.3 })
    );
    plug.position.set(-5.38, 0.33, 0.015);
    scene.add(plug);

    /* NOTHING MAY PASS THROUGH THE WALL OR THE FLOOR. Leaning, the cap
       touches the wall, so anything lifted along the axis would go into it.
       So the pen first stands itself upright on its tip, 30 cm clear of the
       wall (0 .. 0.28); only then does the stack rise, straight up (0.26 ..
       1), while the body slides out into the room. The tip never leaves the
       floor and nothing moves down. window.__rooms.penClearance() measures it. */
    RIG.penParts = parts;
    RIG.pen = function (ex) {
        pivot.rotation.x = LEAN * (1 - sstep(ex, 0, 0.28));
        var s1 = sstep(ex, 0.1, 0.66); /* body slides aside, into the room */
        var s2 = sstep(ex, 0.26, 1.0); /* the stack separates along the axis */
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          p.o.position.set(
            p.home.x + (p.side ? p.side[0] * s1 : 0),
            p.home.y + p.lift * s2,
            p.home.z + (p.side ? p.side[1] * s1 : 0)
          );
        }
        /* The lamp never goes off. The strips are the lamp: bared, they are
           brighter. The veneer is only a shade, so it stops glowing as it
           leaves them — and picks up their light from the side instead. */
        for (i = 0; i < mats.veneer.length; i++) {
          mats.veneer[i].emissiveIntensity = VENEER * (1 - 0.94 * s1);
          /* lit from inside, the wood should not also be front-lit by the
             stand-in wash light; bared, it is plain oak again */
          mats.veneer[i].color.setHex(0xb0814d).multiplyScalar(lerp(VENEER_MAP ? 0.05 : 0.4, 1, s1));
          /* lit, the room's reflections on it are a faint sheen at most:
             at full strength they lay a grey veil over the orange */
          if (VENEER_MAP) mats.veneer[i].envMapIntensity = lerp(0.12, 0.4, s1);
        }
        for (i = 0; i < mats.led.length; i++) mats.led[i].emissiveIntensity = 3.2 + 4.6 * s1;
        for (i = 0; i < lights.length; i++) {
          lights[i].position.y = lights[i].userData.h + 0.356 * s2;
          lights[i].intensity = PEN_LIGHT.inner + 0.2 * s1;
        }
        wash.position.y = 0.95 + 0.3 * s2;
    };
    RIG.pen(0);
  }

  /* ---------- 02: the cluster ---------- */

  var CL = { x: 8.5, y: 1.72, z: 1.15 };
  /* Bubblegum's motion, in mm from the centre of the knot to the centre of
     a globe (see RIG.cl):
     open: how far the shared radius grows at "take apart" = 1 (the old
     per-globe 300 .. 480, now one value for all); fly: the radius every
     globe starts from on the crossing. A globe is 75 mm in radius and the
     centre is 1.15 m off the wall, so at 1.0 m a globe pointing straight at
     the wall keeps 75 mm clear of it (window.__rooms.clReach()). */
  var CL_MOVE = { open: 390, fly: 1000 };

  async function buildCluster(Loader) {
    var gl = await loadModel(Loader, "media/models/bubblegum.glb");
    var model = gl.scene;
    /* the lamp is INSIDE the cluster, 4 to 8 cm from every socket and cap */
    /* ...and at the middle of sixteen lit globes, which is the best-lit
       place in the whole object: sockets, zip ties, cables and tangle take
       warm light from all round (WARM), so the centre can be seen from
       outside, through the gaps. */
    var WARM = [1.15, 0.56, 0.25];
    fixMaterials(model, 0.004, WARM);
    var top = partsParent(model); /* BUBBLEGUM-root: millimetres */

    var rig = new THREE.Group();
    rig.position.set(CL.x, CL.y, CL.z);
    scene.add(rig);
    var spin = new THREE.Group();
    rig.add(spin);
    spin.add(model);

    var bulbs = [];
    top.children.forEach(function (o) {
      if (/drop_cord|ceiling_cap/.test(o.name)) {
        o.visible = false; /* replaced by a cord that reaches this ceiling */
        return;
      }
      if (!/bulb/.test(o.name)) return;
      var dir = o.position.clone().normalize();
      bulbs.push({ o: o, home: o.position.clone(), dir: dir, r0: o.position.length() });
    });

    /* THE KNOT IS A TANGLE, a fistful of cable, not a neat ball. Three kinds
       of thing make it, all of the cable's own thickness and colour:
         - each of the sixteen cables, once it reaches the bundle, carries on
           as its own wrap: round the bundle, over and under the others,
           working inward until it is lost;
         - loose loops of different sizes sticking out of it;
         - a dark core, so no gap shows through.
       The model's two zip ties are scaled up to bite into the bigger bundle,
       and the drop cord comes out of the top. It is the best-lit part of the
       lamp (WARM) and it is not a light: it hides the glow, adds none. */
    var CR = 3.3; /* mm: a 6.6 mm round textile cable */
    var TR = 56; /* mm: where a cable meets the bundle */
    var cableMat = new THREE.MeshStandardMaterial({ color: 0xc4432a, roughness: 0.82, envMapIntensity: 0.2 });
    tame(cableMat, 0.006, 0.6, WARM);
    var coreMat = new THREE.MeshStandardMaterial({ color: 0x4a140c, roughness: 0.9, envMapIntensity: 0.1 });
    tame(coreMat, 0.004, 0.3, WARM);
    top.children.forEach(function (o) {
      if (/anchor_knot/.test(o.name)) o.visible = false;
      if (/ziptie/.test(o.name)) o.scale.set(1.38, 2.3, 1.38); /* round the bigger bundle, biting in */
    });
    var tangle = new THREE.Group();
    top.add(tangle);
    tangle.add(asOccluder(new THREE.Mesh(new THREE.SphereGeometry(33, 20, 14), coreMat)));
    var rv = new THREE.Vector3(), ax = new THREE.Vector3(), pp = new THREE.Vector3(), k, j, th, wpts;
    for (k = 0; k < bulbs.length; k++) {
      /* this cable's wrap: starts where the cable arrives, ends inside */
      rv.set(hash(k * 3 + 1) - 0.5, hash(k * 3 + 2) - 0.5, hash(k * 3 + 3) - 0.5);
      ax.crossVectors(bulbs[k].dir, rv).normalize();
      var turns = (0.75 + 1.0 * hash(k + 31)) * Math.PI * 2 * (hash(k + 17) > 0.5 ? 1 : -1);
      var deep = 30 + 10 * hash(k + 5);
      wpts = [];
      for (j = 0; j <= 18; j++) {
        th = j / 18;
        pp.copy(bulbs[k].dir).applyAxisAngle(ax, th * turns);
        pp.multiplyScalar(lerp(TR, deep, Math.pow(th, 0.7)) + 7 * Math.sin(th * 11 + k) * (1 - th));
        pp.addScaledVector(ax, 16 * Math.sin(th * 5 + k * 1.3) * th);
        wpts.push(pp.clone());
      }
      tangle.add(asOccluder(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts), 64, CR, 6, false), cableMat
      )));
    }
    for (k = 0; k < 10; k++) {
      /* a loose loop standing proud of the bundle */
      rv.set(hash(k * 7 + 2) - 0.5, hash(k * 7 + 3) - 0.35, hash(k * 7 + 4) - 0.5).normalize();
      ax.set(hash(k * 5 + 1) - 0.5, hash(k * 5 + 2) - 0.5, hash(k * 5 + 3) - 0.5);
      ax.addScaledVector(rv, -ax.dot(rv)).normalize();
      var rho = 15 + 27 * hash(k + 71), cen = 40 + rho * 0.62;
      wpts = [];
      for (j = 0; j < 20; j++) {
        th = (j / 20) * Math.PI * 2;
        pp.copy(rv).multiplyScalar(cen + rho * Math.cos(th) * (1 + 0.25 * Math.sin(th * 2 + k)));
        pp.addScaledVector(ax, rho * 0.8 * Math.sin(th));
        pp.addScaledVector(new THREE.Vector3().crossVectors(rv, ax), 6 * Math.sin(th * 3 + k));
        wpts.push(pp.clone());
      }
      tangle.add(asOccluder(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts, true), 60, CR, 6, true), cableMat
      )));
    }

    /* SIXTEEN REAL CABLES, one from the back of each socket into the tangle.
       One mesh, rebuilt in place as the globes move: each is a tube along a
       curve that leaves the socket along its axis, sags under its own weight
       and enters the knot, so when the cluster opens the cables pay out of
       the tangle and when it gathers they are drawn back in. */
    var NS = 22, NR = 6, NB = bulbs.length, RING = (NS + 1) * NR;
    var cPos = new Float32Array(NB * RING * 3), cNor = new Float32Array(NB * RING * 3), cIdx = [];
    for (var bi = 0; bi < NB; bi++)
      for (var si = 0; si < NS; si++)
        for (var ri = 0; ri < NR; ri++) {
          var a0 = bi * RING + si * NR + ri, a1 = bi * RING + si * NR + ((ri + 1) % NR);
          cIdx.push(a0, a1, a0 + NR, a1, a1 + NR, a0 + NR);
        }
    var cGeo = new THREE.BufferGeometry();
    cGeo.setIndex(cIdx);
    cGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
    cGeo.setAttribute("normal", new THREE.BufferAttribute(cNor, 3));
    var cables = new THREE.Mesh(cGeo, cableMat);
    cables.frustumCulled = false;
    top.add(asOccluder(cables));

    var q0 = new THREE.Vector3(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3(), q3 = new THREE.Vector3();
    var pt = new THREE.Vector3(), tg = new THREE.Vector3(), nn = new THREE.Vector3(), bn = new THREE.Vector3();
    var UP = new THREE.Vector3(0, 1, 0), SIDE2 = new THREE.Vector3(1, 0, 0);
    function layCable(i, pos, axis, anchor) {
      /* socket back (39 mm behind the bulb's origin, on its axis) -> knot */
      q3.copy(pos).addScaledVector(axis, -39);
      q0.copy(anchor);
      var len = q0.distanceTo(q3), o = i * RING * 3, s, r;
      /* Every cable is drawn at full thickness all the way out (the globes
         never go further than CL_MOVE.fly, so a cable is at most about a
         metre long and stays a cable). (Gathered, the socket's back is
         inside the bundle: nothing to draw.) */
      var fat = CR; /* always a proper cable, never thinned to a thread */
      if (q3.length() < TR + 6) {
        for (s = 0; s < RING; s++) {
          cPos[o + s * 3] = q0.x;
          cPos[o + s * 3 + 1] = q0.y;
          cPos[o + s * 3 + 2] = q0.z;
        }
        return;
      }
      /* TAUT. The whole lamp is held by cable tension, so a cable does not
         hang: it runs as a tight, nearly straight line from socket to knot.
         The only curve is a very slight one where it leaves the socket and
         where it enters the bundle (the end tangents lean an eighth of the
         way toward the socket's axis and the bundle's surface; the rest is
         the straight line between the two ends). No sag term at all. */
      var h = len * 0.14;
      tg.subVectors(q3, q0).normalize(); /* the chord */
      q1.copy(anchor).normalize().lerp(tg, 0.88).normalize().multiplyScalar(h).add(q0);
      q2.copy(axis).lerp(tg, 0.88).normalize().multiplyScalar(-h).add(q3);
      ch.copy(tg);
      for (s = 0; s <= NS; s++) {
        var t = s / NS, u = 1 - t;
        var b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
        pt.set(
          b0 * q0.x + b1 * q1.x + b2 * q2.x + b3 * q3.x,
          b0 * q0.y + b1 * q1.y + b2 * q2.y + b3 * q3.y,
          b0 * q0.z + b1 * q1.z + b2 * q2.z + b3 * q3.z
        );
        /* how far this point is below the straight line between the ends */
        dv.subVectors(pt, q0);
        dv.addScaledVector(ch, -dv.dot(ch)); /* its offset from the chord */
        if (-dv.y > dip) dip = -dv.y;
        if (dv.length() > bow) bow = dv.length();
        var d0 = 3 * u * u, d1 = 6 * u * t, d2 = 3 * t * t;
        tg.set(
          d0 * (q1.x - q0.x) + d1 * (q2.x - q1.x) + d2 * (q3.x - q2.x),
          d0 * (q1.y - q0.y) + d1 * (q2.y - q1.y) + d2 * (q3.y - q2.y),
          d0 * (q1.z - q0.z) + d1 * (q2.z - q1.z) + d2 * (q3.z - q2.z)
        ).normalize();
        nn.crossVectors(tg, Math.abs(tg.y) > 0.93 ? SIDE2 : UP).normalize();
        bn.crossVectors(tg, nn);
        for (r = 0; r < NR; r++) {
          var an = (r / NR) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
          var nx = ca * nn.x + sa * bn.x, ny = ca * nn.y + sa * bn.y, nz = ca * nn.z + sa * bn.z;
          var e = o + (s * NR + r) * 3;
          cPos[e] = pt.x + nx * fat;
          cPos[e + 1] = pt.y + ny * fat;
          cPos[e + 2] = pt.z + nz * fat;
          cNor[e] = nx;
          cNor[e + 1] = ny;
          cNor[e + 2] = nz;
        }
      }
    }
    var anchors = bulbs.map(function (b) {
      return b.dir.clone().multiplyScalar(TR);
    });
    var laid = "", dip = 0, bow = 0, ch = new THREE.Vector3(), dv = new THREE.Vector3();
    /* for checking, in millimetres, as last laid: the furthest any cable
       lies BELOW the straight line between its two ends, and the furthest
       any cable is from that line in any direction */
    RIG.clDip = function () {
      return { below: +dip.toFixed(2), off: +bow.toFixed(2) };
    };

    /* the red cord, knot to ceiling, and its cap */
    var len = CEIL - CL.y;
    var cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, len, 8),
      new THREE.MeshStandardMaterial({ color: 0xb8301c, roughness: 0.55, envMapIntensity: 0.3 })
    );
    cord.position.set(0, len / 2, 0); /* it rises out of the tangle */
    cord.layers.enable(GLOW);
    occluders.push(cord);
    rig.add(cord);
    var cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.026, 32),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.5, envMapIntensity: 0.3 })
    );
    cap.position.set(0, len - 0.013, 0);
    cap.layers.enable(GLOW);
    occluders.push(cap);
    rig.add(cap);

    var light = new THREE.PointLight(0xff8e46, 6.0, 0, 2);
    if (ROOMT && ROOMT.clLight) light.intensity *= ROOMT.clLight; /* the test room (notes/room-test.md) */
    rig.add(light);
    /* (seen from below, through the cluster: kept faint and wide, or it
       turns to fog) */
    hazeAt(light, 0xff8e46, 0.004, 1.5, 0.7);

    var Y = new THREE.Vector3(0, 1, 0);
    var v = new THREE.Vector3(), w = new THREE.Vector3();

    /* THE MOTION. Every globe moves only along its own axis, the line from
       the centre of the knot out through its own slot (b.dir, the model's
       own slot directions: already an even spread, 50 +- 1 degrees to the
       nearest neighbour, the top left free for the cord). All sixteen sit
       at ONE shared distance from the centre at every instant, so the
       cluster is always a sphere: it breathes open and shut, it never
       becomes sixteen globes at sixteen distances.
         r = lerp(CL_MOVE.fly, r0 + loose * CL_MOVE.open, e(gather))
       gather 1 = assembled (scroll only lets it go during the crossing,
       motion on); loose = the "take apart" slider or the knot beat. The
       fly-in uses the same axes, so a globe arrives on the side it belongs
       to and leaves from it, and since r > 0 always, no globe ever passes
       the centre. (The old fly-in started each globe from a "swarm" point
       folded to the room side, |dir.z|, and shifted 0.45 m along x: globes
       from the back and from the +x side came in from the wrong side and
       crossed the cluster. That was the glitch.) */
    var r0 = bulbs.reduce(function (a, b) { return a + b.r0; }, 0) / bulbs.length;
    var GC = 210 - r0; /* bulb origin -> globe centre, mm (the README's 0.210 m) */
    RIG.cl = function (gather, loose, angle) {
        spin.rotation.y = angle;
        /* the cables only need laying again when a globe has moved */
        var sig = "g" + gather.toFixed(4) + "l" + loose.toFixed(4);
        var redo = sig !== laid;
        laid = sig;
        if (redo) dip = bow = 0;
        var e = ease(clamp(gather, 0, 1));
        e = 1 - Math.pow(1 - e, 1.6); /* pulled in: quick, then it seats */
        /* r: where each bulb's own origin sits (its socket end; the globe's
           centre is GC mm further out along the same axis) */
        var r = lerp(CL_MOVE.fly - GC, r0 + loose * CL_MOVE.open, e);
        for (var i = 0; i < bulbs.length; i++) {
          var b = bulbs[i];
          /* its own slot's distance (the model's are all 210 mm, to 0.3 mm),
             plus the shared opening */
          b.o.position.copy(b.dir).multiplyScalar(r + (b.r0 - r0) * e);
          /* the socket always points back down its own axis at the knot */
          b.o.quaternion.setFromUnitVectors(Y, b.dir);
          if (redo) layCable(i, b.o.position, b.dir, anchors[i]);
        }
        if (redo) {
          cGeo.attributes.position.needsUpdate = true;
          cGeo.attributes.normal.needsUpdate = true;
        }
        light.intensity = 6.0 * (0.12 + 0.88 * e * e);
        if (ROOMT && ROOMT.clLight) light.intensity *= ROOMT.clLight; /* the test room */
    };
    /* for checking (window.__rooms.clCheck): every globe's direction and
       distance from the centre, in the cluster's own frame, at (gather,
       loose); and the nearest any globe comes to wall, floor and ceiling
       at the widest spread, over a full turn of the cluster */
    RIG.clCheck = function (gather, loose) {
      if (gather != null) RIG.cl(gather, loose, 0); /* else: as the page has it now */
      var out = [], wv = new THREE.Vector3();
      for (var i = 0; i < bulbs.length; i++) {
        var p = wv.copy(bulbs[i].o.position).addScaledVector(bulbs[i].dir, GC), d = p.length(); /* the globe's centre */
        out.push({ i: i, deg: +(Math.acos(clamp(p.dot(bulbs[i].dir) / d, -1, 1)) / RAD).toFixed(3), mm: +d.toFixed(1) });
      }
      return out;
    };
    RIG.clReach = function () {
      var GR = 75, wall = 1e9, floor = 1e9, ceil = 1e9;
      for (var a = 0; a < 360; a += 5) {
        /* the widest of each: flown out, and opened */
        [[0, 0], [1, 1]].forEach(function (gl) {
          RIG.cl(gl[0], gl[1], a * RAD);
          rig.updateMatrixWorld(true);
          for (var i = 0; i < bulbs.length; i++) {
            v.copy(bulbs[i].o.position).addScaledVector(bulbs[i].dir, GC);
            bulbs[i].o.parent.localToWorld(v); /* the globe's centre, in the room */
            wall = Math.min(wall, v.z - GR / 1000);
            floor = Math.min(floor, v.y - GR / 1000);
            ceil = Math.min(ceil, CEIL - v.y - GR / 1000);
          }
        });
      }
      return { wall: +wall.toFixed(3), floor: +floor.toFixed(3), ceiling: +ceil.toFixed(3) };
    };
    RIG.cl(1, 0, 0);
  }

  /* ---------- 03 – 05: the lamps whose models arrive as GLB ----------
     Contract for media/models/{sr01,lightbox-wall,bulb-block,wire-stand}.glb
     (lightbox-floor.glb is not used: that box is the inside of SR01): metres, Y up, true scale, no scaled root, origin at the
     mounting point, every part a named mesh, and every light-emitting
     material's name starts with EMIT_. So "only emitters glow" is one name
     test here. Until a file exists (the generator lists which do, in
     <html data-models>), a plain stand-in built from primitives takes its
     place, with the same rule: emitters marked, everything else an occluder. */

  /* How each named material of the arriving models is treated. One rule
     above all: only a material whose name starts with EMIT_ emits, and only
     those meshes feed the glow. Clear glass is clear — it reflects, it does
     not shine, and it neither glows nor hides the glow behind it. */
  var EMIT = {
    /* name after EMIT_: [emissive colour, intensity, share of the glow] */
    filament: [0xff932c, 9.5, 0.5], /* bright, with a tight bloom: the coil stays a coil */
    steps: [0xffa957, 3.4, 0.8],
    led: [0xffdcb6, 4.2, 0.4], /* SR01's tape: warm white, 3000 K, and a tight bloom */
    seam: [0xffcf98, 1.05, 0.4],
    bulb: [0xffa757, 6, 1]
  };
  var GLASS = null, glowDim = [];

  function unlit(m, key) {
    /* an emitter is its own light: the lamp inside it must not also light it */
    m.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <lights_fragment_end>",
        "#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 0.0;\nreflectedLight.directSpecular *= 0.0;\n"
      );
    };
    m.customProgramCacheKey = function () {
      return "unlit" + (key || "");
    };
  }

  /* The wall box's face: wood veneer with light behind it. Two bookmatched
     leaves of crown-cut grain mirrored about the seam, drawn once to a
     canvas and used as BOTH the colour map and the emissive map, so dense
     grain glows darker. That is the whole effect. */
  /* (only used if the photographed face is missing) */
  function veneerTexture(noFlip) {
    var S = 1024, seam = Math.round(S * 0.572);
    var leaf = document.createElement("canvas");
    leaf.width = seam;
    leaf.height = S;
    var g = leaf.getContext("2d");
    var bg = g.createLinearGradient(0, 0, seam, 0);
    bg.addColorStop(0, "#f3cf9a");
    bg.addColorStop(0.5, "#ffe2b4");
    bg.addColorStop(1, "#f6d4a0");
    g.fillStyle = bg;
    g.fillRect(0, 0, seam, S);
    var i, x, k;
    /* straight grain: many fine, slightly wandering vertical lines */
    for (i = 0; i < 420; i++) {
      x = hash(i * 1.37 + 3) * seam;
      var drift = (hash(i * 2.11) - 0.5) * 26;
      g.strokeStyle = "rgba(" + (118 + hash(i) * 40 | 0) + "," + (58 + hash(i + 7) * 26 | 0) + ",18," + (0.05 + hash(i * 3.3) * 0.2) + ")";
      g.lineWidth = 0.6 + hash(i * 5.1) * 2.6;
      g.beginPath();
      g.moveTo(x, -10);
      g.bezierCurveTo(x + drift, S * 0.33, x - drift, S * 0.66, x + drift * 0.4, S + 10);
      g.stroke();
    }
    /* the cathedral figure of a crown cut: nested arches, a little off-centre */
    var cx = seam * 0.44;
    for (k = 0; k < 15; k++) {
      var hw = 10 + k * 17 + hash(k + 60) * 8, apex = S * 0.9 - k * 54 - hash(k + 80) * 20;
      g.strokeStyle = "rgba(104,48,14," + (0.34 - k * 0.012) + ")";
      g.lineWidth = 2.2 + hash(k + 20) * 3.4;
      g.beginPath();
      g.moveTo(cx - hw, S + 20);
      g.bezierCurveTo(cx - hw * 0.92, apex + (S - apex) * 0.3, cx - hw * 0.42, apex, cx + hash(k) * 6, apex);
      g.bezierCurveTo(cx + hw * 0.42, apex, cx + hw * 0.92, apex + (S - apex) * 0.3, cx + hw, S + 20);
      g.stroke();
    }
    /* broad soft bands: where the leaf is thicker or thinner */
    for (i = 0; i < 26; i++) {
      x = hash(i * 9.7 + 1) * seam;
      var w = 20 + hash(i * 4.3) * 70;
      var lg = g.createLinearGradient(x - w, 0, x + w, 0);
      var d = hash(i * 6.1) > 0.5 ? "90,40,10" : "255,236,200";
      lg.addColorStop(0, "rgba(" + d + ",0)");
      lg.addColorStop(0.5, "rgba(" + d + "," + (0.07 + hash(i) * 0.1) + ")");
      lg.addColorStop(1, "rgba(" + d + ",0)");
      g.fillStyle = lg;
      g.fillRect(x - w, 0, w * 2, S);
    }
    var c = document.createElement("canvas");
    c.width = c.height = S;
    var o = c.getContext("2d");
    o.drawImage(leaf, 0, 0);
    o.save(); /* the second leaf is the first one turned over: bookmatched */
    o.translate(seam * 2, 0);
    o.scale(-1, 1);
    o.drawImage(leaf, 0, 0);
    o.restore();
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = !noFlip;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  function prepGLB(obj, selfScale) {
    obj.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var m = o.material, n = m.name || "";
      if (/^EMIT_/.test(n)) {
        var key = n.replace(/^EMIT_/, "");
        if (/veneer/.test(key)) {
          /* buildBox() gives the face its own material */
        } else if (!m.userData.emit) {
          var e = EMIT[key];
          if (e) {
            m.emissive = new THREE.Color(e[0]);
            m.emissiveIntensity = e[1];
            if (e[2] !== 1) glowDim.push({ m: m, k: e[2] });
          } else if (!m.emissive || m.emissive.r + m.emissive.g + m.emissive.b < 0.02 || !m.emissiveIntensity) {
            m.emissive = (m.color || new THREE.Color(0xffb060)).clone();
            m.emissiveIntensity = 1.6;
          }
          m.userData.emit = true;
          unlit(m, "emit");
        }
        asEmitter(o);
        return;
      }
      if (/glass_clear/.test(n) || m.transmission > 0) {
        /* Clear glass: a thin shell that only reflects. Black base (no
           diffuse), added over whatever is behind it, never written to depth:
           the filament is seen through it, sharply, with the room's highlights
           lying on the surface. Not an emitter, not in the glow. */
        if (!GLASS) {
          GLASS = new THREE.MeshPhysicalMaterial({
            /* a glass sphere reads by its rim highlights and the reflections
               lying on it: a strong index, the studio at full strength */
            /* (THIN CLEAR GLASS, not a mirror ball: the artist found the
               globes "a bit too reflective". Window glass's own index, the
               studio at a third of its strength and a touch of roughness, so
               what lies on the globe is its bright rim and one or two soft
               highlights, and the filament is the brightest thing in it.) */
            name: "glass", color: 0x000000, roughness: 0.07, metalness: 0, ior: 1.5, envMapIntensity: 0.8,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          });
          tame(GLASS, 0.03, 0.7);
        }
        o.material = GLASS;
        o.renderOrder = 3;
        return;
      }
      if (m.transparent || m.opacity < 1) {
        m.depthWrite = false;
        return;
      }
      asOccluder(o);
      /* (the wire man's globe is plain clear glass, NOT chrome-dipped: no
         mirror material any more; its glass is GLASS above, like the bulb's
         on the oak block) */
      if (/wire_steel/.test(n)) {
        /* bright bent steel: on the studio map, so every twist in the column
           catches a highlight */
        m.color.setHex(0xe4e4e0);
        m.metalness = 1;
        m.roughness = 0.17;
        m.envMapIntensity = 1.7;
        tame(m, 0.6, 1.6);
      } else if (/stem_brass|collar_bronze/.test(n)) {
        /* aged brass and bronze: warm metal, soft highlights */
        m.color.setHex(/bronze/.test(n) ? 0x7a5a36 : 0xc9a24a);
        m.metalness = 1;
        m.roughness = /bronze/.test(n) ? 0.42 : 0.3;
        m.envMapIntensity = 1.0;
        tame(m, 0.25, 1.1);
      } else if (/oak/.test(n)) {
        /* rough-sawn and matt: no sheen at all */
        var ot = oakTexture();
        m.map = ot;
        m.color.setHex(0xffffff);
        m.roughness = 0.95;
        m.metalness = 0;
        m.bumpMap = ot;
        m.bumpScale = 1.5;
        m.envMapIntensity = 0.03;
        /* the inside of the bored hole is dark */
        var op = o.geometry.attributes.position, oc = new Float32Array(op.count * 3);
        for (var vi = 0; vi < op.count; vi++) {
          var inBore = op.getX(vi) * op.getX(vi) + op.getZ(vi) * op.getZ(vi) < 0.0212 * 0.0212;
          oc[vi * 3] = oc[vi * 3 + 1] = oc[vi * 3 + 2] = inBore ? 0.16 : 1;
        }
        o.geometry.setAttribute("color", new THREE.BufferAttribute(oc, 3));
        m.vertexColors = true;
        tame(m, 0.42, 1.0); /* enough of the bulb's light that the pale timber stays pale */
      } else if (/socket_black/.test(n)) {
        /* black bakelite: a little gloss */
        m.roughness = 0.32;
        m.envMapIntensity = 0.8;
        tame(m, selfScale, 0.6);
      } else if (m.metalness > 0.9) {
        if (m.roughness < 0.15) {
          var gid = o.geometry.uuid;
          o.geometry = prepGLB.smooth[gid] || (prepGLB.smooth[gid] = Utils.toCreasedNormals(o.geometry, 34 * RAD));
          m.envMapIntensity = 1.25;
        } else m.envMapIntensity = 0.16; /* raw steel in a dark room stays dark */
        tame(m, selfScale, 0.5);
      } else {
        /* wood, paint, plastic: lit by the room and the lamp, not tinted by
           the orange studio that exists only for the mirror finishes */
        m.envMapIntensity = 0.12;
        tame(m, selfScale, 0.9);
      }
    });
    return obj;
  }
  prepGLB.smooth = {};

  /* centre of everything that emits inside obj, in world space */
  function emitCentre(obj, fallback) {
    var box = new THREE.Box3(), any = false;
    obj.updateMatrixWorld(true);
    obj.traverse(function (o) {
      if (o.isMesh && emitters.indexOf(o) >= 0) {
        box.expandByObject(o);
        any = true;
      }
    });
    return any ? box.getCenter(new THREE.Vector3()) : fallback;
  }

  function std(color, rough, metal, env) {
    return new THREE.MeshStandardMaterial({
      color: color, roughness: rough, metalness: metal || 0, envMapIntensity: env == null ? 0.14 : env
    });
  }
  function emit(color, k) {
    return new THREE.MeshStandardMaterial({
      color: 0x241a12, roughness: 0.6, envMapIntensity: 0, emissive: color, emissiveIntensity: k
    });
  }
  function box(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  /* ---- 03: SR01. A sheet of raw steel held off a birch body; the light is
     inside, never seen from the front; THE WALL TAKES IT, AND THE HALO IS
     THE PIECE (the artist: "Improve SR01 by a lot, a lot! It should be really
     nice like in the photos"). After his photographs and films of it lit
     (sr01/06.jpg, 07, 08, v04, v05) and the model's notes (sr01.md):

     - IT HANGS ON A PALE WALL. In every photograph the wall is white
       plaster, which is why the wash is so clean. So the room has a bay of
       pale, matt plaster here, floor to ceiling, 5.2 m wide and 12 mm proud
       of the wall, in the room's own trowelled texture.
     - THE HALO is a card on that plaster, added over it, with the falloff
       fitted in sr01.md to his film of it: a dark band of a few centimetres
       against the box, brightest 90 - 150 mm outside the steel's edge, then
       a long soft tail of about a metre; the same on all four sides, a
       little stronger beside the long sides and a little dimmer on the
       diagonals. No light inside the lamp reaches the wall (the steel throws
       it back past the rim), so no lamp could draw this. It is generous: it
       lights the wall. Its spill on floor and ceiling is one local light.
     - THE LIGHT IS WARM WHITE, not orange (3000 K LED tape; the pen and the
       bulbs are the orange ones).
     - THE STEEL is a calm dark rectangle in the middle of the glow, and
       plainly steel: cold-rolled raw sheet. Its cloudy, streaky mill scale is
       the real face, media/extra/rooms-v2/sr01-steel-face.jpg (rectified
       from a daylight photograph), with the band of sunlight divided out of
       it: as a roughness map and a bump (sr01-steel-var.jpg) and, faintly, in
       its colour (sr01-steel-alb.jpg); never a pasted photograph. A thin
       sheet is never dead flat, and a dead-flat mirror shows one patch of
       its surroundings, a single tone, which is what made it "a flat dark
       rectangle": so the sheet has the faint oil-canning a real one has (a
       broad, shallow normal map), its highlights are drawn out along the
       rolling direction (anisotropy), and it reflects a dim soft room of its
       own (steelEnv(): no orange studio), so a slow sheen lies across it and
       moves as you do. The lamp's own light never falls on its face.
     - The plywood sides take the wall's glow, warm, and show their plies.
     THE TAKE-APART is written against part names: everything moves OUT from
     the wall along +z (the steel first, then the tiers stepping out one by
     one, LED bands lit throughout), nothing moves toward it or downward. As
     the steel leaves, the halo, which is the steel's doing, widens and
     falls away, and the bare tape lights the room instead. ---- */
  function steelEnv() {
    var s = new THREE.Scene();
    s.add(new THREE.Mesh(
      new THREE.SphereGeometry(30, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: "varying vec3 p;\nvoid main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "varying vec3 p;\nvoid main(){ vec3 d = normalize(p);" +
          /* a dim room: dark floor, a wall that is a little lighter toward
             the left, a paler ceiling */
          " vec3 c = mix(vec3(0.030,0.027,0.024), vec3(0.085,0.080,0.074), smoothstep(-0.35, 0.05, d.y));" +
          " c = mix(c, vec3(0.30,0.285,0.26), smoothstep(0.25, 0.9, d.y));" +
          " c *= 1.0 + 0.55 * smoothstep(0.6, -0.9, d.x);" +
          " gl_FragColor = vec4(c, 1.0); }"
      })
    ));
    function soft(bearing, elev, w, h, hex, power) {
      var a = bearing * RAD, e = elev * RAD, d = 12;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power), side: THREE.DoubleSide }));
      m.position.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d);
      m.lookAt(0, 0, 0);
      s.add(m);
    }
    /* bearing 0 is the room side, where the visitor stands */
    soft(-34, 24, 11, 9, 0xfff3e2, 1.25); /* the room's soft light, high on the left */
    soft(42, 6, 5, 12, 0xffeeda, 0.5);
    soft(17, 13, 6, 5, 0xfff1e0, 0.62); /* ...and a paler stretch of the far wall, straight ahead: what it shows from the front */
    soft(4, -32, 16, 3, 0xffe2c2, 0.42); /* the pale floor in front of it, lit by its own wash */
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    return tex;
  }
  /* the sheet's oil-canning: a height field of a few broad, shallow waves
     across the diagonal, as a normal map */
  function warpMap() {
    var W = 64, H = 96, c = document.createElement("canvas"), x, y;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d"), id = g.createImageData(W, H), d = id.data;
    function hgt(u, v) {
      return 0.55 * Math.sin(2.1 * u + 3.4 * v + 0.6) + 0.3 * Math.sin(-4.3 * u + 2.2 * v + 2.0) + 0.22 * Math.sin(6.1 * u + 7.3 * v + 4.1) + 0.5 * (u - 0.5) * (v - 0.5);
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var u = x / W, v = 1 - y / H, e = 0.01;
      var nx = -(hgt(u + e, v) - hgt(u - e, v)) / (2 * e), ny = -(hgt(u, v + e) - hgt(u, v - e)) / (2 * e), k = 0.11;
      var l = Math.hypot(nx * k, ny * k, 1), i = (y * W + x) * 4;
      d[i] = 127.5 + 127.5 * (nx * k) / l;
      d[i + 1] = 127.5 + 127.5 * (ny * k) / l;
      d[i + 2] = 127.5 + 127.5 / l;
      d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  }
  var SR_PZ = 0.012; /* how far the pale plaster stands off the wall */
  /* LR01'S SPOT. The artist: "a soft spot light from behind the camera? i
     want the metal to be a bit more exposed". A gallery spot on the ceiling
     behind where the visitor stands (from = [dx along the wall from the
     lamp, down from the ceiling, out from the wall], m), aimed at the
     panel. It lights the STEEL ONLY, in the steel's own shader (so the wall
     and the halo are untouched, and it costs nothing anywhere else, phone
     included), and after tame(), which scales the lamp's own light on its
     parts to almost nothing. spec: the broad soft sheen of the raw sheet
     (a metal answers a light only with this); diffuse: the mill scale, an
     oxide, takes a little matt light, which is what shows its cloudy face;
     rough: the sheet is seen by this light at no less than this roughness
     (a broad sheen, never a hot disc where it mirrors the spot); cap: the
     most that sheen may add (linear), so no angle of the drag blows it out;
     inner / outer: the cone's half-angles (deg), wide enough to hold the
     panel when it comes off in the take-apart. Live: __rooms.srSpot, then
     __rooms.srSpotApply(). */
  var SR_SPOT = { from: [-3.2, 0.3, 7.4], color: 0xfff1e2, spec: 0.45, rough: 0.65, cap: 0.1, diffuse: 0.3, inner: 6, outer: 16 };
  var srSpotU = null;
  function srSpotApply() {
    if (!srSpotU) return;
    var S = srSpotU.S, f = SR_SPOT.from, at = srSpotU.at;
    S.pos.set(X.sr + f[0], CEIL - f[1], f[2]);
    S.dir.copy(at).sub(S.pos).normalize();
    S.uCone.value.set(Math.cos(SR_SPOT.inner * RAD), Math.cos(SR_SPOT.outer * RAD));
    S.uCol.value.setHex(SR_SPOT.color).multiplyScalar(Math.PI);
    srSpotU.uK.value.set(SR_SPOT.spec, SR_SPOT.diffuse, SR_SPOT.rough, SR_SPOT.cap);
    if (typeof invalidate === "function") invalidate();
  }
  /* the spot on the steel's material: after everything else it does */
  function srSpot(mat, at) {
    if (!srSpotU) {
      srSpotU = { S: localLight({ pos: [0, 0, 0], at: [0, -1, 0], inner: 1, outer: 2, decay: 0 }), at: at.clone(), uK: { value: new THREE.Vector4() } };
      srSpotApply();
    }
    var S = srSpotU.S, prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : "";
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(mat, sh, r);
      sh.uniforms.spPos = S.uPos;
      sh.uniforms.spDir = S.uDir;
      sh.uniforms.spCone = S.uCone;
      sh.uniforms.spCol = S.uCol;
      sh.uniforms.spK = srSpotU.uK;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 spPos;\nuniform vec3 spDir;\nuniform vec2 spCone;\nuniform vec3 spCol;\nuniform vec4 spK;")
        .replace("#include <aomap_fragment>", [
          "{ vec3 sL = normalize(spPos - geometryPosition);",
          "  float sA = smoothstep(spCone.y, spCone.x, dot(-sL, spDir));",
          "  IncidentLight spL; spL.direction = sL; spL.color = spCol * sA; spL.visible = true;",
          "  ReflectedLight spR = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));",
          "  PhysicalMaterial spM = material; spM.roughness = max(spM.roughness, spK.z);",
          "  RE_Direct(spL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, spM, spR);",
          "  reflectedLight.directSpecular += min(spR.directSpecular * spK.x, vec3(spK.w));",
          "  reflectedLight.directDiffuse += spCol * sA * saturate(dot(geometryNormal, sL)) * diffuseColor.rgb * RECIPROCAL_PI * spK.y; }",
          "#include <aomap_fragment>"
        ].join("\n"));
    };
    mat.customProgramCacheKey = function () {
      return prevKey + "|srspot";
    };
    mat.needsUpdate = true;
  }
  async function buildSR(Loader) {
    var PZ = SR_PZ, PW = 5.2, x0 = X.sr - PW / 2, x1 = X.sr + PW / 2, y0 = 0.076, yc = 1.5;
    var Lw = X0 - WALL_L / 2;
    function uw(x) {
      return (x - Lw) / WALL_L;
    }
    /* (no bay any more: the wall itself grows paler toward the lamp, see
       PALE in buildRoom(); the lamp still hangs SR_PZ off it) */

    /* the halo */
    var HU = {
      uColor: { value: new THREE.Color(1.0, 0.9, 0.79) }, /* (0.875, 0.74: a shade whiter now, as in sr01/06) */ uGain: { value: 1 }, uSpread: { value: 0.3 },
      uHalf: { value: new THREE.Vector2(0.202, 0.302) }, uC: { value: new THREE.Vector2(X.sr, yc) }
    };
    var hx = 2.2, hz = PZ + 0.0016;
    var halo = new THREE.Mesh(
      quad([X.sr - hx, y0, hz, X.sr + hx, y0, hz, X.sr + hx, CEIL - 0.004, hz, X.sr - hx, CEIL - 0.004, hz], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]),
      new THREE.ShaderMaterial({
        uniforms: HU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: "varying vec2 vP;\nvoid main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: [
          "uniform vec3 uColor; uniform float uGain; uniform float uSpread; uniform vec2 uHalf; uniform vec2 uC; varying vec2 vP;",
          "void main(){",
          " vec2 o = max(abs(vP - uC) - uHalf, 0.0); float d = length(o);", /* metres outside the steel's outline */
          " if (d <= 0.0) discard;",
          " vec2 g = o / d;",
          " float rise = smoothstep(0.0, 0.12, d);", /* the dark band against the box */
          " float t = max(d - 0.10, 0.0) / uSpread;",
          " float fall = 1.0 / (1.0 + t * t);",
          " float c = 2.0 * g.x * g.y;",
          " float lobe = 1.0 - 0.16 * c * c;", /* a little dimmer on the diagonals */
          " float side = mix(0.82, 1.0, g.x * g.x);", /* the long sides a little stronger */
          " float edge = 1.0 - smoothstep(1.2, 1.95, d);", /* gone to nothing before the card ends */
          " gl_FragColor = vec4(uColor * uGain * rise * fall * lobe * side * edge, 1.0);",
          "}"
        ].join("\n")
      })
    );
    halo.renderOrder = 1;
    scene.add(halo);
    /* what that wash sends on to the floor and the ceiling */
    var S = localLight({ pos: [X.sr, yc, 0.5], color: 0xffe4c6, power: 0.34, decay: 2, range: 5.5 });
    var spill = [patch(S, "floor", X.sr - 4, X.sr + 4, 0, 5), patch(S, "ceil", X.sr - 3.4, X.sr + 3.4, 0, 4), patch(S, "skirt", X.sr - 3, X.sr + 3)];
    var spillCol = S.uCol.value.clone();
    /* no haze here: the wash is already a paleness on the wall, and air
       over it only muddied it */

    var g = new THREE.Group();
    g.position.set(X.sr, yc, PZ);
    scene.add(g);
    var at = new THREE.Vector3(X.sr, yc, PZ + 0.092);
    var parts = [], core = false;
    if (has("sr01")) {
      var got = await Promise.all([loadModel(Loader, "media/models/sr01.glb"), extraTex("sr01-steel-var"), extraTex("sr01-steel-alb"), extraTex("birch-ply-face")]);
      var model = prepGLB(got[0].scene, 0.0025), tVar = got[1], tAlb = got[2], tPly = got[3];
      g.add(model);
      at = emitCentre(g, at);
      /* the wall's glow coming back onto the wood, from all round */
      var GLOW_BACK = [0.62, 0.55, 0.46];
      var steel = new THREE.MeshPhysicalMaterial({
        name: "MAT-raw_steel", color: 0x8e9197, metalness: 1, roughness: 0.4, envMap: steelEnv(), envMapIntensity: 0.85,
        anisotropy: 0.5, anisotropyRotation: Math.PI / 2, normalMap: warpMap(), normalScale: new THREE.Vector2(1, 1)
      });
      if (tVar) {
        tVar.colorSpace = THREE.NoColorSpace;
        steel.roughnessMap = tVar; /* 0.3 .. 0.5 about 0.4 */
        steel.roughness = 0.8;
        steel.bumpMap = tVar;
        steel.bumpScale = 0.02; /* calmer: the photograph's sheet is quiet */
      }
      if (tAlb) {
        steel.map = tAlb;
        steel.color.setHex(0x74767b); /* darker than it was (0xb9bcc3): in sr01/06 the steel is nearly black */
      }
      tame(steel, 0.0025, 0.5);
      /* the 1 mm sheet's edges: the faces that look along the wall catch a
         thin line of light (light on an edge, not an emitter: no glow) */
      var steelPrev = steel.onBeforeCompile;
      steel.onBeforeCompile = function (sh, r) {
        if (steelPrev) steelPrev.call(steel, sh, r);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float vEdgeZ;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvEdgeZ = abs(normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz).z);");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vEdgeZ;")
          .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directSpecular += vec3(0.95, 0.9, 0.82) * 0.55 * (1.0 - smoothstep(0.25, 0.45, vEdgeZ));");
      };
      steel.customProgramCacheKey = function () {
        return "sr-steel-edge";
      };
      srSpot(steel, at); /* LR01's spot (SR_SPOT) */
      var ply = new THREE.MeshStandardMaterial({ name: "MAT-birch_ply", map: tPly || birchTexture(), color: tPly ? 0xf4ecdf : 0xe9e0d0, roughness: 0.6, envMapIntensity: 0.04 });
      if (tPly) {
        ply.map = tPly.clone();
        ply.map.wrapS = ply.map.wrapT = THREE.RepeatWrapping;
        ply.map.repeat.set(1 / 0.48, 1 / 0.29);
        ply.map.needsUpdate = true;
      }
      ply.vertexColors = true;
      tame(ply, 0.0025, 1.0, GLOW_BACK);
      var rim = new THREE.MeshStandardMaterial({ name: "MAT-birch_ply_edge", map: plies(13, 1), roughness: 0.66, envMapIntensity: 0.03 });
      tame(rim, 0.0025, 1.0, GLOW_BACK);
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var n = o.name, mn = (o.material && o.material.name) || "", m, d = 0, t0 = 0;
        if (/raw_steel/.test(mn) || /SR01-panel/.test(n)) o.material = steel;
        else if (/birch_ply_edge/.test(mn)) o.material = rim;
        else if (/birch_ply/.test(mn)) {
          o.material = ply;
          /* THE INSIDE OF THE BODY IS LIT HARD by four bands of tape a few
             centimetres away; the outside only by the wall's glow. Seen
             through the 18 mm slot, that lit inside is the razor-thin bright
             line along the steel's edge in his photographs. The faces that
             look inward (and the back board) are marked in vertex colour,
             and take four times the light. */
          var gp = o.geometry.attributes.position, gn = o.geometry.attributes.normal, col = new Float32Array(gp.count * 3);
          for (var vi = 0; vi < gp.count; vi++) {
            var inward = /SR01-back/.test(n) ? gn.getZ(vi) > 0.5 : gn.getX(vi) * gp.getX(vi) + gn.getY(vi) * gp.getY(vi) < -0.05;
            col[vi * 3] = col[vi * 3 + 1] = col[vi * 3 + 2] = inward ? 6 : 1;
          }
          o.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
        }
        /* distances are the table in media/models/sr01.md: panel 0.48,
           core_top 0.40, tiers 4..1 with their LED rings 0.34 / 0.28 / 0.22 /
           0.16, plinth 0.10 (so the tiers never hang in the air); body, edges
           and back stay on the wall. Front goes first. */
        if (/panel/.test(n)) d = 0.48;
        else if (/core_top/.test(n)) {
          d = 0.4;
          t0 = 0.1;
        } else if ((m = /(?:core_tier|led)_(\d+)/.exec(n))) {
          d = 0.1 + 0.06 * Math.min(4, +m[1]);
          t0 = 0.18 + 0.09 * (4 - Math.min(4, +m[1]));
          if (/core_tier/.test(n)) core = true;
        } else if (/core_plinth/.test(n)) {
          d = 0.1;
          t0 = 0.5;
        }
        if (d) parts.push({ o: o, z: o.position.z, d: d, t0: t0 });
      });
    } else {
      var ply0 = std(0xd6bd92, 0.7);
      tame(ply0, 0.0025, 1.0);
      var steel0 = std(0x393c40, 0.44, 1, 0.16);
      tame(steel0, 0.0025, 0.5);
      g.add(asOccluder(box(0.34, 0.52, 0.07, ply0, 0, 0, 0.035)));
      g.add(asOccluder(box(0.42, 0.6, 0.003, steel0, 0, 0, 0.112)));
      var bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 6, 16), emit(0xffdcb8, 5));
      bulb.rotation.z = Math.PI / 2;
      bulb.position.set(0.012, 0, 0.092);
      g.add(asEmitter(bulb));
    }
    /* one small real light level with the slot, for the lamp's own inside
       (its parts take a capped share of it) and a little warmth close by;
       the halo is not its doing */
    var l = new THREE.PointLight(0xffe2c2, 0.3, 0, 2);
    var lz = Math.max(at.z, PZ + 0.11);
    l.position.set(at.x, at.y, lz);
    scene.add(l);
    RIG.srHalo = HU;
    if (core) {
      by.sr.cfg.apart = true;
      by.sr.cfg.slider = "Take apart";
      by.sr.cfg.aria = "Look behind LR01, then take it apart";
      RIG.sr = function (ex) {
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          p.o.position.z = p.z + p.d * sstep(ex, p.t0, p.t0 + 0.36);
        }
        /* the steel is what throws the light back onto the wall: as it
           comes away the wash widens and thins, and the bare tape lights
           the room in front instead */
        var off = sstep(ex, 0.02, 0.5);
        HU.uGain.value = lerp(1, 0.5, off);
        HU.uSpread.value = lerp(0.3, 0.52, off);
        l.position.z = lz + 0.2 * sstep(ex, 0.2, 0.9); /* the light goes with the LEDs */
        l.intensity = lerp(0.3, 1.5, off);
        S.uCol.value.copy(spillCol).multiplyScalar(lerp(1, 1.7, off));
      };
      RIG.srParts = parts;
    }
  }

  /* ---- 04: Light Box, 2021. One piece: a square on the wall whose face is
     wood veneer lit from behind — light through veneer, years before the
     pen. ----

     THE FACE IS THE REAL ONE, BY DAY. media/extra/rooms-v2/lightbox-face-day.jpg
     is the lit veneer from a sharp frontal frame of the artist's daytime
     film: crown-cut grain, and the join between the two leaves with the tape
     that holds it showing through as darker patches. In the file the join
     runs across; on the wall he hangs it upright, so the picture is turned a
     quarter (and lightly sharpened: it is a film frame) on a canvas when it
     loads. It is the colour map and the emissive map.

     WHAT IS MODELLED IS THE OBJECT, not a glowing square:
       - the light that comes through is the photograph, deepened: late wood
         passes far less than early wood and what it passes is redder, so the
         figure is drawn dark and sharp on a saturated amber-orange;
       - the join is a bright hairline where the bare diffuser shows between
         the leaves, much whiter than the wood;
       - two lamps sit behind the face: a little fuller there, a little
         less toward the edges and corners; no more than that;
       - the veneer is lit right out to the box's edges (it used to have a
         dark 6 mm margin on the frame's rebate; the artist: no dark lines);
       - the frame is birch ply. Its sides carry the birch face, grain
         running round the box. The veneer face covers the WHOLE front, out
         to the outer edges: no rim, no dark line (the artist);
       - no cable: the box hangs over its wall socket (the artist);
       - a soft warm spill on the wall around the frame (a local light on a
         patch, so it costs the rest of the room nothing), and its light on
         the floor in front and the ceiling above (the station's one real
         light, stood off the wall where the face throws it).
     Deep and saturated, nowhere near clipping, hardly any bloom. */
  var BX = { y: 1.45, glow: 1.75 }; /* (1.4 with the daytime face; the artist: brighter) */

  function dayFace(img, noFlip, upright) {
    var S = Math.min(1400, img.naturalWidth || 1400), c = document.createElement("canvas");
    c.width = c.height = S;
    var g = c.getContext("2d");
    /* a quarter turn anticlockwise: the join stands upright, a little right
       of centre, which is how it hangs in his films of it on the wall */
    g.translate(S / 2, S / 2);
    if (!upright) g.rotate(-Math.PI / 2);
    g.drawImage(img, -S / 2, -S / 2, S, S);
    g.setTransform(1, 0, 0, 1, 0, 0);
    try {
      /* unsharp mask on the brightness, hue untouched: a box blur of 7 px
         taken away again, so the lines of the grain have edges */
      var id = g.getImageData(0, 0, S, S), d = id.data, n = S * S, R = 3, i, x, y, sum, o;
      var L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
      for (i = 0; i < n; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      for (y = 0; y < S; y++) {
        o = y * S;
        sum = 0;
        for (x = -R; x <= R; x++) sum += L[o + clamp(x, 0, S - 1)];
        for (x = 0; x < S; x++) {
          A[o + x] = sum;
          sum += L[o + Math.min(S - 1, x + R + 1)] - L[o + Math.max(0, x - R)];
        }
      }
      for (x = 0; x < S; x++) {
        sum = 0;
        for (y = -R; y <= R; y++) sum += A[clamp(y, 0, S - 1) * S + x];
        for (y = 0; y < S; y++) {
          B[y * S + x] = sum;
          sum += A[Math.min(S - 1, y + R + 1) * S + x] - A[Math.max(0, y - R) * S + x];
        }
      }
      var w = (2 * R + 1) * (2 * R + 1), K = BX.sharp == null ? 0.8 : BX.sharp;
      for (i = 0; i < n; i++) {
        var l = L[i], k = l > 2 ? clamp((l + K * (l - B[i] / w)) / l, 0.5, 1.6) : 1;
        d[i * 4] = Math.min(255, d[i * 4] * k);
        d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k);
        d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k);
      }
      g.putImageData(id, 0, 0);
    } catch (e) {}
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = !noFlip; /* glTF UVs are not flipped */
    t.anisotropy = aniso();
    return t;
  }

  async function buildBox(Loader) {
    var g = new THREE.Group();
    g.position.set(X.bx, BX.y, 0);
    scene.add(g);
    var glb = has("lightbox-wall");
    /* THE OLD FACE AGAIN (the artist: "use the old front texture, but
       brighter"): lightbox-face.jpg, cut from his film of the box on the
       wall, already upright, with the bright vertical seam between the two
       leaves. (lightbox-face-day.jpg, the daytime frame, is the fallback.) */
    var old = hasExtra("lightbox-face");
    var img = old ? await loadImage("media/extra/rooms-v2/lightbox-face.jpg") : hasExtra("lightbox-face-day") ? await loadImage("media/extra/rooms-v2/lightbox-face-day.jpg") : null;
    var tex = img ? dayFace(img, glb, old) : veneerTexture(glb);
    /* Set against his own frame of it lit by day (light-boxes/04.jpg: the
       face averages 221,150,54; its lightest tenth 247,179,66). Here, in a
       dim room and with no daylight lying on it: 219,131,35 and 250,187,71,
       the darkest tenth (the grain) deeper than by day; nothing clips.
       gam: a power per channel (what passes little light is a shade redder);
       con: the brightness of open wood, and the power by which denser wood
       is darkened further; tint: the colour of the light, set so that open
       wood lands on amber-orange AFTER the tone map, which pulls a bright
       orange toward yellow; seam: where the picture's blue says "bare
       diffuser", and how bright that is; lamp: fuller over the two lamps /
       less at the edges / less again in the corners. */
    var U = {
      bxGam: { value: new THREE.Vector3(1.0, 1.05, 1.4) },
      bxCon: { value: new THREE.Vector2(0.46, 0.6) },
      bxTint: { value: new THREE.Vector3(1.0, 0.55, 0.3) },
      bxSeam: { value: new THREE.Vector3(0.09, 0.18, 1.15) }, /* (the old face's seam is white in the file: kept warm, below clipping) */
      bxLamp: { value: new THREE.Vector3(0.1, 0.07, 0.12) }
    };
    RIG.bxU = U;
    RIG.bxFace = null;
    var face = new THREE.MeshStandardMaterial({
      /* (its own colour is kept low: what you see of this face is the light
         coming through it, not the room's light lying on it) */
      name: "EMIT_veneer_face", color: 0x4a3828, map: tex, roughness: 0.62, envMapIntensity: 0.04,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BX.glow
    });
    face.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 bxGam;\nuniform vec2 bxCon;\nuniform vec3 bxTint;\nuniform vec3 bxSeam;\nuniform vec3 bxLamp;")
        .replace(
          "#include <emissivemap_fragment>",
          "#ifdef USE_EMISSIVEMAP\n" +
            "vec2 fU = vEmissiveMapUv;\n" +
            "vec3 fT = texture2D( emissiveMap, fU ).rgb;\n" +
            /* the veneer as a filter: what passes little light passes less
               still (con: the brightness of open wood, and the power), and
               what it passes is a shade redder (gam) */
            "float fL = dot( fT, vec3( 0.3, 0.6, 0.1 ) );\n" +
            "vec3 fC = pow( fT, bxGam ) * bxTint * pow( clamp( fL / bxCon.x, 0.0, 1.6 ), bxCon.y );\n" +
            /* the join: bare diffuser between the two leaves */
            "fC = mix( fC, vec3( 1.0, 0.8, 0.52 ) * bxSeam.z, smoothstep( bxSeam.x, bxSeam.y, fT.b ) );\n" +
            /* two lamps behind it, left and right of the middle */
            "float fLamp = exp( - dot( fU - vec2( 0.3, 0.5 ), fU - vec2( 0.3, 0.5 ) ) / 0.085 ) + exp( - dot( fU - vec2( 0.7, 0.5 ), fU - vec2( 0.7, 0.5 ) ) / 0.085 );\n" +
            "vec2 fD = abs( fU - 0.5 );\n" +
            "float fE = max( fD.x, fD.y );\n" +
            "float fK = length( max( fD - 0.3, 0.0 ) ) / 0.2;\n" +
            "fC *= ( 1.0 - bxLamp.x + bxLamp.x * min( fLamp, 1.0 ) ) * ( 1.0 - bxLamp.y * smoothstep( 0.22, 0.5, fE ) ) * ( 1.0 - bxLamp.z * fK * fK );\n" +
            /* (no dark margin any more: the veneer runs out to the box's
               outer edges and is lit to them; the artist: "no dark lines") */
            "totalEmissiveRadiance *= fC;\n" +
            "#endif\n"
        )
        .replace(
          "#include <lights_fragment_end>",
          "#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 0.25;\nreflectedLight.directSpecular *= 0.0;\n"
        );
    };
    face.customProgramCacheKey = function () {
      return "veneerface";
    };
    RIG.bxFace = face;
    /* a face this size must not stack its own glow on itself: a small share */
    glowDim.push({ m: face, k: 0.06 });
    if (glb) {
      var model = prepGLB((await loadModel(Loader, "media/models/lightbox-wall.glb")).scene, 0.02);
      /* the frame: birch on its sides (grain round the box), the plies on
         the front rim. One mesh in the file; its triangles are sorted into
         the two by where they lie and given UVs in metres. */
      var ply = new THREE.MeshStandardMaterial({ name: "MAT-birch_ply", map: birchTexture(), color: 0xe9e0d0, roughness: 0.6, envMapIntensity: 0.05 });
      tame(ply, 0.6, 0.8);
      var cut = new THREE.MeshStandardMaterial({ name: "MAT-birch_ply_edge", map: plyEdgeTexture(1), color: 0xd8cdbb, roughness: 0.7, envMapIntensity: 0.03 });
      tame(cut, 0.25, 0.7); /* the rim is in the plane of the face: the face does not light it */
      var faceMesh = null, frameMesh = null;
      model.traverse(function (o) {
        if (!o.isMesh) return;
        if (/face/.test(o.name)) {
          o.material = face;
          faceMesh = o;
        }
        /* the photograph already carries the join between the two leaves */
        else if (/seam/.test(o.name)) o.visible = false;
        else if (/frame/.test(o.name)) {
          var geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          var p = geo.attributes.position, uv = new Float32Array(p.count * 2), fa = [], ed = [];
          var a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), k, j;
          for (k = 0; k < p.count; k += 3) {
            a.fromBufferAttribute(p, k);
            b.fromBufferAttribute(p, k + 1);
            c.fromBufferAttribute(p, k + 2);
            var nz = Math.min(a.z, b.z, c.z);
            b.sub(a);
            c.sub(a);
            b.cross(c).normalize();
            var rim = b.z > 0.9 && nz > 0.0995;
            for (j = 0; j < 3; j++) {
              var x = p.getX(k + j), y = p.getY(k + j), z = p.getZ(k + j), e = (k + j) * 2;
              if (rim) {
                /* v: across the 18 mm of the board, of which 6 show */
                uv[e] = Math.abs(x) > Math.abs(y) ? y : x;
                uv[e + 1] = (0.3 - Math.max(Math.abs(x), Math.abs(y))) / 0.018;
              } else if (Math.abs(b.x) > 0.5) {
                uv[e] = z + 0.31;
                uv[e + 1] = y;
              } else if (Math.abs(b.y) > 0.5) {
                uv[e] = z + 0.57;
                uv[e + 1] = x + 0.4;
              } else {
                uv[e] = x;
                uv[e + 1] = y;
              }
            }
            (rim ? ed : fa).push(k, k + 1, k + 2);
          }
          geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          /* THE WHOLE FRONT IS VENEER (the artist: "the entire front is
             veneer, no dark lines on the sides are visible"): the rim of
             plies in the plane of the face is not drawn; the face runs out
             over it to the box's outer edges (below). The sides stay birch. */
          geo.setIndex(fa);
          geo.clearGroups();
          geo.addGroup(0, fa.length, 0);
          o.geometry = geo;
          o.material = [ply, cut];
          frameMesh = o;
        }
      });
      g.add(model);
      if (faceMesh && frameMesh) {
        /* The face keeps its own geometry and UVs (texture, seam, brightness
           as they were); its vertices are scaled out, about its centre and
           by the same factor across and up (the box is square, so the grain
           is not stretched one way), to the frame's outer edges, and stood
           0.4 mm in front of the frame's front plane. */
        g.updateMatrixWorld(true);
        var ob = new THREE.Box3().setFromObject(frameMesh), fb = new THREE.Box3().setFromObject(faceMesh);
        var oc = ob.getCenter(V3(0, 0, 0)), fc = fb.getCenter(V3(0, 0, 0));
        var sx = (ob.max.x - ob.min.x) / Math.max(1e-4, fb.max.x - fb.min.x);
        var sy2 = (ob.max.y - ob.min.y) / Math.max(1e-4, fb.max.y - fb.min.y);
        var fg = faceMesh.geometry.clone(), fp = fg.attributes.position, mw = faceMesh.matrixWorld, inv = mw.clone().invert();
        var fzMax = fb.max.z, v = V3(0, 0, 0);
        for (var fi = 0; fi < fp.count; fi++) {
          v.fromBufferAttribute(fp, fi).applyMatrix4(mw);
          v.x = oc.x + (v.x - fc.x) * sx;
          v.y = oc.y + (v.y - fc.y) * sy2;
          v.z = ob.max.z - (fzMax - v.z); /* (was 0.4 mm proud; see below) */
          v.applyMatrix4(inv);
          fp.setXYZ(fi, v.x, v.y, v.z);
        }
        fp.needsUpdate = true;
        /* ONLY ITS FRONT. The face in the file is a 4 mm slab whose four
           edges carry the top row of the picture stretched along them (the
           seam a white fleck half-way up each side) and glow: seen from the
           side (the walk round it) that was a lit line and a white dot down
           the box's front edges. Its back and edges go; the front stands in
           the frame's front plane, so the sides meet it with no gap. */
        if (fg.index) {
          var fn = fg.attributes.normal, fk = [], fx0 = fg.index.array;
          for (var ft = 0; ft < fx0.length; ft += 3) if (fn.getZ(fx0[ft]) > 0.5) fk.push(fx0[ft], fx0[ft + 1], fx0[ft + 2]);
          fg.setIndex(fk);
        }
        fg.computeBoundingBox();
        fg.computeBoundingSphere();
        faceMesh.geometry = fg;
        RIG.bxFit = { outer: [+(ob.max.x - ob.min.x).toFixed(4), +(ob.max.y - ob.min.y).toFixed(4)], face: [+(fb.max.x - fb.min.x).toFixed(4), +(fb.max.y - fb.min.y).toFixed(4)], scale: [+sx.toFixed(4), +sy2.toFixed(4)] };
      }
    } else {
      var ply0 = std(0xc9ae84, 0.7);
      tame(ply0, 0.02, 0.9);
      g.add(asOccluder(box(0.6, 0.6, 0.098, ply0, 0, 0, 0.049)));
      var f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), face); /* the whole front */
      f.position.z = 0.0985;
      g.add(asEmitter(f));
    }

    /* NO CABLE (the artist: "it's mounted on top of a socket so we do not
       need it"): the box hangs over its wall socket, which it hides. */

    /* where its back meets the wall: a soft occlusion line round the frame
       (seen from the side as the camera walks round it); desktop only, like
       every contact shadow */
    contact(V3(X.bx, BX.y, 0.0046), V3(0, 0, 1), V3(1, 0, 0), V3(0, 1, 0), 0.42, 0.42, { round: 0.01, ba: 0.3, bb: 0.3, core: 0.4, coreR: 0.025, soft: 0.14, softR: 0.07 });

    /* The whole face is the source and it faces the room, so its light is
       stood well off the wall: floor and ceiling take it. */
    var l = new THREE.PointLight(0xff8c38, 1.4, 0, 2); /* (1.15 before the face was brightened) */
    l.position.set(X.bx, 1.35, 1.25);
    scene.add(l);
    /* ...and what comes back off the room and off the box's own edges lies
       on the wall round the frame as a soft warm spill, nearest the frame and
       gone within a metre and a half */
    var S = localLight({ pos: [X.bx, BX.y, 0.46], color: 0xff8a32, power: 0.42, decay: 2, range: 3.6 }); /* (0.34 before the face was brightened) */
    patch(S, "wall", X.bx - 3.2, X.bx + 3.2, 0, CEIL);
    patch(S, "skirt", X.bx - 3.2, X.bx + 3.2);
  }

  /* ---- 05: Bulb Studies. Hand-sized, ON A WINDOWSILL: a window is cut into
     the gallery wall here, as in his own photograph of the two of them
     (bulb-studies/05.jpg: sill, greenery outside, radiator below). An oak
     block with a bare globe stands on the sill; the wire man sits on its
     front edge with his legs hanging down in front of the wall. The only
     things that emit are the two filaments; their light fills the recess. ---- */
  var focusStand = null, manAt = null;

  /* THE BLOCK IS THE REAL WOOD. media/extra/rooms-v2/oak-block-face.jpg is
     the block's front face rectified from the artist's photograph
     (bulb-studies/01.jpg): pale grey-beige weathered timber, fine straight
     grain, a long knot near the top with a hairline crack under it, worm
     holes. It is laid out here to the model's UV layout (the four sides are
     one strip along the bottom third of the image: front, right, back, left;
     the end grain of the top lies above it):
       - the photograph is lit from above and taken by lamplight, so each
         row is first brought to the same, pale, mean brightness: the
         texture carries wood, not lighting, and keeps its grey-beige;
       - the front is the face as it is;
       - the knot is not repeated: the other three sides are made from its
         knot-free right half and that half's mirror image, from slightly
         different columns and one of them turned over, so each is a
         different face of the same piece, grain upright on all of them;
       - the top is end grain in the same colours, a little darker and more
         open: tight growth-ring arcs and pores.
     The same canvas is the bump map, so grain, crack and knot catch the
     bulb's raking light. Until the photograph has loaded it is a flat tone. */
  var oakTex = null;
  function oakTexture() {
    if (oakTex) return oakTex;
    var S = 2048, c = document.createElement("canvas");
    c.width = c.height = S;
    var g = c.getContext("2d");
    g.fillStyle = "#a8957a";
    g.fillRect(0, 0, S, S);
    oakTex = new THREE.CanvasTexture(c);
    oakTex.colorSpace = THREE.SRGBColorSpace;
    oakTex.flipY = false;
    oakTex.wrapS = oakTex.wrapT = THREE.RepeatWrapping;
    oakTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight, x, y, i;
      var f = document.createElement("canvas");
      f.width = w;
      f.height = h;
      var fg = f.getContext("2d");
      fg.drawImage(img, 0, 0);
      var id = fg.getImageData(0, 0, w, h), d = id.data;
      /* even out the light from above: every row to the same mean */
      var row = new Float32Array(h), all = 0, mr = 0, mg = 0, mb = 0;
      for (y = 0; y < h; y++) {
        var sum = 0;
        for (x = 0; x < w; x += 4) {
          i = (y * w + x) * 4;
          sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        }
        row[y] = sum / (w / 4);
        all += row[y];
      }
      all /= h;
      for (y = 0; y < h; y++) {
        var a = 0, n = 0;
        for (var k = -70; k <= 70; k += 5) {
          if (y + k >= 0 && y + k < h) {
            a += row[y + k];
            n++;
          }
        }
        /* ...and that mean is the timber's own pale tone, not the dim
           exposure of a photograph taken by lamplight */
        var gain = clamp(172 / (a / n), 0.6, 2.6);
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          d[i] = Math.min(255, d[i] * gain);
          d[i + 1] = Math.min(255, d[i + 1] * gain);
          d[i + 2] = Math.min(255, d[i + 2] * gain);
        }
      }
      for (i = 0; i < d.length; i += 4 * 97) {
        mr += d[i];
        mg += d[i + 1];
        mb += d[i + 2];
      }
      var cnt = Math.ceil(d.length / (4 * 97));
      mr /= cnt;
      mg /= cnt;
      mb /= cnt;
      fg.putImageData(id, 0, 0);

      var y0 = Math.round(S * 0.675), sh = S - y0;
      /* end grain: the top, and whatever else lies above the strip */
      g.fillStyle = "rgb(" + (mr * 0.84 | 0) + "," + (mg * 0.82 | 0) + "," + (mb * 0.78 | 0) + ")";
      g.fillRect(0, 0, S, y0);
      for (i = 0; i < 230; i++) {
        g.strokeStyle = "rgba(" + (mr * 0.5 | 0) + "," + (mg * 0.46 | 0) + "," + (mb * 0.4 | 0) + "," + (0.18 + hash(i + 3) * 0.3) + ")";
        g.lineWidth = 1.2 + hash(i + 9) * 3;
        g.beginPath();
        g.arc(S * 0.3, y0 + S * 0.5, S * 0.52 + i * 6.2 + hash(i) * 5, Math.PI, Math.PI * 2);
        g.stroke();
      }
      for (i = 0; i < 2600; i++) { /* open pores */
        g.fillStyle = "rgba(" + (mr * 0.4 | 0) + "," + (mg * 0.36 | 0) + "," + (mb * 0.3 | 0) + "," + (0.2 + hash(i * 1.3) * 0.4) + ")";
        g.fillRect(hash(i * 2.7 + 1) * S, hash(i * 5.3 + 2) * y0, 1.5 + hash(i) * 2.5, 1.5 + hash(i + 5) * 2);
      }
      /* THE FOUR SIDES ARE FOUR QUARTERS OF THE STRIP (the file's own layout:
         they begin at u = 0, 0.25, 0.5 and 0.75). They used to be drawn
         0.2375 wide each, so the back showed a sliver of the next side and
         the left side ended in a band of bare fill: the "weird" face. */
      var qw = S / 4;
      /* front: the photographed face, as it is */
      g.drawImage(f, 0, 0, w, h, 0, y0, qw, sh);
      /* the other three: the knot-free right part of the same face, NEVER
         MIRRORED (a strip beside its own mirror image meets in a butterfly
         down the middle of the side). One strip fills the left half of a
         side; the same timber turned end for end fills the right half; the
         two are cross-faded over the middle, so there is no join. Nothing is
         stretched: 47 % of the face's width fills half a side, and the grain
         stands upright on all four. */
      var tmp = document.createElement("canvas");
      tmp.width = qw;
      tmp.height = sh;
      var tg = tmp.getContext("2d");
      function side(k, fromA, fromB, flipA) {
        var hw = qw / 2, band = qw * 0.055;
        function strip(from, vflip, x, wid) {
          tg.save();
          if (vflip) {
            tg.translate(0, sh);
            tg.scale(1, -1);
          }
          tg.drawImage(f, w * from, 0, (w * 0.47 * wid) / hw, h, x, 0, wid, sh);
          tg.restore();
        }
        tg.globalCompositeOperation = "source-over";
        tg.clearRect(0, 0, qw, sh);
        strip(fromB, !flipA, hw - band, hw + band);
        tg.globalCompositeOperation = "destination-in";
        var gr = tg.createLinearGradient(hw - band, 0, hw + band, 0);
        gr.addColorStop(0, "rgba(0,0,0,0)");
        gr.addColorStop(1, "#000");
        tg.fillStyle = gr;
        tg.fillRect(0, 0, qw, sh);
        tg.globalCompositeOperation = "destination-over";
        strip(fromA, flipA, 0, hw + band);
        tg.globalCompositeOperation = "source-over";
        g.drawImage(tmp, k * qw, y0);
      }
      side(1, 0.462, 0.47, false);
      side(2, 0.47, 0.458, true);
      side(3, 0.455, 0.468, false);
      oakTex.needsUpdate = true;
      invalidate();
    };
    if (hasExtra("oak-block-face")) img.src = "media/extra/rooms-v2/oak-block-face.jpg";
    return oakTex;
  }

  /* the sill: one board of warm oak, grain along its length */
  function sillTexture() {
    var W = 1024, H = 256, c = document.createElement("canvas"), i, y, d;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = "#b48b5d";
    g.fillRect(0, 0, W, H);
    for (i = 0; i < 16; i++) { /* broad soft bands: the figure of the board */
      y = hash(i * 3.3 + 1) * H;
      var hh = 12 + hash(i * 1.7) * 46, lg = g.createLinearGradient(0, y - hh, 0, y + hh);
      var col = hash(i * 5.1) > 0.5 ? "118,82,46" : "230,196,146";
      lg.addColorStop(0, "rgba(" + col + ",0)");
      lg.addColorStop(0.5, "rgba(" + col + "," + (0.07 + hash(i) * 0.11) + ")");
      lg.addColorStop(1, "rgba(" + col + ",0)");
      g.fillStyle = lg;
      g.fillRect(0, y - hh, W, hh * 2);
    }
    for (i = 0; i < 560; i++) {
      y = hash(i * 1.9 + 1) * H;
      d = (hash(i * 3.7) - 0.5) * 9;
      g.strokeStyle = "rgba(" + (102 + hash(i) * 30 | 0) + "," + (70 + hash(i + 4) * 22 | 0) + ",40," + (0.03 + hash(i * 2.3) * 0.09) + ")";
      g.lineWidth = 0.6 + hash(i * 6.1) * 1.5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.33, y + d, W * 0.66, y - d, W, y + d * 0.4);
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 1.7, 1 / 0.42); /* UVs are metres */
    t.anisotropy = aniso();
    return t;
  }

  /* THE NIGHT OUTSIDE THE WINDOW AT 05 (the artist: "make the window ...
     wayy more realistic"). Not a picture but layers at their own distances
     behind the glass, so they slide against each other as the camera walks
     and as you drag: the sky, far off; a row of houses and the trees in
     front of them across the gardens; nearer, darker trees; and right
     outside, a few twigs whose leaves catch a little of the room's light.
     All dark and quiet: the bulbs are the subject. Under the desktop's depth
     of field they are all out of focus. ?room=white (evening) has a dusk sky
     instead of night. Canvas-drawn, small: nothing to download. */
  function nightSky(dusk) {
    /* a vertical gradient for a plane from y = -6 to 24 (world metres);
       the horizon at y = 0.6 */
    var H = 512, c = document.createElement("canvas");
    c.width = 4;
    c.height = H;
    var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, H);
    function at(y) {
      return clamp(1 - (y + 6) / 30, 0, 1);
    }
    var S = dusk
      ? [[24, "#0e1e4a"], [9, "#1f3a7a"], [5, "#3a5596"], [3, "#6a76a6"], [1.6, "#a38a96"], [0.9, "#c99878"], [0.6, "#a07454"], [0.45, "#0e0e0d"], [-6, "#060606"]]
      : [[24, "#050c24"], [9, "#0d1c44"], [5, "#1a2d5c"], [3, "#2a3c6c"], [1.6, "#4a4a6a"], [0.9, "#6e5a5c"], [0.6, "#7a5a44"], [0.45, "#0c0c0c"], [-6, "#050505"]];
    S.forEach(function (s) {
      gr.addColorStop(at(s[0]), s[1]);
    });
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, H);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  /* a band of tree crowns (and, behind them if `houses`, a row of houses
     with a few lit windows), as a silhouette with soft, leafy edges; the
     picture repeats along x */
  function treeBand(seed, col, top, amp, houses, warm) {
    var W = 1024, H = 256, c = document.createElement("canvas"), x, i;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    if (houses) {
      for (i = 0; i < 5; i++) {
        var hx = (i + 0.15 + hash(seed + i) * 0.5) * W / 5, hw = 90 + hash(seed * 3 + i) * 70, hh = 60 + hash(seed * 7 + i) * 70;
        g.fillStyle = houses;
        g.fillRect(hx, H - hh, hw, hh);
        g.beginPath(); /* the roof */
        g.moveTo(hx - 6, H - hh);
        g.lineTo(hx + hw / 2, H - hh - 26 - hash(i * 5.1 + seed) * 20);
        g.lineTo(hx + hw + 6, H - hh);
        g.fill();
        for (var k = 0; k < 6; k++) {
          if (hash(seed * 11 + i * 7 + k) > 0.3) continue; /* most windows dark */
          var wx = hx + 10 + hash(i * 13 + k) * (hw - 26), wy = H - hh + 12 + hash(i * 17 + k * 3) * (hh - 34);
          var wg = g.createRadialGradient(wx + 5, wy + 6, 0, wx + 5, wy + 6, 16);
          wg.addColorStop(0, "rgba(255,170,90,0.35)");
          wg.addColorStop(1, "rgba(255,170,90,0)");
          g.fillStyle = wg;
          g.fillRect(wx - 12, wy - 12, 34, 36);
          g.fillStyle = warm;
          g.fillRect(wx, wy, 10, 12);
        }
      }
    }
    if (!col) {
      var th = new THREE.CanvasTexture(c);
      th.colorSpace = THREE.SRGBColorSpace;
      th.wrapS = THREE.RepeatWrapping;
      return th;
    }
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (x = 0; x <= W; x += 4) {
      var p = (x / W) * Math.PI * 2;
      var y = H * top - amp * (Math.sin(p * 2 + seed) * 0.45 + Math.sin(p * 5 + seed * 2.3) * 0.3 + Math.sin(p * 11 + seed * 0.7) * 0.15 + Math.max(0, Math.sin(p * 3 + seed * 1.7)) * 0.5);
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    for (i = 0; i < 260; i++) { /* leafy crowns: blobs along the top edge */
      var bx = hash(seed * 5 + i * 1.7) * W, pb = (bx / W) * Math.PI * 2;
      var by = H * top - amp * (Math.sin(pb * 2 + seed) * 0.45 + Math.sin(pb * 5 + seed * 2.3) * 0.3 + Math.sin(pb * 11 + seed * 0.7) * 0.15 + Math.max(0, Math.sin(pb * 3 + seed * 1.7)) * 0.5);
      var r = 4 + hash(seed + i * 3.3) * 12;
      g.beginPath();
      g.arc(bx, by + (hash(i * 2.2 + seed) - 0.3) * 14, r, 0, Math.PI * 2);
      g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = aniso();
    return t;
  }
  /* single trees, standing on the bottom edge of the picture: a trunk and
     a crown of leafy blobs; `open` keeps the middle of the picture clear
     (the part seen straight through the window) */
  function treeClumps(seed, col, n, open) {
    var W = 1024, H = 512, c = document.createElement("canvas"), i, j;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = g.strokeStyle = col;
    for (i = 0; i < n; i++) {
      var cx = (i + 0.2 + hash(seed + i * 1.3) * 0.6) * W / n;
      if (open && Math.abs(cx / W - 0.5) < open) continue;
      var R = H * (0.1 + hash(seed * 2 + i) * 0.1), cy = H * (0.42 + hash(seed * 3 + i) * 0.3);
      g.filter = "blur(1px)";
      g.lineWidth = 2 + R * 0.04;
      g.beginPath();
      g.moveTo(cx, H);
      g.quadraticCurveTo(cx + (hash(i + seed * 4) - 0.5) * 30, (H + cy) / 2, cx + (hash(i * 3 + seed) - 0.5) * 20, cy);
      g.stroke();
      for (j = 0; j < 5; j++) { /* boughs */
        var ba = -Math.PI / 2 + (hash(i * 7 + j + seed) - 0.5) * 2.4, bl = R * (0.5 + hash(i * 11 + j) * 0.5);
        g.lineWidth = 1 + R * 0.015;
        g.beginPath();
        g.moveTo(cx, cy + R * 0.3);
        g.lineTo(cx + Math.cos(ba) * bl, cy + R * 0.3 + Math.sin(ba) * bl);
        g.stroke();
      }
      /* the crown: many small clusters, thinner towards the edge, so the
         sky shows through it in places */
      for (j = 0; j < 420; j++) {
        var a = hash(seed * 7 + i * 31 + j) * Math.PI * 2, d = Math.pow(hash(seed * 9 + i * 17 + j * 3), 0.7) * R;
        if (d > R * 0.75 && hash(j * 1.3 + i) > 0.6) continue;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, 2 + hash(i * 5 + j * 7 + seed) * R * 0.1, 1.5 + hash(i * 3 + j * 5 + seed) * R * 0.07, hash(j + i) * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.filter = "none";
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = aniso();
    return t;
  }
  /* the ground outside, seen from above: dark grass, and the window's own
     light lying on it, warm and soft, just outside */
  function nightGround(dusk) {
    var W = 256, H = 512, c = document.createElement("canvas"), i;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    var gg = g.createLinearGradient(0, 0, 0, H); /* the lawn, a little lighter far off where the sky glow lies on it */
    gg.addColorStop(0, dusk ? "#363e40" : "#283036");
    gg.addColorStop(1, dusk ? "#252b23" : "#1c221b");
    g.fillStyle = gg;
    g.fillRect(0, 0, W, H);
    for (i = 0; i < 9; i++) { /* darker beds and shrubs */
      g.fillStyle = "rgba(0,0,0," + (0.3 + hash(i * 4.1) * 0.4) + ")";
      g.beginPath();
      g.ellipse(hash(i * 2.3 + 1) * W, H * (0.1 + hash(i * 3.7) * 0.6), 12 + hash(i) * 30, 6 + hash(i * 1.9) * 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (i = 0; i < 1400; i++) {
      g.fillStyle = "rgba(" + (hash(i) > 0.5 ? "34,42,28" : "0,0,0") + "," + (0.3 + hash(i * 3.3) * 0.4) + ")";
      g.fillRect(hash(i * 1.7) * W, hash(i * 2.9) * H, 1 + hash(i * 5.1) * 3, 1 + hash(i * 7.3) * 2);
    }
    /* the light from the window: the bottom of the picture is the wall's
       foot (the plane is laid flat, its far end away from the room); a soft
       trapezoid, the width of the window, fanning out */
    var lg = g.createLinearGradient(0, H, 0, H * 0.7);
    lg.addColorStop(0, "rgba(190,128,66,0.85)");
    lg.addColorStop(1, "rgba(190,128,66,0)");
    g.save();
    g.beginPath();
    g.moveTo(W * 0.46, H);
    g.lineTo(W * 0.54, H);
    g.lineTo(W * 0.66, H * 0.7);
    g.lineTo(W * 0.34, H * 0.7);
    g.closePath();
    g.filter = "blur(6px)";
    g.fillStyle = lg;
    g.fill();
    g.restore();
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso();
    return t;
  }
  /* the shrubs under the window: low leafy masses whose upper leaves
     catch the light falling out of the window */
  function shrubs() {
    var W = 1024, H = 256, c = document.createElement("canvas"), i;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    g.filter = "blur(2.5px)"; /* out of focus even where there is no depth of field (phones) */
    for (i = 0; i < 2600; i++) {
      var x = hash(i * 1.37 + 5) * W, top = H * (0.25 + 0.2 * Math.sin(x * 0.012) + 0.1 * Math.sin(x * 0.041 + 2));
      var y = top + Math.pow(hash(i * 2.71 + 3), 0.8) * (H - top);
      var nearTop = (y - top) / (H - top) < 0.18, lit = nearTop && hash(i * 7.1) > 0.45 && Math.abs(x / W - 0.5) < 0.28;
      g.fillStyle = lit ? (hash(i * 3.3) > 0.5 ? "#6a4826" : "#4a3620") : ["#07100b", "#0a160e", "#0d1c12"][Math.floor(hash(i * 4.4) * 3)];
      g.beginPath();
      g.ellipse(x, y, 3 + hash(i * 5.5) * 5, 2 + hash(i * 6.6) * 3, hash(i) * 3, 0, Math.PI * 2);
      g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso();
    return t;
  }
  /* right outside the glass: twigs coming in from above and from the
     sides, leaving the middle open; a few leaves turned to the window
     catch a little warm light from the room */
  function nearTwigs() {
    var W = 1024, H = 768, c = document.createElement("canvas"), i, j;
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    var greens = ["#08100c", "#0c1a12", "#122318", "#18301f"];
    function leaf(x, y, len, ang, col) {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.45, -len * 0.34, len, 0);
      g.quadraticCurveTo(len * 0.45, len * 0.34, 0, 0);
      g.fill();
      g.restore();
    }
    var twigs = [];
    for (i = 0; i < 70; i++) {
      var sx = hash(i * 3.1 + 1), sy = Math.pow(hash(i * 5.3 + 2), 1.6) * 0.8 - 0.04;
      var ex = sx + (hash(i * 7.7 + 3) - 0.5) * 0.2, ey = sy + 0.05 + hash(i * 2.9 + 4) * 0.14;
      var mxx = (sx + ex) / 2 - 0.5, myy = (sy + ey) / 2 - 0.55;
      if ((mxx * mxx) / (0.2 * 0.2) + (myy * myy) / (0.3 * 0.3) < 1) continue; /* the open middle */
      if (sx < 0.45 && hash(i * 9.9) > 0.5) continue;
      twigs.push([sx, sy, ex, ey]);
    }
    twigs.forEach(function (tw, n) {
      var x0 = tw[0] * W, y0 = tw[1] * H, x1 = tw[2] * W, y1 = tw[3] * H;
      var mx = (x0 + x1) / 2 + (hash(n * 9.1) - 0.5) * 30, my = (y0 + y1) / 2 + 8 + hash(n * 4.7) * 14;
      g.strokeStyle = "#050a08";
      g.lineWidth = 1 + hash(n * 2.3) * 1.4;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(mx, my, x1, y1);
      g.stroke();
      var cnt = 4 + Math.floor(hash(n * 6.3) * 5);
      for (j = 1; j <= cnt; j++) {
        var t = j / cnt, u = 1 - t;
        var px = u * u * x0 + 2 * u * t * mx + t * t * x1, py = u * u * y0 + 2 * u * t * my + t * t * y1;
        var ang = Math.atan2(2 * u * (my - y0) + 2 * t * (y1 - my), 2 * u * (mx - x0) + 2 * t * (x1 - mx));
        for (var s = -1; s <= 1; s += 2) {
          var lit = hash(n * 17 + j * 3 + s * 5) > 0.8;
          leaf(px, py, 9 + hash(n * 31 + j * 7 + s) * 9, ang + s * (0.5 + hash(n + j * 5 + s) * 0.8) + 0.25, lit ? "#6e4c2a" : greens[Math.floor(hash(n * 13 + j + s * 3) * greens.length)]);
        }
      }
    });
    var tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = aniso();
    return tx;
  }

  /* the sill's nose: its profile (rounded where a hand would rest) swept
     along x. UVs in metres, in step with the sill's top inside the recess. */
  function noseGeometry(x0, x1, top, th, out, r) {
    var pts = [], i, a;
    pts.push([0, top, 0, 1]);
    for (i = 0; i <= 5; i++) {
      a = (Math.PI / 2) * (1 - i / 5);
      pts.push([out - r + r * Math.cos(a), top - r + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    for (i = 0; i <= 5; i++) {
      a = -(Math.PI / 2) * (i / 5);
      pts.push([out - r + r * Math.cos(a), top - th + r + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    pts.push([0, top - th, 0, -1]);
    var pos = [], nor = [], uv = [], idx = [], len = 0, n = pts.length, k;
    for (i = 0; i < n; i++) {
      if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pos.push(x0, pts[i][1], pts[i][0], x1, pts[i][1], pts[i][0]);
      nor.push(0, pts[i][3], pts[i][2], 0, pts[i][3], pts[i][2]);
      uv.push(x0, -len, x1, -len);
    }
    for (i = 0; i < n - 1; i++) {
      k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    /* the two ends */
    [x0, x1].forEach(function (x, e) {
      var b = pos.length / 3;
      for (i = 0; i < n; i++) {
        pos.push(x, pts[i][1], pts[i][0]);
        nor.push(e ? 1 : -1, 0, 0);
        uv.push(pts[i][0] + 0.3, pts[i][1]);
      }
      for (i = 1; i < n - 1; i++) e ? idx.push(b, b + i, b + i + 1) : idx.push(b, b + i + 1, b + i);
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  /* a round cable along a cubic curve, laid again whenever its ends move */
  function bezTube(mat, NS, NR, r) {
    var n = (NS + 1) * NR, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = [], s, k;
    for (s = 0; s < NS; s++)
      for (k = 0; k < NR; k++) {
        var a0 = s * NR + k, a1 = s * NR + ((k + 1) % NR);
        idx.push(a0, a1, a0 + NR, a1, a1 + NR, a0 + NR);
      }
    var geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    var pt = V3(0, 0, 0), tg = V3(0, 0, 0), nn = V3(0, 0, 0), bn = V3(0, 0, 0), UP = V3(0, 1, 0), SD = V3(1, 0, 0);
    mesh.userData.lay = function (q0, q1, q2, q3) {
      for (s = 0; s <= NS; s++) {
        var t = s / NS, u = 1 - t;
        var b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
        pt.set(
          b0 * q0.x + b1 * q1.x + b2 * q2.x + b3 * q3.x,
          b0 * q0.y + b1 * q1.y + b2 * q2.y + b3 * q3.y,
          b0 * q0.z + b1 * q1.z + b2 * q2.z + b3 * q3.z
        );
        var d0 = 3 * u * u, d1 = 6 * u * t, d2 = 3 * t * t;
        tg.set(
          d0 * (q1.x - q0.x) + d1 * (q2.x - q1.x) + d2 * (q3.x - q2.x),
          d0 * (q1.y - q0.y) + d1 * (q2.y - q1.y) + d2 * (q3.y - q2.y),
          d0 * (q1.z - q0.z) + d1 * (q2.z - q1.z) + d2 * (q3.z - q2.z)
        ).normalize();
        nn.crossVectors(tg, Math.abs(tg.y) > 0.93 ? SD : UP).normalize();
        bn.crossVectors(tg, nn);
        for (k = 0; k < NR; k++) {
          var an = (k / NR) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
          var nx = ca * nn.x + sa * bn.x, ny = ca * nn.y + sa * bn.y, nz = ca * nn.z + sa * bn.z, e = (s * NR + k) * 3;
          pos[e] = pt.x + nx * r;
          pos[e + 1] = pt.y + ny * r;
          pos[e + 2] = pt.z + nz * r;
          nor[e] = nx;
          nor[e + 1] = ny;
          nor[e + 2] = nz;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
    };
    return mesh;
  }

  async function buildBulbs(Loader) {
    var MAN = {};
    try {
      MAN = JSON.parse(root.getAttribute("data-man") || "{}") || {};
    } catch (e) {}
    /* E comes from the modeller's notes by way of the generator */
    var SEAT_E = MAN.E || parseFloat(root.getAttribute("data-seat-e")) || 0.21;
    var SILL = WIN.y0, HEAD = WIN.y1, NOSE = WIN.nose, TH = WIN.t, xa = X.bs - WIN.w / 2, xb = X.bs + WIN.w / 2;
    /* HOW DEEP THE RECESS IS follows from him: he leans back into it, and the
       furthest thing back is the lampholder at the back of his head (the
       file's own bounds, by way of the generator). The glass stands 75 mm
       behind that at rest, so the frame's bars (30 mm proud of the glass)
       clear it when his head moves and the cable has room to turn. */
    var back = MAN.box ? -MAN.box.min[2] : 0.07;
    var D = Math.max(0.3, Math.ceil((SEAT_E - NOSE + back + 0.075) * 100) / 100);
    WIN.d = D;

    var niche = new THREE.Group();
    scene.add(niche);
    function face(p, n, uv, mat) {
      var m = new THREE.Mesh(quad(p, n, uv), mat);
      niche.add(m);
      return m;
    }
    /* THE REVEAL: the wall's own plaster carried round the corner into the
       opening, in register with the wall (same texture coordinates, running
       on into the depth). Cheeks, head and sill are also BLOCKERS: see
       draw(). From along the wall the filaments are behind the cheek, and
       their glow must not shine through it. */
    var revMat = wallMat.clone();
    tame(revMat, 0.75, 1.2); /* a bare bulb a forearm away */
    var Lw = X0 - WALL_L / 2;
    function uw(x) {
      return (x - Lw) / WALL_L;
    }
    function vw(y) {
      return y / CEIL;
    }
    asBlocker(face([xa, SILL, 0, xa, SILL, -D, xa, HEAD, -D, xa, HEAD, 0], [1, 0, 0],
      [uw(xa), vw(SILL), uw(xa - D), vw(SILL), uw(xa - D), vw(HEAD), uw(xa), vw(HEAD)], revMat));
    asBlocker(face([xb, SILL, -D, xb, SILL, 0, xb, HEAD, 0, xb, HEAD, -D], [-1, 0, 0],
      [uw(xb + D), vw(SILL), uw(xb), vw(SILL), uw(xb), vw(HEAD), uw(xb + D), vw(HEAD)], revMat));
    asBlocker(face([xa, HEAD, 0, xa, HEAD, -D, xb, HEAD, -D, xb, HEAD, 0], [0, -1, 0],
      [uw(xa), vw(HEAD), uw(xa), vw(HEAD + D), uw(xb), vw(HEAD + D), uw(xb), vw(HEAD)], revMat));

    /* THE SILL: timber, 45 mm, its top the seat. Inside the recess it is as
       wide as the opening; its nose stands 30 mm proud of the wall (the wall
       under it is then 30 mm behind the seat's edge, which is what the
       figure's knees were modelled for) and runs a little past the opening
       on either side. */
    /* A REAL BOARD: media/extra/rooms-v2/oak-sill.jpg is straight-grained
       oak made from the artist's own photograph (bulb-studies/01.jpg): the
       grain is the knot-free half of the oak block's face, laid along the
       board strip over strip so it runs unbroken down the length and never
       repeats inside 0.8 x 0.4 m; the colour is the oak table the block
       stands on in the same picture. Matt, oiled. (sillTexture() is the drawn
       stand-in, used only until the picture has loaded or if it is missing.) */
    var sillMat = new THREE.MeshStandardMaterial({ map: sillTexture(), color: 0xffffff, roughness: 0.7, envMapIntensity: 0.03 });
    extraTex("oak-sill").then(function (t) {
      if (!t) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / 0.8, 1 / 0.4); /* UVs are metres */
      sillMat.map = sillMat.bumpMap = t;
      sillMat.bumpScale = 0.35;
      sillMat.needsUpdate = true;
      invalidate();
    });
    tame(sillMat, 0.5, 1.05); /* pale wood a hand's width under a bare bulb */
    asBlocker(face([xa, SILL, 0, xb, SILL, 0, xb, SILL, -D, xa, SILL, -D], [0, 1, 0], [xa, 0, xb, 0, xb, D, xa, D], sillMat));
    var nose = new THREE.Mesh(noseGeometry(xa - WIN.horn, xb + WIN.horn, SILL, TH, NOSE, 0.007), sillMat);
    niche.add(asBlocker(nose));

    /* THE WINDOW at the back of the recess, as in his photographs (05.jpg,
       v01.mp4): a white casement set back in a deep plastered reveal. An
       outer frame; a transom high up with a fixed fanlight above it; below
       it one tall sash lying over the frame, with the dark line of its
       seal round it, a glazing bead round the glass, a handle on its right
       stile; a roller blind rolled up under the head of the reveal, its
       ball chain hanging down at the left. Every member is one piece with
       mitred corners and rounded front edges that catch the bulbs' light. */
    var winMat = std(0xe9e5dd, 0.36, 0, 0.12);
    tame(winMat, 0.32, 0.95);
    var sealMat = std(0x26231f, 0.8, 0, 0);
    tame(sealMat, 0.3, 0.6);
    /* The dark lines are a few mm wide and lie a mm or less in front of (or
       just behind) white surfaces. Two faults showed on phones: they fought
       those surfaces for depth (a row of dashes), and, with no multisampling
       on a phone (COARSE), a line under a pixel wide that runs a hair off
       the pixel grid is drawn as dashes too. So they always win the depth
       test against what they lie on (polygon offset: a few depth steps,
       never a visible shift), and on a phone none is narrower than 8 mm,
       about 1.5 px from the station's wide view. */
    sealMat.polygonOffset = true;
    sealMat.polygonOffsetFactor = -1;
    sealMat.polygonOffsetUnits = -4;
    var lw = function (w) {
      return COARSE ? Math.max(w, 0.008) : w;
    };
    var FW = 0.068, SW = 0.066, TRW = 0.084; /* frame face, sash face (what shows of it), transom */
    var zf = -D + 0.03; /* the front of the frame (the frame is 70 mm deep) */
    var TRY = SILL + 0.74 * (HEAD - SILL); /* the transom's middle */
    /* a flat outline (with holes) extruded towards the room, front edges
       rounded; z1 is its front face */
    function plate(o, holes, depth, z1, r, mat) {
      var s = new THREE.Shape();
      s.moveTo(o[0], o[1]);
      s.lineTo(o[2], o[1]);
      s.lineTo(o[2], o[3]);
      s.lineTo(o[0], o[3]);
      s.lineTo(o[0], o[1]);
      (holes || []).forEach(function (h) {
        var p = new THREE.Path();
        p.moveTo(h[0], h[1]);
        p.lineTo(h[0], h[3]);
        p.lineTo(h[2], h[3]);
        p.lineTo(h[2], h[1]);
        p.lineTo(h[0], h[1]);
        s.holes.push(p);
      });
      var gm = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 3, curveSegments: 1 });
      gm.computeBoundingBox();
      gm.translate(0, 0, z1 - gm.boundingBox.max.z);
      gm.deleteAttribute("uv");
      gm = Utils.toCreasedNormals(gm, 40 * RAD);
      var m = new THREE.Mesh(gm, mat || winMat);
      niche.add(m);
      return m;
    }
    function inset(b, d) {
      return [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
    }
    var OPEN = [xa, SILL, xb, HEAD];
    var LOW = [xa + FW, SILL + FW, xb - FW, TRY - TRW / 2], TOP = [xa + FW, TRY + TRW / 2, xb - FW, HEAD - FW];
    plate(OPEN, [LOW, TOP], 0.07, zf, 0.004); /* the frame and its transom */
    var SASH = inset(LOW, -0.012), SASHIN = inset(SASH, SW + 0.012);
    plate(inset(SASH, -lw(0.007)), [SASH], 0.004, zf + 0.0015, 0.0005, sealMat); /* the seal's shadow line */
    plate(SASH, [SASHIN], 0.068, zf + 0.01, 0.005); /* the sash, lying 10 mm over the frame */
    plate(SASHIN, [inset(SASHIN, 0.02)], 0.024, zf + 0.004, 0.004); /* its glazing bead */
    plate(TOP, [inset(TOP, 0.02)], 0.024, zf - 0.006, 0.004); /* the fanlight's bead */
    /* the shadow lines that make the steps read from across the room: the
       sash's inner edge over its bead, and the black glazing gaskets where
       each bead meets its glass */
    plate(SASHIN, [inset(SASHIN, lw(0.004))], 0.002, zf + 0.0045, 0.0005, sealMat);
    plate(inset(SASHIN, 0.019), [inset(SASHIN, 0.019 + lw(0.006))], 0.004, zf - 0.001, 0.0005, sealMat);
    plate(TOP, [inset(TOP, lw(0.004))], 0.002, zf - 0.0065, 0.0005, sealMat);
    plate(inset(TOP, 0.019), [inset(TOP, 0.019 + lw(0.006))], 0.004, zf - 0.011, 0.0005, sealMat);
    /* the handle: a rosette and a lever hanging down, on the right stile */
    var hx = SASH[2] - (SW + 0.012) / 2, hy = SILL + 0.66;
    /* satin aluminium, so it reads against the white sash. Not a metal in
       the shader: as a mirror it showed the studio environment's warm strips
       and the filaments' orange, and read salmon pink. A cool grey that
       takes the room's light evenly, with a soft sheen, reads as the metal. */
    var hMat = std(0x8a939c, 0.38, 0, 0.9);
    tame(hMat, 0.25, 1.0);
    plate([hx - 0.018, hy - 0.045, hx + 0.018, hy + 0.045], null, 0.014, zf + 0.024, 0.005, hMat);
    plate([hx - 0.013, hy - 0.15, hx + 0.013, hy + 0.014], null, 0.018, zf + 0.05, 0.0075, hMat);
    niche.add(box(0.016, 0.016, 0.024, hMat, hx, hy, zf + 0.024 + 0.012));
    /* its soft shadow on the sash, falling down and to the right from the bulbs */
    var hsh = new THREE.Mesh(quad([hx - 0.01, hy - 0.17, zf + 0.0105, hx + 0.03, hy - 0.17, zf + 0.0105, hx + 0.03, hy + 0.0, zf + 0.0105, hx - 0.01, hy + 0.0, zf + 0.0105], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    hsh.renderOrder = 1;
    niche.add(hsh);
    /* the glass: two panes (double glazing). It does not glow and is not a
       picture: it lets the night through, a little darker, and reflects
       the room (the copy of the lit room behind it, made at the end of
       buildBulbs()). */
    var ZG = zf - 0.02, paneMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
    [[SASHIN, ZG], [TOP, zf - 0.03]].forEach(function (pn) {
      var b = pn[0], pz = pn[1];
      var pane = new THREE.Mesh(quad([b[0], b[1], pz, b[2], b[1], pz, b[2], b[3], pz, b[0], b[3], pz], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]), paneMat);
      pane.renderOrder = 1;
      niche.add(pane);
    });
    /* the roller blind, rolled up under the head of the reveal, and its
       ball chain (his window has one: 05.jpg) */
    var blindMat = std(0xcfc9be, 0.85, 0, 0.05);
    tame(blindMat, 0.32, 0.9);
    var roll = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, WIN.w - 0.05, 24), blindMat);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(X.bs, HEAD - 0.034, zf + 0.055);
    niche.add(roll);
    [xa + 0.012, xb - 0.012].forEach(function (x) {
      niche.add(box(0.012, 0.07, 0.07, winMat, x, HEAD - 0.035, zf + 0.055));
    });
    var chainTop = HEAD - 0.05, chainLow = SILL + 0.62, BEAD = 0.0046, nB = Math.floor((chainTop - chainLow) / BEAD);
    var chain = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0021, 6, 4), std(0xb7b5b0, 0.35, 1, 0.5), nB * 2 + 6);
    var cM = new THREE.Matrix4(), cI = 0;
    for (var ci = 0; ci < nB; ci++) {
      [-0.0045, 0.0045].forEach(function (dx) {
        cM.makeTranslation(xa + 0.03 + dx, chainTop - ci * BEAD, zf + 0.09);
        chain.setMatrixAt(cI++, cM);
      });
    }
    for (ci = 0; ci < 6; ci++) { /* the loop at the bottom */
      var ca = Math.PI * (ci + 0.5) / 6;
      cM.makeTranslation(xa + 0.03 - 0.0045 * Math.cos(ca), chainLow - 0.0045 * Math.sin(ca), zf + 0.09);
      chain.setMatrixAt(cI++, cM);
    }
    chain.count = cI;
    tame(chain.material, 0.3, 0.9);
    niche.add(chain);
    /* SOFT CORNERS: plaster darkens a little into the corners of the
       reveal, against the frame and along the sill (no cast shadows in this
       room; these are what make the frame sit IN the wall) */
    var aoC = document.createElement("canvas");
    aoC.width = 4;
    aoC.height = 64;
    var aoG = aoC.getContext("2d"), aoL = aoG.createLinearGradient(0, 0, 0, 64);
    aoL.addColorStop(0, "rgba(0,0,0,0.55)");
    aoL.addColorStop(0.35, "rgba(0,0,0,0.16)");
    aoL.addColorStop(1, "rgba(0,0,0,0)");
    aoG.fillStyle = aoL;
    aoG.fillRect(0, 0, 4, 64);
    var aoMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(aoC), transparent: true, depthWrite: false });
    /* a strip from the dark edge a0-a1 out to b1-b0 (b1 lies off a1, b0 off a0) */
    var aoSoft = aoMat.clone();
    aoSoft.opacity = 0.45;
    function aoStrip(a0, a1, b1, b0, n) {
      var m = new THREE.Mesh(quad(b0.concat(b1, a1, a0), n, [0, 0, 1, 0, 1, 1, 0, 1]), n[1] > 0.5 ? aoSoft : aoMat);
      m.renderOrder = 1;
      niche.add(m);
    }
    var e = 0.002, zr = zf + 0.0005;
    aoStrip([xa + e, SILL, zr], [xa + e, HEAD, zr], [xa + e, HEAD, zr + 0.2], [xa + e, SILL, zr + 0.2], [1, 0, 0]); /* cheeks against the frame */
    aoStrip([xb - e, HEAD, zr], [xb - e, SILL, zr], [xb - e, SILL, zr + 0.2], [xb - e, HEAD, zr + 0.2], [-1, 0, 0]);
    aoStrip([xb, HEAD - e, zr], [xa, HEAD - e, zr], [xa, HEAD - e, zr + 0.12], [xb, HEAD - e, zr + 0.12], [0, -1, 0]); /* the head */
    aoStrip([xa, SILL + e, zr], [xb, SILL + e, zr], [xb, SILL + e, zr + 0.06], [xa, SILL + e, zr + 0.06], [0, 1, 0]); /* the sill against the frame */
    aoStrip([xa + e, HEAD, zr], [xa + e, HEAD, 0], [xa + e, HEAD - 0.07, 0], [xa + e, HEAD - 0.07, zr], [1, 0, 0]); /* cheek and head meet */
    aoStrip([xb - e, HEAD, 0], [xb - e, HEAD, zr], [xb - e, HEAD - 0.07, zr], [xb - e, HEAD - 0.07, 0], [-1, 0, 0]);
    aoStrip([xa, HEAD - e, 0], [xa, HEAD - e, zr], [xa + 0.07, HEAD - e, zr], [xa + 0.07, HEAD - e, 0], [0, -1, 0]);
    aoStrip([xb, HEAD - e, zr], [xb, HEAD - e, 0], [xb - 0.07, HEAD - e, 0], [xb - 0.07, HEAD - e, zr], [0, -1, 0]);
    aoStrip([xa + e, SILL + e, 0], [xa + e, SILL + e, zr], [xa + e, SILL + 0.05, zr], [xa + e, SILL + 0.05, 0], [1, 0, 0]); /* cheek and sill meet */
    aoStrip([xb - e, SILL + e, zr], [xb - e, SILL + e, 0], [xb - e, SILL + 0.05, 0], [xb - e, SILL + 0.05, zr], [-1, 0, 0]);
    /* OUTSIDE: the layers (see nightSky()), each at its own distance behind
       the glass. They take the room's fog as the WINDOW takes it, not by
       their own distance (metres out in the garden would be lost in the
       room's haze): from the entrance there is no window to see, from the
       sill the night is clear */
    var dusk = ROOMQ === "white", OUT = [], winC = new THREE.Vector3(X.bs, (SILL + HEAD) / 2, zf);
    function layer(tex, w, h, x, y, z, rep, k, opaque) {
      if (rep) tex.repeat.set(rep, 1);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, color: new THREE.Color().setScalar(k), transparent: !opaque, depthWrite: !!opaque, alphaTest: opaque ? 0 : 0.02, fog: false
      }));
      m.position.set(x, y, z);
      m.onBeforeRender = function (r, sc, cam) {
        var fd = sc.fog ? sc.fog.density * cam.position.distanceTo(winC) : 0;
        m.material.color.setScalar(k * Math.exp(-fd * fd));
      };
      niche.add(m);
      OUT.push(m);
      return m;
    }
    layer(nightSky(dusk), 70, 30, X.bs, 9, -D - 16, 0, 1, true);
    layer(treeBand(5.3, null, 0, 0, dusk ? "#151b28" : "#0b0d13", "#d99a55"), 52, 6, X.bs + 3, 3, -D - 14, 3, 1); /* houses across the gardens */
    layer(treeClumps(3.1, dusk ? "#141c2c" : "#090f1c", 7, 0), 34, 6, X.bs + 1.5, 3, -D - 9, 2, 1); /* trees in the gardens */
    layer(treeClumps(7.7, dusk ? "#0a0e12" : "#04070a", 4, 0.16), 16, 6, X.bs, 3, -D - 4.5, 1, 1); /* nearer trees, either side */
    var gnd = layer(nightGround(dusk), 40, 20, X.bs, 0, -D - 10.2, 0, 1, true); /* the ground */
    gnd.rotation.x = -Math.PI / 2;
    layer(shrubs(), 5, 1.25, X.bs, 0.5, -D - 1.6, 0, 1); /* shrubs under the window */
    layer(nearTwigs(), 4.2, 3.15, X.bs + 0.15, SILL + 1.35, -D - 0.7, 0, 1);

    /* (There was a radiator under the sill. The artist: "remove the heater
       below." The wall under the sill is plain wall.) */
    /* the sill's own shadow on the wall under its nose (there are no cast
       shadows in this room; this one is what makes the sill stand out from
       the wall): a soft dark band, deepest right under the board */
    var shc = document.createElement("canvas");
    shc.width = 4;
    shc.height = 64;
    var shg = shc.getContext("2d"), shl = shg.createLinearGradient(0, 0, 0, 64);
    shl.addColorStop(0, "rgba(0,0,0,0.5)");
    shl.addColorStop(0.3, "rgba(0,0,0,0.24)");
    shl.addColorStop(1, "rgba(0,0,0,0)");
    shg.fillStyle = shl;
    shg.fillRect(0, 0, 4, 64);
    var shade = new THREE.Mesh(
      quad([xa - WIN.horn, SILL - TH - 0.16, 0.0025, xb + WIN.horn, SILL - TH - 0.16, 0.0025, xb + WIN.horn, SILL - TH, 0.0025, xa - WIN.horn, SILL - TH, 0.0025], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shc), transparent: true, depthWrite: false, fog: false })
    );
    shade.renderOrder = 1;
    scene.add(shade);

    /* ---- the two pieces ---- */
    var gb = new THREE.Group();
    gb.position.set(X.bs - 0.36, SILL, -0.13);
    gb.rotation.y = 0.5 + SPIN * RAD;
    scene.add(gb);
    var cb = new THREE.Vector3(X.bs - 0.36, SILL + 0.222, -0.13);
    var gs = new THREE.Group();
    /* THE MAN THAT SITS. The model's seat is y = 0 with his hip at the origin,
       facing +z, and the seat's front edge on the line z = E: so he is placed
       with that line on the sill's own front edge, and his shins and feet
       hang free in front of the wall under it. HE IS A STATIC FIGURE (the
       artist: "make the arms straight and remove animation"): the pose in
       the file is the pose, in every mode; nothing here turns a shin or his
       head, and nothing follows the pointer. A drag walks the camera round
       the sill, as at every station. */
    gs.position.set(X.bs + 0.16, SILL, NOSE - SEAT_E);
    scene.add(gs);
    CONTACT.refs.block = gb;
    CONTACT.refs.man = gs;
    var cs = new THREE.Vector3(gs.position.x - 0.066, SILL + 0.402, gs.position.z - 0.146);

    if (has("bulb-block")) {
      var bb = prepGLB((await loadModel(Loader, "media/models/bulb-block.glb")).scene, 0.08);
      gb.add(bb);
      cb = emitCentre(gb, cb);
      /* the file's own cable is a 0.33 m stub that ends on the sill: it is
         hidden, and the whole lead is laid below, block to socket */
      bb.traverse(function (o) {
        if (o.isMesh && /^BB-cable/.test(o.name)) o.visible = false;
      });
    } else {
      var oak = std(0xb48a56, 0.62);
      tame(oak, 0.08, 0.9);
      gb.add(asOccluder(box(0.095, 0.13, 0.095, oak, 0, 0.065, 0)));
      var fil = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0012, 6, 40), emit(0xff932c, 7.5));
      fil.position.y = 0.222;
      gb.add(asEmitter(fil));
    }

    /* bare bulbs: their light lands, warm, on the sill, the cheeks of the
       recess and the window's frame, in pools with a visible falloff */
    var l1 = new THREE.PointLight(0xff9a3c, 0.9, 0, 2);
    var l2 = new THREE.PointLight(0xff9a3c, 0.75, 0, 2);
    var FACE = V3(0.669, 0.035, 0.743).normalize();
    if (MAN.face) FACE.set(MAN.face[0], MAN.face[1], MAN.face[2]).normalize();

    /* TWO LEADS, TWO PLUGS, ONE DOUBLE SOCKET on the wall under the sill, by
       the cheek of the recess away from the writing. Both lie on the sill
       (their own radius above it), go over its rounded nose and hang down
       the wall, 71 mm apart, into their plugs. Nothing floats. */
    var R_LEAD = 0.00325, R_WHITE = 0.0032;
    var leadMat = std(0x151515, 0.5, 0, 0.5);
    tame(leadMat, 0.08, 0.5);
    var whiteMat = std(0xe4e0d6, 0.6, 0, 0.1);
    tame(whiteMat, 0.1, 0.9);
    var cx = xa + 0.062, xw = cx + 0.071, yT = SILL + R_LEAD;
    function overNose(run, x, r) {
      for (var q = 0; q <= 4; q++) { /* over the rounded nose */
        var a = (Math.PI / 2) * (1 - q / 4);
        run.push([x, SILL - 0.007 + (0.007 + r) * Math.sin(a), NOSE - 0.007 + (0.007 + r) * Math.cos(a)]);
      }
      run.push([x, SILL - TH + 0.004, NOSE + r], [x, SILL - TH - 0.04, NOSE + 0.0028], [x + 0.001, SILL - 0.17, 0.026], [x + 0.002, SILL - 0.3, 0.018], [x + 0.001, 0.48, 0.0105], [x, 0.4, 0.009], [x, 0.352, 0.013]);
    }
    function lay(run, r, mat) {
      var m = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run.map(function (p) {
          return V3(p[0], p[1], p[2]);
        }), false, "catmullrom", 0.35), 320, r, 8, false),
        mat
      );
      scene.add(asOccluder(m));
      return m;
    }
    /* the oak block's: white, out of the back of the block low down, round
       to the left along the sill and forward to the nose */
    gb.updateMatrixWorld(true);
    var w0 = gb.localToWorld(V3(0, 0.012, -0.0478)), wd = V3(0, 0, -1).transformDirection(gb.matrixWorld);
    var wy = SILL + R_WHITE, wrun = [
      [w0.x - wd.x * 0.012, w0.y, w0.z - wd.z * 0.012], [w0.x + wd.x * 0.012, w0.y - 0.002, w0.z + wd.z * 0.012],
      [w0.x + wd.x * 0.045, wy + 0.001, w0.z + wd.z * 0.045], [X.bs - 0.465, wy, -0.238], [X.bs - 0.55, wy, -0.222],
      [X.bs - 0.615, wy, -0.165], [xw + 0.006, wy, -0.085], [xw, wy, NOSE - 0.02]
    ];
    overNose(wrun, xw, R_WHITE);
    lay(wrun, R_WHITE, whiteMat);
    scene.add(asOccluder(box(0.036, 0.046, 0.026, whiteMat, xw, 0.332, 0.022)));
    /* the socket: one plate for both */
    var plate = std(0xd9d4cc, 0.5, 0, 0.3);
    tame(plate, 0.4, 0.9);
    scene.add(asOccluder(box(0.153, 0.082, 0.009, plate, (cx + xw) / 2, 0.318, 0.0045)));
    scene.add(asOccluder(box(0.036, 0.046, 0.026, leadMat, cx, 0.332, 0.022)));

    var part = {};
    if (has("wire-stand")) {
      var ws = prepGLB((await loadModel(Loader, "media/models/wire-stand.glb")).scene, 0.08);
      gs.add(ws);
      cs = emitCentre(gs, cs);
      ws.traverse(function (o) {
        if (o.isMesh) part[o.name] = o;
      });
      /* HIS HEAD, SEEN CLOSE (the close view looks at it three-quarter
         from the side, as 05.jpg does). Four things, all his own: */
      /* 1. HIS GLOBE IS PLAIN CLEAR GLASS (not chrome-dipped). It starts as
         the block's glass, but the studio (built for the pen's chrome: bars
         and strips) would lie across a globe this close as a grid. So: the
         studio at a trace, and what a clear globe at night shows instead,
         all added light, never milky: a thin bright rim where the glass
         turns away (Fresnel), a warm glow on the inside of the glass from
         its own spiral, strongest towards the edge, and one soft reflection
         of the room on its upper left. */
      var wg = part["WS-head_globe_clear"];
      if (wg && wg.material && wg.material.isMeshPhysicalMaterial) {
        var wgm = wg.material.clone(), wgTame = wg.material.onBeforeCompile;
        wgm.envMapIntensity = 0.05;
        wgm.onBeforeCompile = function (sh) {
          if (wgTame) wgTame(sh);
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <opaque_fragment>",
            "vec3 gV = normalize(vViewPosition);\n" +
              "float gF = 1.0 - abs(dot(normal, gV));\n" +
              "outgoingLight += vec3(0.95, 0.80, 0.62) * pow(gF, 5.0) * 0.6;\n" +
              "outgoingLight += vec3(0.10, 0.04, 0.012) * pow(gF, 2.4);\n" +
              "vec3 gR = reflect(-gV, normal);\n" +
              "outgoingLight += vec3(0.55, 0.6, 0.68) * pow(max(dot(gR, normalize(vec3(-0.55, 0.62, 0.56))), 0.0), 40.0) * 0.28;\n" +
              "#include <opaque_fragment>"
          );
        };
        wgm.customProgramCacheKey = function () {
          return "wsGlobe";
        };
        wg.material = wgm;
      }
      /* 2. HIS SPIRAL: its own setting, not the block's (which is near
         white at 9.5): a deeper orange at about half the strength and a
         tighter share of the glow, so it reads as a glowing orange coil
         whose turns you can count, as in 04.jpg and 05.jpg. */
      var wf = part["WS-head_filament"];
      if (wf && wf.material) {
        var wfm = wf.material.clone();
        wfm.onBeforeCompile = wf.material.onBeforeCompile;
        wfm.customProgramCacheKey = wf.material.customProgramCacheKey;
        wfm.userData = { emit: true };
        wfm.emissive = new THREE.Color(0xff7418);
        wfm.emissiveIntensity = 4.2;
        glowDim.push({ m: wfm, k: 0.35 });
        wf.material = wfm;
      }
      /* 3. HIS WIRE IS GALVANISED STEEL, NOT A NEON TUBE. What made it
         white close up was the studio: at 1.7 it wraps the whole wire in
         bright reflection, so it lit evenly from every side. Close to him
         the studio comes down and the wire is lit by his own bulb: a bright
         line on the side facing the spiral, dark on the far side, the twist
         showing. From the windowsill's wide view (several metres) it is the
         studio at full strength again, so there he stays the light line
         drawing against the dark window. It is an occluder: never in the
         glow. */
      var wsteel = part["WS-torso"] && part["WS-torso"].material;
      if (wsteel && /wire_steel/.test(wsteel.name)) {
        wsteel.roughness = 0.24;
        var wEnv = function (r, sc, cam) {
          var d = cam.position.distanceTo(cs), t = clamp((d - 0.75) / 1.05, 0, 1);
          wsteel.envMapIntensity = 0.42 + (1.7 - 0.42) * t * t * (3 - 2 * t);
        };
        ws.traverse(function (o) {
          if (o.isMesh && o.material === wsteel) o.onBeforeRender = wEnv;
        });
      }
      /* HIS CABLE (the file has none): black. It leaves the back of the
         lampholder the way the lampholder points, hangs down behind him to
         the sill, runs along the back of the sill to the cheek of the recess,
         forward along the cheek, over the sill's nose and down the wall. */
      var ex = V3(-0.164, 0.397, -0.255), eh = V3(-0.669, -0.035, -0.743);
      if (MAN.cable) {
        ex.set(MAN.cable.p[0], MAN.cable.p[1], MAN.cable.p[2]);
        eh.set(MAN.cable.d[0], MAN.cable.d[1], MAN.cable.d[2]).normalize();
      }
      var gz = gs.position.z, gx = gs.position.x;
      var zBack = -D + 0.042; /* 12 mm in front of the frame's bars */
      var land = V3(ex.x - 0.105, R_LEAD, zBack - gz); /* where it comes down onto the sill, in his own space */
      var lead = bezTube(leadMat, 26, 8, R_LEAD);
      gs.add(asOccluder(lead));
      var c1 = ex.clone().addScaledVector(eh, 0.045);
      c1.y -= 0.012;
      lead.userData.lay(ex, c1, V3(land.x + 0.085, land.y, land.z), land);
      var run = [[gx + land.x, yT, zBack]];
      run.push([gx + land.x - 0.09, yT, zBack], [X.bs - 0.42, yT, zBack + 0.004], [xa + 0.22, yT, zBack + 0.01], [xa + 0.1, yT, zBack + 0.03], [cx + 0.004, yT, zBack + 0.1],
        [cx - 0.003, yT, -0.24], [cx + 0.002, yT, -0.08], [cx, yT, NOSE - 0.02]);
      overNose(run, cx, R_LEAD);
      lay(run, R_LEAD, leadMat);
    } else {
      var f2 = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0012, 6, 40), emit(0xff932c, 7.5));
      f2.position.set(-0.066, 0.402, -0.146);
      gs.add(asEmitter(f2));
    }
    l1.position.copy(cb);
    scene.add(l1);
    l2.position.copy(cs);
    scene.add(l2);
    focusBulb = cb;
    focusStand = cs;
    manAt = {
      x: gs.position.x, y: SILL, z: gs.position.z, edge: NOSE,
      /* where his face points: the close-up looks in along it */
      az: Math.atan2(FACE.x, FACE.z) / RAD, el: Math.asin(clamp(FACE.y, -1, 1)) / RAD
    };

    /* THE GLASS AT NIGHT IS HALF A MIRROR. It shows the lit room faintly
       over the night: above all the two bulbs and the wire man. No mirror
       pass: a copy of the two pieces, mirrored in the plane of the glass,
       drawn behind it, ADDED over the night at a few per cent, and twice
       (double glazing: the second pane's copy 24 mm further back and
       weaker; not on phones). Strongest at a slant (Fresnel), from the
       camera's angle to the glass. The copies are not emitters: they never
       enter the glow, and nothing in them lights anything. */
    var REFL = [], rfC = new THREE.Vector3(X.bs, (SILL + HEAD) / 2, ZG);
    function mirrored(zPlane, k) {
      var grp = new THREE.Group();
      grp.position.z = 2 * zPlane;
      grp.scale.z = -1;
      [gb, gs].forEach(function (src) {
        var c = src.clone(true);
        c.traverse(function (o) {
          o.layers.set(0);
          if (!o.isMesh) return;
          o.onBeforeRender = function () {};
          var m0 = o.material, m = m0.clone();
          m.onBeforeCompile = m0.onBeforeCompile;
          m.customProgramCacheKey = m0.customProgramCacheKey;
          m.transparent = true;
          m.blending = THREE.AdditiveBlending;
          m.depthWrite = false;
          o.material = m;
          o.renderOrder = 2;
          /* a filament is many times brighter than anything else in the
             copy: in the glass it stays a soft spot, not a second lamp */
          REFL.push({ m: m, k: m0.emissiveIntensity > 0.5 ? k * 0.25 : k, o: m0.opacity == null ? 1 : m0.opacity });
        });
        grp.add(c);
      });
      scene.add(grp);
      return grp;
    }
    var rf1 = mirrored(ZG, 1);
    if (!G.narrow && !COARSE) mirrored(ZG - 0.024, 0.55);
    var rfLast = -1;
    rf1.children[0].traverse(function (o) {
      if (!o.isMesh || rfLast >= 0) return;
      rfLast = 0;
      o.onBeforeRender = function (r, sc, cam) {
        var dx = cam.position.x - rfC.x, dy = cam.position.y - rfC.y, dz = cam.position.z - rfC.z;
        var cs = Math.abs(dz) / Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz)), f = Math.pow(1 - cs, 5);
        var a = clamp(0.065 + 0.2 * f, 0, 0.2);
        if (Math.abs(a - rfLast) < 0.002) return;
        rfLast = a;
        for (var i = 0; i < REFL.length; i++) REFL[i].m.opacity = REFL[i].o * a * REFL[i].k;
      };
    });

    /* NOTHING THROUGH THE SILL, THE REVEAL, THE WALL OR THE WINDOW.
       window.__rooms.manClearance() counts the vertices of the figure, as
       he sits, that are inside something solid: the sill's board, the wall
       below it and beside the opening, the head of the recess, the window
       (its glass, and its bars near the edge of the opening). All must be
       0. It also reports how far his shins hang in front of the wall under
       the sill, his lowest point, how far the back of his head is from the
       window's bars, and how much sill his hands have round them. */
    RIG.man = function () {
      var out = { vertices: 0, meshes: 0, sill: 0, wall: 0, reveal: 0, window: 0 };
      var v = V3(0, 0, 0), tol = 0.0006, low = 1e9, shinWall = 1e9, headBars = 1e9, hx0 = 1e9, hx1 = -1e9, hz = 1e9;
      gs.updateMatrixWorld(true);
      gs.traverse(function (o) {
        if (!o.isMesh || !/^WS-/.test(o.name)) return;
        out.meshes++;
        var p = o.geometry.attributes.position, shin = /shin/.test(o.name), head = /head_/.test(o.name), arms = /arms/.test(o.name);
        for (var i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          out.vertices++;
          var x = v.x, y = v.y, z = v.z;
          if (y < low) low = y;
          if (shin && y < SILL - TH && z < shinWall) shinWall = z;
          if (head && z - zf < headBars) headBars = z - zf;
          if (arms && y < SILL + 0.02) {
            hx0 = Math.min(hx0, x);
            hx1 = Math.max(hx1, x);
            hz = Math.min(hz, z);
          }
          if (z < -tol) {
            /* behind the face of the wall: only the air of the recess is free */
            if (x < xa + tol || x > xb - tol || y > HEAD - tol) out.reveal++;
            else if (y < SILL - tol) y > SILL - TH ? out.sill++ : out.wall++;
            else if (z < -D + tol) out.window++;
            else if (z < zf + 0.01 - tol && (x < xa + FW + SW + 0.012 || x > xb - FW - SW - 0.012 || y < SILL + FW + SW + 0.012 || y > TRY - TRW / 2 - SW)) out.window++;
          } else if (y < SILL - tol && y > SILL - TH + tol && z < NOSE - tol && x > xa - WIN.horn && x < xb + WIN.horn) out.sill++;
        }
      });
      out.through = out.sill + out.wall + out.reveal + out.window;
      out.lowestBelowSeat = +(low - SILL).toFixed(3);
      out.feetAboveFloor = +low.toFixed(3);
      out.shinsInFrontOfWall = +shinWall.toFixed(4);
      out.headToWindowBars = +headBars.toFixed(4);
      out.sillBehindHands = +(hz + D).toFixed(3);
      out.sillBesideHands = [+(hx0 - xa).toFixed(3), +(xb - hx1).toFixed(3)];
      out.recess = { depth: D, sill: SILL, thick: TH, nose: NOSE, seatEdgeE: SEAT_E };
      out.notes = MAN.sync ? "agree with the file" : "DISAGREE: " + (MAN.why || "?");
      out.moves = false;
      return out;
    };
  }

  /* ============================================================
     06 – 10: THE WORKS THAT ARE NOT LAMPS

     None of them gives off light (the glass at the end apart), so the room
     lights them: each has a discreet gallery light, a ceiling spot on a
     short track or a picture light on arms, and each fixture is a thing in
     the room, an occluder, never a glowing mesh.

     THE LIGHT OF THOSE FIXTURES COSTS THE REST OF THE ROOM NOTHING. In this
     renderer every real light is evaluated for every lit pixel on screen,
     whether it reaches that pixel or not (and a light at zero intensity
     costs exactly as much as one at full). Six more real lights would be
     paid for at the pen, sixty metres away. So a gallery light here is a
     LOCAL light: one spot (or point) evaluated only in the materials of
     its own station, and on patches of wall, floor and ceiling laid over
     the room's own surfaces where its pool falls. A patch is the room's
     own material again, lit by that one light alone and added on top, which
     is exactly what a light does. The number of real lights in the room is
     what it was with five stations.
     ============================================================ */

  var wallMat = null, floorMat = null, ceilMat = null, skirtMat = null; /* buildRoom() */
  var LOCALS = [];

  /* o: pos [x,y,z]; at [x,y,z] (omit for a bare point); inner / outer: the
     cone's half-angles in degrees; power; decay (2: a point, 1: a line of
     light, which is what a picture light is); range: where it has gone to
     nothing, so a patch never shows its edge */
  function localLight(o) {
    var S = {
      pos: new THREE.Vector3(o.pos[0], o.pos[1], o.pos[2]),
      dir: new THREE.Vector3(0, -1, 0),
      uPos: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(0, -1, 0) },
      uCone: { value: new THREE.Vector2(-1, -1.01) },
      uCol: { value: new THREE.Color(o.color == null ? 0xfff0dc : o.color).multiplyScalar((o.power || 1) * Math.PI) },
      uFall: { value: new THREE.Vector2(o.decay == null ? 2 : o.decay, o.range || 0) }
    };
    if (o.at) {
      S.dir.set(o.at[0], o.at[1], o.at[2]).sub(S.pos).normalize();
      S.uCone.value.set(Math.cos(o.inner * RAD), Math.cos(o.outer * RAD));
    }
    if (ROOMT && o.at && o.pos[1] > CEIL - 0.6) S.uCol.value.multiplyScalar(roomSpotGain(o)); /* hung higher: as bright where it lands */
    /* flag: [nx, ny, nz], a barn door on the can: a plane through the
       light with that normal; the light goes only to its positive side,
       fading over flagSoft (sine of the angle off the plane). 07, 08. */
    if (o.flag) {
      S.flag = new THREE.Vector3(o.flag[0], o.flag[1], o.flag[2]).normalize();
      S.uFlag = { value: new THREE.Vector4(0, 1, 0, o.flagSoft || 0.05) };
    }
    LOCALS.push(S);
    return S;
  }

  /* the shaders work in view space: once per picture, tell each local light
     where it is from the camera */
  function syncLocals() {
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    for (var i = 0; i < LOCALS.length; i++) {
      var S = LOCALS[i];
      S.uPos.value.copy(S.pos).applyMatrix4(camera.matrixWorldInverse);
      S.uDir.value.copy(S.dir).transformDirection(camera.matrixWorldInverse);
      if (S.uFlag) {
        var fv = S.flag.clone().transformDirection(camera.matrixWorldInverse);
        S.uFlag.value.set(fv.x, fv.y, fv.z, S.uFlag.value.w);
      }
    }
  }

  /* light a material with one local light as well as the room's own lights;
     `only`: with that light and nothing else (a patch) */
  function lit(mat, S, only) {
    /* (a clone carries the key but not the function: start again from nothing) */
    var prev = typeof mat.userData.obc === "function" ? mat.userData.obc : null;
    var key = (prev ? mat.userData.obcKey : "") + "|ls" + (only ? 1 : 0) + (S.uFlag ? "f" : "");
    var fn = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.uniforms.lsPos = S.uPos;
      sh.uniforms.lsDir = S.uDir;
      sh.uniforms.lsCone = S.uCone;
      sh.uniforms.lsCol = S.uCol;
      sh.uniforms.lsFall = S.uFall;
      if (S.uFlag) sh.uniforms.lsFlag = S.uFlag;
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 lsPos;\nuniform vec3 lsDir;\nuniform vec2 lsCone;\nuniform vec3 lsCol;\nuniform vec2 lsFall;" +
            (S.uFlag ? "\nuniform vec4 lsFlag;" : "")
        )
        .replace(
          "#include <lights_fragment_begin>",
          "#include <lights_fragment_begin>\n" +
            (only ? "reflectedLight.directDiffuse = vec3(0.0);\nreflectedLight.directSpecular = vec3(0.0);\n" : "") +
            "{\n vec3 lsL = lsPos - geometryPosition;\n float lsD = length(lsL);\n lsL /= lsD;\n" +
            " float lsA = smoothstep(lsCone.y, lsCone.x, dot(-lsL, lsDir)) / pow(max(lsD, 0.06), lsFall.x);\n" +
            " if (lsFall.y > 0.0) { float lsR = clamp(1.0 - pow(lsD / lsFall.y, 4.0), 0.0, 1.0); lsA *= lsR * lsR; }\n" +
            (S.uFlag ? " lsA *= smoothstep(-lsFlag.w, lsFlag.w, dot(-lsL, lsFlag.xyz));\n" : "") +
            " directLight.direction = lsL;\n directLight.color = lsCol * lsA;\n directLight.visible = true;\n" +
            " RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n}\n" +
            /* a patch of floor shows the light's pool, not a mirror image of the lamp */
            (only ? "reflectedLight.directSpecular *= 0.14;\n" : "")
        );
      if (only)
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <lights_fragment_end>",
            "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse = vec3(0.0);\nreflectedLight.indirectSpecular = vec3(0.0);\n"
          )
          /* added light fades into the dark with distance; it never adds the fog's own colour */
          .replace(
            "#include <fog_fragment>",
            "#ifdef USE_FOG\ngl_FragColor.rgb *= exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n#endif\n"
          );
    };
    mat.userData.obc = fn;
    mat.userData.obcKey = key;
    mat.onBeforeCompile = fn;
    mat.customProgramCacheKey = function () {
      return key;
    };
    return mat;
  }

  function quad(p, n, uv) {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }

  /* a patch of the room's own wall ("wall": x a0..a1, y b0..b1), floor or
     ceiling ("floor" / "ceil": x a0..a1, z b0..b1) or skirting ("skirt":
     x a0..a1), 3 mm proud of it, carrying the same plaster or concrete in
     register, lit by S alone and added over the room */
  function patch(S, kind, a0, a1, b0, b1) {
    var L = X0 - WALL_L / 2, e = 0.003, g, src;
    function u(x) {
      return (x - L) / WALL_L;
    }
    if (kind === "wall") {
      src = wallMat;
      g = quad([a0, b0, e, a1, b0, e, a1, b1, e, a0, b1, e], [0, 0, 1],
        [u(a0), b0 / CEIL, u(a1), b0 / CEIL, u(a1), b1 / CEIL, u(a0), b1 / CEIL]);
    } else if (kind === "floor") {
      src = floorMat;
      g = quad([a0, e, b1, a1, e, b1, a1, e, b0, a0, e, b0], [0, 1, 0],
        [u(a0), 1 - b1 / ROOM_D, u(a1), 1 - b1 / ROOM_D, u(a1), 1 - b0 / ROOM_D, u(a0), 1 - b0 / ROOM_D]);
    } else if (kind === "ceil") {
      src = ceilMat;
      g = quad([a0, CEIL - e, b0, a1, CEIL - e, b0, a1, CEIL - e, b1, a0, CEIL - e, b1], [0, -1, 0],
        [u(a0), b0 / ROOM_D, u(a1), b0 / ROOM_D, u(a1), b1 / ROOM_D, u(a0), b1 / ROOM_D]);
    } else {
      src = skirtMat;
      g = new THREE.BoxGeometry(a1 - a0, 0.077, 0.016);
      g.translate((a0 + a1) / 2, 0.0385, 0.008);
    }
    var m = src.clone();
    m.color = src.color; /* one colour object: a patch of floor follows the floor (roomLevel()) */
    if (ROOMT) roomMod(m, src === wallMat ? 0 : src === floorMat ? 1 : src === ceilMat ? 2 : 3, true);
    m.transparent = true;
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -8;
    lit(m, S, true);
    var mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return mesh;
  }

  var V3 = function (x, y, z) {
    return new THREE.Vector3(x, y, z);
  };

  function rod(a, b, r, mat) {
    var d = new THREE.Vector3().subVectors(b, a);
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  }

  /* THE FIXTURES. Plain things in the room's own soft light: a short track
     on the ceiling with one can on a stem, turned to its work; or a slim bar
     held off the wall on two arms above a frame. The can's lens is bright
     because you are looking at a lit lens, but it is an occluder like every
     other part: nothing here blooms. The light itself is S. */
  var fixMat = null, lensMat = null, armMat = null;
  function trackSpot(S, len, shared, mat) {
    if (!fixMat) {
      fixMat = std(0x8c867e, 0.55, 0.3, 0.1);
      lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.98, 0.76) });
    }
    var fm = mat || fixMat; /* mat: another finish for the can, stem and track (07, 08: dark) */
    var g = new THREE.Group();
    var head = new THREE.Group();
    head.position.copy(S.pos);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), S.dir);
    var can = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.047, 0.15, 24), fm);
    can.position.y = 0.075;
    head.add(asOccluder(can));
    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.0012;
    head.add(asOccluder(lens));
    g.add(head);
    var top = S.pos.clone().addScaledVector(S.dir, -0.14);
    g.add(asOccluder(rod(top, V3(top.x, CEIL - 0.03, top.z), 0.009, fm)));
    if (!shared) g.add(asOccluder(box(len, 0.03, 0.036, fm, top.x, CEIL - 0.015, top.z)));
    scene.add(g);
    return g;
  }

  function pictureLight(S, len) {
    if (!armMat) armMat = std(0x2c2823, 0.42, 0.85, 0.5);
    var g = new THREE.Group(), x = S.pos.x, y = S.pos.y, z = S.pos.z;
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 16), armMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, y + 0.012, z);
    g.add(asOccluder(bar));
    [-1, 1].forEach(function (s) {
      g.add(asOccluder(rod(V3(x + s * len * 0.3, y + 0.012, z), V3(x + s * len * 0.3, y - 0.02, 0.012), 0.0055, armMat)));
    });
    g.add(asOccluder(box(len * 0.78, 0.034, 0.008, armMat, x, y - 0.02, 0.008)));
    scene.add(g);
    return g;
  }

  function aniso() {
    return Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  function loadTex(url) {
    url = texUrl(url);
    return new Promise(function (res) {
      new THREE.TextureLoader().load(url, function (t) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso();
        res(t);
      }, undefined, function () {
        res(null);
      });
    });
  }
  function loadImage(url) {
    url = texUrl(url);
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        res(im);
      };
      im.onerror = function () {
        res(null);
      };
      im.src = url;
    });
  }

  /* BIRCH PLYWOOD, drawn (the stand-in for the photographed face): pale
     rotary-cut birch (broad soft bands, a few long flames of figure, fine
     wandering grain, flecks); the edge is the plies. Both are drawn once.
     UVs are in metres, so the grain is the same size on every part. */
  var birchT = null, edgeT = null;
  function birchTexture() {
    if (birchT) return birchT;
    var c = noiseCanvas(1024, function (g, S) {
      g.fillStyle = "#eadcbd";
      g.fillRect(0, 0, S, S);
      var i, x, y, k;
      for (i = 0; i < 46; i++) {
        x = hash(i * 9.7 + 1) * S;
        var w = 24 + hash(i * 4.3) * 120;
        var lg = g.createLinearGradient(x - w, 0, x + w, 0);
        var d = hash(i * 6.1) > 0.5 ? "150,112,62" : "255,246,222";
        lg.addColorStop(0, "rgba(" + d + ",0)");
        lg.addColorStop(0.5, "rgba(" + d + "," + (0.04 + hash(i) * 0.06) + ")");
        lg.addColorStop(1, "rgba(" + d + ",0)");
        g.fillStyle = lg;
        g.fillRect(x - w, 0, w * 2, S);
      }
      for (k = 0; k < 7; k++) {
        var cx = hash(k * 5.3 + 2) * S, top = hash(k * 2.9 + 7) * S * 0.9 - S * 0.2, n = 5 + Math.floor(hash(k + 30) * 5);
        for (i = 0; i < n; i++) {
          var hw = 8 + i * (10 + hash(k + i) * 9), apex = top + i * (46 + hash(k * 3 + i) * 30);
          g.strokeStyle = "rgba(150,116,72," + (0.15 - i * 0.01) + ")";
          g.lineWidth = 1.2 + hash(k * 7 + i) * 2.4;
          g.beginPath();
          g.moveTo(cx - hw, apex + S * 0.9);
          g.bezierCurveTo(cx - hw * 0.96, apex + S * 0.3, cx - hw * 0.5, apex, cx, apex);
          g.bezierCurveTo(cx + hw * 0.5, apex, cx + hw * 0.96, apex + S * 0.3, cx + hw, apex + S * 0.9);
          g.stroke();
        }
      }
      for (i = 0; i < 760; i++) {
        x = hash(i * 1.37 + 3) * S;
        var drift = (hash(i * 2.11) - 0.5) * 18;
        g.strokeStyle = "rgba(" + ((128 + hash(i) * 40) | 0) + "," + ((92 + hash(i + 7) * 30) | 0) + ",58," + (0.03 + hash(i * 3.3) * 0.06) + ")";
        g.lineWidth = 0.5 + hash(i * 5.1) * 1.3;
        g.beginPath();
        g.moveTo(x, -10);
        g.bezierCurveTo(x + drift, S * 0.33, x - drift, S * 0.66, x + drift * 0.4, S + 10);
        g.stroke();
      }
      g.strokeStyle = "rgba(118,88,50,0.13)";
      g.lineWidth = 1;
      g.beginPath();
      for (i = 0; i < 2600; i++) {
        x = hash(i * 3.3 + 0.5) * S;
        y = hash(i * 7.1 + 9) * S;
        g.moveTo(x, y);
        g.lineTo(x + (hash(i) - 0.5) * 1.5, y + 3 + hash(i * 1.7) * 8);
      }
      g.stroke();
    });
    birchT = new THREE.CanvasTexture(c);
    birchT.colorSpace = THREE.SRGBColorSpace;
    birchT.wrapS = birchT.wrapT = THREE.RepeatWrapping;
    birchT.repeat.set(1 / 1.3, 1 / 1.3);
    birchT.anisotropy = aniso();
    return birchT;
  }
  /* the plies: thirteen layers across the thickness (v), light and dark */
  function plyEdgeTexture(vRepeat) {
    if (!edgeT) {
      var c = document.createElement("canvas");
      c.width = 64;
      c.height = 128;
      var g = c.getContext("2d"), n = 13, i;
      for (i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? "#8a6741" : "#dcc69b";
        g.fillRect(0, Math.round((i * 128) / n), 64, Math.ceil(128 / n) + 1);
      }
      for (i = 0; i < 90; i++) {
        g.fillStyle = "rgba(60,40,20," + (0.04 + hash(i) * 0.1) + ")";
        g.fillRect(hash(i * 2.3) * 64, hash(i * 5.1) * 128, 2 + hash(i * 3.7) * 10, 2);
      }
      edgeT = new THREE.CanvasTexture(c);
      edgeT.colorSpace = THREE.SRGBColorSpace;
      edgeT.wrapS = edgeT.wrapT = THREE.RepeatWrapping;
      edgeT.repeat.set(9, 1);
      edgeT.anisotropy = aniso();
    }
    if (!vRepeat) return edgeT;
    var t = edgeT.clone();
    t.repeat.set(9, vRepeat);
    t.needsUpdate = true;
    return t;
  }
  /* a picture from media/extra/rooms-v2/, if the generator lists it */
  function extraTex(name) {
    return hasExtra(name) ? loadTex("media/extra/rooms-v2/" + name + ".jpg") : Promise.resolve(null);
  }

  /* the plies of a board seen on its cut edge: n layers across the
     thickness (v), light and dark by turns with a light one outside, in the
     colours of the chair's own edge in daylight (stills/S0033) */
  function plies(n, vRepeat) {
    var c = document.createElement("canvas"), i, j;
    c.width = 64;
    c.height = n * 8;
    var g = c.getContext("2d");
    for (i = 0; i < n; i++) {
      j = Math.round(hash(i * 3.1) * 16 - 8);
      g.fillStyle = i % 2 ? "rgb(" + (118 + j) + "," + (92 + j) + "," + (64 + j) + ")" : "rgb(" + (210 + j) + "," + (190 + j) + "," + (156 + j) + ")";
      g.fillRect(0, i * 8, 64, 8);
    }
    for (i = 0; i < 80; i++) {
      g.fillStyle = "rgba(60,40,20," + (0.05 + hash(i) * 0.1) + ")";
      g.fillRect(hash(i * 2.3) * 64, hash(i * 5.1) * n * 8, 2 + hash(i * 3.7) * 10, 1.5);
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, vRepeat || 1);
    t.anisotropy = aniso();
    return t;
  }

  /* A SOFT SHADOW ON THE FLOOR OR THE WALL. There are no cast shadows in this
     room; where a thing needs to sit on its surface it gets a drawn one: a
     canvas of black at some alpha, laid just over the surface (and over the
     patches of light on it), which darkens what is there. draw(g, S) paints
     it; soft(fn, blur, alpha) paints fn as nothing but its own blurred
     shadow (the canvas shadow, which every browser has; ctx.filter is not). */
  function shadeCanvas(size, draw) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    draw(g, size, function (fn, blur, alpha) {
      g.save();
      g.shadowColor = "rgba(0,0,0," + alpha + ")";
      g.shadowBlur = blur;
      g.shadowOffsetX = size * 3;
      g.translate(-size * 3, 0);
      g.fillStyle = g.strokeStyle = "#000";
      fn();
      g.restore();
    });
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = aniso();
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  }

  /* ---- 06: Folded Chair. On the floor, off the wall, under a ceiling spot.
     NOTHING HAPPENS TO IT (the artist: "I do not like the look and the
     animation"): it stands there, assembled, on its base, in every mode, and
     the camera walks a little way round it, from above and to the left, so
     the tray of the shell (seat, back, the two triangular sides) and the
     steel frame under it all read. There is no fold any more.
     media/models/folded-chair.glb with its notes (folded-chair.md): four
     24 mm panels and a welded steel frame, every vertex in absolute metres,
     the sitter facing +z, nothing below y = 0.
     IT IS BIRCH PLYWOOD, and the face is the real one:
     media/extra/rooms-v2/birch-ply-face.jpg is a patch of the chair's own
     back panel, rectified from the artist's daylight photograph of the shell
     (stills/S0033), its lighting divided out, made to tile; 0.48 m along the
     grain by 0.29 m. The model's UVs are in metres with U along the grain
     (across the chair on seat and back, along the rim on the sides), so the
     figure runs the way the notes say. The same picture is the bump map. The
     24 mm rims carry seventeen plies. ---- */
  /* turned so the camera, coming from the left, meets it as his photograph
     02 does: from its front-left (the sitter's left), 35 degrees off its
     front, a little above the rim, into the tray (was -0.5: from its
     front-right and high, a flat kite) */
  var FC_ROT = -1.25;
  /* the wool blanket in the seat (his photograph 02, "In use"): false
     removes it, its shadow and its file request in one edit */
  var CHAIR_BLANKET = true;
  /* media/models/chair-blanket.glb (tools/models/chair-blanket-build.py, a
     cloth simulation on this chair; notes/chair.md), in the chair's own
     frame: added to the chair's group, it turns with it. Dark warm wool,
     matt with a little sheen and a fine fuzz; a fringe cut out of a strip
     by its alpha; its contact shadow on the plywood and the floor is a
     sheet of baked occlusion drawn darkening. Never an emitter. */
  function chairBlanket(Loader, g, S) {
    var c = document.createElement("canvas"), N = 128, x = c.getContext("2d"), i, j;
    c.width = c.height = N;
    var im = x.createImageData(N, N);
    for (j = 0; j < N; j++)
      for (i = 0; i < N; i++) {
        /* a twill of soft ridges under random fuzz */
        var v = 128 + 34 * Math.sin(((i + j) / N) * Math.PI * 2 * 12) + 70 * (hash(i * 131 + j * 977) - 0.5) + 30 * (hash(((i >> 2) * 37 + (j >> 2) * 11) * 1.7) - 0.5);
        var k = (j * N + i) * 4;
        im.data[k] = im.data[k + 1] = im.data[k + 2] = Math.max(0, Math.min(255, v));
        im.data[k + 3] = 255;
      }
    x.putImageData(im, 0, 0);
    var fuzz = new THREE.CanvasTexture(c);
    fuzz.wrapS = fuzz.wrapT = THREE.RepeatWrapping;
    fuzz.repeat.set(1 / 0.06, 1 / 0.06); /* UVs are metres: a 6 cm tile */
    fuzz.anisotropy = aniso();
    /* the heather of the wool: soft lighter and darker tufts, a 20 cm tile,
       so even from across the room the surface is not one smooth sheet */
    var hc = document.createElement("canvas"), hx = hc.getContext("2d");
    hc.width = hc.height = 128;
    hx.fillStyle = "#d8d8d8";
    hx.fillRect(0, 0, 128, 128);
    for (i = 0; i < 900; i++) {
      var hv = Math.round(150 + 105 * hash(i * 7.77 + 3));
      hx.fillStyle = "rgba(" + hv + "," + hv + "," + hv + ",0.35)";
      for (var dxh = -128; dxh <= 0; dxh += 128)
        for (var dyh = -128; dyh <= 0; dyh += 128) {
          hx.beginPath();
          hx.ellipse(128 * hash(i * 3.1 + 1) - dxh, 128 * hash(i * 5.3 + 2) - dyh, 1.5 + 4 * hash(i * 1.9), 1 + 2 * hash(i * 2.7), 6.3 * hash(i * 4.1), 0, 6.3);
          hx.fill();
        }
    }
    var heather = new THREE.CanvasTexture(hc);
    heather.colorSpace = THREE.SRGBColorSpace;
    heather.wrapS = heather.wrapT = THREE.RepeatWrapping;
    heather.repeat.set(1 / 0.2, 1 / 0.2);
    heather.anisotropy = aniso();
    var wool = lit(new THREE.MeshPhysicalMaterial({
      color: 0x25180f, map: heather, roughness: 0.97, metalness: 0, vertexColors: true, bumpMap: fuzz, bumpScale: 0.5,
      sheen: 0.5, sheenRoughness: 0.9, sheenColor: new THREE.Color(0x5a4232), envMapIntensity: 0.12, side: THREE.DoubleSide
    }), S);
    /* the fringe: knotted cords, 8 per 10 cm, thinning to their tips */
    var f = document.createElement("canvas");
    f.width = 64; f.height = 64;
    var fx = f.getContext("2d");
    fx.fillStyle = "#000";
    fx.fillRect(0, 0, 64, 64);
    fx.fillStyle = "#fff";
    for (i = 0; i < 2; i++) {
      var cx = 16 + i * 32;
      fx.beginPath();
      fx.moveTo(cx - 12, 0); fx.lineTo(cx + 12, 0); fx.lineTo(cx + 7, 12); fx.lineTo(cx + 6, 58); fx.lineTo(cx, 64); fx.lineTo(cx - 6, 58); fx.lineTo(cx - 7, 12);
      fx.closePath();
      fx.fill();
    }
    var cords = new THREE.CanvasTexture(f);
    cords.wrapS = THREE.RepeatWrapping;
    cords.repeat.set(1 / 0.025, 1);
    cords.flipY = false;
    cords.generateMipmaps = false; /* (mipmaps average the cords away into a grey veil) */
    cords.minFilter = THREE.LinearFilter;
    var fr = lit(new THREE.MeshStandardMaterial({ color: 0x1c120c, roughness: 0.96, alphaMap: cords, alphaTest: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.1 }), S);
    var shade = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return loadModel(Loader, "media/models/chair-blanket.glb").then(function (got) {
      var list = [];
      got.scene.traverse(function (o) {
        if (o.isMesh) list.push(o);
      });
      list.forEach(function (o) {
        if (/shadow/.test(o.name)) {
          /* occlusion as alpha on black */
          var col = o.geometry.attributes.color, a = new Float32Array(col.count * 4);
          for (var k = 0; k < col.count; k++) a[k * 4 + 3] = col.getX(k);
          o.geometry.setAttribute("color", new THREE.BufferAttribute(a, 4));
          o.material = shade;
          o.renderOrder = 3;
        } else {
          o.material = /fringe/.test(o.name) ? fr : wool;
          asOccluder(o);
        }
        g.add(o);
      });
    });
  }
  async function buildChair(Loader) {
    var x0 = X.fc + 0.1, z0 = 1.55;
    /* the gallery light: one can, from the left and above and a little in
       front (as the wall lamp in his own photograph of it, S0036), so every
       facet of the shell takes its own tone and the back is the brightest */
    /* (it stands where it stood for the chair at -0.5, turned with the
       chair: the same light on the same facets whichever way it faces) */
    var lr = FC_ROT + 0.5, lc = Math.cos(lr), ls = Math.sin(lr);
    var LP = [x0 - 1.9 * lc + 1.7 * ls, CEIL - 0.24, z0 + 1.9 * ls + 1.7 * lc];
    var S = localLight({ pos: LP, at: [x0, 0.5, z0], inner: 22, outer: 40, color: 0xfff0dc, power: 34, range: 8 });
    trackSpot(S, 1.2);
    patch(S, "floor", x0 - 4.4, x0 + 4.4, 0, 6.2);
    patch(S, "wall", x0 - 4.2, x0 + 4.2, 0, 2.4);
    patch(S, "skirt", x0 - 4.2, x0 + 4.2);
    var g = new THREE.Group();
    g.position.set(x0, 0, z0);
    g.rotation.y = FC_ROT;
    scene.add(g);
    CONTACT.refs.chair = g;

    /* its shadow on the floor: the shell's (soft, thrown away from the can:
       each corner of the rim by its own height), a deeper one under the
       hollow, and a close dark line beside every bar of the frame */
    var cs = Math.cos(FC_ROT), sn = Math.sin(FC_ROT), lx = (x0 - LP[0]) / LP[1], lz = (z0 - LP[2]) / LP[1];
    var ox = lx * cs - lz * sn, oz = lx * sn + lz * cs; /* shadow run per metre of height, in the chair's own axes */
    var SH = 2.6;
    var shadow = new THREE.Mesh(
      quad([-SH / 2, 0.006, SH / 2, SH / 2, 0.006, SH / 2, SH / 2, 0.006, -SH / 2, -SH / 2, 0.006, -SH / 2], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]),
      shadeCanvas(256, function (c, N, soft) {
        function px(x, z, h) {
          return [(x + ox * h + SH / 2) / SH * N, (z + oz * h + SH / 2) / SH * N];
        }
        function poly(pts) {
          c.beginPath();
          pts.forEach(function (p, i) {
            var q = px(p[0], p[1], p[2]);
            if (i) c.lineTo(q[0], q[1]);
            else c.moveTo(q[0], q[1]);
          });
          c.closePath();
          c.fill();
        }
        soft(function () {
          poly([[-0.5, 0.554, 0.47], [0.5, 0.554, 0.47], [0.5, -0.64, 0.84], [-0.5, -0.64, 0.84]]);
        }, 26, 0.5);
        /* right under the shell, where no light gets in at all */
        soft(function () {
          poly([[-0.46, 0.5, 0.1], [0.46, 0.5, 0.1], [0.44, -0.5, 0.1], [-0.44, -0.5, 0.1]]);
        }, 16, 0.5);
        soft(function () {
          c.lineWidth = 3.4;
          c.beginPath();
          var a = px(-0.407, 0.411, 0.03), b = px(0.407, 0.411, 0.03), d = px(0.407, -0.525, 0.03), e = px(-0.407, -0.525, 0.03);
          c.moveTo(a[0], a[1]);
          c.lineTo(b[0], b[1]);
          c.lineTo(d[0], d[1]);
          c.lineTo(e[0], e[1]);
          c.closePath();
          c.stroke();
        }, 3.5, 0.6);
      })
    );
    shadow.renderOrder = 2;
    g.add(shadow);

    /* satin steel: drawn bar, not chrome. It needs something to reflect or
       it is a dark line on a dark floor: the studio map at half strength,
       and the can's own highlight running along every bar */
    /* MATCHED TO HIS PHOTOGRAPHS (02, 01, 03): the base is dark raw steel,
       hot-rolled bar with its grey-black mill scale, not bright drawn bar.
       Dark but still metal: a low, slightly blue-grey reflectance with a soft
       sheen from the studio map and the can's highlight along each bar, so it
       never goes to a black silhouette. To go back to the pale satin steel:
       FC_STEEL = { color: 0xa6a6a4, metalness: 1, roughness: 0.4, envMapIntensity: 0.42 } */
    var FC_STEEL = { color: 0x4a4846, metalness: 0.85, roughness: 0.48, envMapIntensity: 0.9 };
    var rodMat = new THREE.MeshStandardMaterial(FC_STEEL);
    lit(rodMat, S);

    if (has("folded-chair")) {
      var got = await Promise.all([loadModel(Loader, "media/models/folded-chair.glb"), extraTex("birch-ply-face")]);
      var model = got[0].scene, photo = got[1];
      var cut = new THREE.MeshStandardMaterial({ map: plies(17, 1 / 0.384), color: 0xa39c8c, roughness: 0.62, envMapIntensity: 0.03 });
      lit(cut, S);
      var n = 0;
      function faceMat() {
        var t, m;
        if (photo) {
          t = photo.clone();
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(1 / 0.48, 1 / 0.29);
          t.offset.set(hash(n * 7.3 + 1), hash(n * 3.9 + 4)); /* each panel is a different piece of the sheet */
          t.needsUpdate = true;
          /* oiled birch: pale honey, satin. The picture is the colour; a touch
             of warmth on top, because the photograph is in open shade */
          /* (held down against the room's soft light, which has no direction,
             so that the can's light, which has one, models the facets) */
          m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.6, color: 0x9a927f, roughness: 0.46, envMapIntensity: 0.07 });
        } else {
          t = birchTexture().clone();
          t.center.set(0, 0);
          t.rotation = Math.PI / 2;
          t.needsUpdate = true;
          m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, envMapIntensity: 0.05 });
        }
        n++;
        return lit(m, S);
      }
      var meshes = [];
      model.traverse(function (o) {
        if (o.isMesh) meshes.push(o);
      });
      meshes.forEach(function (o) {
        asOccluder(o);
        if (!/^FC-panel/.test(o.name)) {
          o.material = rodMat;
          return;
        }
        /* faces and cut edges are one mesh: sort its triangles by how they
           lie to the panel's own plane (the plane of its largest triangle) */
        var geo = o.geometry, ix = geo.index, pos = geo.attributes.position, tri = ix ? ix.count / 3 : pos.count / 3;
        var a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), nrm = [], best = 0, ref = V3(0, 1, 0), k;
        for (k = 0; k < tri; k++) {
          a.fromBufferAttribute(pos, ix ? ix.getX(k * 3) : k * 3);
          b.fromBufferAttribute(pos, ix ? ix.getX(k * 3 + 1) : k * 3 + 1);
          c.fromBufferAttribute(pos, ix ? ix.getX(k * 3 + 2) : k * 3 + 2);
          var nn = b.clone().sub(a).cross(c.clone().sub(a)), ar = nn.length();
          nn.normalize();
          nrm.push(nn);
          if (ar > best) {
            best = ar;
            ref = nn;
          }
        }
        var fa = [], ed = [];
        for (k = 0; k < tri; k++) {
          var into = Math.abs(nrm[k].dot(ref)) > 0.8 ? fa : ed;
          into.push(ix ? ix.getX(k * 3) : k * 3, ix ? ix.getX(k * 3 + 1) : k * 3 + 1, ix ? ix.getX(k * 3 + 2) : k * 3 + 2);
        }
        geo.setIndex(fa.concat(ed));
        geo.clearGroups();
        geo.addGroup(0, fa.length, 0);
        geo.addGroup(fa.length, ed.length, 1);
        o.material = [faceMat(), cut];
      });
      g.add(model);
      if (CHAIR_BLANKET) await chairBlanket(Loader, g, S).catch(function () {});
      return;
    }

    /* STAND-IN (only if the file is missing): a seat, a back and two wings
       of plywood on a rod frame, standing as the chair stands */
    var T = 0.024, SEAT_H = 0.345, TILT = 10 * RAD;
    var face = lit(new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: 0.5, envMapIntensity: 0.05 }), S);
    var edge = lit(new THREE.MeshStandardMaterial({ map: plies(17, 1 / T), roughness: 0.62, envMapIntensity: 0.03 }), S);
    var shell = new THREE.Group();
    shell.position.y = SEAT_H;
    shell.rotation.x = -TILT;
    g.add(shell);
    var A = V3(-0.34, 0, 0.3), B = V3(0.34, 0, 0.3), C = V3(0.3, 0, -0.28), D = V3(-0.3, 0, -0.28);
    var E = V3(-0.62, 0.66, -0.62), F = V3(0.62, 0.66, -0.62);
    var G2 = A.clone().addScaledVector(E.clone().sub(D), 0.62), H2 = B.clone().addScaledVector(F.clone().sub(C), 0.62);
    function panel(P0, P1, extra) {
      var u = new THREE.Vector3().subVectors(P1, P0), len = u.length();
      u.normalize();
      var w = new THREE.Vector3().subVectors(extra[0], P0), r = w.clone().addScaledVector(u, -w.dot(u)).normalize();
      var sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(len, 0);
      extra.forEach(function (p) {
        var q = new THREE.Vector3().subVectors(p, P0);
        sh.lineTo(q.dot(u), q.dot(r));
      });
      var mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false }), [face, edge]);
      mesh.position.copy(P0);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, r, new THREE.Vector3().crossVectors(u, r)));
      shell.add(asOccluder(mesh));
    }
    panel(A, B, [C, D]);
    panel(D, C, [F, E]);
    panel(A, D, [E, G2]);
    panel(C, B, [H2, F]);
    var R = 0.009, fy = SEAT_H + 0.26 * Math.sin(TILT) - R - 0.002, ry = SEAT_H - 0.24 * Math.sin(TILT) - R - 0.002;
    var bx = 0.27, bf = 0.26, br = -0.24;
    [[V3(-bx, R, bf), V3(bx, R, bf)], [V3(-bx, R, br), V3(bx, R, br)], [V3(-bx, R, bf), V3(-bx, R, br)], [V3(bx, R, bf), V3(bx, R, br)],
      [V3(-bx, R, bf), V3(-bx, fy, bf)], [V3(bx, R, bf), V3(bx, fy, bf)], [V3(-bx, R, br), V3(-bx, ry, br)], [V3(bx, R, br), V3(bx, ry, br)]
    ].forEach(function (s) {
      g.add(asOccluder(rod(s[0], s[1], R, rodMat)));
    });
  }

  /* ---- 07: Pulls. THREE CANVASES, ALL 500 x 500 mm, in a row at one
     height, each under its own ceiling spot (the artist: "remove first
     painting, make the third the same size as the other two"). They are
     UNFRAMED STRETCHED CANVASES: a box 38 mm deep whose face is the whole
     canvas, margin and all (media/paintings/tex-NN-framed.jpg, rectified from
     his photographs: textures.md), and whose four sides are the canvas
     carried round the stretcher: painted black on two, bare primed cloth on
     the one with the white margin. No frame, no board. The generator names
     the three (<html data-pulls>). The moment is the camera walking the row,
     at a respectful distance: the textures are small. ---- */
  var PULLS = null;
  try {
    PULLS = JSON.parse(root.getAttribute("data-pulls") || "null");
  } catch (e) {}
  var pullsAt = []; /* centre x of each, for the walk */

  /* A GALLERY SPOT ON THE CEILING for a work on the wall (07, 08; the
     artist: "spots von der decke ... statt diesen lampen direkt drueber";
     notes/gallery-spots.md). One dark can, hung 0.2 m under the ceiling
     and out from the wall so that it looks at the middle of the work
     (cx, cy) 30 degrees from vertical, the classic gallery angle: 1.56 m
     out under the 4.4 m ceiling, 0.98 m under 3.4 m. It is aimed `aim`
     below the middle, so the top of the work, nearer the can and struck
     more squarely, is not the hot end. The cone is given as half-widths
     of the pool across the wall at the work (r0: full, r1: gone), so the
     pool is the same whatever the ceiling; E is its strength there, and
     the power follows the distance (decay 1: with 1/d2 the top of a 1 m
     sheet takes 1.5 x the light of its foot). A round cone 30 degrees off
     the wall lays a long tail down to the floor; the can has a barn door
     (`flag`): a plane through the lens and a line on the wall `cut` high,
     softened over `soft`, so the pool ends a little under the work and
     nothing reaches the floor. Its light is a local light on the work and
     on one patch of wall. */
  var spotMat = null, PU_E = 1.2, EH_E = 1.4;
  function ceilSpot(cx, cy, o) {
    var ly = CEIL - 0.2, lz = (ly - cy) * Math.tan(30 * RAD), d = Math.hypot(ly - cy, lz);
    var L = { pos: [cx, ly, lz], at: [cx, cy + o.aim, 0], inner: Math.atan(o.r0 / d) / RAD, outer: Math.atan(o.r1 / d) / RAD,
      color: 0xfff0dc, power: o.E * d, decay: 1, range: 3 * d,
      flag: [0, lz, o.cut - ly], flagSoft: o.soft };
    if (ROOMT) L.power /= roomSpotGain(L); /* placed and scaled for this ceiling already: localLight() would scale it twice */
    var S = localLight(L);
    var hw = o.r1 * 1.6 + 0.3;
    patch(S, "wall", cx - hw, cx + hw, 0, CEIL);
    if (!spotMat) spotMat = std(0x26231f, 0.5, 0.55, 0.1);
    if (o.track !== false) trackSpot(S, o.track || 0.42, o.track === 0, spotMat);
    return S;
  }
  /* a work that stands a few mm off the wall must never lose to a patch
     of light laid 3 mm off it: a patch's polygon offset grows with the
     slope of its depth, so seen at a slant (the station view of 08 from the
     left and above, a drag across it, the row of 07 seen along the wall)
     it came forward of the sheet and was added over it (the poster went
     lilac). Pulled forward further than any patch. */
  function overPatches(m) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -16;
    return m;
  }

  async function buildPulls() {
    var x0 = X.pu, cy = 1.5, GAP = 0.3, i;
    var list = (PULLS && PULLS.length ? PULLS : [{ edge: "#0d0d0c" }, { edge: "#ece6d6" }, { edge: "#0d0d0c" }]).map(function (q) {
      return { src: q.framed || null, w: (q.w || 500) / 1000, h: (q.h || 500) / 1000, d: (q.d || 38) / 1000, side: new THREE.Color(q.edge || "#0d0d0c").getHex() };
    });
    var total = -GAP;
    list.forEach(function (p) {
      total += p.w + GAP;
    });
    var x = x0 - total / 2;
    /* the pictures arrive in the background: the room does not wait at the
       door for something fifty metres down the wall */
    function hang(p, front) {
      if (!p.src) return;
      loadTex(p.src).then(function (tex) {
        if (!tex) return;
        front.map = tex;
        front.color.setHex(0xffffff);
        front.needsUpdate = true;
        invalidate();
      });
    }
    for (i = 0; i < list.length; i++) {
      var p = list[i], cx = x + p.w / 2;
      x += p.w + GAP;
      pullsAt.push(cx);
      /* a can on one short track across the row (the middle one carries it) */
      var S = ceilSpot(cx, cy, { aim: -0.25, r0: 0.1, r1: 0.8, cut: cy - p.h / 2 - 0.3, soft: 0.07, E: PU_E, track: i === list.length >> 1 ? total + 0.1 : 0 });
      /* matt acrylic on cloth */
      var front = overPatches(lit(new THREE.MeshStandardMaterial({ color: p.side, roughness: 0.78, envMapIntensity: 0.02 }), S));
      hang(p, front);
      var side = overPatches(lit(std(p.side, 0.82, 0, 0.02), S));
      var m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), [side, side, side, side, front, side]);
      m.position.set(cx, cy, 0.003 + p.d / 2);
      scene.add(asOccluder(m));
      /* what a canvas 38 mm deep throws on the wall under its spot, 30
         degrees from vertical and straight in front: the face's outline
         dropped by its stand-off x tan 60 (71 mm), so a band under its foot
         and nothing at the sides; nearly crisp (a small can 3 m off), with
         a faint closeness all round where it stands off the wall */
      var drop = (p.d + 0.003) * Math.tan(60 * RAD);
      var sh = new THREE.Mesh(
        quad([cx - p.w / 2 - 0.05, cy - p.h / 2 - 0.13, 0.0045, cx + p.w / 2 + 0.05, cy - p.h / 2 - 0.13, 0.0045, cx + p.w / 2 + 0.05, cy + p.h / 2, 0.0045, cx - p.w / 2 - 0.05, cy + p.h / 2, 0.0045], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]),
        shadeCanvas(256, function (c, N, soft) {
          var kx = N / (p.w + 0.1), ky = N / (p.h + 0.13);
          soft(function () {
            c.fillRect(0.05 * kx, 0, p.w * kx, (p.h + drop) * ky);
          }, 0.014 * kx, 0.5);
          soft(function () {
            c.fillRect(0.05 * kx - 2, 0, p.w * kx + 4, p.h * ky + 3);
          }, 0.035 * kx, 0.22);
        })
      );
      sh.renderOrder = 2;
      scene.add(sh);
    }
  }

  /* ---- 08: EIN HORNY. A POSTER: the sheet itself, 700 x 1000 mm, flat on
     the wall under a ceiling spot. No frame, no mount, no glass (the
     artist: "EIN HORNY should not have a frame!") and no effect ("remove
     effect"): nothing moves here and the camera arrives and holds. The
     sheet is the artist's own file of the print (media/ein-horny/05.jpg) on
     paper: it lies on the wall with its four corners standing a few
     millimetres off it, each a little differently, and a soft line of
     shadow round its edge. ---- */
  async function buildPrint() {
    var x0 = X.eh, cy = 1.5, w = 0.7, h = 1.0;
    var S = ceilSpot(x0, cy, { aim: -0.55, r0: 0.15, r1: 1.0, cut: cy - h / 2 - 0.3, soft: 0.07, E: EH_E, track: 0.42 });
    var paper = overPatches(lit(new THREE.MeshStandardMaterial({ color: 0x1c2fd0, roughness: 0.88, envMapIntensity: 0.02, side: THREE.DoubleSide }), S));
    var geo = new THREE.PlaneGeometry(w, h, 28, 40), pos = geo.attributes.position, i;
    var LIFT = [0.0075, 0.003, 0.0055, 0.002]; /* top left, top right, bottom left, bottom right */
    for (i = 0; i < pos.count; i++) {
      var px = pos.getX(i), py = pos.getY(i);
      var r = Math.hypot(w / 2 - Math.abs(px), h / 2 - Math.abs(py)); /* from the nearest corner */
      var c = Math.max(0, 1 - r / 0.16);
      pos.setZ(i, 0.0052 + LIFT[(py > 0 ? 0 : 2) + (px > 0 ? 1 : 0)] * c * c);
    }
    geo.computeVertexNormals();
    var sheet = new THREE.Mesh(geo, paper);
    sheet.position.set(x0, cy, 0);
    scene.add(asOccluder(sheet));
    var sh = new THREE.Mesh(
      quad([x0 - w / 2 - 0.03, cy - h / 2 - 0.035, 0.0042, x0 + w / 2 + 0.03, cy - h / 2 - 0.035, 0.0042, x0 + w / 2 + 0.03, cy + h / 2 + 0.025, 0.0042, x0 - w / 2 - 0.03, cy + h / 2 + 0.025, 0.0042], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]),
      shadeCanvas(256, function (c, N, soft) {
        /* paper 5 mm off the wall, the spot from above and in front: a
           hair of shadow under its foot (9 mm), barely anything elsewhere */
        var kx = N / (w + 0.06), ky = N / (h + 0.06);
        soft(function () {
          c.fillRect(0.03 * kx, 0.025 * ky, w * kx, (h + 0.009) * ky);
        }, 4, 0.4);
      })
    );
    sh.renderOrder = 2;
    scene.add(sh);
    /* the file is read after the room is up (the poster hangs 56 m from the
       door); until then the sheet is plain ultramarine */
    loadTex("media/ein-horny/05.jpg").then(function (tex) {
      if (!tex) return;
      paper.map = tex;
      paper.color.setHex(0xffffff);
      paper.needsUpdate = true;
      invalidate();
    });
  }

  /* ---- 09: Glass Ball. ONE GLASS BALL CUT WITH MANY FLAT FACES, in the beam
     of an RGB flashlight (the artist: "it's a glass ball with many faces + an
     RGB flashlight"; not panes, not fragments, not a smooth ball). Built
     here: a faceted sphere of clear glass, 170 mm across, 180 flat faces
     with crisp edges, on a small black ring on a plain dark plinth; a small
     hand torch lying beside it, propped on a wedge so it points into the
     ball; its beam in the haze; and what comes out the other side: every
     facet throws its own small patch of the torch's colour, split at its
     edges, onto wall, ceiling and floor, sparse and sharp.
     THE TORCH'S COLOUR CYCLES, slowly, round the wheel: magenta (the colour
     in his photographs), red, yellow, green, cyan, blue and back; the lens,
     the beam, the haze, the wash on the room and every patch of scatter are
     that colour at that moment. The ball turns slowly on its ring and the
     scatter sweeps the room with it; a drag turns it by hand. With motion
     off nothing moves by itself: the torch holds magenta, and the control
     in the strip ("Colour") takes it round the wheel.
     THE EMITTERS ARE THE TORCH'S LENS, THE BEAM AND THE SCATTER, and nothing
     else. The glass is clear (it reflects, and flashes the torch's colour
     off the facets that face it; it neither glows nor hides a glow); the
     plinth, the ring and the torch's body are occluders. Each patch is a ray
     that leaves the ball along one facet's normal, followed to the wall,
     the ceiling or the floor; it lies on that surface, drawn out a little
     along the way the light arrives. Turn the ball and its rays turn. ---- */
  var GF = { t: 0, col: null };
  /* the torch's colour for a place on the wheel, 0..1 (0: magenta), kept at
     about the same strength all the way round so the room does not pump */
  function torchColour(h, out) {
    var x = (((h + 0.8333) % 1) + 1) % 1 * 6, i = Math.floor(x), f = x - i;
    var r = [1, 1 - f, 0, 0, f, 1][i], g = [f, 1, 1, 1 - f, 0, 0][i], b = [0, 0, f, 1, 1, 1 - f][i];
    var k = 0.62 / Math.max(0.2, 0.3 * r + 0.55 * g + 0.15 * b + 0.25);
    return out.setRGB(Math.min(1.25, r * k + 0.02), Math.min(1.1, g * k + 0.02), Math.min(1.35, b * k + 0.04));
  }
  /* the station's own clock: it runs (and asks for frames) only while this
     is the station you are at, with motion on */
  function gfStep(dt) {
    if (REDUCED || !by.gf || !RIG.gf) return false;
    var i = by.gf.i;
    if (T.r[i] < 1 || T.r[i + 1] > 0 || T.mv) return false; /* only while the camera holds at it */
    GF.t += dt;
    return true;
  }

  async function buildGlass() {
    var x0 = X.gf, PZ = 1.05, PW = 0.8, PD = 0.3, TOPY = 0.92, R = 0.085, i;
    var bc = V3(x0 + 0.19, TOPY + 0.014 + R * 0.97, PZ); /* the ball's centre */
    var lens = V3(x0 - 0.2, TOPY + 0.052, PZ + 0.012); /* the torch's lens */
    var beam = bc.clone().sub(lens), blen = beam.length();
    beam.normalize();
    var colU = { value: new THREE.Color(1, 0.2, 0.9) };
    GF.col = colU.value;
    /* the wash: the torch's colour on wall, floor and ceiling, from the ball */
    var S = localLight({ pos: [bc.x, bc.y, bc.z], color: 0xffffff, power: 0.55, decay: 2, range: 8 });
    var washK = Math.PI * 0.55;
    patch(S, "wall", x0 - 7, x0 + 6.5, 0, CEIL);
    patch(S, "floor", x0 - 7, x0 + 6.5, 0, 7);
    patch(S, "ceil", x0 - 7, x0 + 6.5, 0, 7);
    patch(S, "skirt", x0 - 7, x0 + 6.5);
    var g = new THREE.Group();
    scene.add(g);
    var pm = lit(std(0x1c1b1a, 0.74, 0, 0.04), S);
    g.add(asOccluder(box(PW, TOPY, PD, pm, x0, TOPY / 2, PZ)));
    /* the ring the ball sits in */
    var black = lit(std(0x0f0f10, 0.5, 0.4, 0.2), S);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 10, 32), black);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(bc.x, TOPY + 0.007, bc.z);
    g.add(asOccluder(ring));

    /* THE TORCH: a small aluminium hand torch, 150 mm, lying on the plinth
       with its head on a wedge so that its axis runs through the ball */
    var torch = new THREE.Group();
    torch.position.copy(lens);
    torch.quaternion.setFromUnitVectors(V3(0, 1, 0), beam);
    var alu = lit(std(0x2a2b2e, 0.38, 0.9, 0.5), S);
    function tube(r0, r1, len, y, mat) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 28), mat);
      m.position.y = y;
      torch.add(asOccluder(m));
      return m;
    }
    tube(0.0125, 0.0125, 0.105, -0.0875, alu); /* the body */
    tube(0.0125, 0.019, 0.016, -0.027, alu); /* the flare */
    tube(0.019, 0.019, 0.02, -0.01, alu); /* the head */
    tube(0.0132, 0.0132, 0.03, -0.1, lit(std(0x151516, 0.6, 0.3, 0.2), S)); /* its grip */
    tube(0.011, 0.012, 0.006, -0.143, black); /* the tail switch */
    var lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var lensM = new THREE.Mesh(new THREE.CircleGeometry(0.0165, 28), lensMat);
    lensM.rotation.x = -Math.PI / 2;
    lensM.position.y = 0.0006;
    torch.add(asEmitter(lensM));
    g.add(torch);
    var wedge = box(0.03, lens.y - TOPY - 0.017, 0.05, black, lens.x - beam.x * 0.012, TOPY + (lens.y - TOPY - 0.017) / 2, lens.z);
    g.add(asOccluder(wedge));

    /* THE BEAM in the haze: a cone of lit air from the lens to the ball,
       brightest looked at along its length, nothing at its skin. And the
       haze round the ball itself. Light in air, not surfaces. */
    function air(geo, gain, pw) {
      return new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uGain: { value: gain }, uCol: colU },
        vertexShader:
          "varying vec3 vN;\nvarying vec3 vV;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
          " vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader:
          "varying vec3 vN;\nvarying vec3 vV;\nuniform float uGain;\nuniform vec3 uCol;\nvoid main(){" +
          " float f = pow(abs(dot(normalize(vN), normalize(vV))), " + pw.toFixed(1) + ");" +
          " gl_FragColor = vec4(uCol * f * uGain, 1.0); }",
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide
      }));
    }
    var cone = air(new THREE.CylinderGeometry(R * 0.82, 0.0165, blen - R * 0.4, 40, 1, true), 0.2, 2.0);
    /* the beam carries dust: specks in the lit air that drift only as the
       station's clock runs (never with motion off) */
    cone.material.uniforms.uT = { value: 0 };
    cone.material.vertexShader = cone.material.vertexShader.replace("varying vec3 vV;", "varying vec3 vV;\nvarying vec3 vO;").replace("vN = normalize", "vO = position; vN = normalize");
    cone.material.fragmentShader = cone.material.fragmentShader
      .replace("uniform vec3 uCol;", "uniform vec3 uCol;\nuniform float uT;\nvarying vec3 vO;\nfloat dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }")
      .replace("gl_FragColor = vec4(uCol * f * uGain, 1.0);", "vec3 dg = vO * 220.0 + vec3(0.0, uT * 2.2, uT * 0.7);\n float dust = step(0.978, dh(floor(dg))) * smoothstep(0.5, 0.05, length(fract(dg) - 0.5));\n gl_FragColor = vec4(uCol * (f + dust * 1.4) * uGain, 1.0);");
    cone.position.copy(lens).addScaledVector(beam, (blen - R * 0.4) / 2);
    cone.quaternion.copy(torch.quaternion);
    cone.renderOrder = 4;
    Object.defineProperty(cone.material, "emissiveIntensity", {
      get: function () { return cone.material.uniforms.uGain.value; },
      set: function (v) { cone.material.uniforms.uGain.value = v; }
    });
    g.add(asEmitter(cone));
    var haze = air(new THREE.SphereGeometry(0.8, 32, 20), 0.05, 3.2);
    haze.position.copy(bc);
    haze.renderOrder = 4;
    g.add(haze);

    /* THE BALL. Flat faces (the geometry is not indexed, so every face has
       its own normal): a clear shell that reflects the room, a different
       piece of it on every facet; and inside it the light: facets that face
       the beam, or throw it toward the eye, flash the torch's colour. */
    var geo = new THREE.IcosahedronGeometry(R, 2);
    var ball = new THREE.Group();
    ball.position.copy(bc);
    var shell = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: 0x000000, roughness: 0.02, metalness: 0, ior: 1.75, envMapIntensity: 1.5, flatShading: true,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    shell.renderOrder = 3;
    ball.add(shell);
    var inner = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uCol: colU, uBeam: { value: beam.clone() }, uGain: { value: 1 } },
      vertexShader:
        "varying vec3 vW;\nvarying vec3 vO;\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vO = position;" +
        " gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader:
        "varying vec3 vW;\nvarying vec3 vO;\nuniform vec3 uCol;\nuniform vec3 uBeam;\nuniform float uGain;\nvoid main(){\n" +
        " vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));\n" + /* the facet's own normal */
        " vec3 v = normalize(cameraPosition - vW);\n" +
        " if (dot(n, v) < 0.0) n = -n;\n" +
        " float lit = pow(max(dot(n, -uBeam), 0.0), 2.0);\n" + /* faces the torch */
        " float thru = pow(max(dot(reflect(uBeam, n), v), 0.0), 10.0) + pow(max(dot(refract(uBeam, n, 0.66), -v), 0.0), 14.0);\n" +
        " float body = 0.10 + 0.25 * pow(1.0 - abs(dot(n, v)), 2.0);\n" +
        " vec3 c = uCol * (body + 0.55 * lit + 2.6 * thru);\n" +
        /* split at the edges of a flash: toward white, with a cold and a warm side */
        " c += vec3(0.9, 0.5, 0.25) * 0.8 * pow(max(dot(reflect(uBeam, n), normalize(v + vec3(0.06, 0.0, 0.0))), 0.0), 26.0);\n" +
        " c += vec3(0.25, 0.5, 1.0) * 0.8 * pow(max(dot(reflect(uBeam, n), normalize(v - vec3(0.06, 0.0, 0.0))), 0.0), 26.0);\n" +
        " gl_FragColor = vec4(c * uGain, 1.0);\n}",
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
    }));
    inner.renderOrder = 3;
    /* the ball's core glints: what of it is the torch seen through or off
       the glass (the light coming at the eye) is in the glow source, above
       a threshold only, so it glints and does not blur */
    inner.material.uniforms.uGlow = { value: 0 };
    inner.material.fragmentShader = inner.material.fragmentShader.replace("uniform float uGain;", "uniform float uGain;\nuniform float uGlow;").replace("gl_FragColor = vec4(c * uGain, 1.0);", "if (uGlow > 0.5) c = max(c - 0.9, 0.0);\n gl_FragColor = vec4(c * uGain, 1.0);");
    Object.defineProperty(inner.material, "emissiveIntensity", {
      get: function () { return inner.material.uniforms.uGain.value; },
      set: function (v) {
        inner.material.uniforms.uGain.value = v;
        inner.material.uniforms.uGlow.value = v < 0.999 ? 1 : 0;
      }
    });
    glowDim.push({ m: inner.material, k: 0.6 });
    ball.add(asEmitter(inner));
    g.add(ball);

    /* THE FRAGMENTS (notes/glass-ball.md). Traced, not scattered. Every
       facet that faces the torch (1) throws a shard of the beam back off its
       face, and (2) lets the rest in, bent; that crosses the ball and leaves
       by the facet (or the two facets: a shard splits as it crosses an edge)
       on the far side, bent again and split by colour: the glass bends blue
       a little more than red, so an RGB torch's red and blue images land
       side by side, red at one end of a shard and blue at the other. Where
       it meets the far facet too steeply it reflects inside and leaves by
       another (on a desk the weak inner reflection also leaves as a faint
       shard). Each path ends on the wall, floor, ceiling or the plinth's top
       as one instance: a soft triangle (a facet's image) drawn out along the
       way the light arrives, never more than GF_ELONG times, fading as it
       grazes and with the distance travelled; nothing is removed for
       landing far or at a slant. On a desk every shard on the wall or the
       ceiling also lies, faint and smeared, in the floor's sheen (placed in
       the vertex shader from the camera). One InstancedMesh, one draw. */
    var pos = geo.attributes.position, fN = [], n3 = V3(0, 0, 0), pa = V3(0, 0, 0), pb = V3(0, 0, 0), pc = V3(0, 0, 0);
    for (i = 0; i < pos.count; i += 3) {
      pa.fromBufferAttribute(pos, i);
      pb.fromBufferAttribute(pos, i + 1);
      pc.fromBufferAttribute(pos, i + 2);
      fN.push(n3.copy(pa).add(pb).add(pc).normalize().clone());
    }
    /* several beams reach each facet: the torch's hot centre and, weaker
       and a few degrees off, the spill of its reflector (a real torch's
       facets throw a family of shards each). Desk 4, phone 3. */
    var NFC = fN.length, SL = COARSE ? 3 : 4, NRAY = COARSE ? 3 : 4, NQ = NRAY * NFC * SL, NI = COARSE ? NQ : NQ * 2;
    var RAYK = [1, 0.5, 0.35, 0.28], spill = [];
    for (i = 0; i < NFC * NRAY; i++) {
      var sa = hash(i * 1.9 + 17) * 6.2832, sr = 0.05 + 0.05 * Math.floor(i / NFC) + 0.06 * hash(i * 2.3 + 19);
      spill.push(V3(Math.cos(sa) * sr, 0, Math.sin(sa) * sr)); /* across the torch's axis (its own y) */
    }
    /* per slot: the triangle's turn, mark or reflection in the floor; its
       size and strength (a few large bright sharp ones, many small faint
       ones) and how it sparkles as the ball turns */
    var info = new Float32Array(NI * 3), sz = new Float32Array(NQ), br = new Float32Array(NQ), tw = new Float32Array(NQ * 4);
    for (i = 0; i < NQ; i++) {
      var hb = hash(i * 4.7 + 1), hs = hash(i * 6.1 + 3);
      info[i * 3] = hash(i * 8.3 + 2) * 6.2832;
      info[i * 3 + 2] = hash(i * 9.7 + 23); /* how far from equal its corners are */
      sz[i] = hb > 0.9 ? 0.02 + 0.012 * hs : hb > 0.55 ? 0.011 + 0.007 * hs : 0.006 + 0.005 * hs;
      br[i] = hb > 0.9 ? 1.7 + 0.6 * hs : hb > 0.55 ? 0.8 + 0.5 * hs : 0.35 + 0.4 * hs;
      tw[i * 4] = 9 + 26 * hash(i * 2.9 + 5);
      tw[i * 4 + 1] = 6.2832 * hash(i * 3.7 + 7);
      tw[i * 4 + 2] = 4 + 9 * hash(i * 5.3 + 11);
      tw[i * 4 + 3] = 6.2832 * hash(i * 7.1 + 13);
      if (NI > NQ) {
        info[(NQ + i) * 3] = info[i * 3];
        info[(NQ + i) * 3 + 1] = 1;
        info[(NQ + i) * 3 + 2] = info[i * 3 + 2];
      }
    }
    var qg = new THREE.PlaneGeometry(1, 1);
    qg.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 3));
    var sm = new THREE.ShaderMaterial({
      uniforms: { uGain: { value: 1 }, uGlow: { value: 0 }, uCol: colU },
      vertexShader:
        "attribute vec3 aInfo;\nvarying vec2 vP;\nvarying vec3 vI;\nvarying vec2 vN0;\nvarying vec2 vN1;\nvarying vec2 vN2;\nvoid main(){\n vP = position.xy * 2.0;\n" +
        "#ifdef USE_INSTANCING_COLOR\n vI = instanceColor;\n#else\n vI = vec3(0.0);\n#endif\n" +
        " float r = aInfo.x, r1 = r + 2.0944 + (aInfo.z - 0.5) * 0.9, r2 = r + 4.1888 + (fract(aInfo.z * 7.13) - 0.5) * 0.9;\n vN0 = vec2(cos(r), sin(r)); vN1 = vec2(cos(r1), sin(r1)); vN2 = vec2(cos(r2), sin(r2));\n" +
        " vec3 w;\n" +
        " if (aInfo.y > 0.5) {\n" +
        /* the reflection in the floor's sheen: the mark mirrored in the floor,
           seen from the camera, lying on the floor, smeared toward the eye */
        "  vec3 P = instanceMatrix[3].xyz, C = cameraPosition, M = vec3(P.x, -P.y, P.z);\n" +
        "  float s = C.y / max(C.y - M.y, 1e-3);\n  vec3 F = mix(C, M, s);\n" +
        "  vec2 u = normalize(F.xz - C.xz + vec2(1e-4, 0.0));\n  float acr = length(instanceMatrix[1].xyz) * s;\n" +
        "  w = vec3(F.x, 0.006, F.z) + vec3(u.x, 0.0, u.y) * position.x * acr * 3.5 + vec3(-u.y, 0.0, u.x) * position.y * acr * 1.4;\n" +
        "  vI.b = 0.0;\n" +
        " } else w = (instanceMatrix * vec4(position, 1.0)).xyz;\n" +
        " gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(w, 1.0);\n}",
      fragmentShader:
        "varying vec2 vP;\nvarying vec3 vI;\nvarying vec2 vN0;\nvarying vec2 vN1;\nvarying vec2 vN2;\nuniform float uGain;\nuniform float uGlow;\nuniform vec3 uCol;\n" +
        /* a facet's image: a triangle (inradius 0.24 of the half-quad) */
        "float tri(vec2 p){ return max(dot(p, vN0), max(dot(p, vN1), dot(p, vN2))); }\n" +
        /* the glass spreads it along the shard by +-dq: seven images from
           blue (-dq) to red (+dq), each carrying its part of the spectrum;
           the parts of each of r, g, b add up to one, so an unspread shard
           is just the torch's colour */
        "const vec3 SN = vec3(1.0 / 3.0, 1.0 / 3.45, 1.0 / 2.65);\n" +
        "vec3 spec(int i){ return i == 0 ? vec3(0.05, 0.1, 1.0) : i == 1 ? vec3(0.0, 0.35, 0.9) : i == 2 ? vec3(0.0, 0.75, 0.6) : i == 3 ? vec3(0.2, 1.0, 0.15) : i == 4 ? vec3(0.75, 0.8, 0.0) : i == 5 ? vec3(1.0, 0.4, 0.0) : vec3(1.0, 0.05, 0.0); }\n" +
        "void main(){\n vec2 p = vP;\n float ext = max(floor(vI.g) / 16.0, 1.0), e = 0.015 + 0.2 * fract(vI.g), dq = vI.b;\n" +
        " vec2 q = vec2(p.x * ext, p.y);\n" +
        " vec3 sp = vec3(0.0);\n float dMin = 9.0, dC = 9.0;\n" +
        " for (int i = 0; i < 7; i++) {\n  float di = tri(q - vec2(dq * (float(i) - 3.0) / 3.0, 0.0));\n" +
        "  sp += spec(i) * smoothstep(0.24 + e, 0.24 - e, di);\n  dMin = min(dMin, di);\n  if (i == 3) dC = di;\n }\n" +
        " sp *= SN;\n" +
        /* a bright core, a faint halo */
        " float core = smoothstep(0.24, -0.12, dC);\n" +
        " float halo = 0.09 * (1.0 - smoothstep(0.2, 0.62, dMin));\n" +
        " vec3 c = uCol * sp * (0.7 + 0.8 * core) + uCol * halo;\n" +
        /* whatever the torch's colour, a little of the whole spectrum where
           the shard is spread: warm at its red end, cold at its blue */
        " float lum = max(uCol.r, max(uCol.g, uCol.b)), mC = smoothstep(0.24 + e, 0.24 - e, dC);\n" +
        " c += lum * 0.35 * max(sp - vec3(mC), 0.0);\n" +
        " c *= (1.0 - smoothstep(0.8, 1.0, max(abs(p.x), abs(p.y)))) * vI.r * uGain;\n" +
        /* in the glow source only the hottest cores: a glint, not a blur */
        " if (uGlow > 0.5) c = max(c - 0.7, 0.0) * 0.7;\n" +
        " gl_FragColor = vec4(c, 1.0);\n}",
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    /* its share of the glow is set like any other emitter's (glowDim); the
       glow source is the only place that asks for less than 1 */
    Object.defineProperty(sm, "emissiveIntensity", {
      get: function () { return sm.uniforms.uGain.value; },
      set: function (v) {
        sm.uniforms.uGain.value = v;
        sm.uniforms.uGlow.value = v < 0.999 ? 1 : 0;
      }
    });
    glowDim.push({ m: sm, k: 0.6 });
    glowDim.push({ m: cone.material, k: 0.5 });
    var sc = new THREE.InstancedMesh(qg, sm, NI);
    sc.frustumCulled = false;
    sc.renderOrder = 2;
    scene.add(asEmitter(sc));

    var M4 = new THREE.Matrix4(), col = new THREE.Color(), d = V3(0, 0, 0), a = V3(0, 0, 0), b = V3(0, 0, 0), hit = V3(0, 0, 0), o = V3(0, 0, 0);
    var ta = V3(0, 0, 0), tb = V3(0, 0, 0), bL = V3(0, 0, 0), pI = V3(0, 0, 0), nf = V3(0, 0, 0), q1 = V3(0, 0, 0), q2 = V3(0, 0, 0);
    var dv = V3(0, 0, 0), oG = V3(0, 0, 0), oR = V3(0, 0, 0), oB = V3(0, 0, 0), qi = new THREE.Quaternion(), NB = new Float64Array(4);
    var NBW = V3(0, 0, -1), NEW = V3(-1, 0, 0), NSW = V3(1, 0, 0); /* the closed room's walls (RB) */
    var NW = V3(0, 0, 1), NC = V3(0, -1, 0), NF = V3(0, 1, 0), last = null, coneT = cone.material.uniforms.uT;
    var bW = V3(0, 0, 0), ETA = [1.511, 1.522, 1.537]; /* red, green, blue: a dense glass, its spread a little generous */
    var GF_ELONG = 3.2, GF_SPIN = 0.045, GF_HUE = 45; /* the longest a shard is drawn out; the ball's own turn, rad/s */
    /* GLSL's refract(): false where the light cannot get out */
    function refr(I, N, eta, out) {
      var c = N.dot(I), k = 1 - eta * eta * (1 - c * c);
      if (k < 0) return false;
      out.copy(I).multiplyScalar(eta).addScaledVector(N, -(eta * c + Math.sqrt(k)));
      return true;
    }
    /* the two facets nearest a point on the ball (ball's own frame): looked
       up among the ten nearest the centre of its cell (a cube map, 6 x 8 x 8,
       made once), not among all 180 */
    function cellOf(q) {
      var ax = Math.abs(q.x), ay = Math.abs(q.y), az = Math.abs(q.z), fc, u, v, m;
      if (ax >= ay && ax >= az) {
        fc = q.x > 0 ? 0 : 1;
        m = ax;
        u = q.y;
        v = q.z;
      } else if (ay >= az) {
        fc = q.y > 0 ? 2 : 3;
        m = ay;
        u = q.x;
        v = q.z;
      } else {
        fc = q.z > 0 ? 4 : 5;
        m = az;
        u = q.x;
        v = q.y;
      }
      return fc * 64 + Math.min(7, Math.floor((u / m + 1) * 4)) * 8 + Math.min(7, Math.floor((v / m + 1) * 4));
    }
    var CELL = [], cq = V3(0, 0, 0), ci, cu, cv, cf;
    for (cf = 0; cf < 6; cf++)
      for (cu = 0; cu < 8; cu++)
        for (cv = 0; cv < 8; cv++) {
          var uu = (cu + 0.5) / 4 - 1, vv = (cv + 0.5) / 4 - 1, sg = cf % 2 ? -1 : 1;
          if (cf < 2) cq.set(sg, uu, vv);
          else if (cf < 4) cq.set(uu, sg, vv);
          else cq.set(uu, vv, sg);
          cq.normalize();
          var ord = [];
          for (ci = 0; ci < NFC; ci++) ord.push(ci);
          ord.sort(function (x, y) { return fN[y].dot(cq) - fN[x].dot(cq); });
          CELL[cf * 64 + cu * 8 + cv] = ord.slice(0, 10);
        }
    function near2(q) {
      var b1 = -2, b2 = -2, j1 = 0, j2 = 0, j, c, L = CELL[cellOf(q)], li;
      for (li = 0; li < L.length; li++) {
        j = L[li];
        c = fN[j].dot(q);
        if (c > b1) {
          b2 = b1;
          j2 = j1;
          b1 = c;
          j1 = j;
        } else if (c > b2) {
          b2 = c;
          j2 = j;
        }
      }
      NB[0] = j1;
      NB[1] = j2;
      NB[2] = b1;
      NB[3] = b2;
    }
    /* one colour's way through: in at facet n, out by facet ja, or (jb >= 0)
       reflected inside at ja and out by jb */
    function path(n, ja, jb, eta, out) {
      if (!refr(bL, n, 1 / eta, pI)) return false;
      var f = fN[ja];
      if (jb >= 0) {
        pI.addScaledVector(f, -2 * pI.dot(f));
        f = fN[jb];
      }
      return pI.dot(f) > 0 && refr(pI, nf.copy(f).negate(), eta, out);
    }
    function off(k) {
      M4.makeScale(0, 0, 0);
      sc.setMatrixAt(k, M4);
      if (NI > NQ) sc.setMatrixAt(NQ + k, M4);
    }
    /* lay slot k: direction dL (ball's frame) leaving at facet of; dsp: red
       minus blue (or null); W: its strength; refl: a reflection off a face */
    function lay(k, dL, dsp, of, W, ang) {
      if (W < 0.004) return off(k);
      d.copy(dL).applyQuaternion(ball.quaternion);
      o.copy(fN[of]).applyQuaternion(ball.quaternion).multiplyScalar(R).add(bc);
      var t = 1e9, n = null, tt, top = false;
      if (d.z < -1e-3) {
        tt = (0.006 - o.z) / d.z;
        if (tt < t) {
          t = tt;
          n = NW;
        }
      }
      if (d.y > 1e-3) {
        tt = (CEIL - 0.006 - o.y) / d.y;
        if (tt < t) {
          t = tt;
          n = NC;
        }
      }
      /* the closed room: the back wall and the end walls stop what reaches them */
      if (RB && d.z > 1e-3) {
        tt = (RB.d - 0.006 - o.z) / d.z;
        if (tt < t) {
          t = tt;
          n = NBW;
        }
      }
      if (RB && Math.abs(d.x) > 1e-3) {
        tt = ((d.x > 0 ? RB.xe - 0.006 : RB.xs + 0.006) - o.x) / d.x;
        if (tt < t) {
          t = tt;
          n = d.x > 0 ? NEW : NSW;
        }
      }
      if (d.y < -1e-3) {
        /* the plinth's top first: what leaves the ball downward lands there
           if it is over it */
        tt = (TOPY + 0.004 - o.y) / d.y;
        hit.copy(o).addScaledVector(d, tt);
        if (tt > 0 && Math.abs(hit.x - x0) < PW / 2 && Math.abs(hit.z - PZ) < PD / 2) {
          top = true;
          if (tt < t) {
            t = tt;
            n = NF;
          }
        } else {
          tt = (0.006 - o.y) / d.y;
          if (tt < t) {
            t = tt;
            n = NF;
          }
        }
      }
      /* nothing back into the torch, under the ball, or off the room's end */
      if (!n || t > 16 || d.dot(beam) < -0.992 || (top && Math.hypot(o.x + d.x * t - bc.x, o.z + d.z * t - bc.z) < R * 0.75)) return off(k);
      hit.copy(o).addScaledVector(d, t);
      if (hit.z > ROOM_D) return off(k);
      var cosi = Math.abs(d.dot(n));
      a.copy(d).addScaledVector(n, -d.dot(n));
      if (a.lengthSq() < 1e-8) a.set(1, 0, 0);
      a.normalize();
      b.crossVectors(n, a);
      /* the facet's image grows with the way it has come (the beam spreads),
         up to 3.5 m (beyond, it only gets smaller in the eye and fainter); drawn out along its arrival, at most GF_ELONG times */
      var el = Math.min(1 / Math.max(cosi, 0.05), GF_ELONG);
      var Q = (sz[k] * (COARSE ? 1.2 : 1) * (0.5 + 0.35 * Math.min(t, 3.5))) / 0.12; /* (a little larger in a phone's narrow frame) */
      /* red and blue apart along the shard (in the triangle's own units: its
         inradius is 0.24), red at +dq, blue at -dq, the spectrum between:
         far shards become short spectra. The quad grows by `ext`
         to hold them; the whole mark is never more than 6 x as long as wide; spread out, it is dimmer */
      var dq = 0.025, ext;
      if (dsp) {
        dv.copy(dsp).applyQuaternion(ball.quaternion);
        dq = clamp((2 * dv.dot(a) * t) / (Q * el), -0.9, 0.9);
        if (Math.abs(dq) < 0.025) dq = dq < 0 ? -0.025 : 0.025;
      }
      ext = Math.max(1, 0.62 + Math.abs(dq));
      if (el * ext > 6) {
        ext = 6 / el;
        dq = (dq < 0 ? -1 : 1) * Math.max(0.025, ext - 0.62);
      }
      M4.makeBasis(ta.copy(a).multiplyScalar(Q * el * ext), tb.copy(b).multiplyScalar(Q), n);
      M4.setPosition(hit);
      sc.setMatrixAt(k, M4);
      /* sparkle: each shard brightens and fades at its own rate as the ball
         turns (so nothing moves unless the ball does) */
      var j = k * 4, sp = 0.78 + 0.22 * Math.sin(ang * tw[j] + tw[j + 1]) + 1.3 * Math.pow(Math.max(0, Math.sin(ang * tw[j + 2] + tw[j + 3])), 30);
      var I = (W * br[k] * sp * (0.5 + 0.5 * cosi) * sstep(cosi, 0.02, 0.2)) / (1 + 0.05 * t * t) / Math.pow(ext, 0.7);
      var soft = clamp(0.1 + 0.07 * t + (dsp ? 0.06 : 0) - (br[k] > 1.6 ? 0.08 : 0) + (k >= NFC * SL ? 0.3 : 0), 0.03, 0.85); /* the spill's images are soft: it comes from the whole reflector */
      /* (green carries both: 16 x the stretch, whole; the edge's softness, the fraction) */
      sc.setColorAt(k, col.setRGB(I * GF_GAIN, Math.floor(ext * 16) + soft, dq));
      if (NI > NQ) {
        if (n === NF) {
          M4.makeScale(0, 0, 0);
          sc.setMatrixAt(NQ + k, M4);
        } else {
          sc.setMatrixAt(NQ + k, M4.makeBasis(ta, tb, n).setPosition(hit));
          sc.setColorAt(NQ + k, col.setRGB(I * GF_GAIN * 0.1, 16.9, 0));
        }
      }
    }
    var GF_GAIN = 4;
    /* ang: how far the ball has turned on its ring; hue: where on the wheel
       the torch is */
    RIG.gf = function (ang, hue) {
      /* and the colour goes round its wheel in GF_HUE s, not the clock's 28 */
      if (!REDUCED && FOCUS !== "turn") hue = GF.t / GF_HUE;
      torchColour(hue || 0, colU.value);
      lensMat.color.copy(colU.value).multiplyScalar(2.2).addScalar(0.25);
      S.uCol.value.copy(colU.value).multiplyScalar(washK);
      if (RB && RTU && RTU.uFC) { RB.gfLive = true; RTU.uFC.value[3].copy(colU.value).multiplyScalar(RB.far[3][2]); } /* the closed room: the torch's colour, faintly, on the far walls */
      coneT.value = GF.t;
      /* the ball's own turn (motion on) is slower than the station's clock
         gives it, GF_SPIN; with motion off the Colour control turns it too,
         so the slider sweeps the light round the room as it changes colour */
      if (REDUCED) ang += (hue || 0) * 2.0;
      else if (FOCUS !== "turn") ang += GF.t * (GF_SPIN - 0.16);
      if (last !== null && Math.abs(ang - last) < 1e-5) return;
      last = ang;
      ball.rotation.set(0.21, ang, 0.08);
      ball.updateMatrix();
      qi.copy(ball.quaternion).invert();
      var k, f, s, cb, j1, j2, c1, c2, w2, Wt, Fr, ok, ry, rk;
      for (ry = 0; ry < NRAY * NFC; ry++) {
        f = ry % NFC;
        rk = RAYK[Math.floor(ry / NFC)];
        s = ry * SL;
        if (ry < NFC) bL.copy(beam);
        else bL.copy(beam).add(bW.copy(spill[ry]).applyQuaternion(torch.quaternion)).normalize();
        bL.applyQuaternion(qi);
        cb = -fN[f].dot(bL);
        if (cb <= 0.02) {
          for (k = 0; k < SL; k++) off(s + k);
          continue;
        }
        Fr = 0.04 + 0.96 * Math.pow(1 - cb, 5);
        /* 1. off the face */
        oG.copy(bL).addScaledVector(fN[f], 2 * cb);
        lay(s, oG, null, f, rk * cb * (0.9 + 1.6 * Fr), ang);
        /* 2. through: where the light inside meets the far side */
        Wt = rk * cb * (1 - Fr);
        refr(bL, fN[f], 1 / ETA[1], pI);
        q1.copy(fN[f]).addScaledVector(pI, -2 * fN[f].dot(pI));
        near2(q1);
        j1 = NB[0];
        j2 = NB[1];
        c1 = NB[2];
        c2 = NB[3];
        w2 = 0.5 * Math.max(0, 1 - (c1 - c2) / 0.02); /* across an edge it splits */
        for (k = 0; k < 2; k++) {
          var ja = k ? j2 : j1, wk = k ? w2 : 1 - w2, jb = -1;
          ok = path(fN[f], ja, -1, ETA[1], oG);
          if (!ok) {
            /* too steep to get out: it reflects inside and leaves elsewhere */
            refr(bL, fN[f], 1 / ETA[1], pI);
            pI.addScaledVector(fN[ja], -2 * pI.dot(fN[ja]));
            q2.copy(q1).addScaledVector(pI, -2 * q1.dot(pI));
            near2(q2);
            jb = NB[0];
            ok = path(fN[f], ja, jb, ETA[1], oG);
            wk *= 0.85;
          }
          if (ok && path(fN[f], ja, jb, ETA[0], oR) && path(fN[f], ja, jb, ETA[2], oB)) lay(s + 1 + k, oG, oR.sub(oB), jb >= 0 ? jb : ja, Wt * wk, ang);
          else if (ok) lay(s + 1 + k, oG, null, jb >= 0 ? jb : ja, Wt * wk, ang);
          else off(s + 1 + k);
          if (SL > 3 && k === 0) {
            /* 3. (desk) the little that reflects inside even where the light
               can get out, leaving by another facet: a faint shard */
            if (jb >= 0) off(s + 3);
            else {
              refr(bL, fN[f], 1 / ETA[1], pI);
              pI.addScaledVector(fN[ja], -2 * pI.dot(fN[ja]));
              q2.copy(q1).addScaledVector(pI, -2 * q1.dot(pI));
              near2(q2);
              jb = NB[0];
              if (path(fN[f], ja, jb, ETA[1], oG) && path(fN[f], ja, jb, ETA[0], oR) && path(fN[f], ja, jb, ETA[2], oB)) lay(s + 3, oG, oR.sub(oB), jb, Wt * (1 - w2) * 0.35, ang);
              else off(s + 3);
            }
          }
        }
      }
      sc.instanceMatrix.needsUpdate = true;
      if (sc.instanceColor) sc.instanceColor.needsUpdate = true;
    };
    /* every instance has a colour before the first picture is drawn */
    for (i = 0; i < NI; i++) sc.setColorAt(i, col.setRGB(0, 0, 0));
    RIG.gf(0, 0);
    /* for checking: one ball, how many facets, how many shards land and where */
    RIG.gfReach = function () {
      var on = 0, wall = 0, floor = 0, ceil = 0, left = 0, far = 0, xmin = 1e9, xmax = -1e9;
      var hist = { wall: [], floor: [], ceil: [] };
      for (var hk = 0; hk < 18; hk++) hist.wall[hk] = hist.floor[hk] = hist.ceil[hk] = 0;
      for (var k = 0; k < NQ; k++) {
        sc.getMatrixAt(k, M4);
        if (!(M4.elements[0] || M4.elements[1] || M4.elements[2])) continue;
        on++;
        var px = M4.elements[12], py = M4.elements[13], pz = M4.elements[14];
        if (pz < 0.01) wall++;
        else if (py < 0.01 && py > 0) floor++;
        else if (py > CEIL - 0.01) ceil++;
        if (px < bc.x) left++;
        if (Math.hypot(px - bc.x, py - bc.y, pz - bc.z) > 3) far++;
        xmin = Math.min(xmin, px);
        xmax = Math.max(xmax, px);
        /* light per metre along the room, by surface (x from 56 m) */
        var hb2 = Math.floor(px - 56), hs2 = pz < 0.01 ? "wall" : py > CEIL - 0.01 ? "ceil" : "floor";
        if (hb2 >= 0 && hb2 < 18 && sc.instanceColor) hist[hs2][hb2] = +(hist[hs2][hb2] + sc.instanceColor.array[k * 3]).toFixed(2);
      }
      return { balls: 1, facets: NFC, slots: NQ, instances: NI, landing: on, wall: wall, floor: floor, ceil: ceil, leftOfBall: left, beyond3m: far, x: [+xmin.toFixed(2), +xmax.toFixed(2)], colour: "#" + colU.value.getHexString(), perMetreFrom56: hist };
    };
  }

  /* ============================================================
     Camera
     ============================================================

     The views (where the camera stands and what it looks at, for every
     view of every station, desktop and phone) live in views.json, which
     the generator writes into the page (#rooms-views); ?tune=1 edits them
     live (see "Tune" below). Nothing here invents a view: this part only
     decides WHEN the camera is at which view and HOW it gets from one to
     the next.

     The rules (the artist: "calmer camera movement on object switch ...
     right now it's zoom out, tilt, zoom in, but all that could be one
     continuous motion"):
     - one lens, always (FOV); the lens never changes;
     - from one work to the next is ONE move: position and look-at travel
       together along one smooth curve, one ease in and one ease out, at
       a speed that is the same profile along the curve's length; no
       pause, no reversal, no roll. The curve stands out from the wall
       just far enough that the next work is in the frame before the last
       one leaves it;
     - at a work the camera holds still while the writing is read. It
       moves only to a view that shows something the first cannot, once
       per view, slowly; and while the object does something (taken
       apart, opened, gathered) the camera holds. */

  var FOV = 30;

  /* a pose: target, azimuth/elevation of the camera around it, distance */
  function P(tx, ty, tz, az, el, d) {
    return { tx: tx, ty: ty, tz: tz, az: az, el: el, d: d };
  }
  function mixP(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    return P(
      lerp(a.tx, b.tx, t), lerp(a.ty, b.ty, t), lerp(a.tz, b.tz, t),
      lerp(a.az, b.az, t), lerp(a.el, b.el, t), lerp(a.d, b.d, t)
    );
  }
  /* the hand: walking round a lamp. Dragging right brings its right side
     round to you. Never below the floor, never through the wall. */
  function orbit(p, h, k) {
    var q = P(p.tx, p.ty, p.tz, clamp(p.az - h.yaw * (k || 1), -78, 78), p.el + h.pitch, p.d);
    if (q.ty + Math.sin(q.el * RAD) * q.d < 0.12) q.el = Math.asin((0.12 - q.ty) / q.d) / RAD;
    /* ...and never into the ceiling (the views from above stand high) */
    if (q.ty + Math.sin(q.el * RAD) * q.d > CEIL - 0.22) q.el = Math.asin(clamp((CEIL - 0.22 - q.ty) / q.d, -1, 1)) / RAD;
    return q;
  }

  var vPos, vTgt, vA, vB, vC;

  function place(p, pos, tgt) {
    var a = p.az * RAD, e = p.el * RAD;
    tgt.set(p.tx, p.ty, p.tz);
    pos.set(
      p.tx + Math.sin(a) * Math.cos(e) * p.d,
      p.ty + Math.sin(e) * p.d,
      p.tz + Math.cos(a) * Math.cos(e) * p.d
    );
  }
  function toP(pos, tgt) {
    var dx = pos.x - tgt.x, dy = pos.y - tgt.y, dz = pos.z - tgt.z;
    var d = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy + dz * dz));
    return P(tgt.x, tgt.y, tgt.z, Math.atan2(dx, dz) / RAD, Math.asin(clamp(dy / d, -1, 1)) / RAD, d);
  }

  /* one gentle ease in and one ease out: a walk, not a lunge */
  function glide(t) {
    t = clamp(t, 0, 1);
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  /* ---- the views ---- */
  function viewSet() {
    return VIEWS[G.narrow ? "phone" : "desktop"];
  }
  /* The views were composed at a reference size (views.json "ref"). Where
     the free half is narrower for its height than that, the camera stands
     back by the same ratio, so nothing is cut; it never comes closer. */
  function vScale(st) {
    var R = viewSet().ref;
    var now = (st ? st.geo.freeW : G.W) / G.Hc, ref = (st ? R.free : R.w) / R.h;
    return Math.max(1, ref / Math.max(0.05, now));
  }
  function viewRaw(key, name) {
    var S = viewSet()[key];
    if (!name) return S;
    return (S && (S[name] || S.rest)) || null;
  }
  function viewP(st, name) {
    var v = st ? viewRaw(st.key, name) : viewRaw(name);
    vC.set(v.pos[0], v.pos[1], v.pos[2]);
    vB.set(v.at[0], v.at[1], v.at[2]);
    var p = toP(vC, vB);
    p.d *= vScale(st);
    return p;
  }

  /* ---- the plan at each station (motion on) ----
     A move goes to a view as the block of writing that names it comes up,
     and is done before that block reaches the upper third of the screen.
     An act is the object doing its thing, after the camera has arrived:
     out, held, back, all while the camera holds. */
  var MOVES = {
    /* from: "arrive" lets a beat's move start early: after a hold of
       `hold` screens once the camera has arrived (or once the move before
       it has ended), and then run slowly over what was a hold, still
       arriving where it did (the artist: at the pen, a short first still
       position and a longer first camera movement) */
    pen: [{ v: "top", beat: "top", from: "arrive", hold: 0.5 }, { v: "apart", beat: "apart", act: true }],
    cl: [{ v: "knot", beat: "knot", act: true }],
    sr: [{ v: "gap", beat: "gap" }, { v: "apart", beat: "apart", act: true }],
    /* the Light Box: no close-up; one slow walk round it, from the side
       the camera came from (rest) to the side it leaves by (round), over
       the whole station (walk: from arrival to the walk on, not a beat) */
    bx: [{ v: "round", walk: true }],
    /* Bulb Studies: the block's filament, then the man's head. The move
       between the two close views passes through "between" (views.json:
       stood back far enough that the block leaves as the man comes in), as
       one curve with one ease; close to the sill it showed bare sill */
    bs: [{ v: "one", beat: "filament" }, { v: "two", beat: "filament", second: true, via: "between" }],
    pu: [{ v: "row", beat: "row" }],
    gf: [{ v: "turn", beat: "turn" }],
    /* the chair has no beat: the camera walks round it (rest -> round) over
       the whole time it is there, from arriving to leaving, one ease (the
       artist: "on the chair wander around when scrolling"). The same arc as
       the slider "Walk round it" with motion off */
    fc: [{ v: "round", walk: true }]
  };

  /* THE PHONE'S PLAN. Each beat has its own stretch of the track: the camera
     goes to the beat's view over its first half screen; an act (out, held,
     back) follows while the camera holds and is back before the beat ends.
     The pen also goes to its tip on a phone (on a desk the tip passes with
     the camera at rest; on a phone there is no photograph beside it). */
  function planPhone(st) {
    var g = st.geo, H = G.H, L = (st.key === "pen" ? [{ v: "tip", beat: "tip", from: "arrive", hold: 0.5 }] : []).concat(MOVES[st.key] || []);
    var P0 = { moves: [], act: null, out: g.bottom - 0.5 * H };
    for (var k = 0; k < L.length; k++) {
      var m = L[k], b = g.beats[m.beat];
      if (m.walk) {
        P0.moves.push({ v: m.v, s: g.top + 0.05 * H, e: P0.out - 0.1 * H });
        continue;
      }
      if (!b) continue;
      var s = m.second ? b[0] + 0.62 * (b[1] - b[0]) - 0.45 * H : b[0] - 0.08 * H;
      /* (a long way to go: the beat is that much taller and the move takes
         that much longer, so it is a walk and not a lunge) */
      var e = s + ((m.second ? 0.45 : 0.5) + ((!m.second && g.far && g.far[m.beat]) || 0)) * H;
      if (m.from === "arrive") s = early(s, P0.moves, g, m.hold);
      P0.moves.push({ v: m.v, s: s, e: e, via: m.via });
      if (m.act) P0.act = { r0: e, r1: e + 0.26 * H, f0: b[1] - 0.42 * H, f1: b[1] - 0.1 * H };
    }
    return P0;
  }

  /* an early start (from: "arrive"), applied once a plan is otherwise
     settled, so nothing after it moves: hold screens after the arrival or
     the previous move's end, never later than it would have started */
  function early(s, done, g, hold) {
    var after = done.length ? done[done.length - 1].e : g.top;
    return Math.min(s, after + (hold == null ? 0.5 : hold) * G.H);
  }

  function plan(st) {
    if (G.narrow) return planPhone(st);
    var g = st.geo, H = G.H, n = G.narrow, L = MOVES[st.key] || [];
    var out = g.bottom - 0.5 * H; /* where the walk on begins (timeline) */
    var segs = [], k, m, b, e, bm;
    for (k = 0; k < L.length; k++) {
      m = L[k];
      if (m.walk) {
        segs.push({ kind: "move", v: m.v, s: g.top + 0.1 * H, e: out - 0.1 * H, min: 0.5 * H, gap: 0 });
        continue;
      }
      b = g.beats[m.beat];
      if (!b) continue;
      bm = g.bm[m.beat] || 0;
      if (m.second) e = n ? b[0] + bm * 0.55 : b[1] - 0.3 * H;
      else e = n ? b[0] - 0.22 * H : b[0] - 0.3 * H;
      segs.push({ kind: "move", v: m.v, via: m.via, from: m.from, hold: m.hold, s: e - 0.72 * H, e: e, min: 0.5 * H, gap: 0.25 * H });
      if (m.act) {
        segs.push({ kind: "rise", s: e, e: e + 0.34 * H, min: 0.24 * H, gap: 0 });
        var f1 = n ? b[0] + bm + 0.15 * H : b[1] - 0.1 * H;
        segs.push({ kind: "fall", s: f1 - 0.42 * H, e: f1, min: 0.28 * H, gap: 0.3 * H });
      }
    }
    /* in order, never overlapping, a held moment between two moves */
    var lo = g.top + 0.1 * H;
    for (k = 0; k < segs.length; k++) {
      var sg = segs[k], len = Math.max(sg.min, sg.e - sg.s);
      var after = k ? segs[k - 1].e + sg.gap : lo;
      if (sg.s < after) sg.s = after;
      sg.e = Math.max(sg.e, sg.s + Math.min(len, sg.min));
      if (sg.e - sg.s < sg.min) sg.e = sg.s + sg.min;
    }
    /* ...and all of it done before the walk on begins */
    var lim = out - 0.04 * H;
    if (segs.length && segs[segs.length - 1].e > lim) {
      var a0 = segs[0].s, f = (lim - a0) / Math.max(1, segs[segs.length - 1].e - a0);
      f = Math.max(0.2, f);
      for (k = 0; k < segs.length; k++) {
        segs[k].s = a0 + (segs[k].s - a0) * f;
        segs[k].e = a0 + (segs[k].e - a0) * f;
      }
    }
    var P0 = { moves: [], act: null, out: out };
    for (k = 0; k < segs.length; k++) {
      if (segs[k].kind === "move")
        P0.moves.push({ v: segs[k].v, s: segs[k].from === "arrive" ? early(segs[k].s, P0.moves, g, segs[k].hold) : segs[k].s, e: segs[k].e, via: segs[k].via });
      else if (segs[k].kind === "rise") P0.act = { r0: segs[k].s, r1: segs[k].e, f0: 0, f1: 0 };
      else if (P0.act) {
        P0.act.f0 = segs[k].s;
        P0.act.f1 = segs[k].e;
      }
    }
    return P0;
  }

  /* from a to b through v (at the middle), one smooth curve: a quadratic
     whose control point puts v on it at t = 0.5 */
  function viaP(a, v, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    var c = P(2 * v.tx - (a.tx + b.tx) / 2, 2 * v.ty - (a.ty + b.ty) / 2, 2 * v.tz - (a.tz + b.tz) / 2,
      2 * v.az - (a.az + b.az) / 2, 2 * v.el - (a.el + b.el) / 2, 2 * v.d - (a.d + b.d) / 2);
    return mixP(mixP(a, c, t), mixP(c, b, t), t);
  }
  function hasView(st, name) {
    var S = viewRaw(st.key);
    return !!(name && S && S[name]);
  }

  /* where the camera is at a station, motion on: from scroll, by the plan */
  function planP(st) {
    var M = st.plan.moves, y = T.y, p = viewP(st, "rest"), k;
    for (k = 0; k < M.length; k++) {
      var m = M[k];
      if (y >= m.e) {
        p = viewP(st, m.v);
        continue;
      }
      if (y > m.s) {
        var gt = glide((y - m.s) / (m.e - m.s));
        p = m.via && hasView(st, m.via) ? viaP(p, viewP(st, m.via), viewP(st, m.v), gt) : mixP(p, viewP(st, m.v), gt);
      }
      break;
    }
    return p;
  }

  /* motion off (and the ?focus= dev aid): from the slider and the pen's
     view buttons, through the same views */
  function stillP(st) {
    var p = viewP(st, "rest"), w = st.w;
    if (st.key === "sr") {
      var a = wt(st, "gap"), c = wt(st, "apart"), side = Math.min(1, a + c);
      return side > 0 ? mixP(p, mixP(viewP(st, "gap"), viewP(st, "apart"), st.cfg.apart ? c : 0), side) : p;
    }
    if (st.key === "bs") {
      var f2 = (st.p && st.p.filament) || 0;
      return mixP(p, hasView(st, "between") ? viaP(viewP(st, "one"), viewP(st, "between"), viewP(st, "two"), f2) : mixP(viewP(st, "one"), viewP(st, "two"), f2), wt(st, "filament"));
    }
    var S = viewRaw(st.key);
    for (var name in w) if (w[name] > 0 && name !== "rest" && S[name]) p = mixP(p, viewP(st, name), w[name]);
    return p;
  }

  function stationP(st) {
    return REDUCED || FOCUS || !st.plan ? stillP(st) : planP(st);
  }

  /* ---- from one work to the next: one curve ----
     The camera's path is a cubic from where it stands to where it will
     stand, bowed out from the wall only as far as it takes for the frame
     to hold both works at the handover (OUT: how far out, as a share of the
     distance along the wall; none on a phone, whose frame is too narrow
     for any bow to help). It is walked by length, with one ease, so the
     speed rises once and falls once. The look-at travels with it, a little
     ahead (the eye leads the feet), along the wall from the one work to
     the other. */
  /* OUT: metres of each work allowed to fall outside the frame at the
     handover; SKEW: how far along the wall the curve's ends lean (none: it
     steps straight back and straight in); TURNMIX: how much of the head's
     turn is spread over the whole walk rather than round the handover;
     TURNW: over how much of a screen of scroll that turn is centred */
  var OUT = 0, SKEW = 0, TURNMIX = 0.3, TURNW = 0.15, TURNZ = 3;
  var bl = [];
  function yawOf(d) {
    return Math.atan2(d.x, -d.z) / RAD;
  }
  /* how far apart (degrees) the two views' headings are */
  function headDiff(A, B) {
    place(A.p, vA, vB);
    var y1 = Math.atan2(vB.x - vA.x, vA.z - vB.z);
    place(B.p, vA, vB);
    var y2 = Math.atan2(vB.x - vA.x, vA.z - vB.z);
    return Math.abs(((((y1 - y2) / RAD) % 360) + 540) % 360 - 180);
  }
  function cross(A, B, r, o) {
    r = clamp(r, 0, 1);
    var T0 = A.tm, f = glide(Math.pow(r, T0 ? T0.g : 1)), h = f;
    /* the turn so far, at its most: the head never turns back. (Where the
       camera turns round, views more than 120 degrees apart, no frame holds
       both works, and held on the one, then the other, it whipped round
       between them in 150 px: there it turns once, smoothly, over a wide
       stretch round the handover, and a little all the way) */
    if (T0 && headDiff(A, B) > 120) {
      var W = Math.max(T0.w, 0.2);
      h = 0.2 * f + 0.8 * sstep(r, T0.c - W, T0.c + W);
    } else if (T0) {
      /* (the turn as wanted at 40 points along the walk, joined by straight
         lines, and the most of that so far) */
      var NJ = 40, k0 = Math.min(NJ - 1, Math.floor(r * NJ)), j, m = 0, w0 = 0;
      for (j = 0; j <= k0; j++) m = Math.max(m, (w0 = headRaw(A, B, j / NJ, o)));
      h = Math.max(m, lerp(w0, headRaw(A, B, (k0 + 1) / NJ, o), r * NJ - k0));
    }
    crossAt(A, B, f, o, h);
  }
  function headRaw(A, B, r, o) {
    var T0 = A.tm;
    if (r <= T0.r1) return headAt(A, B, r, o);
    /* once the band of the one coming is up, never so far, nor so little,
       that that work is not in the half its writing leaves free */
    var fb = glide(Math.pow(r, T0.g)), hb = headBase(T0, r, fb), iv = lockB(A, B, fb);
    return iv ? clamp(hb, iv[0], iv[1]) : hb;
  }
  /* the head turns once, around the handover, and a little all the way */
  function headBase(T0, r, f) {
    return TURNMIX * f + (1 - TURNMIX) * sstep(r, T0.c - T0.w, T0.c + T0.w);
  }
  /* ...but while the band of the one being left is still up, at least as
     far as it takes to keep that work where it was in the frame (as you
     step back from a thing you keep looking at it); only ever further the
     way it is turning: the most it has needed so far */
  function headAt(A, B, r, o) {
    var T0 = A.tm, h = headBase(T0, r, glide(Math.pow(r, T0.g)));
    if (!A.lockA) return h;
    var hl = 0, k, top = Math.min(r, T0.c);
    for (k = 1; k <= 16 && k / 16 <= top; k++) hl = Math.max(hl, lockH(A, B, glide(Math.pow(k / 16, T0.g)), o));
    if (k <= 16 && top > (k - 1) / 16) hl = Math.max(hl, lerp(hl, Math.max(hl, lockH(A, B, glide(Math.pow(k / 16, T0.g)), o)), (top - (k - 1) / 16) * 16));
    return Math.max(h, hl);
  }
  function lockB(A, B, f) {
    lockH(A, B, f, null);
    var lo = -1, hi = -1, bj = 0, bd = 1e9;
    for (var j = 0; j <= 32; j++) {
      crossAt(A, B, f, lk, j / 32);
      lcam.position.copy(lk.pos);
      lcam.lookAt(lk.tgt);
      lcam.setViewOffset(G.W, G.Hc, (0.5 - lk.cx) * G.W, (0.5 - lk.cy) * G.Hc, G.W, G.Hc);
      lcam.updateMatrixWorld(true);
      lv.copy(lk.tb).project(lcam);
      var x = (lv.x + 1) / 2;
      if (lv.z < 1 && Math.abs(lv.y) < 1 && (B.cx < 0.5 ? x < 0.46 && x > 0.04 : x > 0.54 && x < 0.96)) {
        if (lo < 0) lo = j / 32;
        hi = j / 32;
      }
      /* (if none will do, the one that comes nearest) */
      var miss = lv.z < 1 ? Math.abs(x - (B.cx < 0.5 ? 0.25 : 0.75)) : 9;
      if (miss < bd) {
        bd = miss;
        bj = j / 32;
      }
    }
    return lo < 0 ? [bj, bj] : [lo, hi];
  }
  /* the share of the turn at which the camera, standing where it stands at
     f, looks straight at what A looked at */
  var lk = null, lcam = null, lv = null;
  function lockH(A, B, f, o) {
    if (!lk) {
      lk = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), pa: new THREE.Vector3(), ta: new THREE.Vector3(), pb: new THREE.Vector3(), tb: new THREE.Vector3() };
      lcam = camera.clone();
      lv = new THREE.Vector3();
    }
    var best = 0, bd = 1e9;
    for (var j = 0; j <= 32; j++) {
      crossAt(A, B, f, lk, j / 32);
      lcam.fov = FOV;
      lcam.aspect = G.W / G.Hc;
      lcam.position.copy(lk.pos);
      lcam.lookAt(lk.tgt);
      lcam.setViewOffset(G.W, G.Hc, (0.5 - lk.cx) * G.W, (0.5 - lk.cy) * G.Hc, G.W, G.Hc);
      lcam.updateMatrixWorld(true);
      lv.copy(lk.ta).project(lcam);
      var ex = (lv.x + 1) / 2 - A.cx, ey = ((1 - lv.y) / 2 - A.cy) * (G.Hc / G.W), d = ex * ex + ey * ey;
      if (d < bd - 1e-7) {
        bd = d;
        best = j / 32;
      }
    }
    return best;
  }
  function crossAt(A, B, f, o, h) {
    var pa = o.pa, ta = o.ta, pb = o.pb, tb = o.tb;
    place(A.p, pa, ta);
    place(B.p, pb, tb);
    /* How far out the middle of the curve must stand for the frame to hold
       both works: half the distance between what the two views look at,
       less a little of each work, over the half-width of the frame. On a
       phone the frame is too narrow for any bow to help, and from the last
       work to the end the camera turns round: there, none. */
    var tx = Math.tan((FOV * RAD) / 2) * (G.W / G.Hc), span = Math.abs(tb.x - ta.x);
    /* ...and none where the two views look more than 120 degrees apart (from
       the window's close view, looking back at the man, to the chair's view,
       looking on down the room): no frame holds both, and a bow only pulls
       the camera far out to turn it round. It walks along the room close
       to the wall and turns as it goes. */
    var turn = headDiff(A, B) > 120;
    var need = G.narrow || span > 14 || turn ? 0 : (span / 2 - OUT) / tx + (ta.z + tb.z) / 2;
    /* The curve leaves along the line the camera was looking down (it steps
       back from the work, which stays where it was in the frame) and
       arrives along the line it will look down (it steps in), never back
       up the room. How far: so that its middle stands out at `need`. */
    var dx = pb.x - pa.x, sg = dx < 0 ? -1 : 1;
    vA.subVectors(pa, ta).normalize();
    vB.subVectors(pb, tb).normalize();
    if (vA.x * sg < 0) vA.x = 0;
    if (vB.x * sg > 0) vB.x = 0;
    var bzs = Math.max(0.3, vA.z + vB.z);
    var m = Math.max(0.18 * Math.abs(dx), (need - (pa.z + pb.z) / 2) * (8 / 3) / bzs);
    var c1x = pa.x + vA.x * m, c2x = pb.x + vB.x * m;
    var NS, i, u, w0, w1, w2, w3, x, y, z, px, py, pz, L;
    c1x = pa.x + sg * clamp((c1x - pa.x) * sg, SKEW * Math.abs(dx), 0.45 * Math.abs(dx));
    c2x = pb.x - sg * clamp((pb.x - c2x) * sg, SKEW * Math.abs(dx), 0.45 * Math.abs(dx));
    /* THE ROOM'S GUARD. A cubic stays inside the hull of its four points,
       so with both inner points in the room the curve is: never behind the
       wall (only where a view itself stands behind its plane, and then only
       on the last stretch of the approach to it), never out at the far side
       of the room. Bounding the points, not the path: no kink. (y is
       bounded the same way just below.) */
    var c1z = clamp(pa.z + vA.z * m, 0.5, ROOM_D - 0.3), c2z = clamp(pb.z + vB.z * m, 0.5, ROOM_D - 0.3);
    var c1y = clamp(pa.y + vA.y * m, 0.4, CEIL - 0.4), c2y = clamp(pb.y + vB.y * m, 0.4, CEIL - 0.4);
    /* Turning round (views more than 120 degrees apart): along the room,
       its middle TURNZ m out from the wall (the wall and the works beside
       it in the frame as it turns, not a blank wall at arm's length), at
       the heights of the two views, stepping in to the next view square
       to the wall */
    if (turn && !G.narrow) {
      c1z = c2z = clamp((8 * Math.max(TURNZ, (pa.z + pb.z) / 2) - pa.z - pb.z) / 6, 0.5, ROOM_D - 0.3);
      c1x = pa.x + sg * 0.25 * Math.abs(dx);
      c2x = pb.x - sg * 0.25 * Math.abs(dx);
      c1y = clamp(pa.y, 0.4, CEIL - 0.4);
      c2y = clamp(pb.y, 0.4, CEIL - 0.4);
    }
    if (RB) {
      /* THE CLOSED ROOM'S GUARD: the curve as it was wherever it stays
         RB.keep inside the back wall (most do: the open room's curves
         reach 11 m); where it would not, its inner points are brought in
         just so far that it does (then it is still a smooth curve), and
         the end walls bound them as the art wall does */
      c1x = clamp(c1x, RB.xs + RB.keep, RB.xe - RB.keep);
      c2x = clamp(c2x, RB.xs + RB.keep, RB.xe - RB.keep);
      for (var gk = 0; gk < 12; gk++) {
        var zmax = -1e9;
        for (i = 0; i <= 20; i++) {
          u = i / 20;
          z = (1 - u) * (1 - u) * (1 - u) * pa.z + 3 * u * (1 - u) * (1 - u) * c1z + 3 * u * u * (1 - u) * c2z + u * u * u * pb.z;
          if (z > zmax) zmax = z;
        }
        if (zmax <= ROOM_IN + 1e-4) break;
        c1z = Math.max(0.5, c1z - (zmax - ROOM_IN) / 0.7);
        c2z = Math.max(0.5, c2z - (zmax - ROOM_IN) / 0.7);
      }
    }
    NS = 40; px = 0; py = 0; pz = 0; L = 0;
    for (i = 0; i <= NS; i++) {
      u = i / NS;
      w0 = (1 - u) * (1 - u) * (1 - u); w1 = 3 * u * (1 - u) * (1 - u); w2 = 3 * u * u * (1 - u); w3 = u * u * u;
      x = w0 * pa.x + w1 * c1x + w2 * c2x + w3 * pb.x;
      y = w0 * pa.y + w1 * c1y + w2 * c2y + w3 * pb.y;
      z = w0 * pa.z + w1 * c1z + w2 * c2z + w3 * pb.z;
      if (i) L += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz));
      bl[i] = L;
      px = x; py = y; pz = z;
    }
    var want = f * L;
    for (i = 1; i < NS && bl[i] < want; i++);
    u = (i - 1 + clamp((want - bl[i - 1]) / Math.max(1e-6, bl[i] - bl[i - 1]), 0, 1)) / NS;
    if (L < 1e-4) u = f;
    w0 = (1 - u) * (1 - u) * (1 - u); w1 = 3 * u * (1 - u) * (1 - u); w2 = 3 * u * u * (1 - u); w3 = u * u * u;
    o.pos.set(
      w0 * pa.x + w1 * c1x + w2 * c2x + w3 * pb.x,
      w0 * pa.y + w1 * c1y + w2 * c2y + w3 * pb.y,
      w0 * pa.z + w1 * c1z + w2 * c2z + w3 * pb.z
    );
    /* The head turns once, from the one heading to the other, a little
       ahead of the feet. What turns evenly is the middle of the frame (the
       lens shift that puts a work in the free half included), so what the
       eye sees never swings back. */
    if (h == null) h = f;
    vA.subVectors(ta, pa);
    vB.subVectors(tb, pb);
    var la = vA.length(), lb = vB.length();
    var ya = yawOf(vA), yb = yawOf(vB);
    var ma = ya + Math.atan((0.5 - A.cx) * 2 * tx) / RAD, mb = yb + Math.atan((0.5 - B.cx) * 2 * tx) / RAD;
    mb = ma + ((((mb - ma) % 360) + 540) % 360) - 180;
    o.cx = lerp(A.cx, B.cx, h);
    o.cy = lerp(A.cy, B.cy, h);
    var yaw = (lerp(ma, mb, h) - Math.atan((0.5 - o.cx) * 2 * tx) / RAD) * RAD;
    var pit = lerp(Math.asin(clamp(vA.y / la, -1, 1)), Math.asin(clamp(vB.y / lb, -1, 1)), h);
    var len = lerp(la, lb, h);
    o.tgt.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)).multiplyScalar(len).add(o.pos);
  }

  /* WHEN on the curve the handover comes. For most of a walk one band of
     writing or the other is up and covers half the frame (the one being
     left, then the one coming), and only a short stretch of scroll has
     none. The handover must fall in that stretch: there both works share
     the frame (the next on the side its writing leaves free), or the next
     one crosses the middle to its own side. One ease still; it is only
     walked a little faster or slower before that point than after it. */
  var tcam = null, tq = null;
  function timing(A, B, i, o) {
    var H = G.H, F = Math.max(60, 0.1 * H);
    var a = i === 0 ? 0 : STN[i - 1].geo.bottom - 0.5 * H, b = i < N ? STN[i].geo.top : G.more - 0.15 * H;
    var g0 = i === 0 ? a : STN[i - 1].geo.colBot + 0.5 * F;
    var g1 = (i < N ? STN[i].geo.colTop : G.moreCol) - H - 0.5 * F;
    if (g1 < g0) g0 = g1 = (g0 + g1) / 2;
    var L = Math.max(1, b - a);
    var rc = clamp(((g0 + g1) / 2 - a) / L, 0.15, 0.85);
    /* the feet: the middle of the curve (where it stands furthest out, and
       the frame is widest) at the middle of that stretch */
    var g = clamp(Math.log(0.5) / Math.log(rc), 0.5, 2);
    /* the head: turns around the same moment, over about a third of a
       screen of scroll either side */
    var w = Math.max((g1 - g0) / 2 + TURNW * H * 0.5, TURNW * H) / L;
    return { g: g, c: rc, w: w, r1: clamp((g1 - a) / L, 0, 1) };
  }
  /* where a work's middle falls across the frame, 0..1 (off it: beyond) */
  function sx(k) {
    var b = WORKBOX[k];
    tq.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[4]).project(tcam);
    return tq.z < 1 ? (tq.x + 1) / 2 : -1;
  }

  var CAM = null; /* scratch for one camera: see camPose() */
  function camPose(o) {
    var n = G.narrow, hr = G.H / G.Hc, i, st;
    var cyObj = (n ? 0.38 : 0.5) * hr;
    var prev = { p: viewP(null, "entrance"), cx: 0.5, cy: (n ? 0.4 : 0.5) * hr }, to;
    o.key = "entrance";
    o.view = "";
    o.moving = false;
    for (i = 0; i <= N; i++) {
      var ri = T.r[i];
      if (!(ri > 0)) break;
      st = STN[i];
      to = i < N
        ? { p: viewP(st, "rest"), cx: n ? 0.5 : st.geo.freeX / G.W, cy: cyObj }
        : { p: viewP(null, "end"), cx: n ? 0.5 : 0.58, cy: (n ? 0.4 : 0.5) * hr };
      if (ri < 1) {
        prev.tm = G.narrow ? null : timing(prev, to, i, o);
        prev.lockA = i > 0;
        cross(prev, to, ri, o);
        o.moving = true;
        o.key = ri < 0.5 ? o.key : i < N ? st.key : "end";
        o.view = ri < 0.5 ? o.view : i < N ? "rest" : "";
        return o;
      }
      if (i < N) {
        to.p = stationP(st);
        o.key = st.key;
        o.view = camView(st);
      } else {
        o.key = "end";
        o.view = "";
      }
      prev = to;
    }
    place(prev.p, o.pos, o.tgt);
    o.cx = prev.cx;
    o.cy = prev.cy;
    if (T.mv) o.moving = true;
    return o;
  }

  /* which view the camera is at (or on its way to) at a station */
  function camView(st) {
    if (REDUCED || FOCUS || !st.plan) {
      var best = "rest", bw = 0.5;
      if (st.key === "bs" && wt(st, "filament") > 0.5) return st.p && st.p.filament > 0.5 ? "two" : "one";
      for (var k in st.w) if (st.w[k] > bw && viewRaw(st.key)[k]) { best = k; bw = st.w[k]; }
      if (st.key === "pen" && penView !== "whole" && !(st.v > 0)) best = penView;
      return best;
    }
    var M = st.plan.moves, v = "rest";
    for (var j = 0; j < M.length; j++) if (T.y > M[j].s) v = M[j].v;
    return v;
  }

  /* the hand turns the view about what it looks at; each station's share
     of it fades with how much you are at that station */
  var HANDK = { cl: 0.22, gf: 0.14 };
  function applyHand(o) {
    var yaw = 0, pitch = 0, bs = 0;
    for (var i = 0; i < N; i++) {
      var st = STN[i], h = st.hand;
      if (!h.yaw && !h.pitch) continue;
      var w = presence(st);
      yaw += h.yaw * (HANDK[st.key] || 1) * w;
      pitch += h.pitch * w;
      if (st.key === "bs") bs = w;
    }
    if (!yaw && !pitch) return;
    var p = toP(o.pos, o.tgt), q, k;
    if (bs > 0.01) {
      /* at the window: round them, as far as the room allows. The eye stays
         in the room, or in the open window itself; never in the wall */
      var hx = WIN.w / 2, S = WIN.y0;
      for (k = 1; k >= 0; k -= 0.125) {
        q = orbit(p, { yaw: yaw * k, pitch: pitch * k });
        place(q, vA, vB);
        if (vA.z > 0.12 || (Math.abs(vA.x - X.bs) < hx - 0.14 && vA.y > S + 0.12 && vA.y < WIN.y1 - 0.14 && vA.z > -WIN.d + 0.22)) break;
      }
    } else q = orbit(p, { yaw: yaw, pitch: pitch });
    place(q, o.pos, o.tgt);
  }

  function newCam() {
    return {
      pos: new THREE.Vector3(), tgt: new THREE.Vector3(),
      pa: new THREE.Vector3(), ta: new THREE.Vector3(), pb: new THREE.Vector3(), tb: new THREE.Vector3(),
      cx: 0.5, cy: 0.5, key: "", view: "", moving: false
    };
  }

  /* the closed room (RB): wherever a view, a crossing or a hand would take
     the eye, it stays RB.keep inside every wall (the views themselves all
     stand further in than that at the room's own depth; ?depth= may pull
     some in) */
  var RB_PEEK = null; /* for checking only (__rooms.peek): the camera put anywhere */
  function rbKeep(p) {
    if (!RB) return;
    p.x = clamp(p.x, RB.xs + RB.keep, RB.xe - RB.keep);
    p.z = Math.min(p.z, RB.d - RB.keep);
  }
  function updateCamera() {
    if (!CAM) CAM = newCam();
    var o = camPose(CAM);
    if (TUNE) TUNE.edit(o);
    else applyHand(o);
    vPos.copy(o.pos);
    vTgt.copy(o.tgt);

    /* the hand at the entrance and the end: a small look to either side */
    if (!TUNE && (roomHand.yaw || roomHand.pitch)) {
      vC.subVectors(vPos, vTgt);
      var ry = -roomHand.yaw * RAD * 0.6;
      var cx0 = vC.x * Math.cos(ry) + vC.z * Math.sin(ry);
      var cz0 = -vC.x * Math.sin(ry) + vC.z * Math.cos(ry);
      vPos.set(vTgt.x + cx0, Math.max(0.3, vPos.y + roomHand.pitch * 0.03), Math.max(0.3, vTgt.z + cz0));
    }
    rbKeep(vPos);
    if (RB_PEEK) {
      vPos.fromArray(RB_PEEK[0]);
      vTgt.fromArray(RB_PEEK[1]);
    }

    /* one lens, always. Looking back from the end the near plane moves out
       so the far end of the room keeps its depth precision (that is not
       a change of lens: nothing in the frame moves) */
    camera.fov = FOV;
    camera.near = lerp(0.08, 0.35, T.t[N]);
    camera.position.copy(vPos);
    camera.lookAt(vTgt);
    camera.setViewOffset(G.W, G.Hc, (0.5 - o.cx) * G.W, (0.5 - o.cy) * G.Hc, G.W, G.Hc);
  }

  /* ============================================================
     Tune (?tune=1): the artist sets every view by hand.
     A small panel says which station and view the camera is at; with the
     mouse he walks the camera round (drag), slides it (shift-drag or
     right-drag) and comes closer (alt + wheel, or + and -); the arrow keys
     nudge (shift: slide). The values are live; "Copy view" puts that
     view's line of views.json on the clipboard, "Download views.json" the
     whole file with every edit, "Reset view" puts the saved one back.
     Without ?tune=1 none of this is built and nothing here runs.
     ============================================================ */

  function makeTune() {
    var SAVED = JSON.parse(JSON.stringify(VIEWS));
    var cur = null; /* { set, key, view, st } the view being looked at */
    var edited = {};
    var el = document.createElement("div");
    el.className = "tune";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Tune camera views");
    el.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:9999;width:min(360px,calc(100vw - 32px));box-sizing:border-box;" +
      "padding:12px 14px;background:rgba(10,9,8,.94);color:#ece6dc;border:1px solid rgba(236,230,220,.25);" +
      "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:auto;touch-action:none";
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600">Tune views</span>' +
      '<span style="display:flex;gap:6px"><button type="button" data-t="fold" aria-expanded="true">Fold</button>' +
      '<button type="button" data-t="close" aria-label="Close the tune tool">Close</button></span></div>' +
      '<div data-t="body"><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px">' +
      '<select data-t="st" aria-label="Station"></select><select data-t="vw" aria-label="View"></select>' +
      '<button type="button" data-t="free">Follow scroll</button></div>' +
      '<div data-t="where"></div><div data-t="vals" style="margin:6px 0;white-space:pre;opacity:.85"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">' +
      '<button type="button" data-t="copy">Copy view</button>' +
      '<button type="button" data-t="dl">Download views.json</button>' +
      '<button type="button" data-t="reset">Reset view</button></div>' +
      '<div data-t="msg" style="min-height:1.45em;color:#e8b26a"></div></div>' +
      '<div style="opacity:.6">pick a station and view: the camera holds it · drag: walk round · shift/right-drag: slide · wheel: closer (alt+wheel when not holding) · arrows: nudge (shift: slide) · touch: 1 finger walk round, 2 fingers slide and pinch</div>';
    [].forEach.call(el.querySelectorAll("button, select"), function (b) {
      b.style.cssText = "font:inherit;color:inherit;background:rgba(236,230,220,.1);border:1px solid rgba(236,230,220,.3);padding:" + (COARSE ? "9px 10px" : "4px 8px") + ";cursor:pointer"; /* (a thumb's size on a phone) */
    });
    document.body.appendChild(el);
    var q = function (n) {
      return el.querySelector('[data-t="' + n + '"]');
    };
    var r3 = function (a) {
      return a.map(function (v) {
        return +v.toFixed(3);
      });
    };
    function say(t) {
      q("msg").textContent = t;
    }

    /* HOLDING A VIEW: pick a station and a view in the panel and the camera
       stands at that view and stays there, whatever the scroll or the
       motion setting, until "Follow scroll" (or Close). The page is
       scrolled to where that view is used, so the writing beside it and
       the object's state are as a visitor sees them there. */
    var pin = null, dead = false, touchWas = null;
    var NAMES = ["entrance"].concat(STN.map(function (s) { return s.key; }), ["end"]);
    function setName() {
      return G.narrow ? "phone" : "desktop";
    }
    function viewsOf(key) {
      if (key === "entrance" || key === "end") return [""];
      return Object.keys(viewSet()[key] || {});
    }
    function fillSel(sel, list, val, label) {
      sel.innerHTML = "";
      list.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v;
        o.textContent = label ? label(v) : v || "(the one view)";
        sel.appendChild(o);
      });
      sel.value = val;
    }
    fillSel(q("st"), NAMES, "entrance", function (k) {
      var st = by[k];
      return st ? String(st.i + 1).padStart(2, "0") + " " + k : k;
    });
    fillSel(q("vw"), viewsOf("entrance"), "");
    function scrollFor(key, view) {
      if (key === "entrance") return 0;
      if (key === "end") return Math.round(G.more - 0.1 * G.H); /* (further down, a phone's card covers the room) */
      var st = by[key], g = st.geo, H = G.H;
      if (REDUCED || !st.plan) return g.top;
      var y = g.top + 0.1 * H, M = st.plan.moves, L = MOVES[key] || [];
      for (var k = 0; k < M.length; k++) if (M[k].v === view) y = M[k].e + 2;
      for (k = 0; k < L.length; k++) if (L[k].v === view && L[k].act && st.plan.act) y = (st.plan.act.r1 + st.plan.act.f0) / 2;
      return Math.round(y);
    }
    function hold(key, view) {
      pin = { key: key, view: view };
      window.scrollTo({ top: scrollFor(key, view), behavior: "instant" });
      if (canvas && touchWas === null) {
        touchWas = canvas.style.touchAction;
        canvas.style.touchAction = "none"; /* a held view: the finger walks round it, never scrolls */
      }
      say("");
      invalidate();
    }
    function release() {
      pin = null;
      if (canvas && touchWas !== null) canvas.style.touchAction = touchWas;
      touchWas = null;
      invalidate();
    }
    function pinPose(o) {
      var n = G.narrow, hr = G.H / G.Hc, st = by[pin.key] || null;
      if (st && !viewSet()[pin.key][pin.view]) pin.view = "rest"; /* (the other set has no such view) */
      place(st ? viewP(st, pin.view) : viewP(null, pin.key), o.pos, o.tgt);
      o.cx = st ? (n ? 0.5 : st.geo.freeX / G.W) : pin.key === "end" && !n ? 0.58 : 0.5;
      o.cy = (st ? (n ? 0.38 : 0.5) : n ? 0.4 : 0.5) * hr;
      o.key = pin.key;
      o.view = pin.view;
      o.moving = false;
    }
    q("st").addEventListener("change", function () {
      var k = q("st").value, L = viewsOf(k);
      fillSel(q("vw"), L, L.indexOf("rest") >= 0 ? "rest" : L[0]);
      hold(k, q("vw").value);
    });
    q("vw").addEventListener("change", function () {
      hold(q("st").value, q("vw").value);
    });
    q("free").addEventListener("click", function () {
      release();
      say("Following the scroll again.");
    });
    /* folded: only the title row, at the top of the screen, so a phone's
       whole stage and its caption can be judged */
    q("fold").addEventListener("click", function () {
      var f = q("fold").textContent === "Fold";
      [].forEach.call(q("body").children, function (c) {
        if (c !== q("where")) c.hidden = f; /* (which view it holds stays in sight) */
      });
      q("fold").textContent = f ? "Open" : "Fold";
      q("fold").setAttribute("aria-expanded", String(!f));
      el.style.top = f ? "calc(env(safe-area-inset-top, 0px) + 64px)" : "";
      el.style.bottom = f ? "auto" : "16px";
      el.lastChild.hidden = f;
    });
    q("close").addEventListener("click", function () {
      release();
      dead = true;
      el.remove();
      TUNE = null; /* the page behaves as without ?tune=1 from here on */
      invalidate();
    });

    function slot(c, from) {
      var S = (from || VIEWS)[c.set];
      return c.view ? S[c.key][c.view] : S[c.key];
    }
    function ok() {
      return cur && !cur.moving;
    }
    /* change the view being looked at, in the world (k: how far the camera
       stands back on this screen against the reference: undone on save) */
    function change(fn) {
      if (!ok()) {
        say("The camera is between views: scroll until it holds.");
        return;
      }
      var v = slot(cur), k = vScale(cur.st);
      vA.set(v.pos[0], v.pos[1], v.pos[2]);
      vB.set(v.at[0], v.at[1], v.at[2]);
      var p = toP(vA, vB);
      p.d *= k;
      fn(p);
      p.el = clamp(p.el, -80, 80);
      p.d = clamp(p.d, 0.08, 40);
      place(p, vA, vB);
      vA.sub(vB).multiplyScalar(1 / k).add(vB);
      v.pos = r3([vA.x, vA.y, vA.z]);
      v.at = r3([vB.x, vB.y, vB.z]);
      edited[cur.set + "." + cur.key + "." + cur.view] = 1;
      say("");
      invalidate();
    }
    function orbitBy(dAz, dEl) {
      change(function (p) {
        p.az -= dAz;
        p.el += dEl;
      });
    }
    function panBy(dx, dy) {
      change(function (p) {
        var a = p.az * RAD, s = p.d;
        /* right of the camera, and up the screen (roughly), scaled to the distance */
        p.tx += (Math.cos(a) * dx) * s;
        p.tz += (-Math.sin(a) * dx) * s;
        p.ty += dy * s;
      });
    }
    function dollyBy(f) {
      change(function (p) {
        p.d *= f;
      });
    }

    /* the mouse, and fingers: one pointer walks round (or slides, with
       shift or the right button); two slide together and pinch closer */
    var ptrs = {};
    function two() {
      var ids = Object.keys(ptrs);
      if (ids.length < 2) return null;
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    window.addEventListener("pointerdown", function (e) {
      if (dead || el.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest(SOLID)) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 };
      e.preventDefault();
    }, true);
    window.addEventListener("pointermove", function (e) {
      var d = ptrs[e.pointerId];
      if (dead || !d) return;
      var A = two();
      if (A) {
        d.x = e.clientX;
        d.y = e.clientY;
        var B = two();
        panBy(-(B.x - A.x) * 0.0016, (B.y - A.y) * 0.0016);
        if (A.d > 0 && B.d > 0) dollyBy(A.d / B.d);
        return;
      }
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!dx && !dy) return;
      if (d.pan) panBy(-dx * 0.0016, dy * 0.0016);
      else orbitBy(dx * 0.25, dy * 0.2);
    }, true);
    var up = function (e) {
      delete ptrs[e.pointerId];
    };
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("contextmenu", function (e) {
      if (!dead && !el.contains(e.target)) e.preventDefault();
    });
    window.addEventListener("wheel", function (e) {
      if (dead || el.contains(e.target)) return;
      /* holding a view the wheel comes closer; following the scroll only
         alt + wheel does (the plain wheel scrolls the page). ctrl + wheel
         is a trackpad pinch */
      if (!pin && !e.altKey && !e.ctrlKey) return;
      e.preventDefault();
      dollyBy(Math.exp(e.deltaY * 0.0015));
    }, { passive: false });
    window.addEventListener("keydown", function (e) {
      var t = e.target;
      if (dead || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"))) return;
      var k = e.key, s = e.shiftKey;
      if (k === "ArrowLeft") s ? panBy(-0.01, 0) : orbitBy(-1, 0);
      else if (k === "ArrowRight") s ? panBy(0.01, 0) : orbitBy(1, 0);
      else if (k === "ArrowUp") s ? panBy(0, 0.01) : orbitBy(0, 1);
      else if (k === "ArrowDown") s ? panBy(0, -0.01) : orbitBy(0, -1);
      else if (k === "+" || k === "=") dollyBy(0.97);
      else if (k === "-" || k === "_") dollyBy(1.03);
      else return;
      e.preventDefault();
    });

    /* the buttons */
    function line(c) {
      var v = slot(c);
      return '"' + (c.view || c.key) + '": { "pos": [' + v.pos.join(", ") + '], "at": [' + v.at.join(", ") + "] }";
    }
    function copyText(t) {
      if (navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(t).catch(function () {
          return fallback(t);
        });
      return Promise.resolve(fallback(t));
    }
    function fallback(t) {
      var ta = document.createElement("textarea");
      ta.value = t;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (err) {}
      ta.remove();
    }
    function fileText() {
      var o = { about: "Camera views for rooms-v2. Each view is where the camera stands (pos) and the point it looks at (at), in metres, as composed at the reference viewport (ref). The wall is z = 0, x runs down the room, y is up. Edit with ?tune=1 (Copy view / Download views.json), then re-run rooms-build.mjs so index.html carries the new values.", desktop: VIEWS.desktop, phone: VIEWS.phone };
      var s = JSON.stringify(o, null, 1);
      return s
        .replace(/\[\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)\s*\]/g, "[$1, $2, $3]")
        .replace(/\{\s*"pos": (\[[^\]]*\]),\s*"at": (\[[^\]]*\])\s*\}/g, '{ "pos": $1, "at": $2 }')
        .replace(/\{\s*"w": (\d+),\s*"h": (\d+),\s*"free": (\d+)\s*\}/g, '{ "w": $1, "h": $2, "free": $3 }') + "\n";
    }
    q("copy").addEventListener("click", function () {
      if (!cur) return;
      var t = line(cur);
      copyText(t).then(function () {
        say("Copied " + cur.set + " › " + cur.key + (cur.view ? " › " + cur.view : ""));
      });
    });
    q("dl").addEventListener("click", function () {
      var b = new Blob([fileText()], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "views.json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 500);
      say("views.json: " + Object.keys(edited).length + " view(s) edited");
    });
    q("reset").addEventListener("click", function () {
      if (!cur) return;
      var s = slot(cur, SAVED), v = slot(cur);
      v.pos = s.pos.slice();
      v.at = s.at.slice();
      delete edited[cur.set + "." + cur.key + "." + cur.view];
      say("Reset " + cur.key + (cur.view ? " › " + cur.view : ""));
      invalidate();
    });

    return {
      /* called with each camera pose: remember which view it is, show it */
      edit: function (o) {
        if (pin) pinPose(o);
        var set = setName();
        var key = o.key === "entrance" || o.key === "end" ? o.key : o.key;
        var view = key === "entrance" || key === "end" ? "" : o.view || "rest";
        cur = { set: set, key: key, view: view, moving: o.moving, st: by[key] || null };
        var v = slot(cur);
        q("where").textContent = set + " › " + key + (view ? " › " + view : "") + (pin ? "  (held)" : o.moving ? "  (moving)" : "  (holding)") +
          (edited[set + "." + key + "." + view] ? "  · edited" : "");
        q("vals").textContent = v ? "pos " + v.pos.join(", ") + "\nat  " + v.at.join(", ") : "";
        q("copy").disabled = q("reset").disabled = !v;
        /* the pickers show where the camera is (not while one is in use) */
        var ae = document.activeElement;
        if (!(ae && (ae === q("st") || ae === q("vw")))) {
          var vk = set + ":" + key + ":" + view;
          if (q("vw").getAttribute("data-k") !== vk) {
            q("vw").setAttribute("data-k", vk);
            q("st").value = key;
            fillSel(q("vw"), viewsOf(key), view);
          }
        }
      }
    };
  }

  /* ============================================================
     FX (desktop only): depth of field, haze in the lamp light, grain,
     contact shadows. See NOTES.md, "Depth of field and the realism pass".
     The phone path never builds any of this: it renders through the old
     composer exactly as before. On a desk the picture goes
       scene -> sceneRT (HDR, MSAA 4, depth texture)
       -> composite: + k(1-mask)glow, + haze (analytic, clipped by depth)
       -> DOF 1: half res, Karis average, brightness clamp, nearest depth
       -> DOF 2: half res gather, golden-angle disc, near/far rules
       -> final: sharp/blurred by full-res CoC, ACES, sRGB, grain + dither
     If anything of it fails to start (no depth, a shader that does not
     compile, a nonsense depth read) the old composer draws instead.
     ============================================================ */

  var FXQ = Q.get("fx"), DOFQ = Q.get("dof");
  var FX = null; /* the desktop pipeline; null where it is not built */
  var fxOn = false; /* drawing through it this frame */
  var DOF = {
    want: DOFQ !== "off", /* ?dof=off: the pipeline without the blur */
    forced: DOFQ === "on", /* ?dof=on: also in a narrow window, never auto-off */
    auto: true, /* false once frame time switched it off */
    K: 0.03, /* f^2/(N*sensorH) in metres: blur = K|1/S - 1/d| of picture height */
    kWalk: 0.4, /* share of K while walking or moving between views */
    kNear: 2.5, /* closer than this (m) the lens stops down: K * S/kNear */
    kNearMin: 0.15,
    kApart: 0.55, /* how much a take-apart stops down (1: to nothing) */
    kEnd: 0.12, /* share of K in the closing view */
    cocMax: 0.014, /* the largest blur, as a fraction of picture height */
    tol: 0.0012, /* below this a pixel is exactly sharp */
    lumMax: 3.2, /* HDR luminance cap per sample in the blur (16 x mid-grey) */
    tau: 0.14, /* focus spring: critically damped, about a quarter second */
    kTau: 0.35, /* aperture easing, seconds */
    anchor: 0.0, /* pull of S toward the work's box at a station (0: look-at only) */
    S: 3, v: 0, Kc: 0, St: 3, Kt: 0, t: 0, near: 0.08, far: 150, px: 0, maxPx: 0
  };
  var GRAIN = { amt: 0.022, dither: 1.0, hz: 10 };
  if (ROOMT) GRAIN.amt *= ROOMT.grain; /* the test room (notes/room-test.md) */
  var HAZE = { on: FXQ !== "nohaze", list: [] };
  var CONTACT = { list: [], refs: {} };

  function fxWant() {
    return FXQ !== "off" && (!COARSE || DOF.forced);
  }
  /* desktop, the same rule the page uses: a fine pointer and a wide window */
  function fxTier() {
    return !!(FX && FX.ok && !FX.user) && (DOF.forced || (!COARSE && !G.narrow));
  }
  function dofLive() {
    return fxOn && DOF.want && (DOF.auto || DOF.forced);
  }

  var FSV = "varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  var LIN =
    "#include <packing>\nuniform float uNear; uniform float uFar;\n" +
    "float dist(float d){ return -perspectiveDepthToViewZ(d, uNear, uFar); }\n";

  function fxMat(u, fs) {
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: FSV, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
  }

  function buildFX(FSQ) {
    var HF = THREE.HalfFloatType, i;
    var fx = { ok: false, tested: false, sceneRT: null };
    var dt = new THREE.DepthTexture(4, 4);
    dt.type = THREE.UnsignedIntType;
    fx.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: 4, depthTexture: dt });
    fx.compRT = new THREE.WebGLRenderTarget(4, 4, { type: HF, depthBuffer: false });
    fx.halfA = new THREE.WebGLRenderTarget(4, 4, { type: HF, depthBuffer: false });
    fx.halfB = new THREE.WebGLRenderTarget(4, 4, { type: HF, depthBuffer: false });
    [fx.compRT, fx.halfA, fx.halfB].forEach(function (t) {
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
      t.texture.generateMipmaps = false;
    });
    var near = { value: 0.08 }, far = { value: 150 };
    var NH = 6;
    var hzP = [], hzC = [];
    for (i = 0; i < NH; i++) {
      hzP.push(new THREE.Vector4());
      hzC.push(new THREE.Vector4());
    }

    /* the glow as before, plus the air near the brightest lamps: the
       in-scatter of a point light in thin uniform haze, integrated in
       closed form along each pixel's ray up to the surface it meets, so it
       thins out smoothly where the air meets geometry and has no edge.
       It is added after the glow, so it never enters the bloom. */
    fx.comp = fxMat(
      {
        tScene: { value: fx.sceneRT.texture }, tDepth: { value: dt },
        tGlow: { value: bloom.renderTargetsHorizontal[0].texture }, tMask: { value: maskRT.texture },
        k: { value: 0.5 }, uNear: near, uFar: far, uProjInv: { value: new THREE.Matrix4() },
        hzP: { value: hzP }, hzC: { value: hzC }, hzN: { value: 0 }
      },
      LIN +
        "uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tGlow; uniform sampler2D tMask; uniform float k;\n" +
        "uniform mat4 uProjInv; uniform vec4 hzP[" + NH + "]; uniform vec4 hzC[" + NH + "]; uniform int hzN; varying vec2 vUv;\n" +
        "void main(){\n" +
        " vec4 c = texture2D(tScene, vUv) + k * (1.0 - texture2D(tMask, vUv).r) * texture2D(tGlow, vUv);\n" +
        " if (hzN > 0) {\n" +
        "  float d = texture2D(tDepth, vUv).x;\n" +
        "  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);\n" +
        "  vec3 P = v.xyz / v.w; float tM = length(P); vec3 dir = P / tM; vec3 hz = vec3(0.0);\n" +
        "  for (int i = 0; i < " + NH + "; i++) {\n" +
        "   if (i >= hzN) break;\n" +
        "   vec3 L = hzP[i].xyz; float R = hzP[i].w, e2 = hzC[i].w * hzC[i].w;\n" +
        "   float tc = dot(L, dir), h2 = max(dot(L, L) - tc * tc, 0.0);\n" +
        "   if (h2 >= R * R) continue;\n" +
        "   float hw = sqrt(R * R - h2), t0 = max(tc - hw, 0.0), t1 = min(tc + hw, tM);\n" +
        "   if (t1 <= t0) continue;\n" +
        "   float a = sqrt(h2 + e2);\n" +
        "   float I = (atan((t1 - tc) / a) - atan((t0 - tc) / a)) / a - (t1 - t0) / (R * R + e2);\n" +
        "   hz += hzC[i].rgb * max(I, 0.0);\n" +
        "  }\n" +
        "  c.rgb += hz;\n" +
        " }\n" +
        " gl_FragColor = c;\n" +
        "}"
    );

    /* DOF 1: to half resolution. Karis average (each tap weighted by
       1/(1+luma)) so a sub-pixel filament cannot sparkle in and out, a cap
       on brightness so a disc stays a light and never a white plate, and
       the nearest of the four depths in alpha. */
    fx.down = fxMat(
      { tColor: { value: fx.compRT.texture }, tDepth: { value: dt }, uTexel: { value: new THREE.Vector2() }, uLumMax: { value: 3.2 }, uNear: near, uFar: far },
      LIN +
        "uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uLumMax; varying vec2 vUv;\n" +
        "float lu(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }\n" +
        "void main(){\n" +
        " vec2 o = uTexel * 0.5; vec3 s = vec3(0.0); float ws = 0.0, dm = 1.0;\n" +
        " for (int i = 0; i < 4; i++) {\n" +
        "  vec2 tc = vUv + vec2(i == 0 || i == 2 ? -o.x : o.x, i < 2 ? -o.y : o.y);\n" +
        "  vec3 c = texture2D(tColor, tc).rgb; float w = 1.0 / (1.0 + lu(c));\n" +
        "  s += c * w; ws += w; dm = min(dm, texture2D(tDepth, tc).x);\n" +
        " }\n" +
        " s /= ws; float l = lu(s); if (l > uLumMax) s *= uLumMax / l;\n" +
        " gl_FragColor = vec4(s, dist(dm));\n" +
        "}"
    );

    /* DOF 2: the gather, at half resolution. Golden-angle spiral, turned
       per pixel by interleaved gradient noise (the grain hides what is
       left). A sample behind the centre may not spread wider than the
       centre's own blur (so a sharp work keeps its edge against a blurred
       lamp behind it); a sample in front spreads freely (a blurred
       foreground overlaps). Alpha: how much the near field covers this
       pixel, for the final pass. */
    fx.gather = fxMat(
      {
        tHalf: { value: fx.halfA.texture }, uTexel: { value: new THREE.Vector2() },
        uS: { value: 3 }, uK: { value: 0 }, uMax: { value: 4 }, uLim: { value: 4 }, uStep: { value: 0.5 }
      },
      "uniform sampler2D tHalf; uniform vec2 uTexel; uniform float uS, uK, uMax, uLim, uStep; varying vec2 vUv;\n" +
        "float sz(float d){ return min(uK * abs(1.0 / uS - 1.0 / max(d, 0.01)), uMax); }\n" +
        "void main(){\n" +
        " vec4 c0 = texture2D(tHalf, vUv); float cs = sz(c0.a);\n" +
        " vec3 col = c0.rgb; float tot = 1.0, nf = 0.0, r = uStep;\n" +
        " float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\n" +
        " for (int i = 0; i < 80; i++) {\n" +
        "  if (r >= uLim) break;\n" +
        "  vec4 s = texture2D(tHalf, vUv + vec2(cos(ang), sin(ang)) * uTexel * r);\n" +
        "  float ss = sz(s.a);\n" +
        "  if (s.a > c0.a) ss = min(ss, cs * 2.0);\n" +
        "  float m = smoothstep(r - 0.5, r + 0.5, ss);\n" +
        "  col += mix(col / tot, s.rgb, m); tot += 1.0;\n" +
        "  if (s.a < c0.a - 0.05 && ss > cs + 0.75) nf += m;\n" +
        "  r += uStep / r; ang += 2.39996323;\n" +
        " }\n" +
        " gl_FragColor = vec4(col / tot, clamp(nf * 3.0 / tot, 0.0, 1.0));\n" +
        "}"
    );

    /* final: sharp or blurred by each full-resolution pixel's own CoC (and
       by the near field that covers it), then the same ACES and sRGB as
       three's OutputPass, then grain: monochrome, in display space, strongest
       in the dark gradients and gone in the highlights, plus a one-step
       triangular dither everywhere against banding. */
    fx.fin = fxMat(
      {
        tColor: { value: fx.compRT.texture }, tBlur: { value: fx.halfB.texture }, tDepth: { value: dt },
        uDof: { value: 0 }, uS: { value: 3 }, uK: { value: 0 }, uMax: { value: 4 }, uTol: { value: 1 },
        uExp: { value: 1 }, uGrain: { value: 0.02 }, uDither: { value: 1 }, uSeed: { value: 0 }, uNear: near, uFar: far
      },
      LIN +
        "uniform sampler2D tColor; uniform sampler2D tBlur; uniform sampler2D tDepth;\n" +
        "uniform float uDof, uS, uK, uMax, uTol, uExp, uGrain, uDither, uSeed; varying vec2 vUv;\n" +
        "vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }\n" +
        "vec3 aces(vec3 c){\n" +
        " const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));\n" +
        " const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));\n" +
        " c *= uExp / 0.6; c = I * c; c = rrt(c); c = O * c; return clamp(c, 0.0, 1.0);\n" +
        "}\n" +
        "vec3 srgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }\n" +
        "float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }\n" +
        "void main(){\n" +
        " vec4 c = texture2D(tColor, vUv);\n" +
        " if (uDof > 0.5) {\n" +
        "  float d = dist(texture2D(tDepth, vUv).x);\n" +
        "  float r = min(uK * abs(1.0 / uS - 1.0 / max(d, 0.01)), uMax);\n" +
        "  vec4 b = texture2D(tBlur, vUv);\n" +
        "  float m = max(smoothstep(uTol, uTol + 1.5, r), b.a);\n" +
        "  c.rgb = mix(c.rgb, b.rgb, m);\n" +
        " }\n" +
        " vec3 o = srgb(aces(c.rgb));\n" +
        " vec2 p = gl_FragCoord.xy + uSeed * vec2(37.0, 17.0);\n" +
        " float l = dot(o, vec3(0.2126, 0.7152, 0.0722));\n" +
        " float g = (h12(p) + h12(p + 71.3) - 1.0);\n" +
        " float amp = uGrain * smoothstep(0.0, 0.18, l) * (1.0 - smoothstep(0.35, 0.9, l));\n" +
        " o += g * (amp + uDither / 255.0);\n" +
        " gl_FragColor = vec4(o, 1.0);\n" +
        "}"
    );
    fx.quad = new FSQ(fx.comp);
    fx.near = near;
    fx.far = far;
    fx.hzP = hzP;
    fx.hzC = hzC;
    fx.NH = NH;
    /* the depth probe: a few points of the linearised depth, read back */
    fx.probeRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.UnsignedByteType, depthBuffer: false });
    fx.probe = fxMat(
      { tDepth: { value: dt }, uNear: near, uFar: far },
      LIN + "uniform sampler2D tDepth; varying vec2 vUv;\nvoid main(){ float d = texture2D(tDepth, vUv).x; gl_FragColor = vec4(clamp(dist(d) / 40.0, 0.0, 1.0), d >= 1.0 ? 1.0 : 0.0, 0.0, 1.0); }"
    );
    fx.setSize = function (w, h) {
      fx.sceneRT.setSize(w, h);
      fx.compRT.setSize(w, h);
      var hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
      fx.halfA.setSize(hw, hh);
      fx.halfB.setSize(hw, hh);
      fx.down.uniforms.uTexel.value.set(1 / w, 1 / h);
      fx.gather.uniforms.uTexel.value.set(1 / hw, 1 / hh);
      fx.W = w;
      fx.H = h;
      fx.tested = false; /* a new depth texture: look at it again */
    };
    return fx;
  }

  function fxPass(mat, target) {
    FX.quad.material = mat;
    renderer.setRenderTarget(target);
    FX.quad.render(renderer);
  }

  /* is the depth real? Read 64 points of it: all must be inside (0, 1],
     and they must not all be the same. Called on the first picture after
     every resize. */
  var fxErr = false;
  function fxTest() {
    var px = new Uint8Array(8 * 8 * 4), ok = false;
    try {
      fxPass(FX.probe, FX.probeRT);
      renderer.readRenderTargetPixels(FX.probeRT, 0, 0, 8, 8, px);
      var lo = 1, hi = 0, zero = 0;
      for (var i = 0; i < 64; i++) {
        var d = px[i * 4] / 255;
        if (px[i * 4] === 0) zero++;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      FX.probeRes = { zero: zero, lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
      ok = !fxErr && zero < 8 && hi - lo > 0.02 && FXQ !== "failtest"; /* ?fx=failtest: try the fallback */
    } catch (e) {
      ok = false;
    }
    FX.tested = true;
    return ok;
  }

  /* never re-entered from inside a render: the caller draws with the
     composer this same picture, and the size (pixel ratio) follows */
  function fxFail(why) {
    if (!FX || !FX.ok) return;
    FX.ok = false;
    FX.why = why;
    fxOn = false;
    for (var i = 0; i < CONTACT.list.length; i++) CONTACT.list[i].visible = false;
    if (window.console && console.info) console.info("rooms: depth of field off (" + why + "); the plain pipeline draws.");
    setTimeout(resize, 0);
  }

  /* the focus and the aperture for this picture */
  var fV = null, fW = null;
  function fxFocus() {
    if (!fV) {
      fV = new THREE.Vector3();
      fW = new THREE.Vector3();
    }
    var now = performance.now(), dt = DOF.t ? Math.min(0.05, Math.max(0.001, (now - DOF.t) / 1000)) : 0;
    DOF.t = now;
    camera.updateMatrixWorld();
    camera.getWorldDirection(fW);
    var S = Math.max(0.25, fV.subVectors(vTgt, camera.position).dot(fW));
    /* where the look-at point is not on the work: the work's own box */
    var P = 0, cur = null, i;
    for (i = 0; i < N; i++) {
      var p = presence(STN[i]);
      if (p > P) {
        P = p;
        cur = STN[i];
      }
    }
    if (cur && DOF.anchor > 0 && WORKBOX[cur.key]) {
      var b = WORKBOX[cur.key];
      fV.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[4]).sub(camera.position);
      S = lerp(S, Math.max(0.25, fV.dot(fW)), DOF.anchor * P);
    }
    DOF.St = S;
    /* the aperture: walking, settled at a work, close, taking apart, the end */
    var hold = T.mv || T.cur < 0 ? 0 : 1;
    var K = DOF.K * lerp(DOF.kWalk, 1, P * hold);
    K *= clamp(S / DOF.kNear, DOF.kNearMin, 1);
    var ap = cur ? cur.act || (REDUCED && cur.w ? cur.w.apart || 0 : 0) : 0;
    if (ap) K *= 1 - DOF.kApart * ap;
    K = lerp(K, DOF.K * DOF.kEnd, T.t[N] || 0);
    DOF.Kt = K;
    /* critically damped spring on 1/S; a cut (motion off) or the first
       picture snaps */
    var x = 1 / S;
    if (!dt || REDUCED || !DOF.S) {
      DOF.S = S;
      DOF.v = 0;
      DOF.Kc = K;
    } else {
      var w = 2 / DOF.tau, xc = 1 / DOF.S, a = -w * w * (xc - x) - 2 * w * DOF.v;
      DOF.v += a * dt;
      xc += DOF.v * dt;
      DOF.S = 1 / Math.max(0.01, xc);
      DOF.Kc += (K - DOF.Kc) * (1 - Math.exp(-dt / DOF.kTau));
    }
    /* still settling: ask for another frame */
    return Math.abs(1 / DOF.S - x) > 0.002 || Math.abs(DOF.v) > 0.002 || Math.abs(DOF.Kc - K) > DOF.K * 0.01;
  }

  var hzV = null;
  function fxDraw() {
    var W = FX.W, H = FX.H, dof = dofLive();
    var near = camera.near, far = camera.far;
    FX.near.value = near;
    FX.far.value = far;
    /* the lean's shadows go as the pen stands up to come apart */
    if (CONTACT.pen && by.pen) {
      var ap = 1 - sstep(actW(by.pen, "apart"), 0.0, 0.15);
      for (var pi = 0; pi < CONTACT.pen.length; pi++) CONTACT.pen[pi].material.uniforms.uAmt.value = ap;
    }
    if (contactU) contactU.uFog.value = scene.fog.density;
    renderer.setRenderTarget(FX.sceneRT);
    renderer.render(scene, camera);
    if (fxErr || (!FX.tested && !fxTest())) {
      fxFail(fxErr ? "shader" : "depth probe");
      return false;
    }

    /* haze: the lamps' positions, in view space */
    var n = 0;
    if (HAZE.on) {
      if (!hzV) hzV = new THREE.Vector3();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      for (var i = 0; i < HAZE.list.length && n < FX.NH; i++) {
        var h = HAZE.list[i];
        if (h.o) h.o.getWorldPosition(hzV);
        else hzV.copy(h.p);
        hzV.applyMatrix4(camera.matrixWorldInverse);
        if (hzV.length() > 40) continue;
        FX.hzP[n].set(hzV.x, hzV.y, hzV.z, h.R);
        FX.hzC[n].set(h.c.r * h.k, h.c.g * h.k, h.c.b * h.k, h.e);
        n++;
      }
    }
    var cu = FX.comp.uniforms;
    cu.hzN.value = n;
    cu.uProjInv.value.copy(camera.projectionMatrixInverse);
    fxPass(FX.comp, FX.compRT);

    var fu = FX.fin.uniforms;
    var settling = fxFocus();
    if (dof) {
      var Hpx = H, Kpx = DOF.Kc * 0.5 * Hpx, mx = DOF.cocMax * 0.5 * Hpx;
      /* the widest blur anything in this frame can have (nothing in the
         room comes nearer the lens than half a metre) */
      var lim = Math.min(mx, Kpx * Math.max(1 / DOF.S, 2 - 1 / DOF.S));
      DOF.px = Kpx / DOF.S;
      DOF.maxPx = lim;
      FX.down.uniforms.uLumMax.value = DOF.lumMax;
      if (lim > 1.2) {
        fxPass(FX.down, FX.halfA);
        var g = FX.gather.uniforms;
        g.uS.value = DOF.S;
        g.uK.value = Kpx / 2;
        g.uMax.value = mx / 2;
        g.uLim.value = lim / 2 + 0.5;
        g.uStep.value = 0.5;
        fxPass(FX.gather, FX.halfB);
      } else dof = false;
      fu.uS.value = DOF.S;
      fu.uK.value = Kpx;
      fu.uMax.value = mx;
      fu.uTol.value = DOF.tol * 0.5 * Hpx;
    } else {
      DOF.px = DOF.maxPx = 0;
    }
    fu.uDof.value = dof ? 1 : 0;
    fu.uExp.value = renderer.toneMappingExposure;
    fu.uGrain.value = GRAIN.amt;
    fu.uDither.value = GRAIN.dither;
    /* the grain stands still with motion off and while the loop rests; with
       motion on it changes a few times a second, never per frame */
    fu.uSeed.value = REDUCED ? 0 : Math.floor(performance.now() / (1000 / GRAIN.hz)) % 61;
    fxPass(FX.fin, null);
    FX.settling = dof && settling;
    if (fxErr) {
      fxFail("shader");
      return false;
    }
    return true;
  }

  /* ---- haze sources: a lamp's light in the air, sparingly ---- */
  function hazeAt(o, color, k, R, e) {
    HAZE.list.push({
      o: o && o.isObject3D ? o : null, p: o && o.isObject3D ? null : o,
      c: new THREE.Color(color), k: k, R: R, e: e
    });
  }

  /* ---- contact shadows: soft decals laid just over a surface, multiplied
     into what is under them. Each has a tight core (the contact itself,
     always) and a soft part pushed away from the strongest light nearby,
     and the soft part fades out where the surface stands in a pool of light
     (every room light and every local light, evaluated in the decal). Static:
     nothing to do at rest. */
  var CLN = 28, contactU = null;
  function contactUniforms() {
    if (contactU) return contactU;
    var lp = [], ld = [], i;
    for (i = 0; i < CLN; i++) {
      lp.push(new THREE.Vector4());
      ld.push(new THREE.Vector4(0, -1, 0, -2));
    }
    contactU = { lp: { value: lp }, ld: { value: ld }, ln: { value: 0 }, uE0: { value: 0.6 }, uFog: { value: 0.03 } };
    return contactU;
  }
  /* every light that can make a pool: the room's point lights and the local
     lights (intensity / d^decay, with a spot's cone) */
  function contactLights() {
    var U = contactUniforms(), n = 0, v = new THREE.Vector3();
    scene.updateMatrixWorld(true);
    scene.traverse(function (o) {
      if (!o.isPointLight || n >= CLN) return;
      o.getWorldPosition(v);
      var c = o.color, I = o.intensity * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
      U.lp.value[n].set(v.x, v.y, v.z, I);
      U.ld.value[n].set(0, -1, 0, -2);
      n++;
    });
    for (var i = 0; i < LOCALS.length && n < CLN; i++) {
      var S = LOCALS[i], c2 = S.uCol.value;
      var I2 = (0.2126 * c2.r + 0.7152 * c2.g + 0.0722 * c2.b) / Math.PI;
      if (S.uFall.value.x < 1.5) I2 *= 0.5; /* 1/d lines: weaker pools */
      U.lp.value[n].set(S.pos.x, S.pos.y, S.pos.z, I2);
      U.ld.value[n].set(S.dir.x, S.dir.y, S.dir.z, S.uCone.value.y);
      n++;
    }
    U.ln.value = n;
  }
  /* centre c (Vector3), the surface's normal n and its two axes u, v (unit
     vectors in the surface), the quad's half sizes qa, qb; the footprint: a
     box of half sizes ba, bb at (oa, ob) in (u, v); core: strength and
     reach of the contact; soft: strength, reach and how far it is thrown
     away from the light */
  function contact(c, nrm, ua, va, qa, qb, o) {
    var U = contactUniforms();
    var geo = new THREE.PlaneGeometry(qa * 2, qb * 2);
    var m = new THREE.ShaderMaterial({
      uniforms: {
        lp: U.lp, ld: U.ld, ln: U.ln, uE0: U.uE0, uFog: U.uFog,
        uB: { value: new THREE.Vector4(o.oa || 0, o.ob || 0, o.ba || 0, o.bb || 0) },
        uCore: { value: new THREE.Vector2(o.core || 0, o.coreR || 0.03) },
        uSoft: { value: new THREE.Vector3(o.soft || 0, o.softR || 0.15, 0) },
        uOff: { value: new THREE.Vector2(0, 0) },
        uN: { value: nrm.clone() }, uRound: { value: o.round || 0 }, uAmt: { value: 1 }
      },
      vertexShader:
        "varying vec3 wP; varying vec2 q; varying float vD;\n" +
        "void main(){ q = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); wP = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }",
      fragmentShader:
        "uniform vec4 lp[" + CLN + "]; uniform vec4 ld[" + CLN + "]; uniform int ln; uniform float uE0, uFog, uRound, uAmt;\n" +
        "uniform vec4 uB; uniform vec2 uCore; uniform vec3 uSoft; uniform vec2 uOff; uniform vec3 uN;\n" +
        "varying vec3 wP; varying vec2 q; varying float vD;\n" +
        "float box(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }\n" +
        "void main(){\n" +
        " vec2 p = q - uB.xy;\n" +
        " float ac = uCore.x * (1.0 - smoothstep(0.0, uCore.y, box(p, uB.zw, uRound)));\n" +
        " float as = uSoft.x * (1.0 - smoothstep(-0.3 * uSoft.y, uSoft.y, box(p - uOff, uB.zw, uRound)));\n" +
        " float E = 0.0;\n" +
        " for (int i = 0; i < " + CLN + "; i++) {\n" +
        "  if (i >= ln) break;\n" +
        "  vec3 l = lp[i].xyz - wP; float d2 = max(dot(l, l), 0.01); vec3 ln_ = l * inversesqrt(d2);\n" +
        "  float cone = ld[i].w < -1.5 ? 1.0 : smoothstep(ld[i].w, ld[i].w + 0.15, dot(-ln_, ld[i].xyz));\n" +
        "  E += lp[i].w * max(dot(uN, ln_), 0.0) * cone / d2;\n" +
        " }\n" +
        " float pool = E / (E + uE0);\n" +
        " float a = 1.0 - (1.0 - ac) * (1.0 - as * (1.0 - pool));\n" +
        " a *= uAmt * exp(-uFog * uFog * vD * vD);\n" +
        " gl_FragColor = vec4(vec3(1.0 - a), 1.0);\n" +
        "}",
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    var mesh = new THREE.Mesh(geo, m);
    var basis = new THREE.Matrix4().makeBasis(ua, va, nrm);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(c);
    mesh.renderOrder = 3; /* after the additive patches of light */
    mesh.userData.o = o;
    mesh.userData.c = c.clone();
    mesh.userData.ua = ua.clone();
    mesh.userData.va = va.clone();
    mesh.visible = false; /* shown only where the desktop pipeline draws */
    scene.add(mesh);
    CONTACT.list.push(mesh);
    return mesh;
  }
  /* throw each decal's soft part away from its strongest light */
  function contactAim() {
    var U = contactUniforms(), v = new THREE.Vector3();
    CONTACT.list.forEach(function (m) {
      var o = m.userData.o, c = m.userData.c, best = 0, bi = -1;
      if (!o.throwK) return;
      for (var i = 0; i < U.ln.value; i++) {
        var L = U.lp.value[i], d2 = Math.max(0.01, c.distanceToSquared(v.set(L.x, L.y, L.z)));
        if (o.skip && v.distanceTo(c) < o.skip) continue;
        var E = L.w / d2;
        if (E > best) {
          best = E;
          bi = i;
        }
      }
      if (bi < 0) return;
      var L2 = U.lp.value[bi];
      v.set(c.x - L2.x, c.y - L2.y, c.z - L2.z);
      var da = v.dot(m.userData.ua), db = v.dot(m.userData.va), len = Math.hypot(da, db);
      if (len < 1e-4) return;
      var k = Math.min(o.throwMax || 0.1, o.throwK * len / Math.max(0.3, Math.abs(v.dot(m.material.uniforms.uN.value))));
      m.material.uniforms.uOff.value.set((da / len) * k, (db / len) * k);
    });
  }

  function buildContacts() {
    var V = function (x, y, z) {
      return new THREE.Vector3(x, y, z);
    };
    var UP = V(0, 1, 0), XA = V(1, 0, 0), ZA = V(0, 0, 1), FZ = V(0, 0, -1);
    /* the floor and the wall meet: a soft occlusion line along the foot of
       the skirting, on the floor and on the skirting's face */
    var L = RB ? RB.len / 2 : WALL_L / 2, XM = RB ? RB.xc : X0; /* (the closed room: from wall to wall) */
    contact(V(XM, 0.0045, 0.014 + 0.2), UP, XA, FZ, L, 0.2, { ob: 0.2, ba: L, bb: 0.0, core: 0.0, soft: 0.34, softR: 0.17 });
    contact(V(XM, 0.0375, 0.0145), ZA, XA, UP, L, 0.0375, { ob: -0.0375, ba: L, bb: 0.0, core: 0.0, soft: 0.3, softR: 0.07 });
    /* the pen: its tip on the floor, the shadow of its lean on the floor,
       and where its cap meets the wall */
    if (CONTACT.refs.pen) {
      var pv = CONTACT.refs.pen;
      pv.updateMatrixWorld(true);
      var pb = new THREE.Box3().setFromObject(pv);
      var tip = V(0, 0, 0).applyMatrix4(pv.matrixWorld), cap = V(tip.x, pb.max.y - 0.04, Math.max(0.0, pb.min.z));
      contact(V(tip.x, 0.0048, tip.z), UP, XA, FZ, 0.3, 0.3, { round: 0.02, ba: 0.022, bb: 0.022, core: 0.6, coreR: 0.035, soft: 0.3, softR: 0.16, throwK: 0.05, throwMax: 0.06, skip: 2 });
      var mz = (tip.z + Math.max(0.02, cap.z)) / 2;
      CONTACT.pen = [];
      CONTACT.pen.push(contact(V(tip.x, 0.0046, mz), UP, XA, FZ, 0.35, 0.35, { round: 0.03, ba: 0.04, bb: Math.abs(tip.z - cap.z) / 2 + 0.02, core: 0.0, soft: 0.22, softR: 0.2 }));
      CONTACT.pen.push(contact(V(cap.x, Math.min(1.6, cap.y), 0.0046), ZA, XA, UP, 0.3, 0.3, { round: 0.03, ba: 0.03, bb: 0.03, core: 0.35, coreR: 0.06, soft: 0.0 }));
    }
    /* the oak block and the wire man on the sill */
    var b = new THREE.Box3();
    ["block", "man"].forEach(function (k) {
      var g = CONTACT.refs[k];
      if (!g) return;
      g.updateMatrixWorld(true);
      b.setFromObject(g);
      var sill = WIN.y0;
      var cx, cz, ha, hb;
      if (k === "block") {
        cx = (b.min.x + b.max.x) / 2;
        cz = (b.min.z + b.max.z) / 2;
        ha = (b.max.x - b.min.x) / 2;
        hb = (b.max.z - b.min.z) / 2;
        /* the block itself, not its cable: no wider than it is deep */
        ha = Math.min(ha, 0.09);
        hb = Math.min(hb, 0.09);
      } else {
        /* what he sits on: his seat, a hand's width either side of his hip */
        cx = g.position.x;
        cz = g.position.z + 0.02;
        ha = 0.11;
        hb = 0.06;
      }
      contact(V(cx, sill + 0.0035, cz), UP, XA, FZ, ha + 0.18, hb + 0.18, { round: 0.03, ba: ha * 0.85, bb: hb * 0.85, core: 0.45, coreR: 0.025, soft: 0.16, softR: 0.06, throwK: 0.03, throwMax: 0.025 });
    });
    /* the glass ball's plinth on the floor */
    if (by.gf) {
      var x0 = X.gf, PZ = 1.05, PW = 0.8, PD = 0.3;
      contact(V(x0, 0.0045, PZ), UP, XA, FZ, PW / 2 + 0.35, PD / 2 + 0.35, { round: 0.005, ba: PW / 2, bb: PD / 2, core: 0.55, coreR: 0.05, soft: 0.25, softR: 0.22, throwK: 0.12, throwMax: 0.1 });
    }
    /* (the chair, the canvases and the poster already have drawn shadows
       of their own: shadeCanvas(). Nothing is added there.) */
    contactLights();
    contactAim();
  }

  /* ============================================================
     Size, quality
     ============================================================ */

  var maxPx = COARSE ? 3.0e6 : 5.4e6;
  var qual = 1; /* drops if the machine cannot keep up */

  /* A PHONE (the phone layout, or a phone in landscape): pixel ratio 1.5 at
     most and never more than 1.0 M px in the drawing buffer (tier A). The
     resolution steps down when more than half of 60 paced frames take over
     25 ms, and back up after 300 frames in a row under 12 ms; after three
     reversals it stays where it is. Below the last step the room hands over
     to the stills document (tier C). See phoneGuard() in frame(). */
  var PQ = [1, 0.85, 0.733]; /* 1.5, 1.28, 1.1 */
  var PG = { i: 0, frames: 0, slow: 0, fast: 0, dir: 0, rev: 0, frozen: false, steps: [] };
  function isPhone() {
    return G.narrow || PHONE_DEV;
  }
  var nResize = 0; /* full re-layouts of the room: for checking (address bar) */

  function resize() {
    nResize++;
    measure();
    if (G.tall) {
      /* not a screen: stand down to the plain document with its stills */
      root.classList.remove("gl");
      return;
    }
    if (live) root.classList.add("gl");
    var w = G.W, h = G.Hc;
    /* desktop with depth of field: the pixel ratio is capped at 1.5 (most
       of the frame is soft; this pays for the blur). Elsewhere 2, as ever. */
    fxOn = fxTier();
    if (isPhone()) {
      pr = Math.min(window.devicePixelRatio || 1, 1.5) * PQ[PG.i];
      pr = Math.max(0.6, Math.min(pr, Math.sqrt(1.0e6 / Math.max(1, w * h))));
    } else {
      pr = Math.min(window.devicePixelRatio || 1, fxOn && DOF.want ? 1.5 : 2) * qual;
      pr = Math.max(0.6, Math.min(pr, Math.sqrt(maxPx / Math.max(1, w * h))));
    }
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    /* the glow is blurred anyway, so it is rendered smaller than the picture:
       cheaper everywhere, and cheaper still on a phone */
    glowComposer.setPixelRatio(pr * (COARSE ? 0.4 : 0.75));
    glowComposer.setSize(w, h);
    maskRT.setSize(Math.round(w * pr), Math.round(h * pr));
    if (fxOn) {
      var db = renderer.getDrawingBufferSize(new THREE.Vector2());
      FX.setSize(db.x, db.y);
    }
    for (var ci = 0; ci < CONTACT.list.length; ci++) CONTACT.list[ci].visible = fxOn && FXQ !== "noshadow";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    whichChapter(window.scrollY);
    if (REDUCED) shown = chapter;
    phoneMode();
    /* resizing clears the canvas: draw again now, not a frame later */
    if (live && composer) {
      timeline(sy);
      pose();
    }
    invalidate();
  }

  function draw() {
    var i, o, bg = scene.background;
    scene.background = BLACK;
    camera.layers.set(GLOW);

    /* 1. the glow source: the emitters as they are; every other part of a
          lamp in black, so it hides whatever glows behind it */
    for (i = 0; i < occluders.length; i++) {
      o = occluders[i];
      o.userData.m = o.material;
      o.material = o.isLine ? blackLine : blackMat;
    }
    for (i = 0; i < blockers.length; i++) {
      o = blockers[i];
      o.userData.m = o.material;
      o.material = blockMat;
    }
    for (i = 0; i < glowDim.length; i++) glowDim[i].m.emissiveIntensity *= glowDim[i].k;
    glowComposer.render();
    for (i = 0; i < glowDim.length; i++) glowDim[i].m.emissiveIntensity /= glowDim[i].k;

    /* 2. the mask: the same parts in white, the emitters in black. Where it
          is white the glow is thrown away, so no halo ever lies over a clip,
          a tip, a knob, a socket, a cap or a steel panel. */
    for (i = 0; i < occluders.length; i++) occluders[i].material = occluders[i].isLine ? whiteLine : whiteMat;
    for (i = 0; i < emitters.length; i++) {
      o = emitters[i];
      o.userData.m = o.material;
      o.material = blackMat;
    }
    renderer.setRenderTarget(maskRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    for (i = 0; i < occluders.length; i++) occluders[i].material = occluders[i].userData.m;
    for (i = 0; i < emitters.length; i++) emitters[i].material = emitters[i].userData.m;
    for (i = 0; i < blockers.length; i++) blockers[i].material = blockers[i].userData.m;

    /* 3. the picture */
    camera.layers.set(0);
    scene.background = bg;
    if (fxOn && fxDraw()) return;
    composer.render();
  }

  /* everything that follows from the timeline, then one picture */
  var nPose = 0; /* pictures drawn: for checking that the loop rests */
  function pose() {
    nPose++;
    if (RIG.pen) RIG.pen(actW(by.pen, "apart"));
    if (RIG.cl) RIG.cl(T.gather, actW(by.cl, "knot"), spinAuto + by.cl.hand.yaw * RAD);
    if (RIG.sr) RIG.sr(actW(by.sr, "apart"));


    if (RIG.gf && by.gf) RIG.gf(by.gf.turn || 0, by.gf.hue || 0);
    /* the room comes up as you walk in from the entrance: night at the
       door, a dim evening interior by the time you reach the first work, and
       from there to the end. (Motion off: the entrance, then the room.) */
    var lv = LV != null ? LV : REDUCED ? T.t[0] : sstep(T.r[0], 0.06, 0.92);
    if (ROOMT && ROOMT.walk && LV == null) lv = REDUCED ? T.t[1] : sstep(T.r[1], ROOMT.walk.from, ROOMT.walk.to); /* the room: dark at the pen, lit from Bubblegum on (ROOMT.walk) */
    /* looking back from the end the air clears: the lamps are 50 to 87 m
       away and must still be seen */
    scene.fog.density = lerp(roomLevel(lv), 0.008, T.t[N]);
    /* Bulb Studies is the warmest, most intimate spot in the room: the
       exposure opens a little while you stand at it. (The wall box needs no
       help: its grain reads at the room's exposure.) */
    renderer.toneMappingExposure = by.bs ? lerp(1, 1.24, presence(by.bs)) : 1;
    updateCamera();
    syncLocals();
    hudSync();
    capSync();
    draw();
  }

  /* ============================================================
     Frame. Runs only while something is changing.
     ============================================================ */

  var slow = 0, frames = 0;

  function frame(ts, late) {
    raf = 0;
    if (dog) {
      clearTimeout(dog);
      dog = 0;
    }
    if (!live || document.hidden || G.tall || sheetOpen || cardCovers()) {
      lastT = 0;
      return;
    }
    /* real elapsed time, however late the frame: everything below is an
       exponential approach, so a late frame simply catches up in one step */
    var dt = lastT ? Math.min(1, Math.max(0.001, (ts - lastT) / 1000)) : 0.016;
    var again = false, i;
    if (gfStep(dt)) again = true; /* the torch's colour and the ball's slow turn */

    /* scroll: followed exactly with motion off (it only ever causes a cut
       there), eased a little with motion on so the camera glides */
    var ty = window.scrollY;
    if (REDUCED) sy = ty;
    else {
      sy += (ty - sy) * (1 - Math.exp(-dt * 9));
      if (Math.abs(ty - sy) > 0.4) again = true;
      else sy = ty;
    }
    /* Bubblegum's knot (the globes opening and gathering while the camera
       holds) follows the scroll more closely than the camera does: eased
       over about 40 ms instead of 110, so a quick scroll does not leave
       the cluster still moving after the page has stopped, and a wheel's
       steps are still smoothed */
    if (REDUCED || T.ky == null) T.ky = ty;
    else {
      T.ky += (ty - T.ky) * (1 - Math.exp(-dt * 24));
      if (Math.abs(ty - T.ky) > 0.4) again = true;
      else T.ky = ty;
    }
    whichChapter(ty);
    timeline(sy);
    if (LZ.on) {
      lzNear();
      lzVeil();
    }
    atSync();

    /* the hand: with motion on a released lamp waits, then eases back to its
       choreographed pose; with motion off it stays where it was put */
    /* the turn button's step, eased (motion on); it then holds as a drag does */
    for (i = 0; i < N; i++) {
      var hb = STN[i].hand;
      if (hb.to == null) continue;
      hb.yaw += (hb.to - hb.yaw) * (1 - Math.exp(-dt * 7));
      hb.t = performance.now();
      if (Math.abs(hb.to - hb.yaw) < 0.1) {
        hb.yaw = hb.to;
        hb.to = null;
      }
      again = true;
    }
    if (!REDUCED) {
      var now = performance.now();
      for (i = -1; i < N; i++) {
        var h = i < 0 ? roomHand : STN[i].hand;
        if (!h.yaw && !h.pitch) continue;
        var mine = T.cur === i;
        if (dragging && mine) continue;
        if ((now - h.t) / 1000 > HOLD || !mine) {
          var f = Math.exp(-dt * 2.4);
          if (Math.abs(h.yaw) > 180) h.yaw -= Math.round(h.yaw / 360) * 360;
          h.yaw *= f;
          h.pitch *= f;
          if (Math.abs(h.yaw) < 0.05 && Math.abs(h.pitch) < 0.05) h.yaw = h.pitch = 0;
        }
        again = true;
      }
      /* the cluster turns slowly on its cord while it is in the room with you */
      /* ...only while you stand at it and the camera holds */
      if (by.cl && T.r[by.cl.i] >= 1 && !(T.r[by.cl.i + 1] > 0) && !T.mv) {
        if (!dragging) spinAuto += dt * 0.11;
        again = true;
      }
    }
    /* the wire man sways while he is on screen (never with motion off) */


    if (dirty || again) {
      dirty = false;
      pose();
      /* the focus is still pulling: one more picture */
      if (fxOn && FX.settling) again = true;
      /* Too slow? Give up resolution before giving up frames. Only frames
         the browser itself paced count: a frame that arrived late because
         the page is being throttled says nothing about the machine. */
      if (again && lastT && !late && dt < 0.2 && isPhone()) phoneGuard(ts - lastT);
      else if (again && lastT && !late && dt < 0.2) {
        frames++;
        if (ts - lastT > 34) slow++;
        if (frames >= 50) {
          /* depth of field is the first thing to go, before resolution */
          if (slow > 28 && dofLive() && !DOF.forced) {
            DOF.auto = false;
            if (window.console && console.info) console.info("rooms: depth of field off (frame time).");
          } else if (slow > 28 && qual > 0.55) {
            qual *= 0.8;
            resize();
          }
          frames = slow = 0;
        }
      }
    }

    lastT = again ? ts : 0;
    if (again) tick();
  }

  /* The header's "where am I" (rooms.js) follows the stage, not the page:
     the work the room is drawn for (motion off: the chapter it cut to;
     motion on: the one the camera is at or past the middle of the walk to).
     It is put on <html> as data-at, with an event. Without the room
     rooms.js goes by the page, as before. */
  var atKey = "";
  function atSync() {
    var k;
    if (REDUCED) k = shown <= 0 ? "open" : shown > N ? "more" : STN[shown - 1].key;
    else k = T.cur >= 0 ? STN[T.cur].key : T.t[N] >= 0.5 ? "more" : "open";
    if (k === atKey) return;
    atKey = k;
    root.setAttribute("data-at", k);
    var ev;
    try {
      ev = new CustomEvent("rooms:at", { detail: k });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent("rooms:at", false, false, k);
    }
    window.dispatchEvent(ev);
  }

  /* the phone's frame-time guard (see PQ). ms: one paced frame */
  function phoneGuard(ms) {
    if (PG.frozen) return;
    PG.frames++;
    if (ms > 25) PG.slow++;
    PG.fast = ms < 12 ? PG.fast + 1 : 0;
    var d = 0;
    if (PG.frames >= 60) {
      if (PG.slow > 30) d = 1;
      PG.frames = PG.slow = 0;
    }
    if (!d && PG.fast >= 300 && PG.i > 0) d = -1;
    if (!d) return;
    PG.fast = 0;
    if (d > 0 && PG.i === PQ.length - 1) {
      giveUp("slow");
      return;
    }
    if (PG.dir && d !== PG.dir) PG.rev++;
    PG.dir = d;
    PG.i = clamp(PG.i + d, 0, PQ.length - 1);
    PG.steps.push(d > 0 ? "down" : "up");
    if (PG.rev >= 3) PG.frozen = true;
    if (window.console && console.info) console.info("rooms: phone resolution step " + (d > 0 ? "down" : "up") + " to x" + PQ[PG.i] + (PG.frozen ? " (stays)" : ""));
    resize();
  }

  /* tier C: this phone cannot keep up. The room stands down to the stills
     document, at the work you were at, with one quiet line saying so. */
  function giveUp(why) {
    if (!live) return;
    var at = T.cur >= 0 ? STN[T.cur].sec : null;
    if (sheetOpen) closeSheet(true);
    live = false;
    root.classList.remove("gl");
    root.classList.remove("gl-soon");
    root.classList.add("gl-gaveup");
    var m = document.querySelector("main");
    if (m && !document.querySelector(".gaveup")) {
      var p = document.createElement("p");
      p.className = "gaveup";
      p.setAttribute("role", "status");
      p.textContent = "Showing photographs: this phone could not keep up with the room.";
      m.insertBefore(p, m.firstChild);
    }
    if (at) at.scrollIntoView();
    if (window.console && console.info) console.info("rooms: the room stood down (" + why + ").");
  }

  /* ============================================================
     Loading on a phone: each work when it is needed
     ============================================================
     On a phone (LAZY) boot() builds the room and only what the entrance
     shows (LZ_BOOT: the pen, the cluster, LR01, the glass ball) and goes
     live; every other work is built when the visitor comes within about one
     station of it (lzNear(), from frame()), or first of all when the index
     jumps to it (jumpTo()). The builders are not changed: lzDefer() wraps
     each deferred one so that boot() records its call instead of running
     it. A deferred build runs alone; whatever it puts in the scene goes into
     a hidden group (lzPump(): scene.add is redirected while it runs), its
     shaders are compiled off the frame (lzCompile()), and only then is it
     shown (lzShow()). If its place is on screen at that moment the picture
     from before is laid over the new one and faded off: the work comes in,
     it never pops. With motion off a cut to a work that is not there yet
     waits under the black of the cut (the veil) until it is. */
  var LZ = { on: false, run: {}, ready: {}, wait: {}, q: [], busy: null, at: -9, t: {}, fade: null, hold: false, jump: null, late: {}, holdT: 0 };
  function lzDefer(key, fn) {
    return function () {
      var args = arguments;
      (LZ.run[key] = LZ.run[key] || []).push(function () {
        return fn.apply(null, args);
      });
      return Promise.resolve();
    };
  }
  /* (a station with two builders: wrap both. A builder added later and not
     named here is simply built at boot, as before.) */
  function lzDeferAll() {
    if (!LZ_BOOT.pen) buildPen = lzDefer("pen", buildPen);
    if (!LZ_BOOT.cl) buildCluster = lzDefer("cl", buildCluster);
    if (!LZ_BOOT.sr) buildSR = lzDefer("sr", buildSR);
    if (!LZ_BOOT.bx) buildBox = lzDefer("bx", buildBox);
    if (!LZ_BOOT.bs) buildBulbs = lzDefer("bs", buildBulbs);
    if (!LZ_BOOT.fc) buildChair = lzDefer("fc", buildChair);
    if (!LZ_BOOT.pu) buildPulls = lzDefer("pu", buildPulls);
    if (!LZ_BOOT.eh) buildPrint = lzDefer("eh", buildPrint);
    if (!LZ_BOOT.gf) buildGlass = lzDefer("gf", buildGlass);
  }
  function lzReady(key) {
    return !LZ.on || !LZ.run[key] || !!LZ.ready[key];
  }
  /* ask for a work; the promise is kept when it is in the room */
  function lzWant(key) {
    if (lzReady(key)) return Promise.resolve();
    var w = LZ.wait[key];
    if (!w) {
      w = LZ.wait[key] = {};
      w.p = new Promise(function (ok) {
        w.ok = ok;
      });
    }
    if (LZ.busy !== key) {
      var k = LZ.q.indexOf(key);
      if (k >= 0) LZ.q.splice(k, 1);
      LZ.q.unshift(key);
    }
    lzPump();
    return w.p;
  }
  /* where the visitor is: the work they are at or walking to (-1 the
     entrance, N the end); want that one, the next and the one before. From
     the last work on, the end looks back down the whole room: want all. */
  function lzNear() {
    if (!LZ.on || !live) return;
    var at = -1, i;
    if (REDUCED) at = chapter - 1;
    else {
      for (i = 0; i < N; i++) if (sy >= STN[i].geo.top - G.H) at = i;
      if (sy >= G.more - G.H) at = N;
    }
    if (at === LZ.at) return;
    LZ.at = at;
    var want = [];
    if (at >= N - 1) for (i = N - 1; i >= 0; i--) want.push(i);
    else want.push(at, at + 1, at - 1);
    var q = [];
    LZ.q.forEach(function (key) {
      if (LZ.wait[key]) q.push(key); /* a jump is waiting for it: keep it first */
    });
    want.forEach(function (j) {
      var key = j >= 0 && j < N ? STN[j].key : null;
      if (key && !lzReady(key) && LZ.busy !== key && q.indexOf(key) < 0) q.push(key);
    });
    LZ.q = q;
    lzPump();
  }
  function lzPump() {
    if (LZ.busy || !LZ.q.length || !scene) return;
    var key = LZ.q.shift();
    if (lzReady(key)) {
      lzKeep(key);
      lzPump();
      return;
    }
    LZ.busy = key;
    LZ.t[key] = { asked: Math.round(performance.now()) };
    var hold = new THREE.Group();
    hold.visible = false;
    hold.name = "lazy:" + key;
    scene.add(hold);
    scene.add = function () {
      for (var a = 0; a < arguments.length; a++) hold.add(arguments[a]);
      return scene;
    };
    var jobs = LZ.run[key].map(function (f) {
      try {
        return Promise.resolve(f()).catch(lzWarn(key));
      } catch (e) {
        lzWarn(key)(e);
        return Promise.resolve();
      }
    });
    Promise.all(jobs)
      .then(function () {
        delete scene.add; /* Object3D's own again */
        LZ.t[key].built = Math.round(performance.now());
        return lzCompile(hold);
      })
      .then(function () {
        lzShow(key, hold);
        LZ.busy = null;
        lzPump();
      });
  }
  function lzWarn(key) {
    return function (err) {
      if (window.console && console.warn) console.warn("rooms: " + key + " could not be built.", err && err.message);
    };
  }
  /* compile what the new work needs (and what everything else needs with
     its lights added) without drawing it: the frames go on with the old
     programs until the new ones are linked */
  function lzCompile(hold) {
    hold.traverse(function (o) {
      if (o.isLight) o.layers.enable(GLOW);
    });
    var progs = [];
    var rt = renderer.getRenderTarget();
    hold.visible = true;
    try {
      /* (the room is drawn into the composer's targets: compile for those) */
      renderer.setRenderTarget(composer.renderTarget1);
      var mats = renderer.compile(scene, camera);
      if (mats && mats.forEach)
        mats.forEach(function (m) {
          var pp = renderer.properties.get(m).currentProgram;
          if (pp && pp.isReady) progs.push(pp);
        });
    } catch (e) {
      progs = [];
    }
    renderer.setRenderTarget(rt);
    hold.visible = false;
    return new Promise(function (ok) {
      var t0 = performance.now();
      (function poll() {
        var all = true;
        for (var i = 0; i < progs.length && all; i++) if (!progs[i].isReady()) all = false;
        if (all || performance.now() - t0 > 4000) ok();
        else setTimeout(poll, 40);
      })();
    });
  }
  /* is a work's place (the work and the light it throws round it) in the
     frame as it was last drawn */
  var lzFr = null, lzM = null, lzB = null;
  function lzSeen(key) {
    var b = WORKBOX[key];
    if (!b) return true;
    if (!lzFr) {
      lzFr = new THREE.Frustum();
      lzM = new THREE.Matrix4();
      lzB = new THREE.Box3();
    }
    camera.updateMatrixWorld();
    lzM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse.copy(camera.matrixWorld).invert());
    lzFr.setFromProjectionMatrix(lzM);
    lzB.min.set(b[0] - 1.2, 0, -0.2);
    lzB.max.set(b[1] + 1.2, b[3] + 1.0, b[4] + 0.6);
    return lzFr.intersectsBox(lzB);
  }
  function lzShow(key, hold) {
    var fade = live && !document.hidden && !sheetOpen && !cardCovers() && !G.tall && lzSeen(key);
    if (fade) {
      pose();
      fade = lzSnap();
    }
    while (hold.children.length) scene.add(hold.children[0]);
    scene.remove(hold);
    LZ.ready[key] = true;
    LZ.t[key].shown = Math.round(performance.now());
    LZ.t[key].faded = fade;
    lzKeep(key);
    if (fade) {
      pose();
      lzFadeOut();
    }
    lzVeil();
    invalidate();
  }
  function lzKeep(key) {
    var w = LZ.wait[key];
    if (!w) return;
    delete LZ.wait[key];
    w.ok();
  }
  function lzSnap() {
    var c = LZ.fade;
    if (!c) {
      c = LZ.fade = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:none;touch-action:auto;cursor:auto";
      host.appendChild(c);
    }
    c.width = canvas.width;
    c.height = canvas.height;
    try {
      c.getContext("2d").drawImage(canvas, 0, 0);
    } catch (e) {
      return false;
    }
    c.style.transition = "none";
    c.style.opacity = "1";
    return true;
  }
  function lzFadeOut() {
    var c = LZ.fade;
    void c.offsetWidth;
    c.style.transition = "opacity " + (REDUCED ? 0.12 : 0.7) + "s ease";
    c.style.opacity = "0";
  }
  /* motion off: the station on screen is not there yet: hold the black of
     the cut until it is, then the cut's own fade up */
  function lzVeil() {
    if (!veil || !LZ.on) return;
    var c = REDUCED ? chapter - 1 : -1;
    var jk = LZ.jump, ck = c >= 0 && c < N ? STN[c].key : null;
    var wait = !!(jk && !lzReady(jk) && !LZ.late[jk]) || !!(ck && !lzReady(ck) && !LZ.late[ck]);
    /* never longer than 6 s: then the stage without it, and it fades in
       when it comes */
    if (wait && !LZ.hold) {
      LZ.holdT = setTimeout(function () {
        if (jk) LZ.late[jk] = true;
        if (ck) LZ.late[ck] = true;
        lzVeil();
      }, 6000);
    }
    if (wait === LZ.hold) return;
    LZ.hold = wait;
    if (!wait) {
      LZ.jump = null;
      clearTimeout(LZ.holdT);
    }
    veil.classList.toggle("is-wait", wait);
    if (!wait) {
      veil.classList.remove("is-cut");
      void veil.offsetWidth;
      veil.classList.add("is-cut");
    }
  }

  /* ============================================================
     Boot
     ============================================================ */

  async function boot() {
    var m = await Promise.all([
      import(CDN + "build/three.module.min.js"), /* the same as the import map's "three" */
      import(CDN + "examples/jsm/loaders/GLTFLoader.js"),
      import(CDN + "examples/jsm/postprocessing/EffectComposer.js"),
      import(CDN + "examples/jsm/postprocessing/RenderPass.js"),
      import(CDN + "examples/jsm/postprocessing/UnrealBloomPass.js"),
      import(CDN + "examples/jsm/postprocessing/OutputPass.js"),
      import(CDN + "examples/jsm/postprocessing/ShaderPass.js"),
      import(CDN + "examples/jsm/utils/BufferGeometryUtils.js"),
      import(CDN + "examples/jsm/postprocessing/Pass.js")
    ]);
    THREE = m[0];
    Utils = m[7];
    var Loader = m[1].GLTFLoader;

    renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: false, stencil: false,
      powerPreference: "high-performance"
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060504);
    scene.fog = new THREE.FogExp2(0x060504, 0.04);
    scene.environment = studioEnv();

    camera = new THREE.PerspectiveCamera(FOV, 1, 0.08, 150);
    vPos = new THREE.Vector3();
    vTgt = new THREE.Vector3();
    vA = new THREE.Vector3();
    vB = new THREE.Vector3();
    vC = new THREE.Vector3();

    if (!VIEWS) VIEWS = await fetch("views.json").then(function (r) { return r.json(); });

    LZ.on = LAZY && !fxWant();
    if (LZ.on) lzDeferAll();
    buildRoom();
    var jobs = [];
    /* a short station that fails to build leaves its place empty; it does
       not take the room with it */
    function safe(job, what) {
      return job.catch(function (err) {
        if (window.console && console.warn) console.warn("rooms: " + what + " could not be built.", err && err.message);
      });
    }
    if (by.fc) jobs.push(safe(buildChair(Loader), "the chair"));
    if (by.pu) jobs.push(safe(buildPulls(), "the canvases"));
    if (by.eh) jobs.push(safe(buildPrint(), "the poster"));
    if (by.gf) jobs.push(safe(buildGlass(), "the glass"));
    if (by.pen) jobs.push(buildPen(Loader));
    if (by.cl) jobs.push(buildCluster(Loader));
    if (by.sr) jobs.push(buildSR(Loader));
    if (by.bx) jobs.push(buildBox(Loader));
    if (by.bs) jobs.push(buildBulbs(Loader));
    await Promise.all(jobs);

    /* every light lights the glow layer too, so the glow render uses the
       same shader programs as the main one */
    scene.traverse(function (o) {
      if (o.isLight) o.layers.enable(GLOW);
    });
    BLACK = new THREE.Color(0x000000);
    blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    blockMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide });
    blackLine = new THREE.LineBasicMaterial({ color: 0x000000, fog: false });
    whiteLine = new THREE.LineBasicMaterial({ color: 0xffffff, fog: false });
    maskRT = new THREE.WebGLRenderTarget(4, 4, { samples: COARSE ? 0 : 4 });

    /* 1. the glow: only the emitters, blurred */
    glowComposer = new m[2].EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
    );
    glowComposer.renderToScreen = false;
    glowComposer.addPass(new m[3].RenderPass(scene, camera));
    bloom = new m[4].UnrealBloomPass(new THREE.Vector2(4, 4), 0.62, 0.85, 0.0);
    glowComposer.addPass(bloom);

    /* 2. the picture: the whole room in HDR, the glow added where the mask
          allows it, then tone-mapped */
    composer = new m[2].EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: COARSE ? 0 : 4 })
    );
    composer.addPass(new m[3].RenderPass(scene, camera));
    composer.addPass(
      new m[6].ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            tGlow: { value: bloom.renderTargetsHorizontal[0].texture },
            tMask: { value: maskRT.texture },
            k: { value: 0.5 }
          },
          vertexShader:
            "varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader:
            "uniform sampler2D tDiffuse; uniform sampler2D tGlow; uniform sampler2D tMask; uniform float k; varying vec2 vUv;\n" +
            "void main(){ gl_FragColor = texture2D(tDiffuse, vUv) + k * (1.0 - texture2D(tMask, vUv).r) * texture2D(tGlow, vUv); }"
        }),
        "tDiffuse"
      )
    );
    composer.addPass(new m[5].OutputPass());

    /* 3. desktop: the same picture through our own passes, with depth of
          field, haze and grain (see "FX"). Any failure: the composer above. */
    if (fxWant()) {
      try {
        renderer.debug.onShaderError = function () {
          fxErr = true; /* fxDraw() sees it and hands over to the composer */
          if (window.console && console.warn) console.warn("rooms: a shader did not compile.");
        };
        FX = buildFX(m[8].FullScreenQuad);
        FX.ok = renderer.capabilities.isWebGL2;
        buildContacts();
        if (FXQ === "nohaze") HAZE.on = false;
      } catch (e) {
        FX = null;
        if (window.console && console.info) console.info("rooms: depth of field not built.", e && e.message);
      }
    }

    host.appendChild(canvas);
    measure();
    whichChapter(window.scrollY);
    shown = chapter;
    live = true;
    resize();

    /* draw one frame before the stills hand over, so nothing flashes */
    timeline(sy);
    pose();
    atSync();
    if (!G.tall) root.classList.add("gl");
    if (hud) hud.hidden = false;

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);

    [].forEach.call(document.querySelectorAll("[data-3d]"), function (el) {
      el.addEventListener("keydown", onKey);
    });

    window.addEventListener("scroll", invalidate, { passive: true });
    /* Scroll events are delivered with frames. Where a browser withholds
       frames (see tick()), a scroll made by script or by an anchor would
       never be heard; so also look, four times a second. Two numbers. */
    var seenY = window.scrollY;
    setInterval(function () {
      if (window.scrollY !== seenY) {
        seenY = window.scrollY;
        invalidate();
      }
    }, 250);
    /* On a phone the address bar comes and goes as you scroll, and every time
       the window's height changes by its height. The canvas is 100lvh and the
       page is measured in svh, so nothing needs to change: a change of height
       alone, under 160 px, is ignored (no re-measure, no renderer resize, no
       jump in the framing). A change of width or a larger one is a real
       resize. */
    var rzW = window.innerWidth, rzH = window.innerHeight;
    window.addEventListener("resize", function () {
      var w = window.innerWidth, h = window.innerHeight;
      if (isPhone() && w === rzW && Math.abs(h - rzH) < 160) return;
      rzW = w;
      rzH = h;
      resize();
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.querySelector("main"));
    window.addEventListener("load", resize);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        lastT = 0;
        invalidate();
      }
    });
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      live = false;
      root.classList.remove("gl"); /* the stills come back */
      root.classList.remove("gl-soon");
    });

    if (TUNING) TUNE = makeTune();

    /* for checking by hand and by the screenshot scripts */
    window.__rooms = {
      /* depth of field, live: S (focus, m), Kc (aperture), px (blur at
         infinity, device px radius), maxPx; want/auto/forced; edit and
         call redraw() to tune by hand */
      dof: DOF,
      fx: function () {
        return {
          built: !!FX, ok: !!(FX && FX.ok), on: fxOn, dof: dofLive(), why: FX ? FX.why || null : null,
          probe: FX ? FX.probeRes || null : null, pixelRatio: +pr.toFixed(2),
          size: FX ? [FX.W, FX.H] : null, haze: HAZE.on ? HAZE.list.length : 0, contacts: CONTACT.list.length,
          S: +DOF.S.toFixed(3), St: +DOF.St.toFixed(3), K: +DOF.Kc.toFixed(4), blurInf: +(DOF.Kc / DOF.S * 100).toFixed(3) + "%"
        };
      },
      grain: GRAIN,
      /* LR01's spot on the steel (SR_SPOT): edit, then srSpotApply() */
      srSpot: SR_SPOT,
      srSpotApply: srSpotApply,
      haze: HAZE,
      /* the room's numbers (null in ?room=warm), live; roomApply() after an edit */
      room: ROOMT,
      /* the closed room (null with ?back=off): its walls, live in part (far, corner: roomApply()) */
      back: RB,
      /* for checking: where the camera stands now */
      peek: function (pos, at) {
        RB_PEEK = pos ? [pos, at] : null;
        invalidate();
      },
      camNow: function () {
        return camera.position.toArray().map(function (v) { return +v.toFixed(3); });
      },
      roomApply: roomApply,
      /* for comparing in one session: false draws through the old composer */
      useFx: function (v) {
        if (FX) FX.user = !v;
        resize();
      },
      redraw: function () {
        if (FX) {
          contactLights();
          contactAim();
        }
        invalidate();
      },
      state: function () {
        var st = T.cur >= 0 ? STN[T.cur] : null;
        var w = {};
        if (st) for (var k in st.w) if (st.w[k]) w[k] = +st.w[k].toFixed(2);
        return {
          motion: REDUCED ? "reduced" : "full", station: st ? st.key : "room", chapter: chapter,
          yaw: st ? +st.hand.yaw.toFixed(1) : +roomHand.yaw.toFixed(1), beats: w,
          ex: st && st.ex != null ? +st.ex.toFixed(3) : null, d: st && st.d != null ? +st.d.toFixed(3) : null,
          gather: +T.gather.toFixed(2), knot: by.cl ? +actW(by.cl, "knot").toFixed(3) : null, exposure: +renderer.toneMappingExposure.toFixed(2), level: +levelNow.toFixed(3),
          pixelRatio: +pr.toFixed(2), models: MODELS.filter(Boolean),
          man: RIG.man ? "static" : null,
          pictures: nPose,
          /* the phone */
          phone: { layout: G.narrow, device: PHONE_DEV, resizes: nResize, quality: PQ[PG.i], steps: PG.steps.slice(), frozen: PG.frozen,
            sheet: sheetOpen ? openSt.key : null, cap: cap ? cap.getAttribute("data-state") : null, capKey: capKey, H: G.H, Hc: G.Hc }
        };
      },
      /* the camera at any scroll position, without moving it: where it
         stands, what it looks at, the lens, which view, and which works
         are in the frame (any part of a rough box round each) */
      camAt: function (y) {
        var keep = T.y, kky = T.ky;
        T.ky = null; /* (everything at y, the knot included) */
        timeline(y);
        var o = camPose(newCam());
        applyHand(o);
        rbKeep(o.pos);
        var c = camera.clone();
        c.fov = FOV;
        c.position.copy(o.pos);
        c.lookAt(o.tgt);
        c.setViewOffset(G.W, G.Hc, (0.5 - o.cx) * G.W, (0.5 - o.cy) * G.Hc, G.W, G.Hc);
        c.updateMatrixWorld(true);
        c.updateProjectionMatrix();
        /* the bands the writing stands on (rooms.js, the same rule), as
           they are at y: what is under one that is up does not count */
        var H = G.H, F = Math.max(60, H * 0.1), bl = 0, br = 0;
        if (!G.narrow)
          [].forEach.call(document.querySelectorAll(".work, .more"), function (sec) {
            var ps = sec.querySelectorAll(".work__col .panel, .more__card");
            if (!ps.length) return;
            var t0 = docTop(ps[0]) - y, b1 = docTop(ps[ps.length - 1]) + ps[ps.length - 1].offsetHeight - y;
            var op = Math.max(0, Math.min(1, (H + F - t0) / F, (b1 + F) / F));
            if (/work--l|more/.test(sec.className)) bl = Math.max(bl, op);
            else br = Math.max(br, op);
          });
        var band = document.querySelector(".band--l"), bw = band ? band.offsetWidth / G.W : 0.5;
        var vis = [], q = new THREE.Vector3();
        for (var k in WORKBOX) {
          var b = WORKBOX[k], hit = 0;
          for (var ix = 0; ix <= 4; ix++)
            for (var iy = 0; iy <= 3; iy++) {
              q.set(lerp(b[0], b[1], ix / 4), lerp(b[2], b[3], iy / 3), b[4]).project(c);
              var sx = (q.x + 1) / 2;
              if (q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && !(bl > 0.5 && sx < bw) && !(br > 0.5 && sx > 1 - bw)) hit++;
            }
          var VS = viewSet()[k];
          for (var vn in VS) {
            q.set(VS[vn].at[0], VS[vn].at[1], VS[vn].at[2]).project(c);
            var sx2 = (q.x + 1) / 2;
            if (q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && !(bl > 0.5 && sx2 < bw) && !(br > 0.5 && sx2 > 1 - bw)) hit++;
          }
          if (hit) vis.push(k + ":" + hit);
        }
        /* the current work's rough box (WORKBOX, with 0.15 m of depth either
           side of its plane), projected: CSS px of the viewport */
        var box = null, WB = WORKBOX[o.key];
        if (WB) {
          var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, behind = false;
          for (var cx = 0; cx < 2; cx++)
            for (var cy = 0; cy < 2; cy++)
              for (var cz = 0; cz <= 0; cz += 2) {
                q.set(cx ? WB[1] : WB[0], cy ? WB[3] : WB[2], WB[4] + cz * 0.15).project(c);
                if (q.z >= 1) behind = true;
                var px = (q.x + 1) / 2 * G.W, py = (1 - q.y) / 2 * G.Hc;
                bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
              }
          box = { x0: Math.round(bx0), y0: Math.round(by0), x1: Math.round(bx1), y1: Math.round(by1), behind: behind };
        }
        var dir = new THREE.Vector3().subVectors(o.tgt, o.pos).normalize();
        /* the heading of the middle of the frame, the lens shift included */
        var mid = new THREE.Vector3(0, 0, 0.5).unproject(c).sub(o.pos).normalize();
        T.ky = kky;
        timeline(keep);
        var r3 = function (v) { return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
        return {
          y: y, pos: r3(o.pos), at: r3(o.tgt), fov: c.fov, cx: +o.cx.toFixed(3), key: o.key, view: o.view, moving: o.moving,
          yaw: +(Math.atan2(dir.x, -dir.z) / RAD).toFixed(2), pitch: +(Math.asin(dir.y) / RAD).toFixed(2),
          midYaw: +(Math.atan2(mid.x, -mid.z) / RAD).toFixed(2), vis: vis, band: (bl > 0.5 ? "L" : "") + (br > 0.5 ? "R" : ""), box: box
        };
      },
      /* for checking the phone's quality ladder: feed it frame times */
      phoneGuard: function (ms, n) {
        for (var k = 0; k < (n || 1); k++) phoneGuard(ms);
        return { quality: PQ[PG.i], steps: PG.steps.slice(), rev: PG.rev, frozen: PG.frozen, live: live };
      },
      plans: function () {
        var o = {};
        STN.forEach(function (st) { o[st.key] = st.plan; });
        return o;
      },
      /* prototype only: the Light Box face's shader settings, for tuning */
      box: function () {
        return RIG.bxU ? { u: RIG.bxU, face: RIG.bxFace, redraw: invalidate } : null;
      },
      /* the nearest any part of the pen comes to the wall (z = 0) and the
         floor (y = 0) over the whole take-apart range, in metres */
      clCheck: function (g, l) {
        if (!RIG.clCheck) return null;
        var r = RIG.clCheck(g, l);
        if (g != null) invalidate();
        return r;
      },
      clReach: function () {
        if (!RIG.clReach) return null;
        var r = RIG.clReach();
        invalidate();
        return r;
      },
      cableDip: function () {
        return RIG.clDip ? RIG.clDip() : null;
      },
      manClearance: function () {
        return RIG.man ? RIG.man() : null;
      },
      glass: function () {
        return RIG.gfReach ? RIG.gfReach() : null;
      },
      lights: function () {
        var n = 0;
        scene.traverse(function (o) { if (o.isLight) n++; });
        return { real: n, local: LOCALS.length };
      },
      /* the pen's veneer map, live: ven().u.value = (gain, mean green, contrast) */
      ven: function () { return VEN; },
      penClearance: function () {
        if (!RIG.penParts) return null;
        var b = new THREE.Box3(), minZ = 1e9, minY = 1e9, atZ = 0;
        for (var s = 0; s <= 40; s++) {
          RIG.pen(s / 40);
          scene.updateMatrixWorld(true);
          for (var i = 0; i < RIG.penParts.length; i++) {
            b.setFromObject(RIG.penParts[i].o);
            if (b.min.z < minZ) {
              minZ = b.min.z;
              atZ = s / 40;
            }
            if (b.min.y < minY) minY = b.min.y;
          }
        }
        RIG.pen(actW(by.pen, "apart"));
        return { wall: +minZ.toFixed(4), wallAt: atZ, floor: +minY.toFixed(4) };
      },
      /* loading on a phone: what is in the room, what is coming, when */
      lazy: function () {
        return { on: LZ.on, ready: Object.keys(LZ.ready), deferred: Object.keys(LZ.run), busy: LZ.busy, q: LZ.q.slice(), at: LZ.at, hold: LZ.hold, t: LZ.t };
      }
    };
    invalidate();
    lzNear();
  }

  booting = true;
  boot().catch(function (err) {
    /* no room: the stills and the plain document are already the page */
    if (window.console && console.warn) console.warn("rooms: 3D unavailable, showing stills.", err && err.message);
    root.classList.remove("gl");
    root.classList.remove("gl-soon");
  });
})();
