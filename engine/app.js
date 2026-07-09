/* Driftgarden — interface.
 * Everything the player sees and touches. All world truth lives in
 * engine/world.js (the DriftWorld module); this file only renders it,
 * persists it, and turns clicks into world events.
 */
(function () {
  'use strict';

  var W = window.DriftWorld;
  var M = window.DriftMind;
  var STORE_PREFIX = 'driftgarden.';
  var KITH_TICK_MS = 2000;

  /* ---------- the timewarp (a maker's tool, not a player's) ----------
   * Append ?warp=1000 to the URL and the whole world — growth, weather,
   * seasons, ageing, births, deaths — runs that many times faster. The
   * simulation is sub-stepped so behaviour stays sane. Nothing persists;
   * remove the parameter and time walks again. */

  var WARP = (function () {
    try {
      var m = (location.search + ' ' + location.hash).match(/warp=(\d+(?:\.\d+)?)/);
      return m ? Math.max(1, Math.min(5000, parseFloat(m[1]))) : 1;
    } catch (e) { return 1; }
  })();
  var WARP_BASE = Date.now();
  function vnow() {
    return WARP === 1 ? Date.now() : WARP_BASE + (Date.now() - WARP_BASE) * WARP;
  }
  if (WARP > 1) W.setEnv({ now: vnow });

  /* ---------- persistence & boot ---------- */

  var state = null;

  function save() {
    state.touched = vnow();
    try {
      localStorage.setItem(STORE_PREFIX + state.id, JSON.stringify(state));
    } catch (e) { /* private mode etc. — the Preserve button still works */ }
  }

  function boot() {
    var embedded = window.DRIFT_STATE;
    if (embedded && W.looksLikeWorld(embedded)) {
      state = embedded;
      // If this same world was tended in this browser after the file was
      // written, the browser's copy is newer — resume from it.
      try {
        var local = localStorage.getItem(STORE_PREFIX + embedded.id);
        if (local) {
          var parsed = JSON.parse(local);
          if (parsed.clock > embedded.clock) state = parsed;
        }
      } catch (e) { /* fall through to embedded */ }
    } else {
      // A seed file carries no world. Resume the most recently tended world
      // in this browser rather than spawning a stranger every time.
      try {
        var best = null;
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key.indexOf(STORE_PREFIX) !== 0) continue;
          var world = JSON.parse(localStorage.getItem(key));
          if (W.looksLikeWorld(world) && (!best || (world.touched || 0) > (best.touched || 0))) {
            best = world;
          }
        }
        if (best) state = best;
      } catch (e) { /* corrupted entry — start fresh */ }
      if (!state) state = W.newWorld();
    }
    W.ensureKith(state);        // worlds preserved before the kith existed get theirs
    W.settleImmigrants(state);  // worlds preserved before the land existed settle onto it
    bootNews = W.catchUp(state); // life went on while the file slept
    W.advanceGrowth(state);
    W.weatherTick(state);       // today's sky is chronicled from the first moment
    save();
  }

  var bootNews = [];

  function announceNews(events) {
    if (!events || events.length === 0) return;
    var births = events.filter(function (e) { return e.kind === 'born'; }).length;
    var passings = events.filter(function (e) { return e.kind === 'passing'; }).length;
    if (events.length === 1) { toast(events[0].text); return; }
    var bits = [];
    if (births) bits.push(births === 1 ? 'a child was born' : births + ' children were born');
    if (passings) bits.push(passings === 1 ? 'one of the kith fell asleep beneath the soil' : passings + ' kith fell asleep beneath the soil');
    if (bits.length === 0) { toast(events[events.length - 1].text); return; }
    toast('While the world slept: ' + bits.join(', and ') + '. The chronicle remembers everything.');
  }

  /* ---------- ephemeral UI state ---------- */

  var selected = null;   // { type: 'plant'|'kith', id: '...' } | null
  var openModal = null;  // 'merge' | 'chronicle' | 'about' | 'worlds' | 'lexicon' | 'families' | null
  var lastWxKind = null; // re-render when the weather turns
  var wxPrev = null;     // the sky we are fading away from
  var lastDayPhase = null; // re-render when the light turns (dawn/day/dusk/night)
  var beacon = null;     // { x, y, until } — the player's soft call; never saved
  var chronicleShowAll = false; // long histories start folded
  var lastSayings = {};         // per-kith last spoken line, for chirp timing
  var songStep = 0;             // which note of the melody comes next

  /* ---------- the camera ----------
   * The scene lives in a 1000x1000 box (sky above y=470, land below).
   * The camera is a viewBox window with matched aspect, so nothing is ever
   * cropped away silently: zoom with the wheel or pinch, pan by dragging,
   * and the default framing always shows the whole of the land. */

  var cam = { zoom: 1, cx: 500, cy: 735 };
  var CAM_MIN_ZOOM = 0.55;
  var CAM_MAX_ZOOM = 3;

  function viewAspect() {
    var r = stage.getBoundingClientRect();
    return r.width > 0 ? r.height / r.width : 1;
  }

  function camWindow() {
    var w = 1000 / cam.zoom;
    var h = w * viewAspect();
    return { w: w, h: h };
  }

  function clampCam() {
    var win = camWindow();
    cam.zoom = Math.max(CAM_MIN_ZOOM, Math.min(CAM_MAX_ZOOM, cam.zoom));
    // keep the window over the scene, with a little breathing room
    var minCx = Math.min(500, -150 + win.w / 2), maxCx = Math.max(500, 1150 - win.w / 2);
    var minCy = Math.min(500, -450 + win.h / 2), maxCy = Math.max(500, 1030 - win.h / 2);
    cam.cx = Math.max(minCx, Math.min(maxCx, cam.cx));
    cam.cy = Math.max(minCy, Math.min(maxCy, cam.cy));
  }

  function camViewBox() {
    clampCam();
    var win = camWindow();
    return (cam.cx - win.w / 2).toFixed(1) + ' ' + (cam.cy - win.h / 2).toFixed(1) + ' ' +
      win.w.toFixed(1) + ' ' + win.h.toFixed(1);
  }

  function applyCam() {
    var svg = document.getElementById('world');
    if (svg) svg.setAttribute('viewBox', camViewBox());
  }

  // Default framing: the land fills the frame, close and immersive, anchored
  // to its base — a little sky, mostly world.
  function resetCam() {
    var aspect = viewAspect();
    // fill the land's ~530 units of height (plus a sliver of sky), zoomed in
    var fillHeight = (1000 * aspect) / 560;
    cam.zoom = Math.max(CAM_MIN_ZOOM, Math.min(1.35, fillHeight));
    var win = { w: 1000 / cam.zoom, h: (1000 / cam.zoom) * aspect };
    cam.cx = 500;
    cam.cy = 1018 - win.h / 2; // land's base sits just inside the bottom edge
    clampCam();
  }

  window.addEventListener('resize', function () { resetCam(); applyCam(); });

  var camPointers = {}; // active pointers on the world (for pan & pinch)
  var camPinch = null;

  function zoomAt(svg, clientX, clientY, factor) {
    if (!svg) return;
    var pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var p = pt.matrixTransform(ctm.inverse());
    var oldZoom = cam.zoom;
    cam.zoom = Math.max(CAM_MIN_ZOOM, Math.min(CAM_MAX_ZOOM, oldZoom * factor));
    var keep = oldZoom / cam.zoom;
    cam.cx = p.x + (cam.cx - p.x) * keep;
    cam.cy = p.y + (cam.cy - p.y) * keep;
    applyCam();
  }

  /* ---------- rendering ---------- */

  var stage = document.getElementById('stage');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toScreen(x, y) {
    return { x: 40 + x * 920, y: 470 + (y - 0.55) / 0.4 * 480 };
  }

  /* ---------- sound: the world, heard ----------
   * Everything is synthesised on the spot from oscillators and filtered
   * noise — no audio files, no dependencies. Browsers only allow sound
   * after a user gesture, so the world stays silent until first touch. */

  var audio = {
    ctx: null,
    master: null,
    windGain: null,
    rainGain: null,
    muted: false,
    lastChirp: 0,
    songTimer: null,
    rumbleTimer: null
  };
  try { audio.muted = localStorage.getItem('driftgarden.muted') === '1'; } catch (e) { /* fine */ }

  function initAudio() {
    if (audio.muted) return;
    if (audio.ctx) {
      // autoplay policy may have parked the context; a real touch wakes it
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.6;
    audio.master.connect(ctx.destination);

    // one shared loop of white noise feeds both wind and rain
    var seconds = 2;
    var buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    var wind = ctx.createBufferSource();
    wind.buffer = buffer; wind.loop = true;
    var windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass'; windFilter.frequency.value = 260; windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain(); audio.windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(audio.windGain); audio.windGain.connect(audio.master);
    wind.start();

    var rain = ctx.createBufferSource();
    rain.buffer = buffer; rain.loop = true;
    var rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass'; rainFilter.frequency.value = 4200; rainFilter.Q.value = 0.4;
    audio.rainGain = ctx.createGain(); audio.rainGain.gain.value = 0;
    rain.connect(rainFilter); rainFilter.connect(audio.rainGain); audio.rainGain.connect(audio.master);
    rain.start();

    updateWeatherAudio(lastWxKind || 'clear');
  }
  window.addEventListener('pointerdown', initAudio);
  window.addEventListener('keydown', initAudio);

  var WX_SOUND = {
    clear: { wind: 0.03, rain: 0 },
    breeze: { wind: 0.09, rain: 0 },
    mist: { wind: 0.045, rain: 0 },
    rain: { wind: 0.05, rain: 0.05 },
    storm: { wind: 0.16, rain: 0.09 }
  };

  function updateWeatherAudio(kind) {
    if (!audio.ctx || audio.muted) return;
    var target = WX_SOUND[kind] || WX_SOUND.clear;
    var t = audio.ctx.currentTime;
    audio.windGain.gain.linearRampToValueAtTime(target.wind, t + 2.5);
    audio.rainGain.gain.linearRampToValueAtTime(target.rain, t + 2.5);
    clearTimeout(audio.rumbleTimer);
    if (kind === 'storm') scheduleRumble();
  }

  function scheduleRumble() {
    audio.rumbleTimer = setTimeout(function () {
      if (!audio.ctx || audio.muted || lastWxKind !== 'storm') return;
      var ctx = audio.ctx;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(52 + Math.random() * 18, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + 1.6);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.9);
      osc.connect(g); g.connect(audio.master);
      osc.start(); osc.stop(ctx.currentTime + 2);
      scheduleRumble();
    }, 7000 + Math.random() * 14000);
  }

  // a kith speaks: two tiny blips in its own register
  function chirp(voiceSeed) {
    if (!audio.ctx || audio.muted) return;
    var now = Date.now();
    if (now - audio.lastChirp < 450) return;
    audio.lastChirp = now;
    var ctx = audio.ctx;
    var base = 300 + (voiceSeed % 420);
    [0, 0.11].forEach(function (delay, i) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = base * (i === 0 ? 1 : 1.26);
      var t0 = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(g); g.connect(audio.master);
      osc.start(t0); osc.stop(t0 + 0.1);
    });
  }

  // the singer's melody: slow pentatonic notes drawn from its genome
  var PENTATONIC = [0, 2, 4, 7, 9, 12];
  function songNote(voiceSeed, step) {
    if (!audio.ctx || audio.muted) return;
    var ctx = audio.ctx;
    var base = 220 * Math.pow(2, ((voiceSeed % 5) - 2) / 12);
    var semitone = PENTATONIC[(voiceSeed + step * 3) % PENTATONIC.length];
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = base * Math.pow(2, semitone / 12);
    var t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    osc.connect(g); g.connect(audio.master);
    osc.start(t0); osc.stop(t0 + 1.5);
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    try { localStorage.setItem('driftgarden.muted', audio.muted ? '1' : '0'); } catch (e) { /* fine */ }
    if (audio.muted && audio.ctx) {
      audio.ctx.suspend();
    } else if (audio.ctx) {
      audio.ctx.resume();
      updateWeatherAudio(lastWxKind || 'clear');
    } else {
      initAudio();
    }
    render();
  }

  /* ---------- the land, painted ---------- */

  /* Ten natures, ten palettes: what the low places are made of, what the
   * ground is, what colour the sky turns at noon and at midnight. */
  var REALM_PAINT = {
    meadow:     { deep: [35, 64, 94],   shallows: [46, 90, 117],  shore: [183, 162, 118], meadow: [74, 107, 58],   rock: [109, 106, 99],  peak: [143, 141, 136] },
    lakewild:   { deep: [30, 70, 105],  shallows: [42, 100, 130], shore: [180, 165, 125], meadow: [70, 110, 62],   rock: [105, 105, 100], peak: [138, 140, 138] },
    mistral:    { deep: [150, 170, 205], shallows: [208, 214, 228], shore: [172, 164, 150], meadow: [96, 120, 88], rock: [128, 124, 138], peak: [160, 158, 170] },
    ember:      { deep: [198, 84, 30],  shallows: [130, 62, 40],  shore: [92, 70, 62],    meadow: [88, 82, 78],    rock: [66, 58, 56],    peak: [104, 88, 84] },
    frostmere:  { deep: [38, 58, 84],   shallows: [120, 150, 168], shore: [176, 190, 198], meadow: [214, 224, 230], rock: [140, 150, 158], peak: [235, 240, 244] },
    fungal:     { deep: [18, 26, 40],   shallows: [46, 62, 80],   shore: [92, 82, 96],    meadow: [52, 84, 70],    rock: [58, 54, 66],    peak: [92, 86, 104] },
    saltflats:  { deep: [150, 180, 190], shallows: [160, 170, 150], shore: [212, 206, 188], meadow: [200, 192, 170], rock: [188, 178, 158], peak: [232, 228, 214] },
    duskmoor:   { deep: [22, 26, 34],   shallows: [46, 52, 48],   shore: [86, 74, 64],    meadow: [96, 74, 104],   rock: [74, 70, 78],    peak: [58, 56, 66] },
    coralshelf: { deep: [24, 84, 112],  shallows: [64, 150, 160], shore: [214, 132, 112], meadow: [46, 116, 86],   rock: [150, 110, 124], peak: [226, 150, 130] },
    glasswold:  { deep: [220, 150, 70], shallows: [180, 150, 120], shore: [190, 186, 196], meadow: [168, 180, 190], rock: [150, 140, 170], peak: [214, 214, 228] }
  };

  var REALM_SKY = {
    meadow:     { day: ['#7db4d8', '#cfe6d8', '#2e4630'], night: ['#0b1026', '#1b2333', '#141d16'] },
    lakewild:   { day: ['#74aed6', '#d2e8e2', '#2c4a34'], night: ['#0a1228', '#1a2740', '#12201a'] },
    mistral:    { day: ['#8fb8e8', '#e6dff0', '#3c5040'], night: ['#101a33', '#25304d', '#161e2c'] },
    ember:      { day: ['#4a3231', '#7a4a35', '#332420'], night: ['#1c0f10', '#331612', '#1f1210'] },
    frostmere:  { day: ['#a8c6de', '#e6eef2', '#6b7f8c'], night: ['#0c1626', '#14323b', '#101c22'] },
    fungal:     { day: ['#1c2226', '#232d2a', '#182420'], night: ['#0c1013', '#131a18', '#0e1512'] },
    saltflats:  { day: ['#b8cfe0', '#f2efe4', '#7d786a'], night: ['#101322', '#1f2438', '#161822'] },
    duskmoor:   { day: ['#4a4a78', '#c08a6a', '#2c2434'], night: ['#171530', '#2c2344', '#1a1626'] },
    coralshelf: { day: ['#1e6f86', '#2fa3ab', '#123c46'], night: ['#081e30', '#0e3546', '#0a2028'] },
    glasswold:  { day: ['#9fb6c9', '#e8d9ee', '#5a6470'], night: ['#0e1420', '#232945', '#141828'] }
  };

  function mixHex(a, b, t) {
    function ch(hex, i) { return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16); }
    function two(n) { return ('0' + Math.round(n).toString(16)).slice(-2); }
    return '#' + two(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t) +
      two(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * t) +
      two(ch(a, 2) + (ch(b, 2) - ch(a, 2)) * t);
  }

  function realmPaint() {
    return REALM_PAINT[W.realmOf(state.id).key] || REALM_PAINT.meadow;
  }

  function smoothstep(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  // The land's colour as a SMOOTH function of height — beaches melt into
  // meadow, meadow into rock, rock into peak — so no hard cell-edges show.
  function landColorAt(paint, h, wl) {
    var s = paint.shore, m = paint.meadow, rk = paint.rock, pk = paint.peak;
    if (h < wl + 0.07) return lerp3(s, m, smoothstep((h - wl) / 0.07));
    if (h < 0.66) return m.slice();
    if (h < 0.73) return lerp3(m, rk, smoothstep((h - 0.66) / 0.07));
    if (h < 0.82) return rk.slice();
    if (h < 0.9) return lerp3(rk, pk, smoothstep((h - 0.82) / 0.08));
    return pk.slice();
  }

  var terrainImageCache = {};

  function terrainDataURL(worldId) {
    if (terrainImageCache[worldId]) return terrainImageCache[worldId];
    var terrain = W.makeTerrain(worldId);
    var paint = REALM_PAINT[W.realmOf(worldId).key] || REALM_PAINT.meadow;
    var canvas = document.createElement('canvas');
    var CW = 1120, CH = 600;
    canvas.width = CW; canvas.height = CH;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(CW, CH);
    // Screen consistency: image spans y 470..1000, i.e. world y 0.55..~0.99.
    var ySpan = 530 / 1200;
    var baseSeed = W.hash32(worldId);

    // Smoothly interpolated height for LIGHT (kills the banding lines);
    // biome classification stays cell-based so the sim and the picture
    // never disagree about what a place is.
    function heightSmooth(wx, wy) {
      var gx = Math.max(0, Math.min(terrain.cols - 1.001, wx * terrain.cols - 0.5));
      var gy = Math.max(0, Math.min(terrain.rows - 1.001, (wy - 0.55) / 0.45 * terrain.rows - 0.5));
      var x0 = Math.floor(gx), y0 = Math.floor(gy);
      var fx = gx - x0, fy = gy - y0;
      var h = terrain.heights;
      var x1 = Math.min(terrain.cols - 1, x0 + 1), y1 = Math.min(terrain.rows - 1, y0 + 1);
      return h[y0][x0] * (1 - fx) * (1 - fy) + h[y0][x1] * fx * (1 - fy) +
             h[y1][x0] * (1 - fx) * fy + h[y1][x1] * fx * fy;
    }

    for (var py = 0; py < CH; py++) {
      var wy = 0.55 + (py / CH) * ySpan;
      for (var px = 0; px < CW; px++) {
        var wx = px / CW;
        var cell = heightSmooth(wx, wy);
        var wl = terrain.waterline;
        var col;

        if (cell < wl) {
          // water: deep melts up into the shallows, and darkens with depth
          col = lerp3(paint.deep, paint.shallows, smoothstep((cell - (wl - 0.14)) / 0.14));
          var depth = wl - cell;
          col[0] -= depth * 70; col[1] -= depth * 45; col[2] -= depth * 15;
        } else {
          // land: a smooth blend of the biome bands, lit by the smoothed slope
          col = landColorAt(paint, cell, wl);
          var north = heightSmooth(wx, Math.max(0.551, wy - 0.008));
          var shade = (cell - north) * 300 + (cell - 0.5) * 22;
          col[0] += shade; col[1] += shade; col[2] += shade;
        }

        // a soft line of foam right at the water's edge — the coast, unjagged
        var dEdge = cell < wl ? wl - cell : cell - wl;
        if (dEdge < 0.024) {
          var f = 1 - dEdge / 0.024; f *= f * 0.5;
          col[0] += (236 - col[0]) * f; col[1] += (241 - col[1]) * f; col[2] += (246 - col[2]) * f;
        }

        // a whisper of grain so the ground reads as ground, not plastic
        var n = (baseSeed ^ (px * 7919 + py * 104729)) >>> 0;
        var grain = (n % 9) - 4;
        var i = (py * CW + px) * 4;
        img.data[i] = Math.max(0, Math.min(255, col[0] + grain));
        img.data[i + 1] = Math.max(0, Math.min(255, col[1] + grain));
        img.data[i + 2] = Math.max(0, Math.min(255, col[2] + grain));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var url = canvas.toDataURL('image/png');
    terrainImageCache[worldId] = url;
    return url;
  }

  function skyColors() {
    var sky = REALM_SKY[W.realmOf(state.id).key] || REALM_SKY.meadow;
    var h = new Date(vnow()).getHours(); // follows the warp clock, so night cycles
    function slot(t, warm) {
      // between night and day, warmed toward the horizon fire at the edges
      return [
        mixHex(sky.night[0], sky.day[0], t),
        mixHex(mixHex(sky.night[1], sky.day[1], t), '#d99a6c', warm),
        mixHex(sky.night[2], sky.day[2], t)
      ];
    }
    if (h >= 21 || h < 5) return sky.night;
    if (h < 8) return slot(0.5, 0.35);   // dawn
    if (h < 17) return sky.day;
    if (h < 21) return slot(0.45, 0.45); // dusk
    return sky.day;
  }

  function render() {
    var sky = skyColors();
    var plants = Object.keys(state.plants).map(function (id) { return state.plants[id]; });
    plants.sort(function (a, b) { return a.y - b.y; });

    var svgParts = [];
    svgParts.push('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + sky[0] + '"/><stop offset="1" stop-color="' + sky[1] + '"/></linearGradient>' +
      '<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + sky[2] + '"/><stop offset="1" stop-color="#131a12"/></linearGradient></defs>');
    // backdrop extends far beyond the scene so a zoomed-out camera never
    // finds the void; the painted land sits in the middle of it
    svgParts.push('<rect x="-800" y="-800" width="2600" height="1320" fill="url(#sky)"/>');
    svgParts.push('<rect x="-800" y="470" width="2600" height="1400" fill="#131a12"/>');
    svgParts.push('<image x="0" y="470" width="1000" height="530" preserveAspectRatio="none" href="' + terrainDataURL(state.id) + '"/>');
    svgParts.push('<rect x="0" y="470" width="1000" height="530" fill="url(#ground)" opacity="0.35"/>');
    // horizon haze: the land breathes distance
    svgParts.push('<defs><linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + sky[1] + '" stop-opacity="0.34"/>' +
      '<stop offset="1" stop-color="' + sky[1] + '" stop-opacity="0"/></linearGradient></defs>');
    svgParts.push('<rect x="-800" y="470" width="2600" height="180" fill="url(#haze)" pointer-events="none"/>');

    // villages: where a hearth has gathered shelters and a people around it,
    // a cleared commons and a name on the map
    var villages = [];
    Object.keys(state.structures || {}).forEach(function (id) {
      var h = state.structures[id];
      if (h.type !== 'hearth') return;
      var vc = null;
      for (var ci = 0; ci < state.chronicle.length; ci++) {
        if (state.chronicle[ci].id === 'v' + h.id) { vc = state.chronicle[ci]; break; }
      }
      if (!vc) return;
      var m = /and the (.+?) live among/.exec(vc.text);
      villages.push({ x: h.x, y: h.y, name: m ? m[1] : 'a village' });
    });
    villages.forEach(function (v) {
      var vp = toScreen(v.x, v.y);
      svgParts.push('<ellipse class="village-commons" cx="' + vp.x.toFixed(1) + '" cy="' + (vp.y + 5).toFixed(1) + '" rx="60" ry="21"/>');
    });

    var hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      svgParts.push('<circle cx="840" cy="110" r="34" fill="#f4f1de" opacity="0.9"/>' +
        '<circle cx="826" cy="102" r="30" fill="' + sky[0] + '"/>');
    } else {
      svgParts.push('<circle cx="840" cy="110" r="40" fill="#ffd166" opacity="0.85"/>');
    }

    var structures = Object.keys(state.structures || {}).map(function (id) { return state.structures[id]; });
    structures.sort(function (a, b) { return a.y - b.y; });
    // fields are ground — drawn under the garden that grows in them
    structures.forEach(function (s) { if (s.type === 'field') svgParts.push(drawStructure(s)); });
    plants.forEach(function (p) { svgParts.push(drawPlant(p)); });
    structures.forEach(function (s) { if (s.type !== 'field') svgParts.push(drawStructure(s)); });
    villages.forEach(function (v) {
      var vp = toScreen(v.x, v.y);
      svgParts.push('<text class="village-name" x="' + vp.x.toFixed(1) + '" y="' + (vp.y - 30).toFixed(1) + '">' + escapeHtml(v.name) + '</text>');
    });
    if (beacon && vnow() < beacon.until) {
      var bpos = toScreen(beacon.x, beacon.y);
      svgParts.push('<g class="beckon" transform="translate(' + bpos.x.toFixed(1) + ' ' + bpos.y.toFixed(1) + ')">' +
        '<circle class="beckon-ripple" r="6"/><circle class="beckon-ripple r2" r="6"/></g>');
    }
    svgParts.push('<g id="kith-layer">' + drawAllKith() + '</g>');
    svgParts.push(drawPredator());

    // weather, painted over everything — and weather that CHANGES fades:
    // the old sky lingers a few seconds while the new one settles in
    function weatherLayersSvg(kind, cls) {
      var layerParts = [];
      if (kind === 'rain' || kind === 'storm') {
        var drops = [];
        var rainRng = W.mulberry32(W.hash32(state.id + ':raindrops'));
        var dropCount = kind === 'storm' ? 46 : 28;
        for (var d = 0; d < dropCount; d++) {
          var rx = rainRng() * 1000;
          drops.push('<line class="raindrop" x1="' + rx.toFixed(0) + '" y1="-40" x2="' + (rx - 8).toFixed(0) +
            '" y2="-12" style="animation-delay:-' + (rainRng() * 1.4).toFixed(2) + 's;animation-duration:' +
            (0.9 + rainRng() * 0.6).toFixed(2) + 's"/>');
        }
        layerParts.push('<g class="rain-layer ' + cls + '">' + drops.join('') + '</g>');
      }
      if (kind === 'mist') {
        layerParts.push('<g class="mist-layer ' + cls + '">' +
          '<ellipse class="mist m1" cx="300" cy="600" rx="340" ry="70"/>' +
          '<ellipse class="mist m2" cx="700" cy="780" rx="420" ry="90"/>' +
          '<ellipse class="mist m3" cx="480" cy="920" rx="380" ry="80"/></g>');
      }
      if (kind === 'storm') {
        layerParts.push('<g class="' + cls + '" pointer-events="none">' +
          '<rect x="-800" y="-800" width="2600" height="2600" fill="#0a0f1e" opacity="0.28"/>' +
          '<rect class="lightning" x="-800" y="-800" width="2600" height="2600" fill="#eef4ff"/></g>');
      }
      return layerParts.join('');
    }

    var wx = W.weatherAt(state.id, vnow());
    if (wx.kind !== lastWxKind) {
      if (lastWxKind !== null) wxPrev = { kind: lastWxKind, until: Date.now() + 5000 };
      lastWxKind = wx.kind;
      updateWeatherAudio(wx.kind);
    }
    // the season's breath over everything, very quiet
    var SEASON_TINT = { spring: ['#7ce38b', 0.04], autumn: ['#d99a6c', 0.055], winter: ['#dfe9f2', 0.085] };
    var tint = SEASON_TINT[wx.season];
    if (tint) {
      svgParts.push('<rect x="-800" y="-800" width="2600" height="2600" fill="' + tint[0] + '" opacity="' + tint[1] + '" pointer-events="none"/>');
    }
    svgParts.push(weatherLayersSvg(wx.kind, 'wx-enter'));
    if (wxPrev && wxPrev.kind && Date.now() < wxPrev.until) {
      svgParts.push(weatherLayersSvg(wxPrev.kind, 'wx-exit'));
    }
    var disNow = W.disasterAt(state.id, vnow());
    svgParts.push(drawDisaster(disNow));
    // a soft vignette frames the land and gives it depth
    svgParts.push('<defs><radialGradient id="vign" cx="0.5" cy="0.54" r="0.72">' +
      '<stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.26"/></radialGradient></defs>' +
      '<rect x="0" y="470" width="1000" height="530" fill="url(#vign)" pointer-events="none"/>');
    var disClass = disNow ? ' cata-active cata-' + disNow.visual + ' cata-' + disNow.phase : '';

    stage.innerHTML =
      '<svg id="world" class="wx-' + wx.kind + ' realm-' + W.realmOf(state.id).key + disClass + '" viewBox="' + camViewBox() + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The garden">' +
      svgParts.join('') + '</svg>' +
      '<div id="cam-controls">' +
      '<button class="btn small" data-cam="in" title="Zoom in">+</button>' +
      '<button class="btn small" data-cam="out" title="Zoom out">−</button>' +
      '<button class="btn small" data-cam="reset" title="See the whole land">⌖</button>' +
      '</div>' +
      topbarHTML() +
      panelHTML() +
      modalHTML() +
      '<div id="toast"></div>';

    wireEvents();
  }

  /* ---------- plants (unchanged visual language) ---------- */

  function drawPlant(p) {
    var g = W.modernGenome(p.genome);
    var pos = toScreen(p.x, p.y);
    var stage01 = Math.max(0.1, p.growth);
    var bloom = p.growth > 0.55 ? Math.min(1, (p.growth - 0.55) / 0.45) : 0;
    var s = g.size * (0.85 + (p.y - 0.55) * 0.9); // nearer = larger, but small overall
    var main = 'hsl(' + g.hue + ', 62%, 58%)';
    var deep = 'hsl(' + ((g.hue + 40) % 360) + ', 50%, 40%)';
    var pale = 'hsl(' + g.hue + ', 65%, 74%)';
    var stem = 'hsl(' + ((g.hue + 100) % 360) + ', 30%, 34%)';
    var sel = selected && selected.type === 'plant' && selected.id === p.id;
    var rng = W.mulberry32(W.hash32(p.id));
    var parts = [];

    function glowHalo(x, y, r) {
      return g.glow ? '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 2.4).toFixed(1) + '" fill="' + pale + '" opacity="' + (0.18 + bloom * 0.12) + '"/>' : '';
    }

    if (g.form === 'stalk') {
      var h = 42 * s * g.aspect * stage01;
      parts.push('<path d="M0 0 Q ' + (4 * s) + ' ' + (-h * 0.5) + ' 0 ' + (-h) + '" stroke="' + stem + '" stroke-width="' + (1.5 + s) + '" fill="none" stroke-linecap="round"/>');
      for (var i = 0; i < g.detail; i++) {
        var fy = -h * (0.3 + i / g.detail * 0.5);
        var side = i % 2 === 0 ? 1 : -1;
        var len = 7 * s * stage01 * (0.8 + rng() * 0.4);
        parts.push('<path d="M0 ' + fy.toFixed(1) + ' q ' + (side * len) + ' -2 ' + (side * len * 1.5) + ' 2" stroke="' + stem + '" stroke-width="' + s.toFixed(1) + '" fill="none"/>');
      }
      if (bloom > 0) {
        parts.push(glowHalo(0, -h, 4 * s));
        for (var pi = 0; pi < 4; pi++) {
          var pa = pi * Math.PI / 2 + 0.4;
          parts.push('<ellipse cx="' + (Math.cos(pa) * 3.4 * s * bloom).toFixed(1) + '" cy="' + (-h + Math.sin(pa) * 3.4 * s * bloom).toFixed(1) + '" rx="' + (3 * s * bloom).toFixed(1) + '" ry="' + (1.8 * s * bloom).toFixed(1) + '" fill="' + main + '"/>');
        }
        parts.push('<circle cx="0" cy="' + -h + '" r="' + (2 * s * bloom).toFixed(1) + '" fill="' + pale + '"/>');
      } else {
        parts.push('<circle cx="0" cy="' + -h + '" r="' + (1.6 * s).toFixed(1) + '" fill="' + main + '"/>');
      }
    } else if (g.form === 'rosette') {
      var leaves = g.detail + 3;
      var lr = 11 * s * g.aspect * stage01;
      for (var li = 0; li < leaves; li++) {
        var la = (li / leaves) * 360;
        parts.push('<ellipse cx="0" cy="' + (-lr * 0.42).toFixed(1) + '" rx="' + (2.6 * s).toFixed(1) + '" ry="' + (lr * 0.5).toFixed(1) + '" fill="' + (li % 2 ? main : deep) + '" opacity="0.9" transform="rotate(' + la.toFixed(0) + ')"/>');
      }
      if (bloom > 0) {
        parts.push(glowHalo(0, 0, 3.5 * s));
        parts.push('<circle cx="0" cy="0" r="' + (3.4 * s * bloom).toFixed(1) + '" fill="' + pale + '"/><circle cx="0" cy="0" r="' + (1.6 * s * bloom).toFixed(1) + '" fill="' + deep + '"/>');
      }
    } else if (g.form === 'puff') {
      var ph = 20 * s * g.aspect * stage01;
      parts.push('<line x1="0" y1="0" x2="0" y2="' + -ph + '" stroke="' + stem + '" stroke-width="' + (1 + s) + '"/>');
      var pr = 6.5 * s * (0.3 + stage01 * 0.7);
      parts.push(glowHalo(0, -ph, pr));
      parts.push('<circle cx="0" cy="' + -ph + '" r="' + pr.toFixed(1) + '" fill="' + pale + '" opacity="0.75"/>');
      for (var fi = 0; fi < g.detail + 3; fi++) {
        var fa = rng() * Math.PI * 2, fr = rng() * pr;
        parts.push('<circle cx="' + (Math.cos(fa) * fr).toFixed(1) + '" cy="' + (-ph + Math.sin(fa) * fr).toFixed(1) + '" r="' + (1.1 * s).toFixed(1) + '" fill="' + main + '" opacity="0.85"/>');
      }
    } else if (g.form === 'spire') {
      var sh = 40 * s * g.aspect * stage01;
      var zig = 'M0 0';
      var steps = g.detail + 1;
      for (var zi = 1; zi <= steps; zi++) {
        zig += ' L' + ((zi % 2 ? 1 : -1) * 3.2 * s).toFixed(1) + ' ' + (-sh * zi / steps).toFixed(1);
      }
      parts.push(glowHalo(0, -sh * 0.6, 5 * s));
      parts.push('<path d="' + zig + '" stroke="' + main + '" stroke-width="' + (2.2 * s).toFixed(1) + '" fill="none" stroke-linejoin="round"/>');
      for (var ci = 1; ci < steps; ci++) {
        parts.push('<path d="M' + ((ci % 2 ? 1 : -1) * 3.2 * s).toFixed(1) + ' ' + (-sh * ci / steps).toFixed(1) + ' l ' + ((ci % 2 ? 1 : -1) * 4.5 * s).toFixed(1) + ' ' + (-2 * s).toFixed(1) + ' l ' + ((ci % 2 ? -1 : 1) * 2 * s).toFixed(1) + ' ' + (3.4 * s).toFixed(1) + ' Z" fill="' + (ci % 2 ? pale : deep) + '" opacity="0.9"/>');
      }
    } else if (g.form === 'tendril') {
      var th = 30 * s * g.aspect * stage01;
      parts.push('<path d="M0 0 C ' + (6 * s) + ' ' + (-th * 0.3) + ' ' + (-7 * s) + ' ' + (-th * 0.55) + ' ' + (2 * s) + ' ' + (-th * 0.8) + ' S ' + (7 * s) + ' ' + -th + ' ' + (1 * s) + ' ' + -th + '" stroke="' + stem + '" stroke-width="' + (1.2 + s).toFixed(1) + '" fill="none" stroke-linecap="round"/>');
      for (var di = 0; di < g.detail; di++) {
        var dfy = -th * (0.2 + di / g.detail * 0.75);
        parts.push('<circle cx="' + ((di % 2 ? 3.5 : -3.5) * s).toFixed(1) + '" cy="' + dfy.toFixed(1) + '" r="' + (1.5 * s).toFixed(1) + '" fill="' + main + '"/>');
      }
      if (bloom > 0) {
        parts.push(glowHalo(1 * s, -th, 3 * s));
        parts.push('<circle cx="' + (1 * s).toFixed(1) + '" cy="' + -th + '" r="' + (2.6 * s * bloom).toFixed(1) + '" fill="' + pale + '"/>');
      }
    } else { // pod
      var pods = Math.max(2, Math.round(g.detail / 2));
      for (var poi = 0; poi < pods; poi++) {
        var px = (poi - (pods - 1) / 2) * 6 * s;
        var pph = (12 + poi * 3) * s * g.aspect * stage01;
        parts.push('<line x1="' + px.toFixed(1) + '" y1="0" x2="' + px.toFixed(1) + '" y2="' + -pph + '" stroke="' + stem + '" stroke-width="' + s.toFixed(1) + '"/>');
        parts.push(glowHalo(px, -pph, 3 * s));
        parts.push('<ellipse cx="' + px.toFixed(1) + '" cy="' + -pph + '" rx="' + (3.2 * s).toFixed(1) + '" ry="' + (4.5 * s * (0.4 + stage01 * 0.6)).toFixed(1) + '" fill="' + (poi % 2 ? main : deep) + '"/>');
        if (bloom > 0.4) parts.push('<circle cx="' + px.toFixed(1) + '" cy="' + -pph + '" r="' + (1.2 * s).toFixed(1) + '" fill="' + pale + '"/>');
      }
    }

    var label = p.name ? escapeHtml(p.name) : '';
    var labelSvg = label ? '<text class="plant-label" x="0" y="14">' + label + '</text>' : '';
    var halo = sel ? '<circle cx="0" cy="0" r="11" fill="none" stroke="#ffd166" stroke-width="2" opacity="0.9"/>' : '';

    return '<g class="plant-group' + (sel ? ' selected' : '') + '" data-plant="' + p.id + '" transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')">' +
      '<ellipse cx="0" cy="1.5" rx="' + (9 * s).toFixed(1) + '" ry="2.6" fill="rgba(0,0,0,0.22)"/>' + halo +
      '<g class="sway" style="animation-delay:-' + (W.hash32(p.id) % 6000) + 'ms">' + parts.join('') + '</g>' +
      labelSvg + '</g>';
  }

  /* ---------- structures: what society raises ---------- */

  function drawStructure(s) {
    var pos = toScreen(s.x, s.y);
    var scale = 0.85 + (s.y - 0.55) * 0.9;
    var parts = [];
    if (s.type === 'field') {
      // a tilled plot: dark broken earth with furrow rows
      var rows = [];
      for (var fr = 0; fr < 5; fr++) {
        var fy = -6 + fr * 3;
        rows.push('<line x1="-26" y1="' + fy + '" x2="26" y2="' + fy + '" stroke="#6a4a2c" stroke-width="1.4" opacity="0.75"/>');
      }
      return '<g class="structure field" transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) +
        ') scale(' + scale.toFixed(2) + ')">' +
        '<ellipse cx="0" cy="0" rx="30" ry="12" fill="#5a3c22" opacity="0.72"/>' +
        '<ellipse cx="0" cy="0" rx="30" ry="12" fill="none" stroke="#3d2814" stroke-width="1.5"/>' +
        rows.join('') + '</g>';
    }
    if (s.type === 'leanto') {
      // two leaning walls, a dark doorway, a straw ridge
      parts.push('<ellipse cx="0" cy="1.5" rx="11" ry="3" fill="rgba(0,0,0,0.22)"/>');
      parts.push('<path d="M-10 0 L0 -13 L10 0 Z" fill="#6b5941"/>');
      parts.push('<path d="M-10 0 L0 -13 L-2.5 0 Z" fill="#57482f"/>');
      parts.push('<path d="M-3.5 0 L0 -6 L3.5 0 Z" fill="#241d12"/>');
      parts.push('<path d="M-10.5 0.5 L0 -13.6 L10.5 0.5" stroke="#8a7350" stroke-width="1.4" fill="none" stroke-linecap="round"/>');
    } else {
      // a ring of stones and a live ember
      parts.push('<ellipse cx="0" cy="1" rx="9" ry="3" fill="rgba(0,0,0,0.2)"/>');
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        parts.push('<ellipse cx="' + (Math.cos(a) * 6).toFixed(1) + '" cy="' + (Math.sin(a) * 2.6 - 1).toFixed(1) +
          '" rx="2.1" ry="1.6" fill="' + (i % 2 ? '#6e6a62' : '#5a564e') + '"/>');
      }
      parts.push('<circle class="ember-glow" cx="0" cy="-1.4" r="2.4" fill="#e8873a"/>');
      parts.push('<circle cx="0" cy="-1.6" r="1.1" fill="#ffd166"/>');
    }
    // watch it rise: a build grows from the ground over its raising, faint and
    // low at first, with a scatter of stems or stones at its foot until it stands
    var raised = W.structRaised(s, vnow());
    var body;
    if (raised < 1) {
      var grow = (0.12 + 0.88 * raised).toFixed(3);
      body = '<ellipse cx="0" cy="1.6" rx="' + (11 - 6 * raised).toFixed(1) + '" ry="1.7" fill="rgba(120,108,86,0.4)"/>' +
        '<g transform="scale(1 ' + grow + ')" opacity="' + (0.4 + 0.6 * raised).toFixed(2) + '">' + parts.join('') + '</g>';
    } else {
      body = parts.join('');
    }
    return '<g class="structure' + (raised < 1 ? ' rising' : '') + '" transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) +
      ') scale(' + scale.toFixed(2) + ')">' + body + '</g>';
  }

  /* ---------- predators: the beast at the edge ---------- */

  // A ring of glowing eyes — how many, from the beast's own body.
  function monsterEyes(count, cx, cy, eyeColor, glow) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var ex = cx + (i - (count - 1) / 2) * 3.2;
      out.push('<circle cx="' + ex.toFixed(1) + '" cy="' + cy + '" r="1.7" fill="' + eyeColor + '"' +
        (glow ? ' class="pred-eye"' : '') + '/>');
    }
    return out.join('');
  }
  function monsterTeeth(count, x0, x1, y) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = x0 + (x1 - x0) * (i / (count - 1 || 1));
      out.push('<path d="M' + t.toFixed(1) + ' ' + y + ' l 1.1 3 l 1.1 -3 Z" fill="#f2efe6"/>');
    }
    return out.join('');
  }

  function monsterParts(look, g, tint) {
    var dark = '#0c0e13';
    var eye = g.glow ? '#9be7ff' : '#ff4b2b';
    var spikes = [];
    for (var s = 0; s < g.spikes; s++) {
      var sx = -8 + s * (16 / Math.max(1, g.spikes));
      spikes.push('<path d="M' + sx.toFixed(1) + ' -9 l 2 -5 l 2 5 Z" fill="' + dark + '"/>');
    }
    if (look === 'serpent') {
      return '<ellipse cx="0" cy="1.5" rx="15" ry="2.6" fill="rgba(0,0,0,0.28)"/>' +
        '<path d="M-15 2 Q -18 -14 -6 -16 Q 6 -18 8 -8 Q 9 -1 3 -2 Q -3 -3 -2 -9" fill="none" stroke="' + tint + '" stroke-width="' + (5 * g.elong).toFixed(1) + '" stroke-linecap="round"/>' +
        '<path d="M4 -18 q 10 -2 13 6 q 1 5 -5 6 q -8 1 -9 -6 z" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' +
        monsterTeeth(g.teeth, 8, 16, -8) +
        monsterEyes(g.eyes, 12, -15, eye, g.glow) +
        '<path d="M-6 -15 l -5 -6 l 6 2 z" fill="' + tint + '"/>'; // a fin
    }
    if (look === 'raptor') {
      return '<ellipse cx="0" cy="1.5" rx="10" ry="2.4" fill="rgba(0,0,0,0.28)"/>' +
        '<path d="M0 -10 L-22 -22 L-6 -12 Z" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' +
        '<path d="M0 -10 L22 -22 L6 -12 Z" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' +
        '<ellipse cx="0" cy="-9" rx="5.5" ry="7" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' +
        '<path d="M0 -13 l 7 -3 l -7 -1 z" fill="#e8c06a" stroke="' + dark + '" stroke-width="0.6"/>' + // hooked beak
        monsterEyes(g.eyes, 0, -12, eye, g.glow) +
        '<path d="M-3 -2 l -1 4 M3 -2 l 1 4" stroke="' + dark + '" stroke-width="1.4"/>'; // talons
    }
    if (look === 'worm') {
      var segs = [];
      for (var i = 0; i < 4; i++) segs.push('<ellipse cx="0" cy="' + (-4 - i * 5) + '" rx="' + (7 - i) + '" ry="4" fill="' + tint + '" stroke="' + dark + '" stroke-width="0.8"/>');
      return '<ellipse cx="0" cy="1.5" rx="9" ry="2.6" fill="rgba(0,0,0,0.3)"/>' +
        '<path d="M-9 2 l 4 -3 l -3 3 l 4 -2 l -2 2 z" fill="' + dark + '"/>' + // broken crust
        segs.join('') +
        '<circle cx="0" cy="-25" r="6" fill="' + dark + '"/>' +
        monsterTeeth(g.teeth, -5, 5, -28) +
        monsterEyes(g.eyes, 0, -26, eye, g.glow);
    }
    if (look === 'shade') {
      return '<ellipse cx="0" cy="1.5" rx="13" ry="3" fill="rgba(0,0,0,0.3)"/>' +
        '<ellipse cx="0" cy="-8" rx="14" ry="11" fill="' + tint + '" opacity="0.5"/>' +
        '<ellipse cx="0" cy="-9" rx="10" ry="9" fill="' + dark + '" opacity="0.8"/>' +
        '<path d="M-10 0 q -4 6 -1 10 M9 0 q 4 6 1 10 M0 2 q 0 8 0 12" stroke="' + tint + '" stroke-width="1.6" fill="none" opacity="0.7"/>' +
        monsterEyes(Math.max(2, g.eyes), 0, -11, eye, true);
    }
    // prowler (and pack uses this thrice)
    var body = '<ellipse cx="0" cy="1.5" rx="12" ry="2.6" fill="rgba(0,0,0,0.28)"/>' +
      '<path d="M-11 -3 q 3 -7 11 -6 q 8 1 10 6 q -2 4 -10 4 q -9 0 -11 -4 z" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' +
      spikes.join('') +
      '<path d="M8 -4 q 8 -1 9 4 q -1 4 -6 3 q -5 -1 -3 -7 z" fill="' + tint + '" stroke="' + dark + '" stroke-width="1"/>' + // head
      monsterTeeth(g.teeth, 9, 16, 1) +
      monsterEyes(g.eyes, 13, -3, eye, g.glow) +
      '<path d="M-9 1 l -1 5 M-4 2 l 0 5 M4 2 l 0 5 M9 1 l 1 5" stroke="' + dark + '" stroke-width="1.6"/>' + // legs
      '<path d="M-11 -2 q -6 -2 -8 2" stroke="' + tint + '" stroke-width="2" fill="none"/>'; // tail
    return body;
  }

  function drawPredator() {
    var pred = W.predatorAt(state, vnow());
    if (!pred) return '';
    var v = state.kith[pred.victimId];
    var vx = v ? v.x : 0.5, vy = v ? v.y : 0.72;
    var now = vnow();
    var g = pred.genome;
    var px, py = vy, alpha = 1;
    if (pred.phase === 'stalking') {
      var span = Math.max(1, pred.killAt - pred.start);
      var prog = Math.max(0, Math.min(1, (now - pred.start) / span));
      var fromX = vx < 0.5 ? 0.0 : 1.0;
      px = fromX + (vx - fromX) * (0.15 + 0.85 * prog); // it creeps in and closes on the prey
    } else {
      var span2 = Math.max(1, pred.end - pred.killAt);
      var prog2 = Math.max(0, Math.min(1, (now - pred.killAt) / span2));
      var edgeX = vx < 0.5 ? 0.0 : 1.0;
      px = vx + (edgeX - vx) * prog2; // after the strike it withdraws, and fades
      alpha = 1 - 0.7 * prog2;
    }
    var pos = toScreen(px, py);
    var facing = (vx - px) >= 0 ? 1 : -1;
    var scale = (0.85 + (py - 0.55) * 0.9) * g.size;
    var parts = monsterParts(pred.look, g, pred.tint);
    return '<g class="predator phase-' + pred.phase + '" opacity="' + alpha.toFixed(2) + '" ' +
      'transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')">' +
      '<ellipse class="pred-aura" cx="0" cy="-6" rx="' + (26 * g.size).toFixed(0) + '" ry="' + (16 * g.size).toFixed(0) + '" fill="' + pred.tint + '" opacity="0.14"/>' +
      '<g transform="scale(' + (scale * facing).toFixed(2) + ' ' + scale.toFixed(2) + ')">' + parts + '</g></g>';
  }

  /* ---------- catastrophe: the world turned antagonist ---------- */

  function drawDisaster(dis) {
    if (!dis) return '';
    var strike = dis.phase === 'strike';
    var v = dis.visual;
    var parts = [];
    if (strike) parts.push('<rect x="-800" y="-800" width="2600" height="2600" fill="#100a06" opacity="0.22" pointer-events="none"/>');
    if (v === 'wave') {
      var lvl = strike ? 640 : 900; // the water climbs at the strike
      parts.push('<g class="cata-wave ' + (strike ? 'is-strike' : 'is-warn') + '" pointer-events="none">' +
        '<rect x="-800" y="' + lvl + '" width="2600" height="1400" fill="#2a6b8f" opacity="' + (strike ? 0.42 : 0.15) + '"/>' +
        '<path class="cata-crest" d="M-800 ' + lvl + ' q 300 -55 600 0 t 600 0 t 600 0 t 600 0 t 600 0" fill="none" stroke="#cdeaf6" stroke-width="6" opacity="0.7"/></g>');
    } else if (v === 'fire') {
      var flames = [];
      var frng = W.mulberry32(W.hash32(dis.id + ':fire'));
      for (var i = 0; i < 24; i++) {
        var fx = frng() * 1000;
        flames.push('<path class="cata-flame" style="animation-delay:-' + (frng() * 1.2).toFixed(2) + 's" d="M' + fx.toFixed(0) +
          ' 1010 q -9 -46 0 -78 q 9 32 0 78 Z" fill="#ff7a1a"/>');
      }
      parts.push('<g class="cata-fire ' + (strike ? 'is-strike' : 'is-warn') + '" pointer-events="none">' +
        '<rect x="-800" y="-800" width="2600" height="1500" fill="#3a1505" opacity="' + (strike ? 0.2 : 0.06) + '"/>' +
        '<rect x="-800" y="840" width="2600" height="500" fill="#c23a10" opacity="' + (strike ? 0.4 : 0.13) + '"/>' + flames.join('') + '</g>');
    } else if (v === 'ash') {
      var ash = [];
      var arng = W.mulberry32(W.hash32(dis.id + ':ash'));
      for (var a = 0; a < 44; a++) {
        ash.push('<circle class="cata-ash" style="animation-delay:-' + (arng() * 3).toFixed(2) + 's" cx="' + (arng() * 1000).toFixed(0) +
          '" cy="' + (arng() * 1000).toFixed(0) + '" r="' + (1 + arng() * 2).toFixed(1) + '" fill="#8a8078"/>');
      }
      parts.push('<g class="cata-ashfall ' + (strike ? 'is-strike' : 'is-warn') + '" pointer-events="none">' +
        '<rect x="-800" y="-800" width="2600" height="2600" fill="#2a241f" opacity="' + (strike ? 0.36 : 0.14) + '"/>' + ash.join('') + '</g>');
    } else if (v === 'snow') {
      var sn = [];
      var srng = W.mulberry32(W.hash32(dis.id + ':snow'));
      for (var s2 = 0; s2 < 52; s2++) {
        sn.push('<circle class="cata-snowfall" style="animation-delay:-' + (srng() * 2).toFixed(2) + 's" cx="' + (srng() * 1000).toFixed(0) +
          '" cy="' + (srng() * 1000).toFixed(0) + '" r="' + (1.5 + srng() * 2).toFixed(1) + '" fill="#eef4fb"/>');
      }
      parts.push('<g class="cata-snow ' + (strike ? 'is-strike' : 'is-warn') + '" pointer-events="none">' +
        (strike ? '<rect x="-800" y="-800" width="2600" height="1400" fill="#dfe9f2" opacity="0.32"/>' : '') + sn.join('') + '</g>');
    } else if (v === 'shake' && strike) {
      parts.push('<g class="cata-quake" pointer-events="none">' +
        '<path d="M120 980 l 60 -34 l 40 22 l 80 -26 l 50 18" stroke="#0c0a08" stroke-width="4" fill="none" opacity="0.5"/>' +
        '<path d="M560 998 l 50 -22 l 70 16 l 40 -20 l 60 14" stroke="#0c0a08" stroke-width="4" fill="none" opacity="0.5"/></g>');
    }
    return parts.join('');
  }

  /* ---------- kith ---------- */

  function drawAllKith() {
    var now = vnow();
    return W.presentKith(state) // the away are off the map until they return
      .sort(function (a, b) { return a.y - b.y; })
      .map(function (k) { return drawKith(k, now); })
      .join('');
  }

  function drawKith(k, now) {
    var g = W.modernKithGenome(k.genome);
    var pos = toScreen(k.x, k.y);
    var stage = W.kithStage(k, now);
    var scale = g.size * (stage === 'young' ? 0.65 : 1) * (0.85 + (k.y - 0.55) * 0.9);
    var sat = stage === 'elder' ? 30 : 60;
    var body = 'hsl(' + g.hue + ', ' + sat + '%, 58%)';
    var pale = 'hsl(' + g.hue + ', ' + sat + '%, 74%)';
    var deep = 'hsl(' + g.hue + ', ' + Math.max(25, sat - 10) + '%, 42%)';
    var sel = selected && selected.type === 'kith' && selected.id === k.id;
    var emissary = state.emissary === k.id;
    var rng = W.mulberry32(W.hash32(k.id + ':body'));
    // off land is only SWIMMING where the realm's law says so: walkers
    // stride the Frostmere ice and the Coralshelf seabed upright
    var offLand = !W.isLandAt(W.makeTerrain(state.id), k.x, k.y);
    var realmPass = (W.REALMS[W.realmOf(state.id).key] || {}).pass || 'swim';
    var inWater = offLand && (realmPass === 'swim' || (realmPass === 'all' && W.isSwimmer(k)));
    var parts = [];

    /* torso geometry by form: 0 round, 1 tall, 2 long, 3 pear */
    var rx = [8.5, 6.5, 11, 7.5][g.form] || 8.5;
    var ry = [9, 11, 6.5, 8][g.form] || 9;
    var cy = -ry + 2 + (g.limbs === 0 ? 2 : 0); // limbless bodies sit low
    var top = cy - ry - (g.form === 3 ? 5 : 0);  // pears carry a head-bump

    /* tail first (behind the body), at the back */
    if (g.tail === 1) {
      parts.push('<circle cx="' + (-rx - 1.5) + '" cy="' + (cy + 2) + '" r="2.6" fill="' + body + '"/>');
    } else if (g.tail === 2) {
      parts.push('<path d="M' + (-rx + 1) + ' ' + (cy + 2) + ' q -7 -1 -6 -7 q 0.8 -4 4 -3.4" stroke="' + body + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
    } else if (g.tail === 3) {
      for (var t = 0; t < 3; t++) {
        var ty = cy - 1 + (t - 1) * 3.4;
        parts.push('<ellipse cx="' + (-rx - 4) + '" cy="' + ty + '" rx="6" ry="1.9" fill="' + (t === 1 ? body : pale) + '" transform="rotate(' + ((t - 1) * 24) + ' ' + (-rx - 4) + ' ' + ty + ')"/>');
      }
    } else if (g.tail === 4) {
      parts.push('<path d="M' + (-rx + 1) + ' ' + (cy + 1) + ' l -8.5 -3" stroke="' + body + '" stroke-width="2.4" stroke-linecap="round"/>' +
        '<circle cx="' + (-rx - 7.8) + '" cy="' + (cy - 2.2) + '" r="1.4" fill="' + deep + '"/>');
    }

    /* second segment: a rear hump */
    if (g.segs === 2) {
      parts.push('<ellipse cx="' + (-rx * 0.62) + '" cy="' + (cy + 2) + '" rx="' + (rx * 0.72) + '" ry="' + (ry * 0.74) + '" fill="' + deep + '"/>');
    }

    /* legs & feet (hidden while swimming) */
    if (!inWater) {
      if (g.limbs === 1) {
        parts.push('<ellipse cx="-3.5" cy="1" rx="2.2" ry="1.6" fill="' + body + '"/>' +
          '<ellipse cx="3.5" cy="1" rx="2.2" ry="1.6" fill="' + body + '"/>');
      } else if (g.limbs === 2) {
        [-6, -2.2, 2.2, 6].forEach(function (fx) {
          parts.push('<ellipse cx="' + fx + '" cy="1" rx="1.8" ry="1.5" fill="' + body + '"/>');
        });
      }
    }

    /* the torso itself (pears get a head-bump above) */
    parts.push('<ellipse cx="0" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + body + '"/>');
    if (g.form === 3) {
      parts.push('<ellipse cx="' + (rx * 0.18) + '" cy="' + (cy - ry * 0.9) + '" rx="' + (rx * 0.68) + '" ry="' + (ry * 0.6) + '" fill="' + body + '"/>');
    }

    /* coat pattern */
    if (g.pattern === 1) {
      parts.push('<ellipse cx="0" cy="' + (cy + ry * 0.28) + '" rx="' + (rx * 0.58) + '" ry="' + (ry * 0.56) + '" fill="' + pale + '"/>');
    } else if (g.pattern === 2) {
      for (var s = 0; s < 4; s++) {
        parts.push('<circle cx="' + ((rng() - 0.5) * rx * 1.2).toFixed(1) + '" cy="' + (cy + (rng() - 0.5) * ry * 1.1).toFixed(1) + '" r="' + (1.2 + rng()).toFixed(1) + '" fill="' + deep + '" opacity="0.8"/>');
      }
    } else if (g.pattern === 3) {
      for (var st = 0; st < 3; st++) {
        var sx = -rx * 0.5 + st * rx * 0.5;
        parts.push('<path d="M' + sx + ' ' + (cy - ry * 0.8) + ' q 3 ' + (ry * 0.8) + ' 0 ' + (ry * 1.6) + '" stroke="' + deep + '" stroke-width="1.8" fill="none" opacity="0.75"/>');
      }
    } else if (g.pattern === 4) {
      parts.push('<ellipse cx="' + (rx * 0.32) + '" cy="' + (cy - ry * 0.3) + '" rx="' + (rx * 0.52) + '" ry="' + (ry * 0.42) + '" fill="' + pale + '" opacity="0.9"/>');
    }

    /* fins: a swimmer's silhouette */
    if (g.fins > 0) {
      parts.push('<ellipse cx="' + (-rx * 0.15) + '" cy="' + (top + 1) + '" rx="2" ry="4.6" fill="' + deep + '" transform="rotate(-14 ' + (-rx * 0.15) + ' ' + (top + 1) + ')"/>');
      parts.push('<ellipse cx="' + (rx * 0.55) + '" cy="' + (cy + ry * 0.5) + '" rx="4.2" ry="1.8" fill="' + deep + '" transform="rotate(24 ' + (rx * 0.55) + ' ' + (cy + ry * 0.5) + ')"/>');
    }

    /* crest / ears on the crown */
    if (g.crest === 1) {
      for (var c = 0; c < 3; c++) {
        var cx2 = -4 + c * 4;
        parts.push('<path d="M' + cx2 + ' ' + (top + 2) + ' l 1.6 -4.6 l 1.6 4.4 Z" fill="' + deep + '"/>');
      }
    } else if (g.crest === 2) {
      parts.push('<path d="M-6 ' + (top + 2.5) + ' Q 0 ' + (top - 6.5) + ' 6 ' + (top + 2.5) + '" fill="' + pale + '" stroke="' + deep + '" stroke-width="0.8"/>');
    } else if (g.crest === 3) {
      for (var f = 0; f < 5; f++) {
        var fx2 = -6 + f * 3;
        var fh = 3.5 + (2 - Math.abs(f - 2)) * 1.6;
        parts.push('<path d="M' + fx2 + ' ' + (top + 2) + ' l 1.2 -' + fh + ' l 1.2 ' + fh + ' Z" fill="' + (f % 2 ? pale : deep) + '"/>');
      }
    }
    if (g.ears === 1) {
      parts.push('<circle cx="-5" cy="' + (top + 0.5) + '" r="2.8" fill="' + body + '"/><circle cx="5" cy="' + (top + 0.5) + '" r="2.8" fill="' + body + '"/>');
    } else if (g.ears === 2) {
      parts.push('<ellipse cx="-4.5" cy="' + (top - 3) + '" rx="2.2" ry="5.6" fill="' + body + '"/><ellipse cx="4.5" cy="' + (top - 3) + '" rx="2.2" ry="5.6" fill="' + body + '"/>');
    }

    /* face: eyes across the brow, then the snout */
    var eyeY = (cy - ry * 0.28).toFixed(1);
    var eyeXs = g.eyes === 1 ? [0] : g.eyes === 2 ? [-3, 3] : g.eyes === 3 ? [-4, 0, 4] : [-4.5, -1.5, 1.5, 4.5];
    eyeXs.forEach(function (ex) {
      if (k.act === 'rest' || k.act === 'sleep') {
        parts.push('<path d="M' + (ex - 1.6) + ' ' + eyeY + ' q 1.6 1.5 3.2 0" stroke="#222" stroke-width="1" fill="none"/>');
      } else {
        parts.push('<circle cx="' + ex + '" cy="' + eyeY + '" r="1.8" fill="#fff"/>' +
          '<circle cx="' + (ex + 0.5) + '" cy="' + eyeY + '" r="1" fill="#222"/>');
      }
    });
    var eyeYn = parseFloat(eyeY);
    if (g.snout === 1) {
      parts.push('<path d="M' + (rx - 2) + ' ' + (eyeYn + 3.2) + ' l 5.5 1.6 l -5.2 2.2 Z" fill="' + pale + '" stroke="' + deep + '" stroke-width="0.6"/>');
    } else if (g.snout === 2) {
      parts.push('<ellipse cx="' + (rx - 1.5) + '" cy="' + (eyeYn + 4) + '" rx="3.6" ry="2.4" fill="' + pale + '"/>' +
        '<circle cx="' + (rx + 1.4) + '" cy="' + (eyeYn + 3.6) + '" r="0.9" fill="' + deep + '"/>');
    }

    if (k.act === 'eat') parts.push('<text x="' + (rx + 2) + '" y="' + (top - 2) + '" font-size="9" fill="#ffd166">✿</text>');

    /* swimming: sunk low, with a ripple at the waterline */
    var ripple = inWater
      ? '<ellipse cx="0" cy="0.5" rx="' + (rx + 3) + '" ry="2.6" fill="none" stroke="rgba(210,230,245,0.55)" stroke-width="1.1"/>'
      : '<ellipse cx="0" cy="1" rx="' + (rx + 0.5) + '" ry="3" fill="rgba(0,0,0,0.25)"/>';

    var label = k.name || (emissary ? k.given : '');
    var labelSvg = label ? '<text class="plant-label" x="0" y="14">' + escapeHtml(label) + '</text>' : '';
    var saying = (k.saying && k.sayingUntil && now < k.sayingUntil) ? escapeHtml(k.saying) : '';
    // a visible current intention — what this mind is about, right now. Kept
    // faint and small so a crowd reads as a village of purposes, not a wall of
    // text; it yields to a speech bubble and hushes while the kith sleeps.
    var intentShown = (!saying && k.intent && k.act !== 'sleep') ? escapeHtml(k.intent) : '';
    var intentSvg = '<text class="kith-intent" x="0" y="' + (label ? 24 : 15) + '">' + intentShown + '</text>';
    // stagger bubbles by identity so close talkers don't overlap
    var speechLift = (-top + 8) * scale + 12 + (W.hash32(k.id) % 3) * 9;
    var speechShift = ((W.hash32(k.id + 'x') % 3) - 1) * 8;
    var speechSvg = '<text class="kith-speech" x="' + speechShift + '" y="' + (-speechLift).toFixed(0) + '">' + saying + '</text>';
    var haloSel = sel ? '<circle cx="0" cy="-6" r="16" fill="none" stroke="#ffd166" stroke-width="2" opacity="0.9"/>' : '';
    var haloEmissary = emissary ? '<circle cx="0" cy="-6" r="13" fill="none" stroke="#ffd166" stroke-width="1" stroke-dasharray="2 3" opacity="0.85" class="emissary-ring"/>' : '';
    var haloWanderer = k.wanderer ? '<circle cx="0" cy="-6" r="14" fill="none" stroke="#cfd8dd" stroke-width="1" stroke-dasharray="1 4" opacity="0.8" class="wanderer-ring"/>' : '';
    // a sleeping "z" — always present, shown only by the act-sleep class so
    // the cheap incremental update can reveal it without a full re-render
    var zSvg = '<text class="kith-z" x="' + (rx * scale + 2).toFixed(0) + '" y="' + (-(-top + 4) * scale).toFixed(0) + '">z</text>';

    return '<g class="kith-group' + (sel ? ' selected' : '') + ' act-' + k.act + (inWater ? ' swimming' : '') + '" data-kith="' + k.id + '" ' +
      'style="transition: transform ' + (KITH_TICK_MS / 1000 + 0.2) + 's linear" ' +
      'transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')">' +
      ripple +
      haloWanderer + haloEmissary + haloSel +
      '<g class="kith-bob" style="animation-delay:-' + (W.hash32(k.id) % 3000) + 'ms">' +
      '<g class="pose">' +
      '<g transform="translate(0 ' + (inWater ? 3.5 : 0) + ') scale(' + (scale * k.facing).toFixed(2) + ' ' + scale.toFixed(2) + ')">' +
      parts.join('') +
      '</g></g></g>' + zSvg + labelSvg + intentSvg + speechSvg + '</g>';
  }

  // Between full renders, glide the kith to their new positions cheaply.
  function updateKithLayer() {
    var layer = document.getElementById('kith-layer');
    if (!layer) return;
    var living = W.presentKith(state); // away kith aren't on the map to glide
    var missing = false;
    var now = vnow();
    living.forEach(function (k) {
      var node = layer.querySelector('[data-kith="' + k.id + '"]');
      if (!node) { missing = true; return; }
      var pos = toScreen(k.x, k.y);
      var prev = node.getAttribute('transform');
      var next = 'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')';
      node.setAttribute('transform', next);
      node.classList.toggle('moving', prev !== next);
      node.classList.toggle('act-rest', k.act === 'rest');
      node.classList.toggle('act-shelter', k.act === 'shelter');
      node.classList.toggle('act-eat', k.act === 'eat');
      node.classList.toggle('act-sleep', k.act === 'sleep');
      var speech = node.querySelector('.kith-speech');
      var line = (k.saying && k.sayingUntil && now < k.sayingUntil) ? k.saying : '';
      if (speech) {
        if (line && line !== lastSayings[k.id]) chirp(W.hash32(k.id + line));
        lastSayings[k.id] = line;
        speech.textContent = line;
      }
      var intentEl = node.querySelector('.kith-intent');
      if (intentEl) intentEl.textContent = (!line && k.intent && k.act !== 'sleep') ? k.intent : '';
    });
    if (missing || layer.querySelectorAll('.kith-group').length !== living.length) {
      render(); // someone was born, or someone left us — rebuild properly
    }
  }

  /* ---------- chrome ---------- */

  var WX_VERBS = { breeze: ' stirs', mist: ' lies low', rain: ' is falling', storm: ' rages' };

  function topbarHTML() {
    var notes = [];
    if (WARP > 1) notes.push('⚡×' + WARP);
    notes.push(W.seasonAt(vnow()).key);
    if (state.lineage.length > 0) notes.push('woven from ' + (state.lineage.length + 1) + ' worlds');
    if (lastWxKind && lastWxKind !== 'clear' && WX_VERBS[lastWxKind]) {
      var wxNow = W.weatherAt(state.id, vnow());
      notes.push(wxNow.label + WX_VERBS[lastWxKind]);
    }
    var gen = notes.length ? ' <span class="gen">· ' + notes.join(' · ') + '</span>' : '';
    var disNow = W.disasterAt(state.id, vnow());
    var alarm = disNow ? ' <span class="alarm">⚠ ' + (disNow.phase === 'warning' ? disNow.name + ' is coming' : disNow.name + ' — run!') + '</span>' : '';
    return '<div id="topbar">' +
      '<button id="world-name" title="Rename this world">' + escapeHtml(state.name) + gen + alarm + '</button>' +
      '<div class="bar-actions">' +
      '<button class="btn primary" data-act="plant">Plant a seed</button>' +
      '<button class="btn" data-act="merge">Merge worlds…</button>' +
      '<button class="btn" data-act="chronicle">Chronicle</button>' +
      '<button class="btn" data-act="lexicon">Lexicon</button>' +
      '<button class="btn" data-act="preserve">Preserve</button>' +
      '<button class="btn" data-act="almanac" title="The Almanac">✦</button>' +
      '<button class="btn" data-act="worlds" title="Your worlds">⌂</button>' +
      '<button class="btn" data-act="mute" title="' + (audio.muted ? 'Sound is off' : 'Sound is on') + '">' + (audio.muted ? '🔇' : '🔊') + '</button>' +
      '<button class="btn" data-act="about">?</button>' +
      '</div></div>';
  }

  function panelHTML() {
    if (!selected) return '';
    if (selected.type === 'plant' && state.plants[selected.id]) return plantPanelHTML(state.plants[selected.id]);
    if (selected.type === 'kith' && state.kith[selected.id]) return kithPanelHTML(state.kith[selected.id]);
    return '';
  }

  function plantPanelHTML(p) {
    var age = Math.max(1, Math.round((vnow() - p.planted) / 3600000));
    var ageText = age < 48 ? age + 'h old' : Math.round(age / 24) + ' days old';
    var stageText = p.growth >= 1 ? 'in full bloom' : p.growth > 0.55 ? 'blooming' : p.growth > 0.2 ? 'growing' : 'a seedling';
    var canWater = !p.watered || vnow() - p.watered >= W.WATER_COOLDOWN;
    var hybridNote = p.bornOfMerge
      ? '<div class="hybrid-note">✦ Born when <strong>' + escapeHtml(p.bornOfMerge.worlds[0]) + '</strong> met <strong>' +
        escapeHtml(p.bornOfMerge.worlds[1]) + '</strong> — child of ' + escapeHtml(p.bornOfMerge.parents[0]) +
        ' and ' + escapeHtml(p.bornOfMerge.parents[1]) + '.</div>'
      : '';
    var biome = W.realmBiome(state.id, W.biomeAt(W.makeTerrain(state.id), p.x, p.y));
    var vigour = (p.soil || 1) > 1.05 ? 'thriving in rich soil' : (p.soil || 1) < 0.8 ? 'toughing out poor ground' : 'settled in fair soil';
    return '<div id="panel">' +
      '<h2>' + escapeHtml(p.name || 'Unnamed ' + p.species) + '</h2>' +
      '<div class="species">' + escapeHtml(p.species) + (p.origin === 'merge' ? ' · hybrid' : '') + '</div>' +
      '<div class="meta">' + ageText + ' · ' + stageText + ' · ' + Math.round(p.growth * 100) + '% grown</div>' +
      '<div class="meta">rooted in the ' + biome + ', ' + vigour + '</div>' +
      hybridNote +
      '<div class="row">' +
      '<button class="btn" data-act="water" ' + (canWater ? '' : 'disabled title="Watered recently — try again in a while"') + '>Water</button>' +
      '<button class="btn" data-act="name-plant">Name…</button>' +
      '<button class="btn" data-act="close-panel">Close</button>' +
      '</div></div>';
  }

  function kithPanelHTML(k) {
    var now = vnow();
    var stage = W.kithStage(k, now);
    var days = Math.floor((now - k.born) / 86400000);
    var ageText = days < 1 ? 'born today' : days + (days === 1 ? ' day' : ' days') + ' old';

    if (k.passed) {
      var takenMethod = k.takenBy ? k.takenBy.method : null;
      var lostType = k.lostTo ? k.lostTo.type : null;
      var CATA_END = { tsunami: 'was taken by the sea when the great wave came', flood: 'was lost when the waters rose', wildfire: 'was caught by the fire in the dry country', eruption: 'was lost when the fire-mountain woke', avalanche: 'lies under the snow the mountain let go', quake: 'was lost when the ground itself came apart' };
      var restText = takenMethod === 'depths' ? 'was dragged down into the dark water, and never surfaced'
        : takenMethod === 'nest' ? 'was carried off by a beast, and did not come back'
        : takenMethod === 'devour' ? 'was killed by a beast where it stood'
        : lostType ? CATA_END[lostType] || 'was lost to the turning of the world'
        : k.lostBeyond ? 'walked out past the edge of the world, and did not come home'
        : 'fell asleep beneath the soil';
      var speciesLine = k.takenBy ? 'taken by a predator' : k.lostTo ? 'lost to ' + (k.lostTo.type === 'quake' ? 'the earthquake' : 'the ' + k.lostTo.type) : k.lostBeyond ? 'lost beyond the edge' : 'remembered';
      return '<div id="panel">' +
        '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
        '<div class="species">' + speciesLine + '</div>' +
        '<div class="meta">lived ' + Math.max(1, Math.round((k.passed - k.born) / 86400000)) + ' days · ' + restText + '</div>' +
        (k.bornOfMerge ? '<div class="hybrid-note">✦ Was born of the meeting of ' + escapeHtml(k.bornOfMerge.worlds[0]) + ' and ' + escapeHtml(k.bornOfMerge.worlds[1]) + '.</div>' : '') +
        '<div class="row"><button class="btn" data-act="close-panel">Close</button></div></div>';
    }
    if (k.expedition) {
      var out = Math.max(0, Math.floor((now - k.expedition.start) / 86400000));
      var backIn = Math.max(0, Math.ceil((k.expedition.back - now) / 86400000));
      return '<div id="panel">' +
        '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
        '<div class="species">away beyond the edge of the world</div>' +
        '<div class="meta">' + (out < 1 ? 'set out today' : out + (out === 1 ? ' day' : ' days') + ' gone') +
        ' · ' + (backIn < 1 ? 'due back any hour now' : 'perhaps ' + backIn + (backIn === 1 ? ' day' : ' days') + ' more') + '</div>' +
        '<div class="hybrid-note">✦ It went looking for what lies past the map. It will return changed — or it will be mourned.</div>' +
        '<div class="row"><button class="btn" data-act="close-panel">Close</button></div></div>';
    }
    if (k.departed) {
      return '<div id="panel">' +
        '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
        '<div class="species">a wanderer, walked on</div>' +
        '<div class="meta">it came from elsewhere, stayed a day, and left the way it came</div>' +
        '<div class="row"><button class="btn" data-act="close-panel">Close</button></div></div>';
    }

    var mood = k.starving ? 'starving' :
      k.act === 'eat' ? 'sipping nectar' :
      k.act === 'shelter' ? 'sheltering from the storm' :
      k.act === 'rest' ? 'dozing' :
      k.energy < 0.3 ? 'hungry' : k.energy < 0.55 ? 'peckish' : 'content';
    var emissary = state.emissary === k.id;

    var bonds = Object.keys(k.trust || {}).filter(function (id) { return k.trust[id] >= 0.5 && state.kith[id] && !state.kith[id].passed; });
    var bondLine = bonds.length
      ? 'fond of ' + bonds.slice(0, 3).map(function (id) { return escapeHtml(W.kithLabel(state.kith[id])); }).join(', ') + (bonds.length > 3 ? '…' : '')
      : null;
    var grudges = Object.keys(k.trust || {}).filter(function (id) { return k.trust[id] < -0.15 && state.kith[id] && !state.kith[id].passed; });
    if (grudges.length) {
      bondLine = (bondLine ? bondLine + ' · ' : '') + 'bears a grudge against ' +
        escapeHtml(W.kithLabel(state.kith[grudges[0]])) + (grudges.length > 1 ? ' and others' : '');
    }
    var tribe = W.tribeOfKith(state, k.id);
    var tribeLine = tribe ? 'of the ' + escapeHtml(tribe.name) + ' (' + tribe.members.length + ' strong)' : null;
    var kin = [];
    (k.parents || []).forEach(function (pid) {
      if (state.kith[pid]) kin.push('child of ' + escapeHtml(W.kithLabel(state.kith[pid])) + (state.kith[pid].passed ? ' (remembered)' : ''));
    });
    var children = Object.keys(state.kith).filter(function (id) {
      var c = state.kith[id];
      return c.parents && c.parents.indexOf(k.id) > -1;
    });
    if (children.length) {
      kin.push('parent of ' + children.slice(0, 3).map(function (id) { return escapeHtml(W.kithLabel(state.kith[id])); }).join(', ') + (children.length > 3 ? '…' : ''));
    }
    var kinLine = kin.length ? kin.join(' · ') : null;
    var skills = [];
    if (k.lex && k.lex.gardener) skills.push('it calls you “' + escapeHtml(k.lex.gardener.word) + '”');
    if (W.isSwimmer(k)) skills.push('a swimmer: at home in the water');
    if (W.knowsOf(k).indexOf('seedkeeping') > -1) skills.push('a seed-keeper: it gardens');
    if (W.knowsOf(k).indexOf('song') > -1) skills.push('a singer: it sings against the storms');
    if (W.knowsOf(k).indexOf('shelter') > -1) skills.push('a builder: it raises shelters');
    if (W.knowsOf(k).indexOf('hearth') > -1) skills.push('a hearth-keeper: warmth follows it');
    if (W.knowsOf(k).indexOf('ward') > -1) skills.push('a watcher: it keeps the watch against the dark');
    (k.relics || []).forEach(function (r) { skills.push('carries ' + escapeHtml(r.name) + ', from beyond the edge'); });
    if (k.scars) skills.push(k.scars === 1 ? 'bears a scar from the far country' : 'bears the scars of hard travels');
    var skillLine = skills.length ? skills.join(' · ') : null;
    var tastes = Object.keys(k.taste || {});
    var tasteLine = null;
    if (tastes.length) {
      tastes.sort(function (a, b) { return k.taste[b] - k.taste[a]; });
      var fav = tastes[0], worst = tastes[tastes.length - 1];
      if (k.taste[fav] > 0.25) tasteLine = 'has a taste for ' + escapeHtml(fav);
      if (k.taste[worst] < -0.35) tasteLine = (tasteLine ? tasteLine + '; ' : '') + 'can’t abide ' + escapeHtml(worst);
    }
    var wandererNote = k.wanderer
      ? '<div class="hybrid-note">✦ A wanderer — not of this world. It will walk on soon; whatever it carries goes with it, unless it is befriended.</div>'
      : '';
    var mergeNote = k.bornOfMerge
      ? '<div class="hybrid-note">✦ Born at the meeting stone when <strong>' + escapeHtml(k.bornOfMerge.worlds[0]) +
        '</strong> met <strong>' + escapeHtml(k.bornOfMerge.worlds[1]) + '</strong> — child of the emissaries ' +
        escapeHtml(k.bornOfMerge.parents[0]) + ' and ' + escapeHtml(k.bornOfMerge.parents[1]) + '.</div>'
      : '';
    var emissaryNote = emissary
      ? '<div class="hybrid-note">✦ Your emissary. When worlds merge, ' + escapeHtml(W.kithLabel(k)) + ' will lead the meeting.</div>'
      : '';
    var standing = W.realmBiome(state.id, W.biomeAt(W.makeTerrain(state.id), k.x, k.y));
    var kind = W.kindOf(k.genome);
    // what's on its mind, right now — the intention, and the pressures behind it
    var intentLine = k.intent
      ? '<div class="intent-now">right now: <strong>' + escapeHtml(k.intent) + '</strong></div>'
      : '';
    var needsBars = '';
    if (k.needs && M) {
      var loudest = M.dominant(k.needs); // the pressure that presses hardest
      needsBars = '<div class="needs" title="the pressures on this mind — the longest is what weighs on it">' +
        M.NEEDS.map(function (n) {
          var v = Math.round((k.needs[n] || 0) * 100);
          return '<div class="need' + (loudest === n ? ' on' : '') + '">' +
            '<span class="need-label">' + n + '</span>' +
            '<span class="need-track"><span class="need-fill" style="width:' + v + '%"></span></span></div>';
        }).join('') + '</div>';
    }
    return '<div id="panel">' +
      '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
      '<div class="species">a ' + stage + ' ' + escapeHtml(kind.name) + ' kith' + (k.name ? ' · called ' + escapeHtml(k.given) + ' by its kin' : '') + '</div>' +
      '<div class="meta">' + ageText + ' · ' + mood + ' · on the ' + standing + '</div>' +
      intentLine + needsBars +
      (tribeLine ? '<div class="meta">' + tribeLine + '</div>' : '') +
      (kinLine ? '<div class="meta">' + kinLine + '</div>' : '') +
      (bondLine ? '<div class="meta">' + bondLine + '</div>' : '') +
      (tasteLine ? '<div class="meta">' + tasteLine + '</div>' : '') +
      (skillLine ? '<div class="meta">' + skillLine + '</div>' : '') +
      wandererNote + mergeNote + emissaryNote +
      '<div class="row">' +
      '<button class="btn" data-act="name-kith">Name…</button>' +
      (emissary ? '' : '<button class="btn" data-act="bless">Bless as emissary</button>') +
      '<button class="btn" data-act="close-panel">Close</button>' +
      '</div></div>';
  }

  function modalHTML() {
    if (!openModal) return '';
    var inner = '';
    if (openModal === 'merge') {
      var emissaryLine = state.emissary && state.kith[state.emissary]
        ? 'Your emissary <strong>' + escapeHtml(W.kithLabel(state.kith[state.emissary])) + '</strong> will lead the meeting.'
        : 'No emissary is blessed — the eldest kith will lead the meeting. (Click a kith to bless one.)';
      inner = '<h2>Merge worlds</h2>' +
        '<p class="muted">When two Driftgarden files meet, they become one world. Every plant, every kith, and every line of history from both survives. On a first meeting the two emissaries meet at the meeting stone, and a child of both worlds is born. ' + emissaryLine + '</p>' +
        '<div class="dropzone" id="dropzone">Drop another Driftgarden .html file here<br><span class="muted">(or use the picker / paste below)</span></div>' +
        '<div class="row"><input type="file" id="merge-file" accept=".html,.htm,.json" aria-label="Choose a Driftgarden file"></div>' +
        '<p class="muted" style="margin-bottom:0.25rem">…or paste a world here:</p>' +
        '<textarea id="merge-paste" placeholder="Paste the contents of a Driftgarden file or an exported world"></textarea>' +
        '<div class="row"><button class="btn primary" data-act="merge-paste-go">Merge pasted world</button>' +
        '<button class="btn" data-act="export-world">Copy this world as text</button>' +
        '<button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'chronicle') {
      var allEntries = state.chronicle.slice().reverse();
      var shown = chronicleShowAll ? allEntries : allEntries.slice(0, 60);
      var entries = shown.map(function (e) {
        var d = new Date(e.at);
        var when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        return '<div class="chronicle-entry kind-' + e.kind + '"><span class="when">' + when +
          '</span><span class="what">' + escapeHtml(e.text) + '</span></div>';
      }).join('');
      if (!chronicleShowAll && allEntries.length > 60) {
        entries += '<div class="row"><button class="btn small" data-act="chronicle-all">Show all ' +
          allEntries.length + ' entries — back to the world\'s first day</button></div>';
      }
      var lineage = state.lineage.length
        ? '<p class="muted">Woven from: ' + state.lineage.map(function (l) { return escapeHtml(l.name); }).join(', ') + '.</p>'
        : '';
      inner = '<h2>The Chronicle</h2>' + lineage +
        '<div>' + entries + '</div>' +
        '<div class="row"><button class="btn" data-act="families">The Folk…</button>' +
        '<button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'families') {
      var fam = W.familiesOf(state);
      function branch(kithId, depth) {
        var k = state.kith[kithId];
        if (!k || depth > 6) return '';
        var status = k.passed ? ' <span class="muted">(remembered)</span>' :
          (state.emissary === k.id ? ' <span class="badge-now">emissary</span>' : '');
        var kids = (fam.childrenOf[kithId] || []).map(function (cid) { return branch(cid, depth + 1); }).join('');
        return '<div class="family-node" style="margin-left:' + (depth * 1.1) + 'rem">' +
          (depth > 0 ? '└ ' : '') + escapeHtml(W.kithLabel(k)) + status + '</div>' + kids;
      }
      var trees = fam.roots.map(function (root) {
        return '<div class="card-sub" style="margin:0.7rem 0 0.2rem">the line of ' + escapeHtml(W.kithLabel(root)) + '</div>' + branch(root.id, 0);
      }).join('');
      var censusNow = vnow();
      var census = W.livingKith(state).sort(function (a, b) { return a.born - b.born; }).map(function (k) {
        var kindName = W.kindOf(k.genome).name;
        var away = !!k.expedition;
        var mood = away ? 'away beyond the edge' :
          k.starving ? 'starving' : k.act === 'eat' ? 'eating' : k.act === 'shelter' ? 'sheltering' :
          k.act === 'rest' ? 'dozing' : k.energy < 0.45 ? 'hungry' : 'about';
        var traits = [];
        if (state.emissary === k.id) traits.push('emissary');
        if (W.isSwimmer(k)) traits.push('swimmer');
        W.knowsOf(k).forEach(function (s) { traits.push({ seedkeeping: 'seed-keeper', song: 'singer', shelter: 'builder', hearth: 'hearth-keeper', ward: 'watcher' }[s] || s); });
        if (k.relics && k.relics.length) traits.push('far-traveller');
        if (k.scars) traits.push('scarred');
        var doing = away ? '<br><span class="muted">it went looking for what lies past the map</span>'
          : (k.intent ? '<br><span class="muted">' + escapeHtml(k.intent) + '</span>' : '');
        var visit = away ? '<span class="muted">—</span>'
          : '<button class="btn small" data-kith-focus="' + k.id + '">Visit</button>';
        return '<div class="chronicle-entry"><span class="what"><strong>' + escapeHtml(W.kithLabel(k)) + '</strong> · ' +
          escapeHtml(kindName) + ' · ' + W.kithStage(k, censusNow) + ' · ' + mood + doing +
          (traits.length ? '<br><span class="muted">' + escapeHtml(traits.join(', ')) + '</span>' : '') + '</span>' +
          '<span class="when">' + visit + '</span></div>';
      }).join('');
      inner = '<h2>The Folk</h2>' +
        '<p class="muted">Everyone alive in this world, eldest first. Visit one and the eye of the gardener goes to it.</p>' +
        census +
        '<h2 style="margin-top:1.25rem">Families</h2>' +
        '<p class="muted">The bloodlines of this world, root to leaf. Children of two worlds appear in the line of each parent.</p>' +
        (trees || '<p class="muted">No families yet — children come to bonded, grown kith in fair weather. Give it time.</p>') +
        '<div class="row"><button class="btn" data-act="chronicle">← Chronicle</button>' +
        '<button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'lexicon') {
      var tongue = W.worldLexicon(state);
      var concepts = Object.keys(tongue).filter(function (c) { return c !== ':order'; })
        .sort(function (a, b) {
          return tongue[b][0].weight - tongue[a][0].weight;
        });
      // the world's grammar, with a living example if the words exist
      var order = W.worldOrder(state);
      var grammarLine = '';
      if (order) {
        var intentRow = (tongue['mark:good'] || tongue['mark:want'] || tongue['mark:fear'] || [])[0];
        var thingRow = (tongue['home'] || tongue['sun'] || tongue['water'] || [])[0];
        var example = (intentRow && thingRow)
          ? ' — they say “' + escapeHtml(order === 'mf' ? intentRow.word + ' ' + thingRow.word : thingRow.word + ' ' + intentRow.word) + '”'
          : '';
        grammarLine = '<p><strong>The grammar of this world:</strong> ' +
          (order === 'mf' ? 'the feeling comes first, then the thing' : 'the thing comes first, then the feeling') +
          example + '.</p>';
      }
      var canWhisper = state.emissary && state.kith[state.emissary] && !state.kith[state.emissary].passed &&
        (!state.whispered || vnow() - state.whispered > 20 * 3600 * 1000);
      var lexRows = concepts.map(function (concept) {
        var words = tongue[concept];
        var coiner = words[0].by === 'whisper' ? 'carried on the wind'
          : (state.kith[words[0].by] ? 'first spoken by ' + escapeHtml(W.kithLabel(state.kith[words[0].by])) : '');
        var also = words.length > 1
          ? ' <span class="muted">(also: ' + words.slice(1, 3).map(function (w2) { return '“' + escapeHtml(w2.word) + '”'; }).join(', ') + ')</span>'
          : '';
        return '<div class="chronicle-entry"><span class="what">' +
          escapeHtml(W.conceptLabel(concept)) + ' — <strong class="lex-word">' + escapeHtml(words[0].word) + '</strong>' + also +
          (coiner ? '<br><span class="muted">' + coiner + '</span>' : '') + '</span>' +
          '<span class="when">' + (canWhisper ? '<button class="btn small" data-whisper="' + escapeHtml(concept) + '">whisper…</button>' : '') + '</span></div>';
      }).join('');
      inner = '<h2>The Lexicon</h2>' +
        '<p class="muted">The kith are naming their world. Words are coined in each speaker\'s own voice and spread from mouth to mouth; every world converges on a tongue of its own — and now on sentences: a feeling and a thing, in this world\'s own word order. When worlds merge, dialects and grammars meet.' +
        (canWhisper ? ' Once a day you may whisper a word to your emissary, and see if it spreads.' : '') + '</p>' +
        grammarLine +
        (lexRows || '<p class="muted">No words yet — the kith speak when their paths cross. Listen for the small words above their heads.</p>') +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'almanac') {
      var almanac = state.almanac || {};
      var pages = W.almanacPages();
      var visible = pages.filter(function (p) { return !p.sealed || almanac[p.id]; });
      var writtenCount = visible.filter(function (p) { return almanac[p.id]; }).length;
      var sealedWaiting = pages.some(function (p) { return p.sealed && !almanac[p.id]; });
      var pageRows = visible.map(function (p) {
        var fill = almanac[p.id];
        if (fill) {
          var when = new Date(fill.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          return '<div class="almanac-page written"><span class="page-mark">✦</span> <strong>' + escapeHtml(p.title) + '</strong>' +
            ' <span class="muted">· ' + when + (fill.note ? ' · ' + escapeHtml(fill.note) : '') + '</span></div>';
        }
        return '<div class="almanac-page faded"><span class="page-mark">·</span> <em>' + escapeHtml(p.riddle) + '</em></div>';
      }).join('');
      inner = '<h2>The Almanac</h2>' +
        '<p class="muted">A book of pages that write themselves. Each is a riddle until this world makes it true — then it fills, and never unfills. ' +
        writtenCount + ' of ' + visible.length + ' pages written.</p>' +
        pageRows +
        (sealedWaiting ? '<p class="muted" style="margin-top:0.9rem"><em>The book feels thicker than its pages.</em></p>' : '') +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'worlds') {
      var rows = listStoredWorlds().map(function (entry) {
        var current = entry.id === state.id;
        var when = entry.touched ? new Date(entry.touched).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
        return '<div class="chronicle-entry"><span class="what"><strong>' + escapeHtml(entry.name) + '</strong>' +
          (current ? ' <span class="badge-now">you are here</span>' : '') +
          '<br><span class="muted">of ' + escapeHtml(W.realmOf(entry.id).realm.name) + ' · ' +
          entry.kith + ' kith · ' + entry.plants + ' plants · last tended ' + when + '</span></span>' +
          '<span class="when">' +
          (current ? '' : '<button class="btn small" data-world-visit="' + entry.id + '">Visit</button> ') +
          '<button class="btn small" data-world-forget="' + entry.id + '">Let go…</button>' +
          '</span></div>';
      }).join('');
      inner = '<h2>Your worlds</h2>' +
        '<p class="muted">Every world you tend in this browser lives here. Worlds you preserved as files exist beyond this list — a shared world can be abandoned, but never truly destroyed.</p>' +
        '<div>' + rows + '</div>' +
        '<h2 style="margin-top:1.25rem">Begin a new world</h2>' +
        '<div class="row"><input type="text" id="nw-name" placeholder="A name (or leave blank for fate to choose)"></div>' +
        '<div class="row"><label class="muted" for="nw-nature">Its nature:</label> ' +
        '<select id="nw-nature">' +
        '<option value="surprise">Surprise me</option>' +
        Object.keys(W.REALMS).map(function (rk) {
          return '<option value="' + rk + '">' + escapeHtml(W.REALMS[rk].name.replace(/^the /, 'The ')) + '</option>';
        }).join('') +
        '</select></div>' +
        '<div class="row"><label class="muted" for="nw-temp">The land:</label> ' +
        '<select id="nw-temp">' +
        '<option value="surprise">Surprise me</option>' +
        '<option value="lakeland">Lakeland — low places everywhere</option>' +
        '<option value="highlands">Highlands — rock and peaks</option>' +
        '<option value="plains">Plains — broad open ground</option>' +
        '<option value="drylands">Drylands — scarcely a low place</option>' +
        '</select></div>' +
        '<div class="row"><button class="btn primary" data-act="new-world">Bring it into being</button>' +
        '<button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'about') {
      inner = '<h2>Driftgarden</h2>' +
        '<p>This is a living world in a single file. The file you opened <em>is</em> the world — there is no server, no account, no internet.</p>' +
        '<p><strong>Tend it.</strong> Plant seeds, water them, name what grows. Small beings — the kith — live among your plants: they wander, sip nectar from blooms, and rest. Click one to meet it.</p>' +
        '<p><strong>Bless an emissary.</strong> Choose one kith as yours. When worlds merge, your emissary leads the meeting — and the child born of a first meeting is your emissary’s child.</p>' +
        '<p><strong>Set it free.</strong> Press <em>Preserve</em> and the game writes itself into a new file with your world inside. Give copies to people. Their copies will drift.</p>' +
        '<p><strong>Reunite it.</strong> When two copies meet again, merge them. Nothing is ever lost, and every first meeting creates new life.</p>' +
        '<p><strong>A safety habit worth keeping:</strong> open files <em>you</em> made; <em>merge</em> files you receive. Merging only reads a world\'s data — it can never run anything. Opening someone else\'s copy of the game runs their code, like opening any file from a stranger.</p>' +
        '<p class="muted">Your world stays on your device. Nothing is ever sent anywhere. Free to copy and share — that is the point. And remember: a browser can lose its memory; a file cannot. <strong>Preserve often.</strong> Source: github.com/zeroblowitall/special-spoon</p>' +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    }
    return '<div class="modal-veil" id="veil"><div class="modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
  }

  /* ---------- the shelf of worlds ---------- */

  function listStoredWorlds() {
    var worlds = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.indexOf(STORE_PREFIX) !== 0) continue;
        var w = JSON.parse(localStorage.getItem(key));
        if (!W.looksLikeWorld(w)) continue;
        worlds.push({
          id: w.id, name: w.name, touched: w.touched || 0,
          kith: W.livingKith(w).length,
          plants: Object.keys(w.plants).length
        });
      }
    } catch (e) { /* a corrupt entry hides itself */ }
    worlds.sort(function (a, b) { return b.touched - a.touched; });
    return worlds;
  }

  function switchToWorld(worldState) {
    state = worldState;
    W.ensureKith(state);
    W.settleImmigrants(state);
    W.catchUp(state); // a visited world lived on while it slept
    W.advanceGrowth(state);
    W.weatherTick(state);
    save();
    selected = null;
    openModal = null;
    render();
  }

  /* ---------- the self-writing file ---------- */

  function selfHTML() {
    var style = document.getElementById('dg-style').textContent;
    var mind = document.getElementById('dg-mind').textContent;
    var world = document.getElementById('dg-world').textContent;
    var app = document.getElementById('dg-app').textContent;
    var json = JSON.stringify(state).replace(/</g, '\\u003c');
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta name="description" content="Driftgarden — a living world in a single file. Copies drift apart; when they meet again, they merge.">\n' +
      '<title>' + escapeHtml(state.name) + ' — Driftgarden</title>\n' +
      '<style id="dg-style">' + style + '</style>\n</head>\n<body>\n' +
      '<noscript><p style="padding:2rem;font-family:sans-serif">Driftgarden needs JavaScript to live. No internet connection is required — just JavaScript.</p></noscript>\n' +
      '<div id="stage"></div>\n' +
      '<script id="dg-state">window.DRIFT_STATE = ' + json + ';<\/script>\n' +
      '<script id="dg-mind">' + mind + '<\/script>\n' +
      '<script id="dg-world">' + world + '<\/script>\n' +
      '<script id="dg-app">' + app + '<\/script>\n' +
      '</body>\n</html>\n';
  }

  function preserveWorld() {
    W.advanceGrowth(state);
    W.chronicle(state, 'preserve', 'The world was preserved and set free as a file.');
    state.lastPreserve = vnow();
    save();
    var blob = new Blob([selfHTML()], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* ---------- events ---------- */

  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4000);
  }

  function handleIncomingWorld(text) {
    var world = W.extractWorld(text);
    if (!world) { toast('That didn’t look like a Driftgarden world.'); return; }
    try {
      var result = W.mergeWorlds(state, world);
      save();
      openModal = null;
      if (result.child) selected = { type: 'kith', id: result.child.id };
      else if (result.hybrid) selected = { type: 'plant', id: result.hybrid.id };
      render();
      var flash = document.createElement('div');
      flash.className = 'merge-flash';
      stage.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 1700);
      if (result.same) {
        toast(result.gained > 0 ? 'Same world, newer memories — ' + result.gained + ' new arrivals woven in.' : 'These are the same world — nothing new to weave in.');
      } else if (result.child) {
        toast('The emissaries met at the meeting stone. ' + result.child.given + ' was born of both worlds!');
      } else if (result.hybrid) {
        toast('Worlds merged. A new species was born: the ' + result.hybrid.species + '!');
      } else if (!result.firstMeeting) {
        toast('A reunion with ' + result.otherName + (result.gained + result.gainedKith > 0 ? ' — new arrivals woven in.' : ' — nothing new since you last met.'));
      } else {
        toast('Worlds merged with ' + result.otherName + '.');
      }
    } catch (e) {
      toast('That world could not be merged.');
    }
  }

  function wireEvents() {
    stage.querySelectorAll('.plant-group').forEach(function (node) {
      node.addEventListener('click', function () {
        selected = { type: 'plant', id: node.getAttribute('data-plant') };
        render();
      });
    });
    stage.querySelectorAll('.kith-group').forEach(function (node) {
      node.addEventListener('click', function () {
        selected = { type: 'kith', id: node.getAttribute('data-kith') };
        render();
      });
    });

    stage.querySelectorAll('[data-act]').forEach(function (node) {
      node.addEventListener('click', function () {
        var act = node.getAttribute('data-act');
        if (act === 'plant') {
          var p = W.plantSeed(state);
          save();
          selected = { type: 'plant', id: p.id };
          render();
          toast('A ' + p.species + ' seed settles into the soil.');
        } else if (act === 'water') {
          if (W.waterPlant(state, selected.id)) { save(); render(); toast('Watered. You can almost hear it growing.'); }
        } else if (act === 'name-plant') {
          var plantName = prompt('Name this ' + state.plants[selected.id].species + ':');
          if (plantName && plantName.trim()) { W.namePlant(state, selected.id, plantName.trim()); save(); render(); }
        } else if (act === 'name-kith') {
          var k = state.kith[selected.id];
          var kithName = prompt('Its kin call it ' + k.given + '. What do you name it?', k.name || '');
          if (kithName && kithName.trim()) { W.nameKith(state, selected.id, kithName.trim()); save(); render(); }
        } else if (act === 'bless') {
          W.blessKith(state, selected.id);
          save();
          render();
          toast(W.kithLabel(state.kith[selected.id]) + ' is now your emissary. It will lead when worlds meet.');
        } else if (act === 'close-panel') {
          selected = null; render();
        } else if (act === 'preserve') {
          preserveWorld();
          render();
          toast('World preserved. The file you just downloaded IS your world — share copies freely.');
        } else if (act === 'merge' || act === 'chronicle' || act === 'about' || act === 'worlds' || act === 'lexicon' || act === 'families' || act === 'almanac') {
          if (act === 'chronicle') chronicleShowAll = false;
          openModal = act; render();
        } else if (act === 'chronicle-all') {
          chronicleShowAll = true; render();
        } else if (act === 'mute') {
          toggleMute();
        } else if (act === 'close-modal') {
          openModal = null; render();
        } else if (act === 'new-world') {
          var newName = (document.getElementById('nw-name').value || '').trim();
          var temperament = document.getElementById('nw-temp').value;
          var nature = document.getElementById('nw-nature').value;
          var fresh = W.newWorld({ name: newName || null, temperament: temperament, nature: nature });
          switchToWorld(fresh);
          toast('The world ' + state.name + ' came into being ' + W.realmOf(state.id).realm.born + '. Three kith are already exploring it.');
        } else if (act === 'merge-paste-go') {
          handleIncomingWorld(document.getElementById('merge-paste').value);
        } else if (act === 'export-world') {
          var box = document.getElementById('merge-paste');
          box.value = JSON.stringify(state);
          box.select();
          try { document.execCommand('copy'); toast('World copied — paste it into another Driftgarden.'); }
          catch (e) { toast('World placed in the box — copy it by hand.'); }
        }
      });
    });

    stage.querySelectorAll('[data-kith-focus]').forEach(function (node) {
      node.addEventListener('click', function () {
        var id = node.getAttribute('data-kith-focus');
        var k = state.kith[id];
        if (!k) return;
        selected = { type: 'kith', id: id };
        openModal = null;
        var focusPos = toScreen(k.x, k.y);
        cam.zoom = Math.max(cam.zoom, 1.7);
        cam.cx = focusPos.x;
        cam.cy = focusPos.y;
        render();
        toast('The eye of the gardener rests on ' + W.kithLabel(k) + '.');
      });
    });

    stage.querySelectorAll('[data-whisper]').forEach(function (node) {
      node.addEventListener('click', function () {
        var concept = node.getAttribute('data-whisper');
        var word = prompt('Whisper a word for ' + W.conceptLabel(concept) + ' (letters only, keep it small):');
        if (!word) return;
        var result = W.whisperWord(state, concept, word.trim());
        if (result.ok) {
          save();
          render();
          toast('You whisper “' + result.word + '”. Whether it spreads is up to them now.');
        } else {
          toast(result.why);
        }
      });
    });

    stage.querySelectorAll('[data-world-visit]').forEach(function (node) {
      node.addEventListener('click', function () {
        try {
          var w = JSON.parse(localStorage.getItem(STORE_PREFIX + node.getAttribute('data-world-visit')));
          if (W.looksLikeWorld(w)) { switchToWorld(w); toast('You return to ' + state.name + '.'); }
        } catch (e) { toast('That world could not be woken.'); }
      });
    });
    stage.querySelectorAll('[data-world-forget]').forEach(function (node) {
      node.addEventListener('click', function () {
        var id = node.getAttribute('data-world-forget');
        var entry = listStoredWorlds().filter(function (w) { return w.id === id; })[0];
        var name = entry ? entry.name : 'this world';
        if (!confirm('Let go of ' + name + '? Its life here ends — though any file you preserved of it lives on, and could return one day.')) return;
        try { localStorage.removeItem(STORE_PREFIX + id); } catch (e) { /* already gone */ }
        if (id === state.id) {
          var remaining = listStoredWorlds();
          if (remaining.length > 0) {
            switchToWorld(JSON.parse(localStorage.getItem(STORE_PREFIX + remaining[0].id)));
            toast(name + ' was let go. You find yourself in ' + state.name + '.');
          } else {
            switchToWorld(W.newWorld());
            toast(name + ' was let go. A new world, ' + state.name + ', begins.');
          }
        } else {
          openModal = 'worlds';
          render();
          toast(name + ' was let go.');
        }
      });
    });

    // the camera: wheel and pinch to zoom, drag to pan — and a plain tap
    // on bare land is still a soft call
    var worldSvg = document.getElementById('world');
    if (worldSvg) {
      worldSvg.addEventListener('wheel', function (event) {
        event.preventDefault();
        zoomAt(worldSvg, event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
      }, { passive: false });

      worldSvg.addEventListener('pointerdown', function (event) {
        camPointers[event.pointerId] = { x: event.clientX, y: event.clientY, target: event.target, moved: false };
        // NOTE: the pointer is captured only once a drag actually begins —
        // capturing here retargets clicks to the map and kills every
        // creature and plant click (a real playtest found this)
        var ids = Object.keys(camPointers);
        if (ids.length === 2) {
          var a = camPointers[ids[0]], b = camPointers[ids[1]];
          camPinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        }
      });

      worldSvg.addEventListener('pointermove', function (event) {
        var p = camPointers[event.pointerId];
        if (!p) return;
        var ids = Object.keys(camPointers);
        if (camPinch && ids.length === 2) {
          p.x = event.clientX; p.y = event.clientY; p.moved = true;
          var a = camPointers[ids[0]], b = camPointers[ids[1]];
          var dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (camPinch.dist > 0 && dist > 0) {
            zoomAt(worldSvg, (a.x + b.x) / 2, (a.y + b.y) / 2, dist / camPinch.dist);
          }
          camPinch.dist = dist;
          return;
        }
        var dx = event.clientX - p.x, dy = event.clientY - p.y;
        if (!p.moved && Math.abs(dx) + Math.abs(dy) < 7) return;
        if (!p.moved) {
          p.moved = true;
          try { worldSvg.setPointerCapture(event.pointerId); } catch (e) { /* fine */ }
        }
        var rect = worldSvg.getBoundingClientRect();
        var scale = camWindow().w / rect.width;
        cam.cx -= dx * scale;
        cam.cy -= dy * scale;
        p.x = event.clientX; p.y = event.clientY;
        applyCam();
      });

      function releasePointer(event) {
        var p = camPointers[event.pointerId];
        delete camPointers[event.pointerId];
        if (Object.keys(camPointers).length < 2) camPinch = null;
        if (!p || p.moved || event.type === 'pointercancel') return;
        // a clean tap: the soft call
        if (p.target.closest && (p.target.closest('.plant-group') || p.target.closest('.kith-group') || p.target.closest('.btn'))) return;
        var pt = worldSvg.createSVGPoint();
        pt.x = event.clientX; pt.y = event.clientY;
        var ctm = worldSvg.getScreenCTM();
        if (!ctm) return;
        var scenePoint = pt.matrixTransform(ctm.inverse());
        var wx = (scenePoint.x - 40) / 920;
        var wy = 0.55 + (scenePoint.y - 470) / 1200;
        if (wx < 0.02 || wx > 0.98 || wy < 0.555 || wy > 0.99) return; // the sky does not listen
        if (!W.isLandAt(W.makeTerrain(state.id), wx, wy)) { toast('Only ripples answer from the water.'); return; }
        beacon = { x: wx, y: wy, until: vnow() + 45000 * WARP }; // 45 real seconds, whatever the warp
        selected = null;
        render();
        toast('You call softly. The curious will come.');
      }
      worldSvg.addEventListener('pointerup', releasePointer);
      worldSvg.addEventListener('pointercancel', releasePointer);
    }

    stage.querySelectorAll('[data-cam]').forEach(function (node) {
      node.addEventListener('click', function () {
        var action = node.getAttribute('data-cam');
        if (action === 'reset') { resetCam(); applyCam(); return; }
        var rect = stage.getBoundingClientRect();
        zoomAt(document.getElementById('world'), rect.left + rect.width / 2, rect.top + rect.height / 2,
          action === 'in' ? 1.3 : 1 / 1.3);
      });
    });

    var worldName = document.getElementById('world-name');
    if (worldName) worldName.addEventListener('click', function () {
      var name = prompt('Rename this world:', state.name);
      if (name && name.trim() && name.trim() !== state.name) { W.renameWorld(state, name.trim()); save(); render(); }
    });

    var veil = document.getElementById('veil');
    if (veil) veil.addEventListener('click', function (event) {
      if (event.target === veil) { openModal = null; render(); }
    });

    var fileInput = document.getElementById('merge-file');
    if (fileInput) fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) readFileForMerge(fileInput.files[0]);
    });

    var dropzone = document.getElementById('dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (type) {
        dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.add('hot'); });
      });
      dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('hot'); });
    }
  }

  function readFileForMerge(file) {
    var reader = new FileReader();
    reader.onload = function () { handleIncomingWorld(reader.result); };
    reader.readAsText(file);
  }

  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFileForMerge(e.dataTransfer.files[0]);
    }
  });

  /* ---------- heartbeats ---------- */

  // The kith live: think & move every couple of seconds, glide between beats.
  setInterval(function () {
    var events = [];
    if (WARP === 1) {
      events = W.kithTick(state, KITH_TICK_MS / 1000, beacon);
    } else {
      // sub-step the accelerated world so behaviour stays sane
      var steps = Math.max(1, Math.min(240, Math.round(WARP / 8)));
      var dtEach = (KITH_TICK_MS / 1000) * WARP / steps;
      for (var s = 0; s < steps; s++) {
        events = events.concat(W.kithTick(state, dtEach, beacon));
      }
      W.advanceGrowth(state);
      W.weatherTick(state);
    }
    if (beacon && vnow() > beacon.until) beacon = null;
    if (events && events.length > 0) {
      save();
      announceNews(events);
    }
    // when the light turns (dawn, dusk, nightfall) the whole scene is
    // repainted so the sky keeps pace — vital under warp, cheap at rest
    var phaseNow = W.dayPhase(vnow());
    // while a hunter stalks or the country turns on the folk, repaint every
    // beat so the danger moves; otherwise repaint only when the light turns
    if (!openModal && (phaseNow !== lastDayPhase || W.predatorAt(state, vnow()) || W.disasterAt(state.id, vnow()))) {
      lastDayPhase = phaseNow;
      render();
    } else if (!openModal) {
      updateKithLayer();
    }
    // a sheltering singer sings, note by note
    if (lastWxKind === 'storm') {
      var singer = W.livingKith(state).filter(function (k) {
        return k.act === 'shelter' && W.knowsOf(k).indexOf('song') > -1;
      })[0];
      if (singer && songStep % 2 === 0) songNote(W.hash32(singer.id), songStep / 2);
      songStep++;
    }
  }, KITH_TICK_MS);

  // The world endures: growth advances, skies turn, twice a minute.
  setInterval(function () {
    W.advanceGrowth(state);
    var wx = W.weatherTick(state); // chronicles storms exactly once
    save();
    if (wx.kind !== lastWxKind) updateWeatherAudio(wx.kind);
    if (!openModal && (wx.kind !== lastWxKind || !selected)) render();
  }, 30000);

  /* ---------- boot ---------- */

  boot();
  resetCam();
  render();
  announceNews(bootNews);

  // A browser can lose its memory; a file cannot. When a world has real
  // history and hasn't been preserved lately, say so — once, gently.
  setTimeout(function () {
    if (state.clock > 60 && (!state.lastPreserve || vnow() - state.lastPreserve > 24 * 3600 * 1000)) {
      toast('This world has history worth keeping. Press Preserve — the file is the only copy that can never be lost.');
    }
  }, 9000);
})();
