/* Driftgarden — interface.
 * Everything the player sees and touches. All world truth lives in
 * engine/world.js (the DriftWorld module); this file only renders it,
 * persists it, and turns clicks into world events.
 */
(function () {
  'use strict';

  var W = window.DriftWorld;
  var STORE_PREFIX = 'driftgarden.';
  var KITH_TICK_MS = 2000;

  /* ---------- persistence & boot ---------- */

  var state = null;

  function save() {
    state.touched = Date.now();
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
  var openModal = null;  // 'merge' | 'chronicle' | 'about' | 'worlds' | null
  var lastWxKind = null; // re-render when the weather turns

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

  /* ---------- the land, painted ---------- */

  var BIOME_PAINT = {
    deep: [35, 64, 94],
    shallows: [46, 90, 117],
    shore: [183, 162, 118],
    meadow: [74, 107, 58],
    rock: [109, 106, 99],
    peak: [143, 141, 136]
  };

  var terrainImageCache = {};

  function terrainDataURL(worldId) {
    if (terrainImageCache[worldId]) return terrainImageCache[worldId];
    var terrain = W.makeTerrain(worldId);
    var canvas = document.createElement('canvas');
    var CW = 480, CH = 256;
    canvas.width = CW; canvas.height = CH;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(CW, CH);
    // Screen consistency: image spans y 470..1000, i.e. world y 0.55..~0.99.
    var ySpan = 530 / 1200;
    for (var py = 0; py < CH; py++) {
      var wy = 0.55 + (py / CH) * ySpan;
      for (var px = 0; px < CW; px++) {
        var wx = px / CW;
        var biome = W.biomeAt(terrain, wx, wy);
        var base = BIOME_PAINT[biome];
        // gentle height shading + per-pixel grain
        var h = 0;
        var cell = terrain.heights[
          Math.max(0, Math.min(terrain.rows - 1, Math.floor((wy - 0.55) / 0.45 * terrain.rows)))][
          Math.max(0, Math.min(terrain.cols - 1, Math.floor(wx * terrain.cols)))];
        h = (cell - 0.5) * 34;
        var grain = ((W.hash32(worldId) ^ (px * 7919 + py * 104729)) % 13) - 6;
        var i = (py * CW + px) * 4;
        img.data[i] = Math.max(0, Math.min(255, base[0] + h + grain));
        img.data[i + 1] = Math.max(0, Math.min(255, base[1] + h + grain));
        img.data[i + 2] = Math.max(0, Math.min(255, base[2] + h + grain));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var url = canvas.toDataURL('image/png');
    terrainImageCache[worldId] = url;
    return url;
  }

  function skyColors() {
    var h = new Date().getHours();
    if (h >= 21 || h < 5) return ['#0b1026', '#1b2333', '#141d16'];
    if (h < 8) return ['#2b3a5c', '#b57967', '#233225'];
    if (h < 17) return ['#7db4d8', '#cfe6d8', '#2e4630'];
    if (h < 21) return ['#3f4d78', '#d99a6c', '#26381f'];
    return ['#7db4d8', '#cfe6d8', '#2e4630'];
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
    svgParts.push('<rect x="0" y="0" width="1000" height="520" fill="url(#sky)"/>');
    svgParts.push('<image x="0" y="470" width="1000" height="530" preserveAspectRatio="none" href="' + terrainDataURL(state.id) + '"/>');
    svgParts.push('<rect x="0" y="470" width="1000" height="530" fill="url(#ground)" opacity="0.35"/>');
    var hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      svgParts.push('<circle cx="840" cy="110" r="34" fill="#f4f1de" opacity="0.9"/>' +
        '<circle cx="826" cy="102" r="30" fill="' + sky[0] + '"/>');
    } else {
      svgParts.push('<circle cx="840" cy="110" r="40" fill="#ffd166" opacity="0.85"/>');
    }

    plants.forEach(function (p) { svgParts.push(drawPlant(p)); });
    svgParts.push('<g id="kith-layer">' + drawAllKith() + '</g>');

    // weather, painted over everything
    var wx = W.weatherAt(state.id, Date.now());
    lastWxKind = wx.kind;
    if (wx.kind === 'rain' || wx.kind === 'storm') {
      var drops = [];
      var rainRng = W.mulberry32(W.hash32(state.id + ':raindrops'));
      var dropCount = wx.kind === 'storm' ? 46 : 28;
      for (var d = 0; d < dropCount; d++) {
        var rx = rainRng() * 1000;
        drops.push('<line class="raindrop" x1="' + rx.toFixed(0) + '" y1="-40" x2="' + (rx - 8).toFixed(0) +
          '" y2="-12" style="animation-delay:-' + (rainRng() * 1.4).toFixed(2) + 's;animation-duration:' +
          (0.9 + rainRng() * 0.6).toFixed(2) + 's"/>');
      }
      svgParts.push('<g class="rain-layer">' + drops.join('') + '</g>');
    }
    if (wx.kind === 'mist') {
      svgParts.push('<g class="mist-layer">' +
        '<ellipse class="mist m1" cx="300" cy="600" rx="340" ry="70"/>' +
        '<ellipse class="mist m2" cx="700" cy="780" rx="420" ry="90"/>' +
        '<ellipse class="mist m3" cx="480" cy="920" rx="380" ry="80"/></g>');
    }
    if (wx.kind === 'storm') {
      svgParts.push('<rect x="0" y="0" width="1000" height="1000" fill="#0a0f1e" opacity="0.28" pointer-events="none"/>' +
        '<rect class="lightning" x="0" y="0" width="1000" height="1000" fill="#eef4ff" pointer-events="none"/>');
    }

    stage.innerHTML =
      '<svg id="world" class="wx-' + wx.kind + '" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" role="img" aria-label="The garden">' +
      svgParts.join('') + '</svg>' +
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

  /* ---------- kith ---------- */

  function drawAllKith() {
    var now = Date.now();
    return W.livingKith(state)
      .sort(function (a, b) { return a.y - b.y; })
      .map(function (k) { return drawKith(k, now); })
      .join('');
  }

  function drawKith(k, now) {
    var g = k.genome;
    var pos = toScreen(k.x, k.y);
    var stage = W.kithStage(k, now);
    var scale = g.size * (stage === 'young' ? 0.65 : 1) * (0.85 + (k.y - 0.55) * 0.9);
    var sat = stage === 'elder' ? 30 : 60;
    var body = 'hsl(' + g.hue + ', ' + sat + '%, 58%)';
    var belly = 'hsl(' + g.hue + ', ' + sat + '%, 74%)';
    var sel = selected && selected.type === 'kith' && selected.id === k.id;
    var emissary = state.emissary === k.id;

    var ears = '';
    if (g.ears === 1) {
      ears = '<circle cx="-6" cy="-16" r="3" fill="' + body + '"/><circle cx="6" cy="-16" r="3" fill="' + body + '"/>';
    } else if (g.ears === 2) {
      ears = '<ellipse cx="-5" cy="-19" rx="2.4" ry="6" fill="' + body + '"/><ellipse cx="5" cy="-19" rx="2.4" ry="6" fill="' + body + '"/>';
    }

    var eyes = k.act === 'rest'
      ? '<path d="M-4.5 -9 q 2 1.6 4 0" stroke="#222" stroke-width="1" fill="none"/><path d="M0.5 -9 q 2 1.6 4 0" stroke="#222" stroke-width="1" fill="none"/>'
      : '<circle cx="-3" cy="-9" r="1.8" fill="#fff"/><circle cx="-2.6" cy="-9" r="1" fill="#222"/>' +
        '<circle cx="3" cy="-9" r="1.8" fill="#fff"/><circle cx="3.4" cy="-9" r="1" fill="#222"/>';

    var act = k.act === 'eat'
      ? '<text x="9" y="-14" font-size="9" fill="#ffd166">✿</text>'
      : '';

    var label = k.name || (emissary ? k.given : '');
    var labelSvg = label ? '<text class="plant-label" x="0" y="14">' + escapeHtml(label) + '</text>' : '';
    var saying = (k.saying && k.sayingUntil && now < k.sayingUntil) ? escapeHtml(k.saying) : '';
    var speechSvg = '<text class="kith-speech" x="0" y="' + (-26 * scale).toFixed(0) + '">' + saying + '</text>';
    var haloSel = sel ? '<circle cx="0" cy="-6" r="16" fill="none" stroke="#ffd166" stroke-width="2" opacity="0.9"/>' : '';
    var haloEmissary = emissary ? '<circle cx="0" cy="-6" r="13" fill="none" stroke="#ffd166" stroke-width="1" stroke-dasharray="2 3" opacity="0.85" class="emissary-ring"/>' : '';

    return '<g class="kith-group' + (sel ? ' selected' : '') + '" data-kith="' + k.id + '" ' +
      'style="transition: transform ' + (KITH_TICK_MS / 1000 + 0.2) + 's linear" ' +
      'transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')">' +
      '<ellipse cx="0" cy="1" rx="9" ry="3" fill="rgba(0,0,0,0.25)"/>' +
      haloEmissary + haloSel +
      '<g class="kith-bob" style="animation-delay:-' + (W.hash32(k.id) % 3000) + 'ms">' +
      '<g transform="scale(' + (scale * k.facing).toFixed(2) + ' ' + scale.toFixed(2) + ')">' +
      ears +
      '<ellipse cx="0" cy="-7" rx="8.5" ry="9" fill="' + body + '"/>' +
      '<ellipse cx="0" cy="-4.5" rx="5" ry="5.2" fill="' + belly + '"/>' +
      eyes + act +
      '<ellipse cx="-3.5" cy="1" rx="2.2" ry="1.6" fill="' + body + '"/>' +
      '<ellipse cx="3.5" cy="1" rx="2.2" ry="1.6" fill="' + body + '"/>' +
      '</g></g>' + labelSvg + speechSvg + '</g>';
  }

  // Between full renders, glide the kith to their new positions cheaply.
  function updateKithLayer() {
    var layer = document.getElementById('kith-layer');
    if (!layer) return;
    var living = W.livingKith(state);
    var missing = false;
    var now = Date.now();
    living.forEach(function (k) {
      var node = layer.querySelector('[data-kith="' + k.id + '"]');
      if (!node) { missing = true; return; }
      var pos = toScreen(k.x, k.y);
      node.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')');
      var speech = node.querySelector('.kith-speech');
      if (speech) speech.textContent = (k.saying && k.sayingUntil && now < k.sayingUntil) ? k.saying : '';
    });
    if (missing || layer.querySelectorAll('.kith-group').length !== living.length) {
      render(); // someone was born, or someone left us — rebuild properly
    }
  }

  /* ---------- chrome ---------- */

  var WX_WORDS = { clear: '', breeze: 'a breeze is up', mist: 'mist on the water', rain: 'rain is falling', storm: 'a storm rages' };

  function topbarHTML() {
    var notes = [];
    if (state.lineage.length > 0) notes.push('woven from ' + (state.lineage.length + 1) + ' worlds');
    if (lastWxKind && WX_WORDS[lastWxKind]) notes.push(WX_WORDS[lastWxKind]);
    var gen = notes.length ? ' <span class="gen">· ' + notes.join(' · ') + '</span>' : '';
    return '<div id="topbar">' +
      '<button id="world-name" title="Rename this world">' + escapeHtml(state.name) + gen + '</button>' +
      '<div class="bar-actions">' +
      '<button class="btn primary" data-act="plant">Plant a seed</button>' +
      '<button class="btn" data-act="merge">Merge worlds…</button>' +
      '<button class="btn" data-act="chronicle">Chronicle</button>' +
      '<button class="btn" data-act="lexicon">Lexicon</button>' +
      '<button class="btn" data-act="preserve">Preserve</button>' +
      '<button class="btn" data-act="worlds" title="Your worlds">⌂</button>' +
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
    var age = Math.max(1, Math.round((Date.now() - p.planted) / 3600000));
    var ageText = age < 48 ? age + 'h old' : Math.round(age / 24) + ' days old';
    var stageText = p.growth >= 1 ? 'in full bloom' : p.growth > 0.55 ? 'blooming' : p.growth > 0.2 ? 'growing' : 'a seedling';
    var canWater = !p.watered || Date.now() - p.watered >= W.WATER_COOLDOWN;
    var hybridNote = p.bornOfMerge
      ? '<div class="hybrid-note">✦ Born when <strong>' + escapeHtml(p.bornOfMerge.worlds[0]) + '</strong> met <strong>' +
        escapeHtml(p.bornOfMerge.worlds[1]) + '</strong> — child of ' + escapeHtml(p.bornOfMerge.parents[0]) +
        ' and ' + escapeHtml(p.bornOfMerge.parents[1]) + '.</div>'
      : '';
    var biome = W.biomeInfo(W.biomeAt(W.makeTerrain(state.id), p.x, p.y)).name;
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
    var now = Date.now();
    var stage = W.kithStage(k, now);
    var days = Math.floor((now - k.born) / 86400000);
    var ageText = days < 1 ? 'born today' : days + (days === 1 ? ' day' : ' days') + ' old';

    if (k.passed) {
      return '<div id="panel">' +
        '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
        '<div class="species">remembered</div>' +
        '<div class="meta">lived ' + Math.max(1, Math.round((k.passed - k.born) / 86400000)) + ' days · fell asleep beneath the soil</div>' +
        (k.bornOfMerge ? '<div class="hybrid-note">✦ Was born of the meeting of ' + escapeHtml(k.bornOfMerge.worlds[0]) + ' and ' + escapeHtml(k.bornOfMerge.worlds[1]) + '.</div>' : '') +
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
    var skillLine = W.knowsOf(k).indexOf('seedkeeping') > -1 ? 'a seed-keeper: it gardens' : null;
    var tastes = Object.keys(k.taste || {});
    var tasteLine = null;
    if (tastes.length) {
      tastes.sort(function (a, b) { return k.taste[b] - k.taste[a]; });
      var fav = tastes[0], worst = tastes[tastes.length - 1];
      if (k.taste[fav] > 0.25) tasteLine = 'has a taste for ' + escapeHtml(fav);
      if (k.taste[worst] < -0.35) tasteLine = (tasteLine ? tasteLine + '; ' : '') + 'can’t abide ' + escapeHtml(worst);
    }
    var mergeNote = k.bornOfMerge
      ? '<div class="hybrid-note">✦ Born at the meeting stone when <strong>' + escapeHtml(k.bornOfMerge.worlds[0]) +
        '</strong> met <strong>' + escapeHtml(k.bornOfMerge.worlds[1]) + '</strong> — child of the emissaries ' +
        escapeHtml(k.bornOfMerge.parents[0]) + ' and ' + escapeHtml(k.bornOfMerge.parents[1]) + '.</div>'
      : '';
    var emissaryNote = emissary
      ? '<div class="hybrid-note">✦ Your emissary. When worlds merge, ' + escapeHtml(W.kithLabel(k)) + ' will lead the meeting.</div>'
      : '';
    var standing = W.biomeInfo(W.biomeAt(W.makeTerrain(state.id), k.x, k.y)).name;
    return '<div id="panel">' +
      '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
      '<div class="species">a ' + stage + ' kith' + (k.name ? ' · called ' + escapeHtml(k.given) + ' by its kin' : '') + '</div>' +
      '<div class="meta">' + ageText + ' · ' + mood + ' · on the ' + standing + '</div>' +
      (tribeLine ? '<div class="meta">' + tribeLine + '</div>' : '') +
      (kinLine ? '<div class="meta">' + kinLine + '</div>' : '') +
      (bondLine ? '<div class="meta">' + bondLine + '</div>' : '') +
      (tasteLine ? '<div class="meta">' + tasteLine + '</div>' : '') +
      (skillLine ? '<div class="meta">' + skillLine + '</div>' : '') +
      mergeNote + emissaryNote +
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
      var entries = state.chronicle.slice().reverse().map(function (e) {
        var d = new Date(e.at);
        var when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        return '<div class="chronicle-entry kind-' + e.kind + '"><span class="when">' + when +
          '</span><span class="what">' + escapeHtml(e.text) + '</span></div>';
      }).join('');
      var lineage = state.lineage.length
        ? '<p class="muted">Woven from: ' + state.lineage.map(function (l) { return escapeHtml(l.name); }).join(', ') + '.</p>'
        : '';
      inner = '<h2>The Chronicle</h2>' + lineage +
        '<div>' + entries + '</div>' +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'lexicon') {
      var tongue = W.worldLexicon(state);
      var concepts = Object.keys(tongue).sort(function (a, b) {
        return tongue[b][0].weight - tongue[a][0].weight;
      });
      var canWhisper = state.emissary && state.kith[state.emissary] && !state.kith[state.emissary].passed &&
        (!state.whispered || Date.now() - state.whispered > 20 * 3600 * 1000);
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
        '<p class="muted">The kith are naming their world. Words are coined in each speaker\'s own voice and spread from mouth to mouth; every world converges on a tongue of its own, and when worlds merge, dialects meet.' +
        (canWhisper ? ' Once a day you may whisper a word to your emissary, and see if it spreads.' : '') + '</p>' +
        (lexRows || '<p class="muted">No words yet — the kith speak when their paths cross. Listen for the small words above their heads.</p>') +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    } else if (openModal === 'worlds') {
      var rows = listStoredWorlds().map(function (entry) {
        var current = entry.id === state.id;
        var when = entry.touched ? new Date(entry.touched).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
        return '<div class="chronicle-entry"><span class="what"><strong>' + escapeHtml(entry.name) + '</strong>' +
          (current ? ' <span class="badge-now">you are here</span>' : '') +
          '<br><span class="muted">' + entry.kith + ' kith · ' + entry.plants + ' plants · last tended ' + when + '</span></span>' +
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
        '<div class="row"><label class="muted" for="nw-temp">The land:</label> ' +
        '<select id="nw-temp">' +
        '<option value="surprise">Surprise me</option>' +
        '<option value="lakeland">Lakeland — water everywhere</option>' +
        '<option value="highlands">Highlands — rock and peaks</option>' +
        '<option value="plains">Plains — broad meadows</option>' +
        '<option value="drylands">Drylands — scarcely a puddle</option>' +
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
        '<p class="muted">Your world stays on your device. Nothing is ever sent anywhere. Free to copy and share — that is the point. Source: github.com/zeroblowitall/special-spoon</p>' +
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
      '<script id="dg-world">' + world + '<\/script>\n' +
      '<script id="dg-app">' + app + '<\/script>\n' +
      '</body>\n</html>\n';
  }

  function preserveWorld() {
    W.advanceGrowth(state);
    W.chronicle(state, 'preserve', 'The world was preserved and set free as a file.');
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
        } else if (act === 'merge' || act === 'chronicle' || act === 'about' || act === 'worlds' || act === 'lexicon') {
          openModal = act; render();
        } else if (act === 'close-modal') {
          openModal = null; render();
        } else if (act === 'new-world') {
          var newName = (document.getElementById('nw-name').value || '').trim();
          var temperament = document.getElementById('nw-temp').value;
          var fresh = W.newWorld({ name: newName || null, temperament: temperament });
          switchToWorld(fresh);
          toast('The world ' + state.name + ' came into being. Three kith are already exploring it.');
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
    var events = W.kithTick(state, KITH_TICK_MS / 1000);
    if (events && events.length > 0) {
      save();
      announceNews(events);
    }
    if (!openModal) updateKithLayer();
  }, KITH_TICK_MS);

  // The world endures: growth advances, skies turn, twice a minute.
  setInterval(function () {
    W.advanceGrowth(state);
    var wx = W.weatherTick(state); // chronicles storms exactly once
    save();
    if (!openModal && (wx.kind !== lastWxKind || !selected)) render();
  }, 30000);

  /* ---------- boot ---------- */

  boot();
  render();
  announceNews(bootNews);
})();
