/* Driftgarden — world logic.
 * Everything that is TRUE about a world lives here: genomes, growth, kith,
 * the chronicle, and the merge. No DOM, no browser APIs — this file runs
 * identically inside the game and inside `node test.js`, which is how the
 * merge's determinism is proven.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DriftWorld = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- environment (injectable for tests) ---------- */

  var env = {
    now: function () { return Date.now(); },
    newId: function () {
      var bytes = new Uint8Array(8);
      var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto :
        (typeof require === 'function' ? require('crypto').webcrypto : null);
      if (c && c.getRandomValues) c.getRandomValues(bytes);
      else for (var i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
      var s = '';
      for (var j = 0; j < 8; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
      return s;
    }
  };

  function setEnv(overrides) {
    if (overrides.now) env.now = overrides.now;
    if (overrides.newId) env.newId = overrides.newId;
  }

  /* ---------- constants ---------- */

  var GROW_HOURS = 36;
  var WATER_BOOST = 0.06;
  var WATER_COOLDOWN = 60 * 60 * 1000;
  var KITH_CAP = 20;
  var FOUNDER_COUNT = 3;
  var ENERGY_DECAY_PER_SEC = 1 / 300;   // peckish after ~2.5 min of watching
  var EAT_SECONDS = 5;
  var KITH_STAGES = [                    // age thresholds in real days
    { name: 'young', until: 1 },
    { name: 'grown', until: 7 },
    { name: 'elder', until: Infinity }
  ];

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

  /* ---------- names ---------- */

  var WORLD_A = ['Quiet', 'Amber', 'Drifting', 'Mossy', 'Silver', 'Golden', 'Windward', 'Hidden', 'Waking', 'Evening', 'Early', 'Wandering', 'Bright', 'Northern', 'Sleepy'];
  var WORLD_B = ['Hollow', 'Meadow', 'Reach', 'Terrace', 'Vale', 'Acre', 'Glen', 'Commons', 'Slope', 'Garden', 'Field', 'Bank', 'Clearing', 'Rise', 'Patch'];
  var SPECIES_A = ['Lumen', 'Vesper', 'Thistle', 'Fen', 'Aster', 'Bell', 'Clove', 'Ember', 'Sorrel', 'Rune', 'Moon', 'Paper', 'Star', 'Frost', 'Honey'];
  var SPECIES_B = ['wort', 'bloom', 'cap', 'reed', 'fern', 'lace', 'plume', 'tuft', 'vine', 'cup', 'spire', 'brush', 'quill', 'drop', 'crest'];
  // Kith names are built from their genome's own syllables — their voice.
  var SYL_OPEN = ['po', 'mi', 'ta', 'lu', 'ke', 'no', 'vi', 'sa', 'ru', 'fe', 'obi', 'ela', 'uma', 'iri', 'osu'];
  var SYL_CLOSE = ['m', 'n', 'l', 'r', 'sh', 'k', '', '', '', ''];

  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function makeWorldName(rng) { return pick(rng, WORLD_A) + ' ' + pick(rng, WORLD_B); }
  function makeSpeciesName(rng) { return pick(rng, SPECIES_A) + pick(rng, SPECIES_B); }

  function makeKithName(rng, voice) {
    // voice = [i, i, i] indexes into SYL_OPEN, from the genome
    var parts = Math.floor(rng() * 2) + 2; // 2-3 syllables
    var name = '';
    for (var i = 0; i < parts; i++) {
      name += SYL_OPEN[voice[Math.floor(rng() * voice.length)] % SYL_OPEN.length];
    }
    name += pick(rng, SYL_CLOSE);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /* ---------- chronicle ---------- */

  function bumpClock(w) { w.clock += 1; return w.clock; }

  function chronicle(w, kind, text, fixedId, fixedWorld) {
    // Merge events are written identically by both sides (same id, text and
    // attribution), so re-merges dedupe them and A⊕B stays content-equal to B⊕A.
    w.chronicle.push({
      id: fixedId || env.newId(),
      t: bumpClock(w),
      at: env.now(),
      world: fixedWorld || w.id,
      kind: kind,
      text: text
    });
  }

  /* ---------- flora: every world is its own planet ----------
   * A world's flora palette (archetypes + a species-naming tongue) derives
   * purely from its id, like the land. Plants CARRY their genome, so foreign
   * flora arriving in a merge visibly transforms the receiving world. */

  var PLANT_FORMS = ['stalk', 'rosette', 'puff', 'spire', 'tendril', 'pod'];
  var FLORA_CONS = ['vr', 'zl', 'th', 'k', 'ss', 'ph', 'gr', 'mn', 'x', 'q', 'fl', 'br', 't', 'sh', 'l', 'w'];
  var FLORA_VOWS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou', 'y', 'ei'];
  var FLORA_ENDS = ['', 'a', 'is', 'um', 'or', 'ex', 'il', 'ka', 'oss', 'yn'];
  var floraCache = {};

  function makeFlora(worldId) {
    if (floraCache[worldId]) return floraCache[worldId];
    var rng = mulberry32(hash32(worldId + ':flora'));
    function pickSome(list, n) {
      var pool = list.slice(), out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return out;
    }
    var flora = {
      cons: pickSome(FLORA_CONS, 4),   // this world's naming tongue
      vows: pickSome(FLORA_VOWS, 3),
      ends: pickSome(FLORA_ENDS, 4),
      archetypes: []
    };
    var count = 4 + Math.floor(rng() * 3); // 4-6 archetypes per world
    for (var i = 0; i < count; i++) {
      flora.archetypes.push({
        form: pick(rng, PLANT_FORMS),
        hue: Math.floor(rng() * 360),
        hueSpread: 18 + rng() * 55,
        size: 0.4 + rng() * 0.45,      // deliberately small — scenery, not stars
        aspect: 0.7 + rng() * 0.8,
        glow: rng() < 0.22
      });
    }
    floraCache[worldId] = flora;
    return flora;
  }

  function floraSpeciesName(flora, rng) {
    var name = '';
    var syllables = rng() < 0.7 ? 2 : 3;
    for (var i = 0; i < syllables; i++) {
      name += pick(rng, flora.cons) + pick(rng, flora.vows);
    }
    if (name.length < 9) name += pick(rng, flora.ends);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function newPlantGenome(rng, arch) {
    return {
      form: arch.form,
      hue: ((Math.round(arch.hue + (rng() - 0.5) * arch.hueSpread) % 360) + 360) % 360,
      size: Math.max(0.2, Math.min(1.2, arch.size * (0.8 + rng() * 0.4))),
      aspect: Math.max(0.5, Math.min(1.6, arch.aspect * (0.85 + rng() * 0.3))),
      detail: 2 + Math.floor(rng() * 5),
      glow: arch.glow,
      rate: 0.7 + rng() * 0.7
    };
  }

  // Elder worlds' plants predate the flora system; give them modern genomes
  // on demand so they can parent hybrids and be drawn by one renderer.
  function modernGenome(g) {
    if (g.form) return g;
    return {
      form: 'stalk',
      hue: g.hue,
      size: Math.max(0.2, Math.min(1.2, (g.height || 100) / 160)),
      aspect: 1,
      detail: Math.max(2, Math.min(6, g.petals || 4)),
      glow: false,
      rate: g.rate || 1
    };
  }

  function crossGenomes(rng, a, b, spec) {
    // spec: { gene: [min, max, round?] } — numbers mutate & clamp; arrays
    // splice; anything else (strings, booleans) is inherited whole.
    var child = {};
    Object.keys(spec).forEach(function (gene) {
      var value = rng() < 0.5 ? a[gene] : b[gene];
      if (Array.isArray(value)) {
        var other = value === a[gene] ? b[gene] : a[gene];
        var cut = Math.floor(rng() * value.length);
        child[gene] = value.slice(0, cut).concat(other.slice(cut));
        return;
      }
      if (typeof value !== 'number') { child[gene] = value; return; }
      if (rng() < 0.3) value = value * (1 + (rng() - 0.5) * 0.3); // mutation
      var lo = spec[gene][0], hi = spec[gene][1];
      if (spec[gene][2]) value = Math.round(value);
      child[gene] = Math.max(lo, Math.min(hi, value));
    });
    return child;
  }

  var PLANT_GENE_SPEC = {
    form: [0, 0], hue: [0, 359, true], size: [0.2, 1.2], aspect: [0.5, 1.6],
    detail: [2, 7, true], glow: [0, 0], rate: [0.5, 1.6]
  };

  function newKithGenome(rng) {
    return {
      hue: Math.floor(rng() * 360),
      size: 0.8 + rng() * 0.5,
      speed: 0.012 + rng() * 0.014,   // field-fractions per second
      ears: Math.floor(rng() * 3),    // 0 none, 1 tufts, 2 long
      voice: [Math.floor(rng() * 15), Math.floor(rng() * 15), Math.floor(rng() * 15)]
    };
  }

  var KITH_GENE_SPEC = {
    hue: [0, 359, true], size: [0.7, 1.4], speed: [0.008, 0.03],
    ears: [0, 2, true], voice: [0, 0] // arrays are spliced, bounds unused
  };

  /* ---------- the land ----------
   * Terrain is IDENTITY, not content: it is derived purely from the world's
   * id, never stored, never merged. When worlds merge, travellers arrive
   * onto the host world's own land and settle on it. */

  var TERRAIN_COLS = 120;
  var TERRAIN_ROWS = 56;
  var terrainCache = {};

  function valueNoise(rng, cols, rows) {
    // coarse random lattice, sampled with smooth bilinear interpolation
    var latticeW = 7, latticeH = 4;
    var lattice = [];
    for (var i = 0; i <= latticeH; i++) {
      var row = [];
      for (var j = 0; j <= latticeW; j++) row.push(rng());
      lattice.push(row);
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    var out = [];
    for (var r = 0; r < rows; r++) {
      var line = [];
      for (var c = 0; c < cols; c++) {
        var gx = (c / (cols - 1)) * latticeW;
        var gy = (r / (rows - 1)) * latticeH;
        var x0 = Math.min(latticeW - 1, Math.floor(gx));
        var y0 = Math.min(latticeH - 1, Math.floor(gy));
        var fx = smooth(gx - x0), fy = smooth(gy - y0);
        var top = lattice[y0][x0] * (1 - fx) + lattice[y0][x0 + 1] * fx;
        var bottom = lattice[y0 + 1][x0] * (1 - fx) + lattice[y0 + 1][x0 + 1] * fx;
        line.push(top * (1 - fy) + bottom * fy);
      }
      out.push(line);
    }
    return out;
  }

  function makeTerrain(worldId) {
    if (terrainCache[worldId]) return terrainCache[worldId];
    var rng = mulberry32(hash32(worldId + ':terrain'));
    var broad = valueNoise(rng, TERRAIN_COLS, TERRAIN_ROWS);
    var detail = valueNoise(rng, TERRAIN_COLS, TERRAIN_ROWS);
    var fine = valueNoise(rng, TERRAIN_COLS, TERRAIN_ROWS);
    var heights = [];
    var min = Infinity, max = -Infinity;
    for (var r = 0; r < TERRAIN_ROWS; r++) {
      var line = [];
      for (var c = 0; c < TERRAIN_COLS; c++) {
        var h = broad[r][c] * 0.6 + detail[r][c] * 0.28 + fine[r][c] * 0.12;
        line.push(h);
        if (h < min) min = h;
        if (h > max) max = h;
      }
      heights.push(line);
    }
    for (var r2 = 0; r2 < TERRAIN_ROWS; r2++) {
      for (var c2 = 0; c2 < TERRAIN_COLS; c2++) {
        heights[r2][c2] = (heights[r2][c2] - min) / (max - min || 1);
      }
    }
    var terrain = {
      cols: TERRAIN_COLS,
      rows: TERRAIN_ROWS,
      heights: heights,
      waterline: 0.24 + rng() * 0.16   // some worlds are lakelands, some dry
    };
    terrainCache[worldId] = terrain;
    return terrain;
  }

  // World-space: x in [0,1], y in [0.55,1] (the ground region).
  function terrainCell(terrain, x, y) {
    var c = Math.max(0, Math.min(terrain.cols - 1, Math.floor(x * terrain.cols)));
    var r = Math.max(0, Math.min(terrain.rows - 1, Math.floor((y - 0.55) / 0.45 * terrain.rows)));
    return terrain.heights[r][c];
  }

  var BIOMES = {
    deep: { name: 'deep water', land: false, soil: false, fertility: 0 },
    shallows: { name: 'shallows', land: false, soil: false, fertility: 0 },
    shore: { name: 'sandy shore', land: true, soil: true, fertility: 0.95 },
    meadow: { name: 'meadow', land: true, soil: true, fertility: 1.2 },
    rock: { name: 'rocky ground', land: true, soil: false, fertility: 0.6 },
    peak: { name: 'stony peaks', land: true, soil: false, fertility: 0.4 }
  };

  function biomeAt(terrain, x, y) {
    var h = terrainCell(terrain, x, y);
    if (h < terrain.waterline - 0.08) return 'deep';
    if (h < terrain.waterline) return 'shallows';
    if (h < terrain.waterline + 0.07) return 'shore';
    if (h < 0.66) return 'meadow';
    if (h < 0.82) return 'rock';
    return 'peak';
  }

  function isLandAt(terrain, x, y) { return BIOMES[biomeAt(terrain, x, y)].land; }
  function isSoilAt(terrain, x, y) { return BIOMES[biomeAt(terrain, x, y)].soil; }

  // Find a deterministic spot satisfying `test`, seeded by (world, key).
  function findSpot(w, key, test) {
    var terrain = makeTerrain(w.id);
    var rng = mulberry32(hash32(w.id + ':spot:' + key));
    for (var i = 0; i < 80; i++) {
      var x = 0.04 + rng() * 0.92;
      var y = 0.56 + rng() * 0.42;
      if (test(terrain, x, y)) return { x: x, y: y };
    }
    // stubborn world (almost all water/rock): sweep for anything valid
    for (var r = 0; r < terrain.rows; r++) {
      for (var c = 0; c < terrain.cols; c++) {
        var cx = (c + 0.5) / terrain.cols;
        var cy = 0.55 + (r + 0.5) / terrain.rows * 0.45;
        if (test(terrain, cx, cy)) return { x: cx, y: cy };
      }
    }
    return { x: 0.5, y: 0.75 };
  }

  // Travellers from a merge settle onto the host world's own land.
  function settleImmigrants(w) {
    var terrain = makeTerrain(w.id);
    Object.keys(w.plants).forEach(function (id) {
      var p = w.plants[id];
      if (!isSoilAt(terrain, p.x, p.y)) {
        var spot = findSpot(w, 'plant:' + id, isSoilAt);
        p.x = spot.x; p.y = spot.y;
      }
    });
    Object.keys(w.kith || {}).forEach(function (id) {
      var k = w.kith[id];
      if (!isLandAt(terrain, k.x, k.y)) {
        var spot = findSpot(w, 'kith:' + id, isLandAt);
        k.x = spot.x; k.y = spot.y; k.tx = null; k.ty = null;
      }
    });
  }

  /* ---------- weather: identity + time, no stored state ----------
   * Every copy of the same world computes the same skies, always. Climate
   * leans on the land: lake-worlds rain and mist, peak-worlds storm. */

  var WX_BUCKET_MS = 2 * 3600 * 1000; // weather changes every couple of hours
  var statsCache = {};

  function terrainStats(worldId) {
    if (statsCache[worldId]) return statsCache[worldId];
    var terrain = makeTerrain(worldId);
    var counts = { water: 0, soil: 0, high: 0, total: 0 };
    for (var r = 0; r < terrain.rows; r += 2) {
      for (var c = 0; c < terrain.cols; c += 2) {
        var b = biomeAt(terrain, (c + 0.5) / terrain.cols, 0.55 + (r + 0.5) / terrain.rows * 0.45);
        counts.total++;
        if (b === 'deep' || b === 'shallows') counts.water++;
        else if (b === 'shore' || b === 'meadow') counts.soil++;
        else counts.high++;
      }
    }
    var stats = {
      water: counts.water / counts.total,
      soil: counts.soil / counts.total,
      high: counts.high / counts.total
    };
    statsCache[worldId] = stats;
    return stats;
  }

  function climateOf(worldId) {
    var stats = terrainStats(worldId);
    var rng = mulberry32(hash32(worldId + ':climate'));
    return {
      storm: 0.05 + stats.high * 0.35 + rng() * 0.06,
      rain: 0.12 + stats.water * 0.5,
      mist: 0.05 + stats.water * 0.3,
      breeze: 0.18
    };
  }

  function weatherAt(worldId, t) {
    var bucket = Math.floor(t / WX_BUCKET_MS);
    var rng = mulberry32(hash32(worldId + ':wx:' + bucket));
    var roll = rng();
    var c = climateOf(worldId);
    var kind = 'clear';
    if (roll < c.storm) kind = 'storm';
    else if (roll < c.storm + c.rain) kind = 'rain';
    else if (roll < c.storm + c.rain + c.mist) kind = 'mist';
    else if (roll < c.storm + c.rain + c.mist + c.breeze) kind = 'breeze';
    return { kind: kind, bucket: bucket, intensity: 0.5 + rng() * 0.5 };
  }

  var STORM_TEXTS = [
    'A storm broke over {w}. The kith huddled while the sky argued with itself.',
    'Thunder walked across {w} for hours. Every leaf remembered it.',
    'A great storm scoured {w}; by morning the air tasted washed and new.'
  ];

  // Called by any live session; chronicles each storm exactly once, with a
  // deterministic id so every copy of the world remembers the SAME storm.
  function weatherTick(w) {
    var wx = weatherAt(w.id, env.now());
    if (wx.kind === 'storm') {
      var id = 's' + w.id + '-' + wx.bucket;
      var already = w.chronicle.some(function (e) { return e.id === id; });
      if (!already) {
        var textRng = mulberry32(hash32(id));
        chronicle(w, 'storm', pick(textRng, STORM_TEXTS).replace('{w}', w.name), id);
      }
    }
    return wx;
  }

  /* ---------- world ---------- */

  // Prospect candidate worlds until the land fits the asked temperament.
  function mineWorldId(temperament) {
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < 24; i++) {
      var id = env.newId();
      var s = terrainStats(id);
      var score = 0;
      if (temperament === 'lakeland') score = s.water;
      else if (temperament === 'highlands') score = s.high - Math.max(0, s.water - 0.25);
      else if (temperament === 'plains') score = s.soil - s.high - s.water;
      else if (temperament === 'drylands') score = -s.water + s.soil * 0.3;
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  function newWorld(opts) {
    opts = opts || {};
    var id = (opts.temperament && opts.temperament !== 'surprise')
      ? mineWorldId(opts.temperament)
      : env.newId();
    var rng = mulberry32(hash32(id));
    var w = {
      format: 'driftgarden/1',
      id: id,
      name: opts.name ? String(opts.name).slice(0, 48) : makeWorldName(rng),
      born: env.now(),
      clock: 0,
      plants: {},
      kith: {},
      emissary: null,
      chronicle: [],
      lineage: [],
      merges: 0
    };
    chronicle(w, 'born', 'The world ' + w.name + ' came into being.');
    spawnFounderKith(w);
    return w;
  }

  function looksLikeWorld(obj) {
    return !!(obj && obj.format === 'driftgarden/1' && obj.id &&
      typeof obj.clock === 'number' && obj.plants && Array.isArray(obj.chronicle));
  }

  // Worlds preserved before the kith existed get theirs on first waking.
  function ensureKith(w) {
    if (!w.kith) { w.kith = {}; w.emissary = null; }
    if (Object.keys(w.kith).length === 0) spawnFounderKith(w);
  }

  /* ---------- plants ---------- */

  function plantSeed(w) {
    var rng = mulberry32(hash32(w.id + ':' + (w.clock + 1)));
    var id = env.newId();
    var terrain = makeTerrain(w.id);
    var flora = makeFlora(w.id);
    var spot = findSpot(w, 'seed:' + id, isSoilAt);
    var arch = flora.archetypes[Math.floor(rng() * flora.archetypes.length)];
    var plant = {
      id: id,
      species: floraSpeciesName(flora, rng),
      name: null,
      genome: newPlantGenome(rng, arch),
      x: spot.x,
      y: spot.y,
      // A plant carries the vigour of its native soil for life, wherever
      // it later travels — so growth stays identical in every copy.
      soil: BIOMES[biomeAt(terrain, spot.x, spot.y)].fertility,
      planted: env.now(),
      tick: env.now(),
      growth: 0,
      watered: 0,
      origin: w.id,
      bornOfMerge: null,
      u: bumpClock(w)
    };
    w.plants[id] = plant;
    chronicle(w, 'plant', 'A ' + plant.species + ' seed was planted in the ' +
      BIOMES[biomeAt(terrain, spot.x, spot.y)].name + '.');
    return plant;
  }

  function advanceGrowth(w) {
    var now = env.now();
    Object.keys(w.plants).forEach(function (id) {
      var p = w.plants[id];
      if (p.growth >= 1) { p.tick = now; return; }
      var hours = Math.max(0, (now - (p.tick || p.planted)) / 3600000);
      p.growth = Math.min(1, p.growth + (hours / GROW_HOURS) * p.genome.rate * (p.soil || 1));
      p.tick = now;
    });
  }

  function waterPlant(w, id) {
    var p = w.plants[id];
    if (!p) return false;
    var now = env.now();
    if (p.watered && now - p.watered < WATER_COOLDOWN) return false;
    advanceGrowth(w);
    p.watered = now;
    p.growth = Math.min(1, p.growth + WATER_BOOST);
    p.u = bumpClock(w);
    return true;
  }

  function namePlant(w, id, name) {
    var p = w.plants[id];
    if (!p || !name) return;
    p.name = String(name).slice(0, 40);
    p.u = bumpClock(w);
    chronicle(w, 'name', 'The ' + p.species + ' was named “' + p.name + '”.');
  }

  function renameWorld(w, name) {
    if (!name) return;
    var old = w.name;
    w.name = String(name).slice(0, 48);
    chronicle(w, 'name', 'The world ' + old + ' took a new name: ' + w.name + '.');
  }

  /* ---------- kith ---------- */

  function makeKith(w, rng, genome, parents, origin) {
    var id = env.newId();
    var spot = findSpot(w, 'kith:' + id, isLandAt);
    var kith = {
      id: id,
      genome: genome,
      given: makeKithName(rng, genome.voice),
      name: null,             // a name the player bestows
      born: env.now(),
      parents: parents || null,
      origin: origin || w.id,
      bornOfMerge: null,
      energy: 0.7 + rng() * 0.3,
      x: spot.x,
      y: spot.y,
      tx: null, ty: null,     // wander target (ephemeral, not clocked)
      act: 'wander',
      actUntil: 0,
      facing: 1,
      u: bumpClock(w)
    };
    w.kith[id] = kith;
    return kith;
  }

  function spawnFounderKith(w) {
    var rng = mulberry32(hash32(w.id + ':founders'));
    var names = [];
    for (var i = 0; i < FOUNDER_COUNT; i++) {
      names.push(makeKith(w, rng, newKithGenome(rng)).given);
    }
    chronicle(w, 'kith', 'Three small kith wandered in and made this world their home: ' +
      names[0] + ', ' + names[1] + ' and ' + names[2] + '.');
  }

  function kithLabel(k) {
    return k.name ? k.name : k.given;
  }

  function kithStage(k, now) {
    var days = (now - k.born) / 86400000;
    for (var i = 0; i < KITH_STAGES.length; i++) {
      if (days < KITH_STAGES[i].until) return KITH_STAGES[i].name;
    }
    return 'elder';
  }

  function nameKith(w, id, name) {
    var k = w.kith[id];
    if (!k || !name) return;
    k.name = String(name).slice(0, 40);
    k.u = bumpClock(w);
    chronicle(w, 'name', k.given + ' was given a name: “' + k.name + '”.');
  }

  function blessKith(w, id) {
    var k = w.kith[id];
    if (!k) return;
    var previous = w.emissary && w.kith[w.emissary] ? kithLabel(w.kith[w.emissary]) : null;
    w.emissary = id;
    k.u = bumpClock(w);
    chronicle(w, 'bless', kithLabel(k) + ' was blessed as emissary of ' + w.name +
      (previous && previous !== kithLabel(k) ? ', taking the mantle from ' + previous : '') + '.');
  }

  /* The heartbeat: advance every kith by dt seconds. Movement and hunger are
   * ephemeral flavour — they deliberately do NOT bump the logical clock, so
   * an open tab doesn't inflate merge ordering. */
  function kithTick(w, dt) {
    var now = env.now();
    var terrain = makeTerrain(w.id);
    var rng = mulberry32(hash32(w.id + ':' + Math.floor(now / 1000)));
    var blooming = Object.keys(w.plants).map(function (id) { return w.plants[id]; })
      .filter(function (p) { return p.growth > 0.55; });

    Object.keys(w.kith).forEach(function (id) {
      var k = w.kith[id];
      k.energy = Math.max(0, k.energy - ENERGY_DECAY_PER_SEC * dt);

      if (k.act === 'eat') {
        if (now >= k.actUntil) { k.energy = 1; k.act = 'wander'; k.tx = null; }
        return; // stay put while sipping
      }
      if (k.act === 'rest') {
        if (now >= k.actUntil) { k.act = 'wander'; k.tx = null; }
        else return;
      }

      // hungry? head for the nearest bloom
      if (k.energy < 0.45 && blooming.length > 0) {
        var nearest = null, nearestD = Infinity;
        blooming.forEach(function (p) {
          var d = (p.x - k.x) * (p.x - k.x) + (p.y - k.y) * (p.y - k.y);
          if (d < nearestD) { nearestD = d; nearest = p; }
        });
        k.tx = nearest.x; k.ty = nearest.y;
        if (Math.sqrt(nearestD) < 0.035) {
          k.act = 'eat';
          k.actUntil = now + EAT_SECONDS * 1000;
          return;
        }
      } else if (k.tx === null || (Math.abs(k.tx - k.x) < 0.01 && Math.abs(k.ty - k.y) < 0.01)) {
        // arrived (or aimless): rest a moment, or pick somewhere new to be
        if (rng() < 0.35) {
          k.act = 'rest';
          k.actUntil = now + (4 + rng() * 10) * 1000;
          return;
        }
        // pick somewhere new to be — on land; kith won't swim (yet)
        for (var tries = 0; tries < 8; tries++) {
          var cx = 0.05 + rng() * 0.9;
          var cy = 0.57 + rng() * 0.38;
          if (isLandAt(terrain, cx, cy)) { k.tx = cx; k.ty = cy; break; }
        }
      }

      // walk toward target, stopping at the water's edge
      if (k.tx !== null) {
        var dx = k.tx - k.x, dy = k.ty - k.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var stageSpeed = kithStage(k, now) === 'elder' ? 0.6 : 1;
        var step = Math.min(dist, k.genome.speed * stageSpeed * dt);
        if (dist > 0.0001) {
          var nx = k.x + (dx / dist) * step;
          var ny = k.y + (dy / dist) * step;
          if (!isLandAt(terrain, nx, ny)) {
            k.tx = null; k.ty = null; // shoreline reached — think again next tick
          } else {
            k.x = nx;
            k.y = ny;
            if (Math.abs(dx) > 0.002) k.facing = dx > 0 ? 1 : -1;
          }
        }
      }
    });
  }

  /* ---------- the merge ---------- */

  function proudestPlant(plants) {
    var best = null;
    Object.keys(plants).sort().forEach(function (id) {
      var p = plants[id];
      if (!best || p.growth > best.growth ||
          (p.growth === best.growth && p.planted < best.planted)) best = p;
    });
    return best;
  }

  function eldestKith(kith) {
    var best = null;
    Object.keys(kith || {}).sort().forEach(function (id) {
      var k = kith[id];
      if (!best || k.born < best.born) best = k;
    });
    return best;
  }

  function mergeSide(w, other) {
    // A world's chosen emissary leads the meeting; a world that never chose
    // one is represented by its eldest kith.
    return (w.emissary && w.kith && w.kith[w.emissary]) ? w.kith[w.emissary] : eldestKith(w.kith);
  }

  function plantLabel(p) {
    return p.name ? p.name + ' the ' + p.species : 'a ' + p.species;
  }

  function unionByU(ours, theirs, ourWorldId, otherWorldId) {
    Object.keys(theirs).forEach(function (id) {
      var t = theirs[id];
      var o = ours[id];
      if (!o || (t.u || 0) > (o.u || 0) ||
          ((t.u || 0) === (o.u || 0) && otherWorldId > ourWorldId)) {
        ours[id] = t;
      }
    });
  }

  function mergeWorlds(w, other) {
    if (!looksLikeWorld(other)) throw new Error('not a world');
    if (other.id === w.id && other.clock <= w.clock) {
      return { same: true, gained: 0, hybrid: null, child: null, otherName: other.name };
    }
    advanceGrowth(w);
    var now = env.now();

    var beforePlants = Object.keys(w.plants).length;
    var beforeKith = Object.keys(w.kith || {}).length;

    // Champions and emissaries must be chosen from each side's own world
    // as it stood BEFORE the union.
    var ourPlantParent = proudestPlant(w.plants);
    var theirPlantParent = proudestPlant(other.plants);
    var ourEmissary = mergeSide(w, other);
    var theirEmissary = mergeSide(other, w);

    var weKnowThem = w.lineage.some(function (l) { return l.id === other.id; });
    var theyKnowUs = (other.lineage || []).some(function (l) { return l.id === w.id; });
    var firstMeeting = other.id !== w.id && !weKnowThem && !theyKnowUs;

    // Unions — never lossy.
    unionByU(w.plants, other.plants, w.id, other.id);
    if (!w.kith) w.kith = {};
    unionByU(w.kith, other.kith || {}, w.id, other.id);

    var seen = {};
    w.chronicle.forEach(function (e) { seen[e.id] = true; });
    (other.chronicle || []).forEach(function (e) { if (!seen[e.id]) w.chronicle.push(e); });
    w.chronicle.sort(function (a, b) {
      return a.t !== b.t ? a.t - b.t : (a.world < b.world ? -1 : a.world > b.world ? 1 : 0);
    });

    var lineageSeen = {};
    w.lineage.forEach(function (l) { lineageSeen[l.id] = true; });
    (other.lineage || []).concat([{ id: other.id, name: other.name }]).forEach(function (l) {
      if (!lineageSeen[l.id] && l.id !== w.id) {
        w.lineage.push(l);
        lineageSeen[l.id] = true;
      }
    });
    w.lineage.sort(function (a, b) { return a.id < b.id ? -1 : 1; });

    w.clock = Math.max(w.clock, other.clock);
    var sameWorld = other.id === w.id;
    var hybrid = null;
    var child = null;

    if (firstMeeting) {
      w.merges += 1;
      var sortedIds = [w.id, other.id].sort();
      var canonicalNames = w.id < other.id ? [w.name, other.name] : [other.name, w.name];
      var mergeClock = w.clock;

      // Everything below must be identical no matter which copy performs the
      // merge: seeded rng, canonical parent order, deterministic ids.
      var rng = mulberry32(hash32(sortedIds.join('+') + ':' + mergeClock));

      chronicle(w, 'merge', 'The worlds ' + canonicalNames[0] + ' and ' + canonicalNames[1] +
        ' met, and became one.', 'm' + sortedIds.join('') + '-' + mergeClock, sortedIds[0]);

      // The emissaries meet first — their child leads the new generation.
      if (ourEmissary && theirEmissary && ourEmissary.id !== theirEmissary.id) {
        var kithParents = [ourEmissary, theirEmissary].sort(function (a, b) { return a.id < b.id ? -1 : 1; });
        var childId = 'k' + sortedIds.join('') + '-' + mergeClock;
        var childGenome = crossGenomes(rng, kithParents[0].genome, kithParents[1].genome, KITH_GENE_SPEC);
        child = {
          id: childId,
          genome: childGenome,
          given: makeKithName(rng, childGenome.voice),
          name: null,
          born: now,
          parents: [kithParents[0].id, kithParents[1].id],
          origin: 'merge',
          bornOfMerge: {
            worlds: canonicalNames.slice(),
            parents: [kithLabel(kithParents[0]), kithLabel(kithParents[1])]
          },
          energy: 1,
          x: 0.45 + rng() * 0.1,
          y: 0.7 + rng() * 0.1,
          tx: null, ty: null,
          act: 'wander',
          actUntil: 0,
          facing: 1,
          u: bumpClock(w)
        };
        w.kith[childId] = child;
        chronicle(w, 'born', 'The emissaries ' + child.bornOfMerge.parents[0] + ' and ' +
          child.bornOfMerge.parents[1] + ' met at the meeting stone. A child was born of the two worlds: ' +
          child.given + '.', 'bk' + childId, sortedIds[0]);
      }

      // The gardens cross too.
      if (ourPlantParent && theirPlantParent && ourPlantParent.id !== theirPlantParent.id) {
        var plantParents = [ourPlantParent, theirPlantParent].sort(function (a, b) { return a.id < b.id ? -1 : 1; });
        // The hybrid is named in the canonical first world's tongue so both
        // copies of the merge christen it identically.
        hybrid = {
          id: 'p' + sortedIds.join('') + '-' + mergeClock,
          species: floraSpeciesName(makeFlora(sortedIds[0]), rng),
          name: null,
          genome: crossGenomes(rng, modernGenome(plantParents[0].genome), modernGenome(plantParents[1].genome), PLANT_GENE_SPEC),
          x: 0.2 + rng() * 0.6,
          y: 0.6 + rng() * 0.3,
          // hybrid vigour is inherited, not local — identical in every copy
          soil: ((plantParents[0].soil || 1) + (plantParents[1].soil || 1)) / 2,
          planted: now,
          tick: now,
          growth: 0.15,
          watered: 0,
          origin: 'merge',
          bornOfMerge: {
            worlds: canonicalNames.slice(),
            parents: [plantLabel(plantParents[0]), plantLabel(plantParents[1])]
          },
          u: bumpClock(w)
        };
        w.plants[hybrid.id] = hybrid;
        chronicle(w, 'born', 'From the meeting of the gardens, a new species grew: the ' + hybrid.species +
          ' — child of ' + hybrid.bornOfMerge.parents[0] + ' and ' + hybrid.bornOfMerge.parents[1] + '.',
          'bp' + hybrid.id, sortedIds[0]);
      }

      // Population mercy: a merge can overfill the world; the newest-born
      // wanderers move on rather than crowd the field. Deterministic order.
      var ids = Object.keys(w.kith);
      if (ids.length > KITH_CAP) {
        // BOTH sides' emissaries are protected, so each copy evicts the same
        // wanderers and the merged worlds stay content-identical.
        var protectedIds = {};
        if (w.emissary) protectedIds[w.emissary] = true;
        if (other.emissary) protectedIds[other.emissary] = true;
        var surplus = ids.map(function (id) { return w.kith[id]; })
          .filter(function (k) { return !protectedIds[k.id] && !k.bornOfMerge && !k.name; })
          .sort(function (a, b) { return b.born !== a.born ? b.born - a.born : (a.id < b.id ? -1 : 1); })
          .slice(0, ids.length - KITH_CAP);
        surplus.forEach(function (k) { delete w.kith[k.id]; });
        if (surplus.length > 0) {
          chronicle(w, 'kith', surplus.length + ' of the newly-arrived kith found the field crowded and wandered on to seek worlds of their own.',
            'w' + sortedIds.join('') + '-' + mergeClock, sortedIds[0]);
        }
      }
    }

    // Travellers (and merge-born newcomers) settle onto this world's own land.
    settleImmigrants(w);

    return {
      same: sameWorld,
      firstMeeting: firstMeeting,
      gained: Object.keys(w.plants).length - beforePlants,
      gainedKith: Object.keys(w.kith).length - beforeKith,
      hybrid: hybrid,
      child: child,
      otherName: other.name
    };
  }

  /* ---------- importing ---------- */

  function extractWorld(text) {
    text = String(text).trim();
    if (!text) return null;
    if (text[0] === '{') {
      try {
        var direct = JSON.parse(text);
        if (looksLikeWorld(direct)) return direct;
      } catch (e) { /* keep trying */ }
    }
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

  /* ---------- exports ---------- */

  return {
    setEnv: setEnv,
    hash32: hash32,
    mulberry32: mulberry32,
    makeTerrain: makeTerrain,
    biomeAt: biomeAt,
    biomeInfo: function (key) { return BIOMES[key]; },
    isLandAt: isLandAt,
    isSoilAt: isSoilAt,
    settleImmigrants: settleImmigrants,
    makeFlora: makeFlora,
    modernGenome: modernGenome,
    terrainStats: terrainStats,
    weatherAt: weatherAt,
    weatherTick: weatherTick,
    newWorld: newWorld,
    looksLikeWorld: looksLikeWorld,
    ensureKith: ensureKith,
    extractWorld: extractWorld,
    chronicle: chronicle,
    plantSeed: plantSeed,
    advanceGrowth: advanceGrowth,
    waterPlant: waterPlant,
    namePlant: namePlant,
    renameWorld: renameWorld,
    nameKith: nameKith,
    blessKith: blessKith,
    kithTick: kithTick,
    kithStage: kithStage,
    kithLabel: kithLabel,
    plantLabel: plantLabel,
    mergeWorlds: mergeWorlds,
    WATER_COOLDOWN: WATER_COOLDOWN,
    KITH_CAP: KITH_CAP
  };
});
