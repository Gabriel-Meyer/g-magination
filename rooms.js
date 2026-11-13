/* ============================================================
   ROOMS v2 — the page (everything that is not the 3D room)
   Gabriel Meyer / g-magination

   The document is complete without this file. It only:
     - keeps the header's "where am I" label in step with the scroll
     - brings up the band the writing stands on, on the side it is on
     - plays the one silent film of a room while it is on screen
       (never under reduced motion, where it keeps its controls)
   The room itself — the canvas, the camera, the drag — is rooms3d.js.
   ============================================================ */

(function () {
  "use strict";

  var root = document.documentElement;
  var REDUCED = root.getAttribute("data-motion") === "reduced";
  /* the phone layout (rooms.css, "PHONE: STAGE AND DOSSIER"): the same query
     as there and in rooms3d.js */
  var PH = window.matchMedia
    ? window.matchMedia("(max-width: 820px) and (orientation: portrait)")
    : { matches: false };
  /* ...with the room live: the columns are dossiers, opened from the caption */
  function phoneRoom() {
    return PH.matches && root.classList.contains("gl");
  }

  /* ---------- motion: on / off ----------
     The head script has already decided how this visit starts (motion on,
     unless the address or a stored choice says otherwise: the artist's
     decision of 2026-11-13). From here the visitor can change it at any
     time with the Motion switch in the header, the one way to the still
     mode. The choice is stored, and the room (rooms3d.js) and the films
     below switch over live. */

  var motionBtn = document.querySelector(".bar__motion");

  function paintMotion() {
    if (!motionBtn) return;
    var on = !REDUCED;
    motionBtn.setAttribute("aria-pressed", String(on));
    motionBtn.setAttribute(
      "aria-label",
      on ? "Motion is on: the camera travels as you scroll. Switch it off."
         : "Motion is off: the room holds still. Switch it on."
    );
    var b = motionBtn.querySelector("b");
    if (b) b.textContent = on ? "on" : "off";
  }

  function setMotion(mode) {
    REDUCED = mode === "reduced";
    root.setAttribute("data-motion", REDUCED ? "reduced" : "full");
    try {
      localStorage.setItem("rooms-motion", REDUCED ? "reduced" : "full");
    } catch (e) {}
    paintMotion();
    films();
    var ev;
    try {
      ev = new CustomEvent("rooms:motion", { detail: REDUCED ? "reduced" : "full" });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent("rooms:motion", false, false, REDUCED ? "reduced" : "full");
    }
    window.dispatchEvent(ev);
  }

  paintMotion();
  if (motionBtn)
    motionBtn.addEventListener("click", function () {
      setMotion(REDUCED ? "full" : "reduced");
    });

  /* ---------- where am I ---------- */

  var chapters = [].slice.call(document.querySelectorAll("[data-chapter]"));
  var barN = document.querySelector(".bar__n");
  var barT = document.querySelector(".bar__t");
  var navLinks = [].slice.call(document.querySelectorAll(".bar__nav a"));
  var current = null;

  function locate() {
    var mid = window.innerHeight * 0.5;
    var here = chapters[0];
    /* with the room live, the work the room is drawn for (rooms3d.js puts
       it on <html> as data-at), so the header never names one the stage is
       not showing; otherwise the chapter at the middle of the screen */
    var at = root.classList.contains("gl") && root.getAttribute("data-at");
    var st = at && document.querySelector('[data-chapter="' + at + '"]');
    if (st) here = st;
    else
      for (var i = 0; i < chapters.length; i++) {
        if (chapters[i].getBoundingClientRect().top <= mid) here = chapters[i];
      }
    if (here === current) return;
    current = here;
    if (barN) barN.textContent = here.getAttribute("data-n") || "00";
    if (barT) barT.textContent = here.getAttribute("data-title") || "";
    navLinks.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + here.id;
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  /* ---------- the band the writing stands on ----------
     Two fixed, full-height bands, one on each side (rooms.css). The writing
     alternates sides, so one is up at a time: each is fully there before
     the first line of a column on its side reaches the screen, and goes
     only once the last has left it. It follows the scroll itself, not a
     timer, so no line of writing is ever on screen without it. (On a phone
     there are no bands: every run of writing is its own sheet.) */
  var bandL = document.querySelector(".band--l");
  var bandR = document.querySelector(".band--r");
  var cols = [].map.call(document.querySelectorAll(".work"), function (s) {
    var p = s.querySelectorAll(".work__col .panel");
    return { left: /work--l/.test(s.className), a: p[0], b: p[p.length - 1] };
  });
  var card = document.querySelector(".more__card");
  if (card) cols.push({ left: true, a: card, b: card });

  function bands() {
    if (!bandL || !bandR) return;
    var H = window.innerHeight, F = Math.max(60, H * 0.1), l = 0, r = 0;
    if (!PH.matches) {
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        if (!c.a) continue;
        var top = c.a.getBoundingClientRect().top, bot = c.b.getBoundingClientRect().bottom;
        var o = Math.max(0, Math.min(1, (H + F - top) / F, (bot + F) / F));
        if (c.left) l = Math.max(l, o);
        else r = Math.max(r, o);
      }
    }
    bandL.style.opacity = l.toFixed(3);
    bandR.style.opacity = r.toFixed(3);
  }

  var ticking = false;
  function onScroll() {
    bands(); /* with the scroll itself, never a frame behind the writing */
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      locate();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("rooms:at", locate);
  window.addEventListener("load", bands);
  locate();
  bands();

  /* ---------- the films ---------- */

  var videos = [].slice.call(document.querySelectorAll("video"));
  var inView = [];

  function play(v) {
    videos.forEach(function (o) {
      if (o !== v && !o.paused) o.pause(); /* one at a time */
    });
    var p = v.play();
    if (p && p.catch)
      p.catch(function () {
        v.setAttribute("controls", "");
      });
  }

  /* motion on: a film plays by itself while it is on screen, no controls.
     motion off: nothing starts by itself; the film keeps its controls.
     A phone with the room live: films are in the dossier, where they are
     tap-to-play, always (rooms3d.js gives them their controls). */
  function films() {
    var auto = !REDUCED && "IntersectionObserver" in window && !phoneRoom();
    videos.forEach(function (v) {
      if (auto) {
        v.removeAttribute("controls");
        v.muted = true;
        if (inView.indexOf(v) >= 0) play(v);
      } else {
        v.setAttribute("controls", "");
        if (!v.paused) v.pause();
      }
    });
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          var i = inView.indexOf(v);
          if (e.isIntersecting && e.intersectionRatio > 0.55) {
            if (i < 0) inView.push(v);
            if (!REDUCED && !phoneRoom()) play(v);
          } else {
            if (i >= 0) inView.splice(i, 1);
            if (!REDUCED && !phoneRoom() && !v.paused) v.pause();
          }
        });
      },
      { threshold: [0, 0.55, 1] }
    );
    videos.forEach(function (v) {
      io.observe(v);
    });
  }
  films();

  /* ---------- posters: fetched when a film comes near ----------
     The page carries each film's poster as data-poster, so it is not
     fetched with the page: it is set when the film is within a screen of
     being seen (on a phone with the room, once its dossier is open and
     scrolled to it). Films never preload (preload="none"). */
  var posters = [].slice.call(document.querySelectorAll("video[data-poster]"));
  function poster(v) {
    if (!v.getAttribute("poster")) v.setAttribute("poster", v.getAttribute("data-poster"));
  }
  if ("IntersectionObserver" in window) {
    var pio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          poster(e.target);
          pio.unobserve(e.target);
        });
      },
      { rootMargin: "100% 0px" }
    );
    posters.forEach(function (v) {
      pio.observe(v);
    });
  } else posters.forEach(poster);
})();
