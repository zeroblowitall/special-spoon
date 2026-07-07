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

  /* ---------- genomes ---------- */

  function newPlantGenome(rng) {
    return {
      hue: Math.floor(rng() * 360),
      height: 70 + Math.floor(rng() * 90),
      branches: 2 + Math.floor(rng() * 4),
      petals: 4 + Math.floor(rng() * 6),
      leaf: 0.6 + rng() * 0.9,
      rate: 0.7 + rng() * 0.7
    };
  }

  function crossGenomes(rng, a, b, spec) {
    // spec: { gene: [min, max, round?] }
    var child = {};
    Object.keys(spec).forEach(function (gene) {
      var value = rng() < 0.5 ? a[gene] : b[gene];
      if (Array.isArray(value)) { // voices etc.: splice the arrays
        var other = value === a[gene] ? b[gene] : a[gene];
        var cut = Math.floor(rng() * value.length);
        child[gene] = value.slice(0, cut).concat(other.slice(cut));
        return;
      }
      if (rng() < 0.3) value = value * (1 + (rng() - 0.5) * 0.3); // mutation
      var lo = spec[gene][0], hi = spec[gene][1];
      if (spec[gene][2]) value = Math.round(value);
      child[gene] = Math.max(lo, Math.min(hi, value));
    });
    return child;
  }

  var PLANT_GENE_SPEC = {
    hue: [0, 359, true], height: [50, 180, true], branches: [2, 6, true],
    petals: [4, 10, true], leaf: [0.4, 1.8], rate: [0.5, 1.6]
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

  /* ---------- world ---------- */

  function newWorld() {
    var id = env.newId();
    var rng = mulberry32(hash32(id));
    var w = {
      format: 'driftgarden/1',
      id: id,
      name: makeWorldName(rng),
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
    var plant = {
      id: id,
      species: makeSpeciesName(rng),
      name: null,
      genome: newPlantGenome(rng),
      x: 0.06 + rng() * 0.88,
      y: 0.55 + rng() * 0.4,
      planted: env.now(),
      tick: env.now(),
      growth: 0,
      watered: 0,
      origin: w.id,
      bornOfMerge: null,
      u: bumpClock(w)
    };
    w.plants[id] = plant;
    chronicle(w, 'plant', 'A ' + plant.species + ' seed was planted.');
    return plant;
  }

  function advanceGrowth(w) {
    var now = env.now();
    Object.keys(w.plants).forEach(function (id) {
      var p = w.plants[id];
      if (p.growth >= 1) { p.tick = now; return; }
      var hours = Math.max(0, (now - (p.tick || p.planted)) / 3600000);
      p.growth = Math.min(1, p.growth + (hours / GROW_HOURS) * p.genome.rate);
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
      x: 0.15 + rng() * 0.7,
      y: 0.6 + rng() * 0.34,
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
        k.tx = 0.05 + rng() * 0.9;
        k.ty = 0.57 + rng() * 0.38;
      }

      // walk toward target
      if (k.tx !== null) {
        var dx = k.tx - k.x, dy = k.ty - k.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var stageSpeed = kithStage(k, now) === 'elder' ? 0.6 : 1;
        var step = Math.min(dist, k.genome.speed * stageSpeed * dt);
        if (dist > 0.0001) {
          k.x += (dx / dist) * step;
          k.y += (dy / dist) * step;
          if (Math.abs(dx) > 0.002) k.facing = dx > 0 ? 1 : -1;
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
        hybrid = {
          id: 'p' + sortedIds.join('') + '-' + mergeClock,
          species: makeSpeciesName(rng),
          name: null,
          genome: crossGenomes(rng, plantParents[0].genome, plantParents[1].genome, PLANT_GENE_SPEC),
          x: 0.2 + rng() * 0.6,
          y: 0.6 + rng() * 0.3,
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
