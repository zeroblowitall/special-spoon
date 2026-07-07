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
    W.ensureKith(state);   // worlds preserved before the kith existed get theirs
    W.advanceGrowth(state);
    save();
  }

  /* ---------- ephemeral UI state ---------- */

  var selected = null;   // { type: 'plant'|'kith', id: '...' } | null
  var openModal = null;  // 'merge' | 'chronicle' | 'about' | null

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
    svgParts.push('<rect x="0" y="470" width="1000" height="530" fill="url(#ground)"/>');
    var hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      svgParts.push('<circle cx="840" cy="110" r="34" fill="#f4f1de" opacity="0.9"/>' +
        '<circle cx="826" cy="102" r="30" fill="' + sky[0] + '"/>');
    } else {
      svgParts.push('<circle cx="840" cy="110" r="40" fill="#ffd166" opacity="0.85"/>');
    }

    plants.forEach(function (p) { svgParts.push(drawPlant(p)); });
    svgParts.push('<g id="kith-layer">' + drawAllKith() + '</g>');

    stage.innerHTML =
      '<svg id="world" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" role="img" aria-label="The garden">' +
      svgParts.join('') + '</svg>' +
      topbarHTML() +
      panelHTML() +
      modalHTML() +
      '<div id="toast"></div>';

    wireEvents();
  }

  /* ---------- plants (unchanged visual language) ---------- */

  function drawPlant(p) {
    var g = p.genome;
    var pos = toScreen(p.x, p.y);
    var stage01 = Math.max(0.08, p.growth);
    var h = g.height * stage01 * (0.9 + (p.y - 0.55) * 1.1);
    var stemColor = 'hsl(' + ((g.hue + 90) % 360) + ', 35%, 32%)';
    var petal = 'hsl(' + g.hue + ', 68%, 62%)';
    var center = 'hsl(' + ((g.hue + 40) % 360) + ', 80%, 55%)';
    var sel = selected && selected.type === 'plant' && selected.id === p.id;
    var parts = [];

    parts.push('<path d="M0 0 Q 6 ' + (-h * 0.5) + ' 0 ' + (-h) + '" stroke="' + stemColor + '" stroke-width="' + (3 + stage01 * 2) + '" fill="none" stroke-linecap="round"/>');

    var leafRng = W.mulberry32(W.hash32(p.id));
    for (var b = 0; b < g.branches; b++) {
      var frac = 0.25 + (b / g.branches) * 0.55;
      if (frac > stage01 + 0.15) break;
      var ly = -h * frac;
      var side = b % 2 === 0 ? 1 : -1;
      var len = 16 * g.leaf * stage01 * (0.7 + leafRng() * 0.6);
      parts.push('<path d="M0 ' + ly + ' q ' + (side * len) + ' ' + (-len * 0.35) + ' ' + (side * len * 1.6) + ' ' + (len * 0.15) +
        ' q ' + (-side * len * 0.8) + ' ' + (len * 0.4) + ' ' + (-side * len * 1.6) + ' ' + (-len * 0.15) + ' Z" fill="' + stemColor + '" opacity="0.9"/>');
    }

    if (p.growth > 0.55) {
      var bloom = Math.min(1, (p.growth - 0.55) / 0.45);
      var r = (5 + g.petals * 0.9) * bloom;
      var petals = [];
      for (var i = 0; i < g.petals; i++) {
        var ang = (i / g.petals) * Math.PI * 2;
        petals.push('<ellipse cx="' + (Math.cos(ang) * r).toFixed(1) + '" cy="' + (-h + Math.sin(ang) * r).toFixed(1) +
          '" rx="' + (r * 0.75).toFixed(1) + '" ry="' + (r * 0.45).toFixed(1) +
          '" fill="' + petal + '" transform="rotate(' + (ang * 180 / Math.PI).toFixed(0) + ' ' + (Math.cos(ang) * r).toFixed(1) + ' ' + (-h + Math.sin(ang) * r).toFixed(1) + ')"/>');
      }
      parts.push('<g opacity="' + (0.6 + bloom * 0.4) + '">' + petals.join('') + '<circle cx="0" cy="' + -h + '" r="' + (r * 0.55) + '" fill="' + center + '"/></g>');
    } else if (p.growth < 0.2) {
      parts.push('<circle cx="0" cy="' + (-h) + '" r="3.5" fill="' + petal + '"/>');
    }

    var label = p.name ? escapeHtml(p.name) : '';
    var labelSvg = label ? '<text class="plant-label" x="0" y="16">' + label + '</text>' : '';
    var halo = sel ? '<circle cx="0" cy="0" r="14" fill="none" stroke="#ffd166" stroke-width="2" opacity="0.9"/>' : '';

    return '<g class="plant-group' + (sel ? ' selected' : '') + '" data-plant="' + p.id + '" transform="translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')">' +
      '<ellipse cx="0" cy="2" rx="14" ry="4" fill="rgba(0,0,0,0.25)"/>' + halo +
      '<g class="sway" style="animation-delay:-' + (W.hash32(p.id) % 6000) + 'ms">' + parts.join('') + '</g>' +
      labelSvg + '</g>';
  }

  /* ---------- kith ---------- */

  function drawAllKith() {
    var now = Date.now();
    return Object.keys(state.kith).map(function (id) { return state.kith[id]; })
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
      '</g></g>' + labelSvg + '</g>';
  }

  // Between full renders, glide the kith to their new positions cheaply.
  function updateKithLayer() {
    var layer = document.getElementById('kith-layer');
    if (!layer) return;
    var now = Date.now();
    var missing = false;
    Object.keys(state.kith).forEach(function (id) {
      var node = layer.querySelector('[data-kith="' + id + '"]');
      if (!node) { missing = true; return; }
      var k = state.kith[id];
      var pos = toScreen(k.x, k.y);
      node.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')');
    });
    if (missing || layer.querySelectorAll('.kith-group').length !== Object.keys(state.kith).length) {
      render(); // population changed — rebuild properly
    }
  }

  /* ---------- chrome ---------- */

  function topbarHTML() {
    var gen = state.lineage.length > 0
      ? ' <span class="gen">· woven from ' + (state.lineage.length + 1) + ' worlds</span>' : '';
    return '<div id="topbar">' +
      '<button id="world-name" title="Rename this world">' + escapeHtml(state.name) + gen + '</button>' +
      '<div class="bar-actions">' +
      '<button class="btn primary" data-act="plant">Plant a seed</button>' +
      '<button class="btn" data-act="merge">Merge worlds…</button>' +
      '<button class="btn" data-act="chronicle">Chronicle</button>' +
      '<button class="btn" data-act="preserve">Preserve</button>' +
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
    return '<div id="panel">' +
      '<h2>' + escapeHtml(p.name || 'Unnamed ' + p.species) + '</h2>' +
      '<div class="species">' + escapeHtml(p.species) + (p.origin === 'merge' ? ' · hybrid' : '') + '</div>' +
      '<div class="meta">' + ageText + ' · ' + stageText + ' · ' + Math.round(p.growth * 100) + '% grown</div>' +
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
    var mood = k.act === 'eat' ? 'sipping nectar' : k.act === 'rest' ? 'dozing' :
      k.energy < 0.3 ? 'hungry' : k.energy < 0.55 ? 'peckish' : 'content';
    var emissary = state.emissary === k.id;
    var mergeNote = k.bornOfMerge
      ? '<div class="hybrid-note">✦ Born at the meeting stone when <strong>' + escapeHtml(k.bornOfMerge.worlds[0]) +
        '</strong> met <strong>' + escapeHtml(k.bornOfMerge.worlds[1]) + '</strong> — child of the emissaries ' +
        escapeHtml(k.bornOfMerge.parents[0]) + ' and ' + escapeHtml(k.bornOfMerge.parents[1]) + '.</div>'
      : '';
    var emissaryNote = emissary
      ? '<div class="hybrid-note">✦ Your emissary. When worlds merge, ' + escapeHtml(W.kithLabel(k)) + ' will lead the meeting.</div>'
      : '';
    return '<div id="panel">' +
      '<h2>' + escapeHtml(k.name || k.given) + '</h2>' +
      '<div class="species">a ' + stage + ' kith' + (k.name ? ' · called ' + escapeHtml(k.given) + ' by its kin' : '') + '</div>' +
      '<div class="meta">' + ageText + ' · ' + mood + '</div>' +
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
        } else if (act === 'merge' || act === 'chronicle' || act === 'about') {
          openModal = act; render();
        } else if (act === 'close-modal') {
          openModal = null; render();
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
    W.kithTick(state, KITH_TICK_MS / 1000);
    if (!openModal) updateKithLayer();
  }, KITH_TICK_MS);

  // The world endures: growth advances and is saved twice a minute.
  setInterval(function () {
    W.advanceGrowth(state);
    save();
    if (!openModal && !selected) render();
  }, 30000);

  /* ---------- boot ---------- */

  boot();
  render();
})();
