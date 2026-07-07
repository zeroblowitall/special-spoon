/* Driftgarden — engine.
 * A living world in a single file. Vanilla JavaScript, zero dependencies,
 * runs from file:// with no network. The world state lives inside the file
 * itself (window.DRIFT_STATE); "Preserve" rewrites the whole file with the
 * current world embedded. Two files merge losslessly and deterministically.
 */
(function () {
  'use strict';

  var GROW_HOURS = 36;          // hours from seed to full bloom at rate 1
  var WATER_BOOST = 0.06;       // growth added by one watering
  var WATER_COOLDOWN = 60 * 60 * 1000; // one watering per plant per hour
  var STORE_PREFIX = 'driftgarden.';

  /* ---------- deterministic randomness ---------- */

  function hash32(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomId() {
    // Non-deterministic on purpose: identity must be unique across the world.
    var bytes = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    var s = '';
    for (var j = 0; j < 8; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
    return s;
  }

  /* ---------- names ---------- */

  var WORLD_A = ['Quiet', 'Amber', 'Drifting', 'Mossy', 'Silver', 'Golden', 'Windward', 'Hidden', 'Waking', 'Evening', 'Early', 'Wandering', 'Bright', 'Northern', 'Sleepy'];
  var WORLD_B = ['Hollow', 'Meadow', 'Reach', 'Terrace', 'Vale', 'Acre', 'Glen', 'Commons', 'Slope', 'Garden', 'Field', 'Bank', 'Clearing', 'Rise', 'Patch'];
  var SPECIES_A = ['Lumen', 'Vesper', 'Thistle', 'Fen', 'Aster', 'Bell', 'Clove', 'Ember', 'Sorrel', 'Rune', 'Moon', 'Paper', 'Star', 'Frost', 'Honey'];
  var SPECIES_B = ['wort', 'bloom', 'cap', 'reed', 'fern', 'lace', 'plume', 'tuft', 'vine', 'cup', 'spire', 'brush', 'quill', 'drop', 'crest'];

  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function makeWorldName(rng) { return pick(rng, WORLD_A) + ' ' + pick(rng, WORLD_B); }
  function makeSpeciesName(rng) { return pick(rng, SPECIES_A) + pick(rng, SPECIES_B); }

  /* ---------- state ---------- */

  var state = null;

  function bumpClock() { state.clock += 1; return state.clock; }

  function chronicle(kind, text) {
    state.chronicle.push({
      id: randomId(),
      t: bumpClock(),
      at: Date.now(),
      world: state.id,
      kind: kind,
      text: text
    });
  }

  function newGenome(rng) {
    return {
      hue: Math.floor(rng() * 360),
      height: 70 + Math.floor(rng() * 90),
      branches: 2 + Math.floor(rng() * 4),
      petals: 4 + Math.floor(rng() * 6),
      leaf: 0.6 + rng() * 0.9,
      rate: 0.7 + rng() * 0.7
    };
  }

  function crossGenome(rng, a, b) {
    var child = {};
    ['hue', 'height', 'branches', 'petals', 'leaf', 'rate'].forEach(function (gene) {
      child[gene] = rng() < 0.5 ? a[gene] : b[gene];
      if (rng() < 0.3) { // mutation
        var wiggle = 1 + (rng() - 0.5) * 0.3;
        child[gene] = typeof child[gene] === 'number' ? child[gene] * wiggle : child[gene];
      }
    });
    child.hue = ((Math.round(child.hue) % 360) + 360) % 360;
    child.height = Math.max(50, Math.min(180, Math.round(child.height)));
    child.branches = Math.max(2, Math.min(6, Math.round(child.branches)));
    child.petals = Math.max(4, Math.min(10, Math.round(child.petals)));
    return child;
  }

  function newWorld() {
    var id = randomId();
    var rng = mulberry32(hash32(id));
    var world = {
      format: 'driftgarden/1',
      id: id,
      name: makeWorldName(rng),
      born: Date.now(),
      clock: 0,
      plants: {},
      chronicle: [],
      lineage: [],   // ids+names of every world ever merged into this one
      merges: 0
    };
    state = world;
    chronicle('born', 'The world ' + world.name + ' came into being.');
    return world;
  }

  /* ---------- persistence ---------- */

  function save() {
    state.touched = Date.now();
    try {
      localStorage.setItem(STORE_PREFIX + state.id, JSON.stringify(state));
    } catch (e) { /* private mode etc. — the Preserve button still works */ }
  }

  function boot() {
    var embedded = window.DRIFT_STATE;
    if (embedded && embedded.format === 'driftgarden/1') {
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
          if (looksLikeWorld(world) && (!best || (world.touched || 0) > (best.touched || 0))) {
            best = world;
          }
        }
        if (best) state = best;
      } catch (e) { /* corrupted entry — start fresh */ }
      if (!state) newWorld();
    }
    advanceGrowth();
    save();
  }

  /* ---------- simulation ---------- */

  function advanceGrowth() {
    var now = Date.now();
    Object.keys(state.plants).forEach(function (id) {
      var p = state.plants[id];
      if (p.growth >= 1) { p.tick = now; return; }
      var hours = Math.max(0, (now - (p.tick || p.planted)) / 3600000);
      p.growth = Math.min(1, p.growth + (hours / GROW_HOURS) * p.genome.rate);
      p.tick = now;
    });
  }

  /* ---------- actions ---------- */

  function plantSeed() {
    var rng = mulberry32(hash32(state.id + ':' + (state.clock + 1)));
    var id = randomId();
    var plant = {
      id: id,
      species: makeSpeciesName(rng),
      name: null,
      genome: newGenome(rng),
      x: 0.06 + rng() * 0.88,   // fraction of field width
      y: 0.55 + rng() * 0.4,    // fraction of field height (lower = nearer)
      planted: Date.now(),
      tick: Date.now(),
      growth: 0,
      watered: 0,
      origin: state.id,
      bornOfMerge: null,
      u: bumpClock()
    };
    state.plants[id] = plant;
    chronicle('plant', 'A ' + plant.species + ' seed was planted.');
    save();
    return plant;
  }

  function waterPlant(id) {
    var p = state.plants[id];
    if (!p) return false;
    var now = Date.now();
    if (p.watered && now - p.watered < WATER_COOLDOWN) return false;
    advanceGrowth();
    p.watered = now;
    p.growth = Math.min(1, p.growth + WATER_BOOST);
    p.u = bumpClock();
    save();
    return true;
  }

  function namePlant(id, name) {
    var p = state.plants[id];
    if (!p || !name) return;
    p.name = name.slice(0, 40);
    p.u = bumpClock();
    chronicle('name', 'The ' + p.species + ' was named “' + p.name + '”.');
    save();
  }

  function renameWorld(name) {
    if (!name) return;
    var old = state.name;
    state.name = name.slice(0, 48);
    chronicle('name', 'The world ' + old + ' took a new name: ' + state.name + '.');
    save();
  }

  /* ---------- the merge ---------- */

  function looksLikeWorld(obj) {
    return obj && obj.format === 'driftgarden/1' && obj.id &&
      typeof obj.clock === 'number' && obj.plants && Array.isArray(obj.chronicle);
  }

  function mergeWorlds(other) {
    if (!looksLikeWorld(other)) throw new Error('not a world');
    if (other.id === state.id && other.clock <= state.clock) {
      return { same: true };
    }
    advanceGrowth();

    var before = Object.keys(state.plants).length;
    // Each side's champion must be chosen from its own garden as it was
    // BEFORE the union, or both parents resolve to the same plant.
    var ourParent = proudestPlant(state.plants);
    var theirParent = proudestPlant(other.plants);
    // A birth happens only the FIRST time two worlds meet. If either side
    // already carries the other in its lineage, this is a reunion: weave in
    // whatever is new, but no second hybrid, no duplicate history.
    var weKnowThem = state.lineage.some(function (l) { return l.id === other.id; });
    var theyKnowUs = (other.lineage || []).some(function (l) { return l.id === state.id; });
    var firstMeeting = other.id !== state.id && !weKnowThem && !theyKnowUs;

    // Plants: union by id; if both know a plant, the most recent tending wins.
    Object.keys(other.plants).forEach(function (id) {
      var theirs = other.plants[id];
      var ours = state.plants[id];
      if (!ours || (theirs.u || 0) > (ours.u || 0) ||
          ((theirs.u || 0) === (ours.u || 0) && other.id > state.id)) {
        state.plants[id] = theirs;
      }
    });

    // Chronicle: union by entry id, ordered by (logical time, world id).
    var seen = {};
    state.chronicle.forEach(function (e) { seen[e.id] = true; });
    other.chronicle.forEach(function (e) { if (!seen[e.id]) state.chronicle.push(e); });
    state.chronicle.sort(function (a, b) {
      return a.t !== b.t ? a.t - b.t : (a.world < b.world ? -1 : a.world > b.world ? 1 : 0);
    });

    // Lineage: remember everyone.
    var lineageSeen = {};
    state.lineage.forEach(function (l) { lineageSeen[l.id] = true; });
    (other.lineage || []).concat([{ id: other.id, name: other.name }]).forEach(function (l) {
      if (!lineageSeen[l.id] && l.id !== state.id) {
        state.lineage.push(l);
        lineageSeen[l.id] = true;
      }
    });

    state.clock = Math.max(state.clock, other.clock);
    var sameWorld = other.id === state.id;
    var hybrid = null;

    if (firstMeeting) {
      state.merges += 1;

      // The meeting creates life: one hybrid, deterministic from both worlds,
      // crossed from the proudest (most grown, oldest) plant of each side.
      // Everything the rng touches must be identical no matter which copy
      // performs the merge, so parents are taken in a canonical order.
      var rng = mulberry32(hash32([state.id, other.id].sort().join('+') + ':' + state.clock));
      if (ourParent && theirParent && ourParent.id !== theirParent.id) {
        var parents = [ourParent, theirParent].sort(function (a, b) {
          return a.id < b.id ? -1 : 1;
        });
        hybrid = {
          id: [state.id, other.id].sort().join('') + '-' + state.clock, // same in both merges
          species: makeSpeciesName(rng),
          name: null,
          genome: crossGenome(rng, parents[0].genome, parents[1].genome),
          x: 0.2 + rng() * 0.6,
          y: 0.6 + rng() * 0.3,
          planted: Date.now(),
          tick: Date.now(),
          growth: 0.15,
          watered: 0,
          origin: 'merge',
          bornOfMerge: {
            worlds: [state.name, other.name],
            parents: [plantLabel(ourParent), plantLabel(theirParent)]
          },
          u: bumpClock()
        };
        state.plants[hybrid.id] = hybrid;
      }

      chronicle('merge', 'The worlds ' + state.name + ' and ' + other.name + ' met, and became one.');
      if (hybrid) {
        chronicle('born', 'From the meeting, a new species was born: the ' + hybrid.species +
          ' — child of ' + hybrid.bornOfMerge.parents[0] + ' and ' + hybrid.bornOfMerge.parents[1] + '.');
      }
    }

    save();
    return {
      same: sameWorld,
      firstMeeting: firstMeeting,
      gained: Object.keys(state.plants).length - before,
      hybrid: hybrid,
      otherName: other.name
    };
  }

  function proudestPlant(plants) {
    var best = null;
    Object.keys(plants).sort().forEach(function (id) {
      var p = plants[id];
      if (!best ||
          p.growth > best.growth ||
          (p.growth === best.growth && p.planted < best.planted)) best = p;
    });
    return best;
  }

  function plantLabel(p) {
    return p.name ? p.name + ' the ' + p.species : 'a ' + p.species;
  }

  /* ---------- the self-writing file ---------- */

  function selfHTML() {
    var style = document.getElementById('dg-style').textContent;
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
      '<script id="dg-app">' + app + '<\/script>\n' +
      '</body>\n</html>\n';
  }

  function preserveWorld() {
    advanceGrowth();
    chronicle('preserve', 'The world was preserved and set free as a file.');
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

  /* ---------- importing other worlds ---------- */

  function extractWorld(text) {
    text = String(text).trim();
    if (!text) return null;
    // A pasted bare world (JSON)?
    if (text[0] === '{') {
      try {
        var direct = JSON.parse(text);
        if (looksLikeWorld(direct)) return direct;
      } catch (e) { /* keep trying */ }
    }
    // A whole Driftgarden HTML file?
    var marker = 'window.DRIFT_STATE = ';
    var start = text.indexOf(marker);
    if (start === -1) return null;
    start += marker.length;
    var end = text.indexOf(';<' + '/script>', start);
    if (end === -1) return null;
    try {
      var parsed = JSON.parse(text.slice(start, end));
      return looksLikeWorld(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- rendering ---------- */

  var stage = document.getElementById('stage');
  var selectedPlant = null;
  var openModal = null; // 'merge' | 'chronicle' | 'about' | null

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function skyColors() {
    var h = new Date().getHours();
    if (h >= 21 || h < 5) return ['#0b1026', '#1b2333', '#141d16'];   // night
    if (h < 8) return ['#2b3a5c', '#b57967', '#233225'];              // dawn
    if (h < 17) return ['#7db4d8', '#cfe6d8', '#2e4630'];             // day
    if (h < 21) return ['#3f4d78', '#d99a6c', '#26381f'];             // dusk
    return ['#7db4d8', '#cfe6d8', '#2e4630'];
  }

  function render() {
    var sky = skyColors();
    var plants = Object.keys(state.plants).map(function (id) { return state.plants[id]; });
    plants.sort(function (a, b) { return a.y - b.y; }); // nearer plants drawn last

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

    stage.innerHTML =
      '<svg id="world" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" role="img" aria-label="The garden">' +
      svgParts.join('') + '</svg>' +
      topbarHTML() +
      (selectedPlant && state.plants[selectedPlant] ? panelHTML(state.plants[selectedPlant]) : '') +
      modalHTML() +
      '<div id="toast"></div>';

    wireEvents();
  }

  function drawPlant(p) {
    var g = p.genome;
    var x = 40 + p.x * 920;
    var groundY = 470 + (p.y - 0.55) / 0.4 * 480;
    var stage01 = Math.max(0.08, p.growth);
    var h = g.height * stage01 * (0.9 + (p.y - 0.55) * 1.1); // nearer = larger
    var stemColor = 'hsl(' + ((g.hue + 90) % 360) + ', 35%, 32%)';
    var petal = 'hsl(' + g.hue + ', 68%, 62%)';
    var center = 'hsl(' + ((g.hue + 40) % 360) + ', 80%, 55%)';
    var sel = selectedPlant === p.id;
    var parts = [];

    parts.push('<path d="M0 0 Q ' + (6) + ' ' + (-h * 0.5) + ' 0 ' + (-h) + '" stroke="' + stemColor + '" stroke-width="' + (3 + stage01 * 2) + '" fill="none" stroke-linecap="round"/>');

    // leaves along the stem
    var leafRng = mulberry32(hash32(p.id));
    for (var b = 0; b < g.branches; b++) {
      var frac = 0.25 + (b / g.branches) * 0.55;
      if (frac > stage01 + 0.15) break;
      var ly = -h * frac;
      var side = b % 2 === 0 ? 1 : -1;
      var len = 16 * g.leaf * stage01 * (0.7 + leafRng() * 0.6);
      parts.push('<path d="M0 ' + ly + ' q ' + (side * len) + ' ' + (-len * 0.35) + ' ' + (side * len * 1.6) + ' ' + (len * 0.15) +
        ' q ' + (-side * len * 0.8) + ' ' + (len * 0.4) + ' ' + (-side * len * 1.6) + ' ' + (-len * 0.15) + ' Z" fill="' + stemColor + '" opacity="0.9"/>');
    }

    // flower when blooming
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

    return '<g class="plant-group' + (sel ? ' selected' : '') + '" data-plant="' + p.id + '" transform="translate(' + x.toFixed(1) + ' ' + groundY.toFixed(1) + ')">' +
      '<ellipse cx="0" cy="2" rx="14" ry="4" fill="rgba(0,0,0,0.25)"/>' + halo +
      '<g class="sway" style="animation-delay:-' + (hash32(p.id) % 6000) + 'ms">' + parts.join('') + '</g>' +
      labelSvg + '</g>';
  }

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

  function panelHTML(p) {
    var age = Math.max(1, Math.round((Date.now() - p.planted) / 3600000));
    var ageText = age < 48 ? age + 'h old' : Math.round(age / 24) + ' days old';
    var stageText = p.growth >= 1 ? 'in full bloom' : p.growth > 0.55 ? 'blooming' : p.growth > 0.2 ? 'growing' : 'a seedling';
    var canWater = !p.watered || Date.now() - p.watered >= WATER_COOLDOWN;
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

  function modalHTML() {
    if (!openModal) return '';
    var inner = '';
    if (openModal === 'merge') {
      inner = '<h2>Merge worlds</h2>' +
        '<p class="muted">When two Driftgarden files meet, they become one world. Every plant and every line of history from both survives — and the meeting gives birth to a hybrid species neither world could have grown alone.</p>' +
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
        '<p><strong>Tend it.</strong> Plant seeds, water them, name what grows. The garden keeps growing in real time, even while the file sleeps.</p>' +
        '<p><strong>Set it free.</strong> Press <em>Preserve</em> and the game writes itself into a new file with your world inside. Give copies to people. Their copies will drift — different plants, different names, different histories.</p>' +
        '<p><strong>Reunite it.</strong> When two copies meet again, merge them. Nothing is ever lost in a merge, and every meeting gives birth to a new hybrid species.</p>' +
        '<p class="muted">Your world stays on your device. Nothing is ever sent anywhere. Free to copy and share — that is the point. Source: github.com/zeroblowitall/special-spoon</p>' +
        '<div class="row"><button class="btn" data-act="close-modal">Close</button></div>';
    }
    return '<div class="modal-veil" id="veil"><div class="modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
  }

  /* ---------- events ---------- */

  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  function handleIncomingWorld(text) {
    var world = extractWorld(text);
    if (!world) { toast('That didn’t look like a Driftgarden world.'); return; }
    try {
      var result = mergeWorlds(world);
      openModal = null;
      selectedPlant = result.hybrid ? result.hybrid.id : selectedPlant;
      render();
      var flash = document.createElement('div');
      flash.className = 'merge-flash';
      stage.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 1700);
      if (result.same) {
        toast(result.gained > 0 ? 'Same world, newer memories — ' + result.gained + ' new arrivals woven in.' : 'These are the same world — nothing new to weave in.');
      } else if (result.hybrid) {
        toast('Worlds merged. A new species was born: the ' + result.hybrid.species + '!');
      } else if (!result.firstMeeting) {
        toast('A reunion with ' + result.otherName + (result.gained > 0 ? ' — ' + result.gained + ' new arrivals woven in.' : ' — nothing new since you last met.'));
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
        selectedPlant = node.getAttribute('data-plant');
        render();
      });
    });

    stage.querySelectorAll('[data-act]').forEach(function (node) {
      node.addEventListener('click', function () {
        var act = node.getAttribute('data-act');
        if (act === 'plant') {
          var p = plantSeed();
          selectedPlant = p.id;
          render();
          toast('A ' + p.species + ' seed settles into the soil.');
        } else if (act === 'water') {
          if (waterPlant(selectedPlant)) { render(); toast('Watered. You can almost hear it growing.'); }
        } else if (act === 'name-plant') {
          var name = prompt('Name this ' + state.plants[selectedPlant].species + ':');
          if (name) { namePlant(selectedPlant, name.trim()); render(); }
        } else if (act === 'close-panel') {
          selectedPlant = null; render();
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
      if (name && name.trim() && name.trim() !== state.name) { renameWorld(name.trim()); render(); }
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

  // Whole-window drop: drag another world onto this one, anywhere, any time.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFileForMerge(e.dataTransfer.files[0]);
    }
  });

  /* ---------- heartbeat ---------- */

  setInterval(function () {
    advanceGrowth();
    save();
    if (!openModal) render(); // keep growth visible; don't disturb open dialogs
  }, 30000);

  /* ---------- boot ---------- */

  boot();
  render();
})();
