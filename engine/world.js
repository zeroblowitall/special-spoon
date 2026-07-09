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

  /* ---------- the mind (a sibling module) ----------
   * The kith's inner life lives in engine/mind.js — needs, traits, and the
   * plain reading of what a kith means to do. It is bundled just before this
   * file in the browser (window.DriftMind) and required directly under Node,
   * so the tick and the test suite see exactly the same mind. */
  var Mind = (typeof module === 'object' && module.exports)
    ? require('./mind.js')
    : (typeof self !== 'undefined' ? self.DriftMind : this.DriftMind);

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

  var DAY = 24 * 60 * 60 * 1000;
  var GROW_HOURS = 36;
  var WATER_BOOST = 0.06;
  var WATER_COOLDOWN = 60 * 60 * 1000;
  var KITH_CAP = 20;
  var FOUNDER_COUNT = 3;
  var ENERGY_DECAY_PER_SEC = 1 / 4800;  // world-speed: hungry roughly hourly
  var EAT_SECONDS = 5;
  var GRAZE_COST = 0.12;                // a sip visibly tires the bloom…
  var GRAZE_FLOOR = 0.3;                // …but never kills the plant
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
    var realm = realmOf(worldId).realm;
    var formPool = realm.forms || PLANT_FORMS;
    var count = 4 + Math.floor(rng() * 3); // 4-6 archetypes per world
    for (var i = 0; i < count; i++) {
      flora.archetypes.push({
        form: pick(rng, formPool),
        hue: Math.floor(rng() * 360),
        hueSpread: 18 + rng() * 55,
        size: 0.4 + rng() * 0.45,      // deliberately small — scenery, not stars
        aspect: 0.7 + rng() * 0.8,
        glow: rng() < realm.glowBias   // the Fungal Deep shines; the salt does not
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
      var lo = spec[gene][0], hi = spec[gene][1];
      if (spec[gene][2] && hi - lo <= 12) {
        // small discrete genes mutate by stepping — how a tail is lost,
        // a fin is found, a third eye opens
        if (rng() < 0.12) value = value + (rng() < 0.5 ? -1 : 1);
        child[gene] = Math.max(lo, Math.min(hi, Math.round(value)));
        return;
      }
      if (rng() < 0.3) value = value * (1 + (rng() - 0.5) * 0.3); // mutation
      if (spec[gene][2]) value = Math.round(value);
      child[gene] = Math.max(lo, Math.min(hi, value));
    });
    return child;
  }

  var PLANT_GENE_SPEC = {
    form: [0, 0], hue: [0, 359, true], size: [0.2, 1.2], aspect: [0.5, 1.6],
    detail: [2, 7, true], glow: [0, 0], rate: [0.5, 1.6]
  };

  /* The body-plan genome: shape itself is heritable. The discrete genes
   * multiply out to well over a million distinct phenotypes before colour
   * and size even enter — and every one of them crosses and mutates. */
  function newKithGenome(rng, realmKey) {
    var realm = REALMS[realmKey] || REALMS.meadow;
    return {
      hue: Math.floor(rng() * 360),
      size: (0.8 + rng() * 0.5) * (realm.sizeBias || 1),
      speed: 0.012 + rng() * 0.014,   // field-fractions per second
      ears: Math.floor(rng() * 3),    // 0 none, 1 tufts, 2 long
      form: Math.floor(rng() * 4),    // 0 round, 1 tall, 2 long, 3 pear
      segs: 1 + Math.floor(rng() * 2),// body segments
      limbs: (realm.limbBias && rng() < realm.limbBias) ? 0 : Math.floor(rng() * 3),
      tail: Math.floor(rng() * 5),    // 0 none, 1 nub, 2 curl, 3 plume, 4 spike
      fins: rng() < realm.finBias ? 1 : 0, // the realm shapes its founders
      crest: Math.floor(rng() * 4),   // 0 none, 1 spikes, 2 frill, 3 fan
      snout: Math.floor(rng() * 3),   // 0 soft, 1 beak, 2 muzzle
      eyes: 1 + Math.floor(rng() * 4),// one to four
      pattern: Math.floor(rng() * 5), // 0 plain, 1 belly, 2 spots, 3 stripes, 4 mask
      voice: [Math.floor(rng() * 15), Math.floor(rng() * 15), Math.floor(rng() * 15)]
    };
  }

  var KITH_GENE_SPEC = {
    hue: [0, 359, true], size: [0.7, 1.4], speed: [0.008, 0.03],
    ears: [0, 2, true], form: [0, 3, true], segs: [1, 2, true],
    limbs: [0, 2, true], tail: [0, 4, true], fins: [0, 1, true],
    crest: [0, 3, true], snout: [0, 2, true], eyes: [1, 4, true],
    pattern: [0, 4, true],
    voice: [0, 0] // arrays are spliced, bounds unused
  };

  // The elder body-plan: what every kith looked like before shape was
  // heritable. Deterministic defaults, identical in every copy.
  function modernKithGenome(g) {
    if (g.form !== undefined) return g;
    g.form = 0; g.segs = 1; g.limbs = 1; g.tail = 0; g.fins = 0;
    g.crest = 0; g.snout = 0; g.eyes = 2;
    g.pattern = 1;
    return g;
  }

  function isSwimmer(k) { return (k.genome.fins || 0) > 0; }

  // Where can this body be? The realm decides what the deeps ARE:
  // water welcomes the finned; ice bears anyone; lava, brine and molten
  // glass admit no body at all.
  function canStandAt(terrain, k, x, y) {
    if (isLandAt(terrain, x, y)) return true;
    var pass = (REALMS[terrain.realm] || REALMS.meadow).pass;
    if (pass === 'all') return true;
    if (pass === 'none') return false;
    return isSwimmer(k);
  }

  // The water's edge must be a wall at ANY speed. Movement used to check only
  // the step's endpoint, so a big step (under ?warp) could leap clean across a
  // lake. Instead we walk the line in increments finer than a terrain cell,
  // stopping at the first spot this body cannot stand on. Returns how far it
  // got and whether the way was blocked before the goal.
  var WALK_SEG = 0.006; // terrain cells are ~0.008 wide; nothing is leapt
  function walkLine(terrain, k, x0, y0, ux, uy, maxDist) {
    var moved = 0, cx = x0, cy = y0, blocked = false, guard = 0;
    while (moved < maxDist - 1e-9 && guard++ < 256) {
      var adv = Math.min(WALK_SEG, maxDist - moved);
      var nx = cx + ux * adv, ny = cy + uy * adv;
      if (!canStandAt(terrain, k, nx, ny)) { blocked = true; break; }
      cx = nx; cy = ny; moved += adv;
    }
    return { x: cx, y: cy, moved: moved, blocked: blocked };
  }

  // Is there a clear, standable straight line from here to there? Land-kith use
  // this to avoid setting off toward a spot they'd only stall at the shore of.
  function reachableStraight(terrain, k, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return true;
    return !walkLine(terrain, k, x0, y0, dx / d, dy / d, d).blocked;
  }

  /* The mind: evolvable weights a kith is born with. Behaviour follows from
   * these, so selection quietly reshapes temperament over generations. */
  function newKithBrain(rng) {
    return {
      curiosity: 0.1 + rng() * 0.85,
      sociability: 0.1 + rng() * 0.85,
      boldness: 0.1 + rng() * 0.85,
      wanderlust: 0.1 + rng() * 0.85,
      appetite: 0.25 + rng() * 0.7,
      patience: 0.1 + rng() * 0.85
    };
  }

  var BRAIN_SPEC = {
    curiosity: [0.05, 1], sociability: [0.05, 1], boldness: [0.05, 1],
    wanderlust: [0.05, 1], appetite: [0.05, 1], patience: [0.05, 1]
  };

  // How a given plant species agrees with a given kith — fixed at the level
  // of physiology, identical in every copy of the world.
  function inbornLiking(kithId, species) {
    return ((hash32(kithId + '~' + species) % 201) - 100) / 100; // -1..1
  }

  /* ---------- language: the naming game ----------
   * Kith coin words for the things they attend to, in their own voice.
   * A kith always coins the SAME word for the same concept (seeded by its
   * identity), so coinages reconcile across copies like everything else.
   * Words spread through encounters: agreement reinforces, disagreement
   * ends with the weaker speaker adopting — Steels' naming game, and the
   * population converges on a shared tongue. Each world converges on its
   * OWN tongue; merges are language contact. */

  var LEX_CAP = 16;

  function coinWord(k, concept) {
    var rng = mulberry32(hash32(k.id + ':word:' + concept));
    var word = '';
    var syllables = 1 + Math.floor(rng() * 2);
    for (var i = 0; i <= syllables; i++) {
      word += SYL_OPEN[k.genome.voice[Math.floor(rng() * k.genome.voice.length)] % SYL_OPEN.length];
    }
    if (rng() < 0.4) word += pick(rng, SYL_CLOSE);
    return word;
  }

  function attendConcept(w, k, concept) {
    if (!k.lex) k.lex = {};
    if (k.lex[concept]) return k.lex[concept];
    k.lex[concept] = { word: coinWord(k, concept), s: 0.3, by: k.id };
    // cap the vocabulary; the faintest word fades first, deterministically.
    // Grammar (':order') is not a word and never fades.
    var concepts = Object.keys(k.lex).filter(function (c) { return c !== ':order'; });
    if (concepts.length > LEX_CAP) {
      concepts.sort(function (a, b) { return k.lex[a].s - k.lex[b].s || (a < b ? -1 : 1); });
      delete k.lex[concepts[0]];
    }
    k.u = bumpClock(w);
    return k.lex[concept];
  }

  function speakBetween(w, speaker, listener, concept, now) {
    var said = exchangeWord(w, speaker, listener, concept);
    speaker.saying = said.word;
    speaker.sayingUntil = now + 3500;
    return said.word;
  }

  function conceptLabel(concept) {
    if (concept.indexOf('plant:') === 0) return 'the ' + concept.slice(6);
    return {
      home: 'this world', rain: 'the rain', storm: 'the storm',
      mist: 'the mist', sun: 'the sun', water: 'the water',
      song: 'the song',
      gardener: 'the unseen gardener — you',
      'mark:want': 'wanting', 'mark:fear': 'fear',
      'mark:good': 'gladness', 'mark:friend': 'friendship'
    }[concept] || concept;
  }

  /* ---------- proto-sentences ----------
   * Two slots: an intent word and a thing word. Intents are concepts like
   * any other, coined in each speaker's own voice. And the ORDER of the two
   * slots is itself a convention — learned, spread, and converged on by the
   * same naming game, so every world develops its own grammar. */

  // Which comes first here: the feeling, or the thing? A newborn instinct,
  // then a convention. ':order' is never evicted and never shown as a word.
  function orderEntry(w, k) {
    if (!k.lex) k.lex = {};
    if (!k.lex[':order']) {
      k.lex[':order'] = { word: (hash32(k.id + ':order') % 2 === 0) ? 'mf' : 'cf', s: 0.3, by: k.id };
      k.u = bumpClock(w);
    }
    return k.lex[':order'];
  }

  // One step of the naming game between two speakers over one concept.
  function exchangeWord(w, speaker, listener, concept) {
    var said = concept === ':order' ? orderEntry(w, speaker) : attendConcept(w, speaker, concept);
    var heard = concept === ':order' ? orderEntry(w, listener) : attendConcept(w, listener, concept);
    if (said.word === heard.word) {
      said.s = Math.min(1, said.s + 0.15);
      heard.s = Math.min(1, heard.s + 0.15);
    } else if (said.s >= heard.s) {
      listener.lex[concept] = { word: said.word, s: 0.25, by: said.by };
      said.s = Math.min(1, said.s + 0.1);
      listener.u = bumpClock(w);
    } else {
      said.s = Math.max(0.05, said.s - 0.05);
    }
    return speaker.lex[concept];
  }

  // A two-word utterance: intent + thing, in the speaker's word order.
  function speakSentence(w, speaker, listener, intent, concept, now) {
    var intentEntry = exchangeWord(w, speaker, listener, intent);
    var contentWord;
    if (concept.indexOf('name:') === 0) {
      contentWord = concept.slice(5).toLowerCase(); // a friend's own name
    } else {
      contentWord = exchangeWord(w, speaker, listener, concept).word;
    }
    exchangeWord(w, speaker, listener, ':order');
    var order = speaker.lex[':order'].word;
    var sentence = order === 'mf'
      ? intentEntry.word + ' ' + contentWord
      : contentWord + ' ' + intentEntry.word;
    speaker.saying = sentence;
    speaker.sayingUntil = now + 3500;
    return sentence;
  }

  // The world's grammar: which order do the living lean toward?
  function worldOrder(w) {
    var tally = { mf: 0, cf: 0 };
    livingKith(w).forEach(function (k) {
      var entry = k.lex && k.lex[':order'];
      if (entry) tally[entry.word] += entry.s;
    });
    if (tally.mf === 0 && tally.cf === 0) return null;
    return tally.mf >= tally.cf ? 'mf' : 'cf';
  }

  // The world's tongue: every living voice tallied, strongest words first.
  function worldLexicon(w) {
    var tally = {};
    livingKith(w).forEach(function (k) {
      Object.keys(k.lex || {}).forEach(function (concept) {
        var entry = k.lex[concept];
        if (!tally[concept]) tally[concept] = {};
        if (!tally[concept][entry.word]) tally[concept][entry.word] = { weight: 0, by: entry.by };
        tally[concept][entry.word].weight += entry.s;
      });
    });
    var out = {};
    Object.keys(tally).forEach(function (concept) {
      out[concept] = Object.keys(tally[concept]).map(function (word) {
        return { word: word, weight: tally[concept][word].weight, by: tally[concept][word].by };
      }).sort(function (a, b) { return b.weight - a.weight || (a.word < b.word ? -1 : 1); });
    });
    return out;
  }

  /* ---------- society ----------
   * Tribes are DERIVED, never stored: connected clusters of mutual bonds
   * among the living, so they merge safely by construction and reshape
   * themselves as friendships (and grudges) shift. A tribe is named in its
   * members' own tongue — their word for home. */

  function tribesOf(w) {
    var alive = livingKith(w);
    var index = {};
    alive.forEach(function (k, i) { index[k.id] = i; });
    var parent = alive.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    alive.forEach(function (a) {
      alive.forEach(function (b) {
        if (a.id >= b.id) return;
        if ((a.trust[b.id] || 0) >= 0.5 && (b.trust[a.id] || 0) >= 0.5) {
          parent[find(index[a.id])] = find(index[b.id]);
        }
      });
    });
    var groups = {};
    alive.forEach(function (k, i) {
      var root = find(i);
      (groups[root] = groups[root] || []).push(k);
    });
    return Object.keys(groups).map(function (root) { return groups[root]; })
      .filter(function (members) { return members.length >= 3; })
      .map(function (members) {
        members.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
        // the tribe's name is its word for home — tallied from its members
        var tally = {};
        members.forEach(function (k) {
          var entry = k.lex && k.lex.home;
          var word = entry ? entry.word : coinWord(k, 'home');
          tally[word] = (tally[word] || 0) + (entry ? entry.s : 0.1);
        });
        var words = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a] || (a < b ? -1 : 1); });
        var name = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        return { name: name, members: members };
      })
      .sort(function (a, b) { return b.members.length - a.members.length; });
  }

  function tribeOfKith(w, kithId) {
    var tribes = tribesOf(w);
    for (var i = 0; i < tribes.length; i++) {
      if (tribes[i].members.some(function (m) { return m.id === kithId; })) return tribes[i];
    }
    return null;
  }

  /* ---------- discoveries ----------
   * Ideas are grown, not scripted: the right mind in the right circumstance
   * discovers, and knowledge spreads only by teaching. Knowledge lives in
   * the kith, so it travels and merges like language does. */

  function knowsOf(k) { return k.knows || []; }

  var SKILL_NAMES = {
    seedkeeping: 'the way of seed-keeping',
    song: 'the song',
    shelter: 'the craft of shelter',
    hearth: 'the keeping of hearths',
    ward: 'the warding'
  };

  /* ---------- structures: what society raises ----------
   * Nobody clicks "build". A discovery, a skilled kith, a day's work —
   * and the world gains a lean-to, then a hearth, then, where a tribe
   * lives among its shelters, a village. Structures are world content
   * with deterministic identities per (builder, day), so drifted copies
   * raise the same buildings and merges never duplicate a town. */

  var STRUCT_CAP = 14;

  function ensureStructures(w) {
    if (!w.structures) w.structures = {};
    return w.structures;
  }

  function structDist(s, x, y) {
    return Math.sqrt((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y));
  }

  // A building is not raised in an instant — you watch it rise. Progress is a
  // pure function of how long since it was begun, so every copy of a world
  // agrees exactly on how far along it is (and once merged, on the one true
  // start time). Structures from before this idea have no start and simply
  // stand, already finished.
  var BUILD_MS = 45 * 60 * 1000; // a lean-to takes about three quarters of an hour
  function structRaised(s, now) {
    if (!s || s.start == null) return 1;
    var r = (now - s.start) / BUILD_MS;
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  function buildStructure(w, k, type, dayBucket) {
    ensureStructures(w);
    var sid = (type === 'hearth' ? 'h' : 'st') + hash32(k.id + ':build:' + type + ':' + dayBucket).toString(16);
    if (w.structures[sid]) return null; // today's work is already done
    var builtCount = 0;
    Object.keys(w.structures).forEach(function (id) { if (w.structures[id].type !== 'field') builtCount++; });
    if (builtCount >= STRUCT_CAP) return null; // fields don't count against shelters
    var terrain = makeTerrain(w.id);
    if (!isLandAt(terrain, k.x, k.y)) return null;
    var s = {
      id: sid,
      type: type,
      x: k.x, y: k.y,
      by: k.id,
      built: env.now(),
      start: env.now(), // when the raising began — progress derives from this
      u: bumpClock(w)
    };
    w.structures[sid] = s;
    var whereName = realmBiome(w.id, biomeAt(terrain, k.x, k.y));
    chronicle(w, 'discovery', type === 'hearth'
      ? kithLabel(k) + ' began setting a ring of stones by the shelters, to keep a fire in the ' + whereName + '.'
      : kithLabel(k) + ' began piling stems against the stone in the ' + whereName + ' — a lean-to, rising.',
      'sb' + sid);
    return s;
  }

  function skillName(skill) { return SKILL_NAMES[skill] || skill; }

  function learn(w, k, skill) {
    if (knowsOf(k).indexOf(skill) > -1) return false;
    k.knows = knowsOf(k).concat([skill]);
    k.u = bumpClock(w);
    return true;
  }

  var MAX_WILD_PLANTS = 40;

  // A seed-keeper gardens: at most one deterministic planting per day, so
  // drifted copies of the world grow the same gardener's garden.
  function keeperPlant(w, k, dayBucket) {
    var plantId = 'g' + hash32(k.id + ':garden:' + dayBucket).toString(16);
    if (w.plants[plantId]) return null;
    if (Object.keys(w.plants).length >= MAX_WILD_PLANTS) return null;
    var favourites = Object.keys(k.taste || {}).filter(function (s) { return k.taste[s] > 0.3; })
      .sort(function (a, b) { return k.taste[b] - k.taste[a] || (a < b ? -1 : 1); });
    if (favourites.length === 0) return null;
    var species = favourites[0];
    // seeds come from a living plant of that species; extinct species are lost
    var stock = null;
    Object.keys(w.plants).sort().forEach(function (pid) {
      if (!stock && w.plants[pid].species === species) stock = w.plants[pid];
    });
    if (!stock) return null;
    var rng = mulberry32(hash32(plantId));
    var terrain = makeTerrain(w.id);
    // a gardener plants in a cleared field if one is near — ash-rich tilled
    // ground where the garden grows faster. Placement uses its own seed so the
    // seed's GENOME never depends on whether a field happened to be there.
    var field = null, fieldD = 0.2;
    Object.keys(w.structures || {}).forEach(function (id) {
      var s = w.structures[id];
      if (s.type !== 'field') return;
      var d = Math.sqrt((s.x - k.x) * (s.x - k.x) + (s.y - k.y) * (s.y - k.y));
      if (d < fieldD) { fieldD = d; field = s; }
    });
    var spot, soil;
    if (field) {
      var frng = mulberry32(hash32(plantId + ':field'));
      var fx = field.x + (frng() - 0.5) * 0.05, fy = field.y + (frng() - 0.5) * 0.04;
      if (!isSoilAt(terrain, fx, fy)) { fx = field.x; fy = field.y; }
      spot = { x: fx, y: fy };
      soil = Math.max(1.5, (BIOMES[biomeAt(terrain, fx, fy)].fertility || 1) * 1.6);
    } else {
      spot = isSoilAt(terrain, k.x, k.y) ? { x: k.x, y: k.y } : findSpot(w, 'garden:' + plantId, isSoilAt);
      soil = BIOMES[biomeAt(terrain, spot.x, spot.y)].fertility;
    }
    var genome = crossGenomes(rng, modernGenome(stock.genome), modernGenome(stock.genome), PLANT_GENE_SPEC);
    var plant = {
      id: plantId,
      species: species,
      name: null,
      genome: genome,
      x: spot.x, y: spot.y,
      soil: soil,
      planted: env.now(),
      tick: env.now(),
      growth: 0,
      watered: 0,
      origin: w.id,
      bornOfMerge: null,
      u: bumpClock(w)
    };
    w.plants[plantId] = plant;
    chronicle(w, 'plant', kithLabel(k) + ' planted a ' + species + ' seed in the ' +
      realmBiome(w.id, biomeAt(terrain, spot.x, spot.y)) + (field ? '’s new field' : '') + '. The garden grows itself now.', 'gp' + plantId);
    return plant;
  }

  /* ---------- clearing with fire: fields ----------
   * A seasoned gardener learns to open new ground the old way: a careful fire
   * clears a patch of wild growth, and the ash-rich earth beneath becomes a
   * field — tilled ground where the garden grows faster and thicker. Fields
   * are world content (deterministic id per gardener per day), so drifted
   * copies clear the same fields and reconcile on merge like any structure. */

  var FIELD_CAP = 6;

  function clearField(w, k, dayBucket) {
    ensureStructures(w);
    var fid = 'fld' + hash32(k.id + ':field:' + dayBucket).toString(16);
    if (w.structures[fid]) return null; // today's clearing is done
    var fieldCount = 0;
    Object.keys(w.structures).forEach(function (id) { if (w.structures[id].type === 'field') fieldCount++; });
    if (fieldCount >= FIELD_CAP) return null;
    var terrain = makeTerrain(w.id);
    if (!isSoilAt(terrain, k.x, k.y)) return null; // fields need good ground
    // the fire clears the wild growth in the patch — burned back to the root
    Object.keys(w.plants).forEach(function (pid) {
      var p = w.plants[pid];
      if (p.byHand) return; // spare the gardener's own careful plantings
      if (Math.abs(p.x - k.x) < 0.06 && Math.abs(p.y - k.y) < 0.06) {
        p.growth = 0; p.planted = env.now(); p.tick = env.now(); p.burned = env.now(); p.u = bumpClock(w);
      }
    });
    var field = { id: fid, type: 'field', x: k.x, y: k.y, by: k.id, built: env.now(), start: env.now(), u: bumpClock(w) };
    w.structures[fid] = field;
    chronicle(w, 'discovery', kithLabel(k) + ' set a careful fire, cleared a patch of ground, and broke the ash-rich earth beneath. ' +
      'A field is opened in the ' + realmBiome(w.id, biomeAt(terrain, k.x, k.y)) + '.', 'cf' + fid);
    return field;
  }

  /* ---------- kinds: speciation you can see ----------
   * A kith's kind is a pure function of its visible morphology, identical
   * in every copy of every world. Inheritance keeps children close to their
   * parents' kind; mutation eventually crosses a boundary — and a world
   * greets the first of a kind it has never seen. */

  var HUE_KIND_WORDS = ['Ember', 'Gold', 'Moss', 'Lake', 'Dusk', 'Rose'];
  var EAR_KIND_WORDS = ['Smoothbrow', 'Tuftear', 'Longear'];

  // The most distinctive feature names the creature; colour places it.
  function kindOf(genome) {
    var g = modernKithGenome(genome);
    var hueBand = Math.floor((((g.hue % 360) + 360) % 360) / 60);
    var descriptor;
    if (g.fins > 0) descriptor = 'Finback';
    else if (g.crest === 3) descriptor = 'Fancrest';
    else if (g.crest === 2) descriptor = 'Frillcrest';
    else if (g.crest === 1) descriptor = 'Spineback';
    else if (g.tail === 4) descriptor = 'Spiketail';
    else if (g.tail === 3) descriptor = 'Plumetail';
    else if (g.tail === 2) descriptor = 'Curltail';
    else if (g.eyes === 4) descriptor = 'Manygaze';
    else if (g.eyes === 3) descriptor = 'Trigaze';
    else if (g.eyes === 1) descriptor = 'Oneeye';
    else if (g.limbs === 2) descriptor = 'Strider';
    else if (g.limbs === 0) descriptor = 'Glider';
    else descriptor = EAR_KIND_WORDS[Math.max(0, Math.min(2, g.ears || 0))];
    return {
      key: hueBand + '-' + descriptor,
      name: HUE_KIND_WORDS[hueBand] + ' ' + descriptor
    };
  }

  // Called with a newborn already in w.kith: is it the first of its kind
  // among the living here? Chronicled with a deterministic id, so drifted
  // copies that both witness the birth remember one arrival, not two.
  function greetNewKind(w, child, fixedWorld) {
    var kind = kindOf(child.genome);
    var already = livingKith(w).some(function (k) {
      return k.id !== child.id && kindOf(k.genome).key === kind.key;
    });
    if (already) return null;
    var text = 'A kith of a new kind: ' + child.given + ', the first ' + kind.name +
      ' this world has seen.';
    chronicle(w, 'kind', text, 'nk' + child.id, fixedWorld);
    return { kind: 'kind', text: text };
  }

  /* Family lines, derived from parenthood: the roots are kith with no
   * recorded parents who founded a line; the branches are everyone since. */
  function familiesOf(w) {
    var all = Object.keys(w.kith || {}).map(function (id) { return w.kith[id]; });
    var childrenOf = {};
    all.forEach(function (k) {
      (k.parents || []).forEach(function (pid) {
        (childrenOf[pid] = childrenOf[pid] || []).push(k.id);
      });
    });
    Object.keys(childrenOf).forEach(function (pid) { childrenOf[pid].sort(); });
    var roots = all.filter(function (k) {
      return (!k.parents || k.parents.length === 0) && childrenOf[k.id];
    }).sort(function (a, b) { return a.born - b.born || (a.id < b.id ? -1 : 1); });
    return { roots: roots, childrenOf: childrenOf };
  }

  /* ---------- the wanderer ----------
   * Every so often a stranger walks out of the edge of the world: a body
   * from nowhere, a tongue no one here taught it, sometimes a craft. It
   * stays a day and walks on. Visits derive from world identity and time,
   * like weather — every copy of a world is visited by the same stranger
   * at the same hour, and reunions never hold two of it. */

  var WANDER_PERIOD = 14 * DAY;

  function wandererDue(worldId, t) {
    var period = Math.floor(t / WANDER_PERIOD);
    var rng = mulberry32(hash32(worldId + ':wander:' + period));
    if (rng() >= 0.55) return null; // a quiet fortnight
    var start = period * WANDER_PERIOD + Math.floor(rng() * 12.5 * DAY);
    var end = start + DAY + Math.floor(rng() * 0.25 * DAY);
    return {
      id: 'wnd' + hash32(worldId + ':wander:' + period).toString(16),
      start: start,
      end: end,
      period: period
    };
  }

  function spawnWanderer(w, due) {
    var rng = mulberry32(hash32(due.id));
    // a body from nowhere: no realm bias shapes a wanderer
    var genome = newKithGenome(rng, null);
    var spot = findSpot(w, 'wander:' + due.id, function (terrain2, x, y) {
      return isLandAt(terrain2, x, y) && (x < 0.14 || x > 0.86); // the edge of the world
    });
    var k = {
      id: due.id,
      genome: genome,
      brain: newKithBrain(rng),
      given: makeKithName(rng, genome.voice),
      name: null,
      born: due.start,
      span: 999,               // wanderers do not grow old here
      passed: null,
      departed: null,
      wanderer: { start: due.start, end: due.end },
      parents: null,
      origin: 'elsewhere',
      bornOfMerge: null,
      energy: 0.9,
      starving: null,
      taste: {},
      trust: {},
      lex: {},
      x: spot.x, y: spot.y,
      tx: null, ty: null,
      act: 'wander',
      actUntil: 0,
      facing: 1,
      u: bumpClock(w)
    };
    // it arrives already carrying its own sure words — they will spread
    ['home', 'sun', 'water', 'rain', 'mark:good', 'mark:want'].forEach(function (concept) {
      k.lex[concept] = { word: coinWord(k, concept), s: 0.85, by: k.id };
    });
    k.lex[':order'] = { word: (hash32(k.id + ':order') % 2 === 0) ? 'mf' : 'cf', s: 0.8, by: k.id };
    // one craft from far away, sometimes
    var crafts = ['seedkeeping', 'song', 'shelter', 'hearth'];
    if (rng() < 0.6) k.knows = [crafts[Math.floor(rng() * crafts.length)]];
    w.kith[k.id] = k;
    chronicle(w, 'wanderer', 'A stranger walked out of the edge of the world. It calls itself ' +
      k.given + ', and no one here taught it the words it carries. It will not stay long.',
      'wa' + k.id);
    greetNewKind(w, k);
    return k;
  }

  function departWanderer(w, k) {
    k.departed = k.wanderer.end; // the same moment in every copy
    k.u = bumpClock(w);
    if (w.emissary === k.id) w.emissary = null;
    var befriended = livingKith(w).some(function (o) { return (o.trust[k.id] || 0) >= 0.5; });
    var giftText = '';
    if (befriended) {
      // first gift: its craft, to a bonded curious friend who lacks it
      var craft = knowsOf(k)[0];
      var pupil = craft && livingKith(w).filter(function (o) {
        return (o.trust[k.id] || 0) >= 0.5 && o.brain.curiosity > 0.35 && knowsOf(o).indexOf(craft) === -1;
      }).sort(function (a, b) { return a.id < b.id ? -1 : 1; })[0];
      if (pupil) {
        learn(w, pupil, craft);
        giftText = ' Before it left, it taught ' + kithLabel(pupil) + ' ' + skillName(craft) + '.';
      } else {
        // second gift: a seed from nowhere
        var plantId = 'wp' + k.id;
        if (!w.plants[plantId]) {
          var rng = mulberry32(hash32(plantId));
          var terrain = makeTerrain(w.id);
          var spot = isSoilAt(terrain, k.x, k.y) ? { x: k.x, y: k.y } : findSpot(w, 'wanderplant:' + k.id, isSoilAt);
          w.plants[plantId] = {
            id: plantId,
            species: makeKithName(rng, k.genome.voice) + 'bloom',
            name: null,
            genome: {
              form: PLANT_FORMS[Math.floor(rng() * PLANT_FORMS.length)],
              hue: Math.floor(rng() * 360),
              size: 0.5 + rng() * 0.4,
              aspect: 0.7 + rng() * 0.8,
              detail: 2 + Math.floor(rng() * 5),
              glow: rng() < 0.5,
              rate: 0.8 + rng() * 0.6
            },
            x: spot.x, y: spot.y,
            soil: BIOMES[biomeAt(terrain, spot.x, spot.y)].fertility,
            planted: k.wanderer.end,
            tick: k.wanderer.end,
            growth: 0,
            watered: 0,
            origin: 'elsewhere',
            byHand: false,
            bornOfMerge: null,
            u: bumpClock(w)
          };
          giftText = ' Where it last stood, a seed from elsewhere was left in the ground.';
        }
      }
    }
    chronicle(w, 'wanderer', kithLabel(k) + ' walked on, the way wanderers do.' +
      (giftText || (befriended ? '' : ' It left nothing but footprints and a few strange words.')),
      'wd' + k.id);
    return { kind: 'wanderer', text: kithLabel(k) + ' walked on.' + giftText };
  }

  // Called each tick: arrivals and departures at their appointed hours.
  function wandererTick(w, now, events) {
    var due = wandererDue(w.id, now);
    if (due && now >= due.start && now <= due.end && !w.kith[due.id]) {
      var visitor = spawnWanderer(w, due);
      events.push({ kind: 'wanderer', text: 'A stranger has come: ' + visitor.given + '. It will not stay long.' });
    }
    Object.keys(w.kith).forEach(function (id) {
      var k = w.kith[id];
      if (k.wanderer && !k.departed && !k.passed && now > k.wanderer.end) {
        events.push(departWanderer(w, k));
      }
    });
  }

  /* ---------- expeditions beyond the edge ----------
   * The mirror of the Wanderer: now and then one of a world's OWN kith — a
   * restless, bold, curious soul — walks off the edge of the map and is gone
   * for days. It comes back changed: a relic from nowhere, a craft learned far
   * away, a scar and a hard story — or it never returns, and is mourned.
   *
   * WHEN a party sets out and how long it is gone derive from world identity
   * and time (like the weather); WHO goes is chosen from stable content
   * (traits, age, standing), never from a copy's fleeting mood; and WHAT is
   * found derives from the expedition's own seed. So identical copies send the
   * same soul on the same day and it returns with the same tale. The merge is
   * "merge-lite" (whole-kith, last clock wins): the more-travelled version of a
   * kith always outranks the one still waiting, and the chronicle dedupes the
   * telling — so reunited worlds hold one journey, not two. */

  var EXPED_PERIOD = 9 * DAY;

  var EXPED_PLACES = [
    'a forest drowned to its crowns', 'a plain of black glass',
    'a canyon that sang in the wind', 'an island ringed with old bones',
    'a warm and shoreless sea', 'a range of a hundred grey peaks',
    'a garden gone wild and vast', 'a valley breathing steam',
    'a wood whose trees had walked', 'a still city with no one left in it'
  ];
  var EXPED_DEEDS = [
    'it traded words with things it could not name',
    'it slept in the halls of an older people',
    'it followed a cold river to its spring',
    'it out-waited a long and starless winter',
    'it was carried a while by a great slow beast',
    'it learned the song the wind was singing there',
    'it went hungry, and would not turn back',
    'it made an unlikely friend, and lost it again'
  ];
  var EXPED_RELIC_ADJ = ['a pale', 'a foreign', 'a light-holding', 'a sea-worn', 'a carved', 'a humming', 'a cold', 'a golden'];
  var EXPED_RELIC_NOUN = ['shell', 'stone', 'ring', 'feather', 'coin', 'seed-pod', 'bead', 'key to no lock here'];

  function expeditionDue(worldId, t) {
    var period = Math.floor(t / EXPED_PERIOD);
    var rng = mulberry32(hash32(worldId + ':exped:' + period));
    if (rng() >= 0.5) return null; // no one hears the horizon this while
    var start = period * EXPED_PERIOD + Math.floor(rng() * 7 * DAY);
    var away = (3 + Math.floor(rng() * 6)) * DAY; // three to eight days gone
    return {
      id: 'xpd' + hash32(worldId + ':exped:' + period).toString(16),
      start: start,
      back: start + away,
      period: period
    };
  }

  // The restless who might answer the horizon — chosen from CONTENT alone
  // (traits, stage, standing, span), so every copy would pick the same soul.
  function expeditionCandidates(w, now, back) {
    return livingKith(w).filter(function (k) {
      if (k.wanderer || k.expedition || k.passed || k.departed) return false;
      if (w.emissary === k.id) return false; // the emissary stays for the meeting-stone
      if (kithStage(k, now) !== 'grown') return false; // the young and the old stay home
      if ((k.born + (k.span || 16) * DAY) <= back) return false; // must outlast the journey
      return (k.brain.curiosity + k.brain.boldness + k.brain.wanderlust) >= 1.7;
    });
  }

  function departExpedition(w, due, events) {
    if (w.chronicle.some(function (e) { return e.id === 'xd' + due.id; })) return; // already set out
    var cands = expeditionCandidates(w, env.now(), due.back);
    if (!cands.length) return; // the horizon called, but no one restless enough was free
    // the most restless goes; a per-journey jitter breaks ties, deterministically
    cands.sort(function (a, b) {
      var ra = a.brain.curiosity + a.brain.boldness + a.brain.wanderlust + (hash32(due.id + a.id) % 1000) / 4000;
      var rb = b.brain.curiosity + b.brain.boldness + b.brain.wanderlust + (hash32(due.id + b.id) % 1000) / 4000;
      return rb - ra || (a.id < b.id ? -1 : 1);
    });
    var goer = cands[0];
    goer.expedition = { id: due.id, start: due.start, back: due.back };
    goer.starving = null; goer.tx = null; goer.ty = null; goer.act = 'wander';
    goer.u = bumpClock(w);
    var text = kithLabel(goer) + ', restless past bearing, walked out beyond the edge of the world. It may be gone some days.';
    chronicle(w, 'expedition', text, 'xd' + due.id);
    events.push({ kind: 'expedition', text: text });
  }

  function returnExpedition(w, k, now) {
    var exp = k.expedition;
    var rng = mulberry32(hash32(exp.id + ':outcome'));
    var place = EXPED_PLACES[Math.floor(rng() * EXPED_PLACES.length)];
    var deed = EXPED_DEEDS[Math.floor(rng() * EXPED_DEEDS.length)];
    var roll = rng();

    if (roll < 0.16) {
      // lost — it never comes home. A gentle hand: mourned, not gruesome.
      k.passed = exp.back;      // the same moment in every copy
      k.lostBeyond = true;      // how they were lost, kept for the record
      if (w.emissary === k.id) w.emissary = null;
      k.u = bumpClock(w);
      var lostText = 'Beyond the edge, ' + kithLabel(k) + ' found ' + place + ', where ' + deed +
        '. It did not come home. The world keeps a place for it.';
      chronicle(w, 'passing', lostText, 'xr' + exp.id);
      return { kind: 'passing', text: kithLabel(k) + ' did not return from beyond the edge.' };
    }

    // survivors reappear at the edge they left from
    var spot = findSpot(w, 'expreturn:' + exp.id, function (t2, x, y) {
      return isLandAt(t2, x, y) && (x < 0.14 || x > 0.86);
    });
    k.x = spot.x; k.y = spot.y; k.tx = null; k.ty = null; k.facing = 1;
    k.act = 'wander'; k.energy = 0.8; k.starving = null;
    k.expedition = null;

    var tail;
    if (roll < 0.5) {
      var relicName = EXPED_RELIC_ADJ[Math.floor(rng() * EXPED_RELIC_ADJ.length)] + ' ' +
        EXPED_RELIC_NOUN[Math.floor(rng() * EXPED_RELIC_NOUN.length)];
      k.relics = (k.relics || []).concat([{ id: 'rl' + exp.id, name: relicName }]);
      tail = 'and came home carrying ' + relicName + '.';
    } else if (roll < 0.72) {
      var crafts = ['seedkeeping', 'song', 'shelter', 'hearth'].filter(function (c) { return knowsOf(k).indexOf(c) === -1; });
      if (crafts.length) {
        var craft = crafts[Math.floor(rng() * crafts.length)];
        learn(w, k, craft); // bumps the clock
        tail = 'and came home having learned ' + skillName(craft) + '.';
      } else {
        k.relics = (k.relics || []).concat([{ id: 'rl' + exp.id, name: 'a strange keepsake' }]);
        tail = 'and came home with a strange keepsake.';
      }
    } else if (roll < 0.88) {
      k.scars = (k.scars || 0) + 1;
      tail = 'and came home changed — a long pale scar, and fewer words than before.';
    } else {
      tail = plantExpeditionSeed(w, k, exp, rng);
    }
    k.u = bumpClock(w);
    var text = 'Beyond the edge, ' + kithLabel(k) + ' found ' + place + ', where ' + deed + ', ' + tail;
    chronicle(w, 'expedition', text, 'xr' + exp.id);
    return { kind: 'expedition', text: kithLabel(k) + ' has come home from beyond the edge.' };
  }

  // A seed from nowhere, planted where the traveller returned. Deterministic
  // id, so drifted copies grow the one same foreign bloom.
  function plantExpeditionSeed(w, k, exp, rng) {
    var plantId = 'xp' + exp.id;
    if (w.plants[plantId] || Object.keys(w.plants).length >= MAX_WILD_PLANTS) {
      return 'and came home with a fistful of seeds from a plant that grows nowhere here.';
    }
    var terrain = makeTerrain(w.id);
    var spot = isSoilAt(terrain, k.x, k.y) ? { x: k.x, y: k.y } : findSpot(w, 'expseed:' + exp.id, isSoilAt);
    w.plants[plantId] = {
      id: plantId,
      species: makeKithName(rng, k.genome.voice) + 'bloom',
      name: null,
      genome: {
        form: PLANT_FORMS[Math.floor(rng() * PLANT_FORMS.length)],
        hue: Math.floor(rng() * 360),
        size: 0.5 + rng() * 0.4,
        aspect: 0.7 + rng() * 0.8,
        detail: 2 + Math.floor(rng() * 5),
        glow: rng() < 0.5,
        rate: 0.8 + rng() * 0.6
      },
      x: spot.x, y: spot.y,
      soil: BIOMES[biomeAt(terrain, spot.x, spot.y)].fertility,
      planted: exp.back, tick: exp.back,
      growth: 0, watered: 0, origin: 'beyond the edge', byHand: false, bornOfMerge: null,
      u: bumpClock(w)
    };
    return 'and came home to plant a seed of a bloom that grows nowhere here.';
  }

  function expeditionTick(w, now, events) {
    var due = expeditionDue(w.id, now);
    if (due && now >= due.start && now < due.back) {
      departExpedition(w, due, events);
    }
    Object.keys(w.kith).forEach(function (id) {
      var k = w.kith[id];
      if (k.expedition && !k.passed && now >= k.expedition.back) {
        events.push(returnExpedition(w, k, now));
      }
    });
  }

  /* ---------- predators: the beast at the edge ----------
   * The world grows teeth. Now and then a hunter comes — a thing suited to its
   * country and its own dark craft: some drag the kith down into the water,
   * some fall on them where they stand, some carry them off to feed their
   * young. WHEN one comes and WHAT it is derive from world identity and time
   * (like the weather); WHO it takes is chosen from stable content (the young,
   * the old, the timid, the solitary, the unwatched), never from a copy's
   * fleeting positions — so every copy suffers the same killing at the same
   * hour, with the same deterministic id, and reunited worlds mourn once.
   *
   * This is where the world is allowed to be dark. (See ROADMAP Q2, revised.) */

  var PRED_PERIOD = 11 * DAY;

  var PREDATOR_KINDS = {
    drowner:     { name: 'the drowner',        method: 'depths', look: 'serpent', tint: '#1d3a52', verb: 'uncoiled from the black water' },
    reefjaws:    { name: 'the reef-jaws',      method: 'depths', look: 'serpent', tint: '#236b6f', verb: 'rose out of the bright shallows' },
    deeplurker:  { name: 'the deep-lurker',    method: 'depths', look: 'shade',   tint: '#3a2b54', verb: 'reached up out of the ink' },
    greatcat:    { name: 'the meadow-cat',     method: 'devour', look: 'prowler', tint: '#7a5a2f', verb: 'came low through the grass' },
    ashhound:    { name: 'the ash-hound pack', method: 'devour', look: 'pack',    tint: '#6a3326', verb: 'poured out of the smoke' },
    whitepack:   { name: 'the white pack',     method: 'devour', look: 'pack',    tint: '#8ea3b8', verb: 'ran it down across the snow' },
    saltwyrm:    { name: 'the salt-wyrm',      method: 'devour', look: 'worm',    tint: '#9a8f6f', verb: 'burst up through the crust' },
    glassstalker:{ name: 'the glass-stalker',  method: 'devour', look: 'prowler', tint: '#6f8f9a', verb: 'stepped out of the glare' },
    skyraptor:   { name: 'the sky-raptor',     method: 'nest',   look: 'raptor',  tint: '#45456a', verb: 'stooped out of the cloud' },
    broodmother: { name: 'the brood-mother',   method: 'nest',   look: 'raptor',  tint: '#5a3a4a', verb: 'swept down on wide wings' },
    moorhound:   { name: 'the hound of the moor', method: 'nest', look: 'shade',  tint: '#39355a', verb: 'slipped out of the dusk' }
  };
  var REALM_PREDATORS = {
    meadow:     ['greatcat', 'broodmother'],
    lakewild:   ['drowner', 'reefjaws'],
    mistral:    ['skyraptor', 'broodmother'],
    ember:      ['ashhound'],
    frostmere:  ['whitepack'],
    fungal:     ['deeplurker', 'moorhound'],
    saltflats:  ['saltwyrm'],
    duskmoor:   ['moorhound', 'greatcat'],
    coralshelf: ['reefjaws', 'drowner'],
    glasswold:  ['glassstalker']
  };

  function predatorDue(worldId, t) {
    var period = Math.floor(t / PRED_PERIOD);
    var rng = mulberry32(hash32(worldId + ':pred:' + period));
    if (rng() >= 0.4) return null; // most seasons pass without a hunter
    var pool = REALM_PREDATORS[realmOf(worldId).key] || ['greatcat'];
    var kind = pool[Math.floor(rng() * pool.length)];
    var start = period * PRED_PERIOD + Math.floor(rng() * 9 * DAY);
    var hunt = (6 + Math.floor(rng() * 11)) * 3600 * 1000; // six to sixteen hours prowling
    var killAt = start + Math.floor(hunt * (0.3 + rng() * 0.5));
    return {
      id: 'prd' + hash32(worldId + ':pred:' + period).toString(16),
      kind: kind, start: start, end: start + hunt, killAt: killAt, period: period
    };
  }

  // A varied body, seeded from the hunt's own id — no two look quite alike.
  function predatorGenome(id) {
    var rng = mulberry32(hash32(id + ':look'));
    return {
      size: 1.8 + rng() * 1.9, hueShift: Math.floor(rng() * 46) - 23,
      eyes: 1 + Math.floor(rng() * 3), spikes: Math.floor(rng() * 6),
      elong: 0.75 + rng() * 1.0, teeth: 4 + Math.floor(rng() * 6), glow: rng() < 0.5
    };
  }

  function predatorVuln(k, w, now, due) {
    var stage = kithStage(k, now);
    var v = (stage === 'young' ? 0.5 : stage === 'elder' ? 0.35 : 0) + (1 - k.brain.boldness) * 0.4;
    var bonds = Object.keys(k.trust || {}).filter(function (id) {
      return (k.trust[id] || 0) >= 0.5 && w.kith[id] && isAlive(w.kith[id]);
    }).length;
    if (bonds === 0) v += 0.25;                              // the solitary are taken first
    if (knowsOf(k).indexOf('ward') > -1) v -= 0.5;           // a watcher is wary and hard to catch
    v += (hash32(due.id + k.id) % 1000) / 3000;              // a little cruelty of chance
    return v;
  }

  // The one it takes — chosen from CONTENT alone, so every copy agrees. A
  // hunter comes only to a peopled world, not a tiny founding band.
  function predatorVictim(w, due, now) {
    var pool = presentKith(w).filter(function (k) { return !k.wanderer; });
    if (pool.length < 4) return null;
    pool.sort(function (a, b) {
      return predatorVuln(b, w, now, due) - predatorVuln(a, w, now, due) || (a.id < b.id ? -1 : 1);
    });
    return pool[0];
  }

  // Does a defended world turn the beast back? Enough bold watchers can.
  function predatorThwart(w, due) {
    var guards = presentKith(w).filter(function (k) { return knowsOf(k).indexOf('ward') > -1; });
    if (!guards.length) return null;
    var strength = guards.reduce(function (s, k) { return s + Math.max(0, k.brain.boldness); }, 0);
    var need = 1 + mulberry32(hash32(due.id + ':thwart'))() * 1.6; // 1.0–2.6
    if (strength < need) return null;
    return guards.slice().sort(function (a, b) { return b.brain.boldness - a.brain.boldness || (a.id < b.id ? -1 : 1); })[0];
  }

  function killByPredator(w, k, due, kind, events) {
    k.passed = due.killAt;                    // the same hour in every copy
    k.takenBy = { kind: due.kind, method: kind.method };
    if (w.emissary === k.id) w.emissary = null;
    k.u = bumpClock(w);
    var Name = kind.name.charAt(0).toUpperCase() + kind.name.slice(1);
    var text;
    if (kind.method === 'depths') {
      text = Name + ' ' + kind.verb + ' and took ' + kithLabel(k) + ' down thrashing into the dark. The water reddened, then closed, and gave nothing back.';
    } else if (kind.method === 'nest') {
      text = Name + ' ' + kind.verb + ', seized ' + kithLabel(k) + ' in its claws, and bore it off to its brood. The screaming carried a long way, and then it stopped.';
    } else {
      text = Name + ' ' + kind.verb + ' and tore into ' + kithLabel(k) + ' where it stood. When it had fed, there was little left for the world to bury.';
    }
    chronicle(w, 'predator', text, 'pk' + due.id);
    events.push({ kind: 'predator', text: kithLabel(k) + ' was taken by ' + kind.name + '.' });
  }

  function predatorTick(w, now, events) {
    var due = predatorDue(w.id, now);
    if (!due || now < due.killAt || now > due.end) return;  // resolve only at the strike, within the hunt
    if (w.chronicle.some(function (e) { return e.id === 'pk' + due.id; })) return; // already resolved
    var victim = predatorVictim(w, due, now);
    if (!victim) return;
    var kind = PREDATOR_KINDS[due.kind] || PREDATOR_KINDS.greatcat;
    var champion = predatorThwart(w, due);
    if (champion) {
      var Name = kind.name.charAt(0).toUpperCase() + kind.name.slice(1);
      var offText = Name + ' ' + kind.verb + ' — but the folk stood together, and ' + kithLabel(champion) +
        ' drove it back into the dark. No one was taken this time.';
      chronicle(w, 'strife', offText, 'pk' + due.id);
      events.push({ kind: 'ward', text: offText });
      return;
    }
    killByPredator(w, victim, due, kind, events);
  }

  // A living portrait of the current hunter, for the eye above — pure, so it
  // needs no stored state. Null when nothing stalks (or the world is too small
  // to draw a hunter to it).
  function predatorAt(w, now) {
    var due = predatorDue(w.id, now);
    if (!due || now < due.start || now > due.end) return null;
    var victim = predatorVictim(w, due, now);
    if (!victim) return null;
    var kind = PREDATOR_KINDS[due.kind] || PREDATOR_KINDS.greatcat;
    return {
      id: due.id, kind: due.kind, name: kind.name, look: kind.look, method: kind.method, tint: kind.tint,
      start: due.start, end: due.end, killAt: due.killAt,
      phase: now < due.killAt ? 'stalking' : 'after',
      resolved: w.chronicle.some(function (e) { return e.id === 'pk' + due.id; }),
      victimId: victim.id, genome: predatorGenome(due.id)
    };
  }

  /* ---------- realm-borne catastrophe: the world as antagonist ----------
   * Some countries can turn on the folk all at once. The sea gathers and comes
   * ashore; the fire-mountain wakes; the dry grass catches and runs; the peak
   * lets go its snow; the ground itself heaves. Each realm has its own, seeded
   * from world identity and time like the weather, and each unfolds in three
   * acts — a WARNING the folk read and flee, a STRIKE, and an AFTERMATH.
   *
   * WHO is lost is chosen from stable content (the young, the old, the timid,
   * the un-defended — a swimmer rides out the water, the sheltered outlast the
   * ash), never from a copy's live positions, so every copy suffers the same
   * loss at the same hour and reunited worlds grieve once. The fleeing to high
   * ground is real to watch but does not decide the toll — who you are does. */

  var DIS_PERIOD = 13 * DAY;

  var DISASTER_KINDS = {
    tsunami:   { name: 'a tsunami',     method: 'drown', visual: 'wave',
      warn: 'Far out, the sea is drawing back from the shore — further than the sea should. Something is coming.',
      strike: 'The sea returned as a grey wall of water and broke over the low ground.',
      after: 'The water drew back at last, and the folk who reached high ground came down to a changed shore.' },
    flood:     { name: 'a great flood', method: 'drown', visual: 'wave',
      warn: 'The waters are rising, and they are not stopping where waters stop.',
      strike: 'The flood came up over the low ground and kept coming.',
      after: 'The waters fell. Mud and a great silence lay where the low ground had been.' },
    wildfire:  { name: 'a wildfire',    method: 'burn',  visual: 'fire',
      warn: 'Smoke on the wind, and a red line crawling through the dry country.',
      strike: 'The fire caught and ran through the dry country faster than legs could carry.',
      after: 'The fire burned itself out. Black ground now — but under the ash the soil lies rich for what comes next.' },
    eruption:  { name: 'an eruption',   method: 'burn',  visual: 'ash',
      warn: 'The fire-mountain is smoking, and the ground is warm underfoot.',
      strike: 'The mountain woke and threw fire and a sky full of ash across the country.',
      after: 'The mountain settled. Ash lies over everything, pale and deep and quiet.' },
    avalanche: { name: 'an avalanche',  method: 'bury',  visual: 'snow',
      warn: 'A crack ran along the high snow, loud as a breaking bone.',
      strike: 'The whole white weight of the peak let go and came down.',
      after: 'The snow settled back into silence. Under it, the mountain kept what it took.' },
    quake:     { name: 'an earthquake', method: 'crush', visual: 'shake',
      warn: 'The ground shivers, and the birds have all gone quiet at once.',
      strike: 'The ground heaved and split, and what stood tall came down.',
      after: 'The shaking stopped. The land lay cracked and rearranged, and very still.' }
  };
  var REALM_DISASTERS = {
    meadow:     ['wildfire', 'flood'], lakewild: ['tsunami', 'flood'], mistral: ['avalanche', 'quake'],
    ember:      ['eruption'],          frostmere: ['avalanche'],       fungal:  ['quake', 'flood'],
    saltflats:  ['wildfire', 'quake'], duskmoor:  ['wildfire', 'flood'], coralshelf: ['tsunami'],
    glasswold:  ['quake']
  };

  function disasterDue(worldId, t) {
    var period = Math.floor(t / DIS_PERIOD);
    var rng = mulberry32(hash32(worldId + ':cata:' + period));
    if (rng() >= 0.35) return null; // most seasons the country keeps its peace
    var pool = REALM_DISASTERS[realmOf(worldId).key] || ['quake'];
    var type = pool[Math.floor(rng() * pool.length)];
    var warnAt = period * DIS_PERIOD + Math.floor(rng() * 10 * DAY);
    var strikeAt = warnAt + Math.floor((2 + rng() * 4) * 3600 * 1000);   // 2–6 hours of warning
    var endAt = strikeAt + Math.floor((1 + rng() * 3) * 3600 * 1000);
    var severity = rng() < 0.25 ? 0 : 1 + Math.floor(rng() * 3);         // a quarter pass as near-misses
    return {
      id: 'cat' + hash32(worldId + ':cata:' + period).toString(16),
      type: type, warnAt: warnAt, strikeAt: strikeAt, endAt: endAt, severity: severity, period: period
    };
  }

  // A living read of the current catastrophe, pure, for the eye above and for
  // the fleeing minds below. Null when the country is at peace.
  function disasterAt(worldId, now) {
    var due = disasterDue(worldId, now);
    if (!due || now < due.warnAt || now >= due.endAt) return null;
    var kind = DISASTER_KINDS[due.type] || DISASTER_KINDS.quake;
    return {
      id: due.id, type: due.type, name: kind.name, method: kind.method, visual: kind.visual,
      severity: due.severity, warnAt: due.warnAt, strikeAt: due.strikeAt, endAt: due.endAt,
      phase: now < due.strikeAt ? 'warning' : 'strike'
    };
  }

  function disasterVuln(k, w, now, due) {
    var stage = kithStage(k, now);
    var v = (stage === 'young' ? 0.5 : stage === 'elder' ? 0.4 : 0) + (1 - k.brain.boldness) * 0.35;
    var kind = DISASTER_KINDS[due.type] || DISASTER_KINDS.quake;
    if (kind.method === 'drown') { if (isSwimmer(k)) v -= 0.75; }                 // a swimmer rides it out
    else if (kind.method === 'burn' || kind.method === 'bury') {
      if (knowsOf(k).indexOf('shelter') > -1) v -= 0.45;                          // the sheltered outlast it
    }
    v += (hash32(due.id + k.id) % 1000) / 3000;
    return v;
  }

  function disasterKill(w, k, due) {
    k.passed = due.strikeAt;                    // the same hour in every copy
    k.lostTo = { type: due.type };
    if (w.emissary === k.id) w.emissary = null;
    k.u = bumpClock(w);
  }

  // Whether a kith in the path rides it out — an appropriate defence gives a
  // real chance to live, so a world that knows the water (all swimmers) or the
  // shelter loses fewer, not just different ones. Deterministic, seeded.
  function disasterSaved(k, due) {
    var kind = DISASTER_KINDS[due.type] || DISASTER_KINDS.quake;
    var save = 0;
    if (kind.method === 'drown') { if (isSwimmer(k)) save = 0.85; }
    else if (kind.method === 'burn' || kind.method === 'bury') { if (knowsOf(k).indexOf('shelter') > -1) save = 0.7; }
    save += k.brain.boldness * 0.12;                                  // the bold react fast
    if (kithStage(k, due.strikeAt) === 'young') save -= 0.15;         // the young, slower
    return mulberry32(hash32(due.id + k.id + ':save'))() < save;
  }

  // Wildfire clears the dry country: about half the growth burns to the ground
  // and grows back from the ash. Deterministic, and merges by the plant clock.
  function burnPlants(w, due) {
    var rng = mulberry32(hash32(due.id + ':burn'));
    Object.keys(w.plants).sort().forEach(function (pid) {
      var p = w.plants[pid];
      if (rng() < 0.5) {
        p.growth = 0; p.planted = due.strikeAt; p.tick = due.strikeAt; p.burned = due.strikeAt;
        p.u = bumpClock(w);
      }
    });
  }

  function resolveStrike(w, due, kind, events) {
    var pool = presentKith(w);
    var names = [];
    if (pool.length >= 4 && due.severity > 0) {
      var toll = Math.min(due.severity, Math.floor(pool.length * 0.34));
      pool.sort(function (a, b) {
        return disasterVuln(b, w, due.strikeAt, due) - disasterVuln(a, w, due.strikeAt, due) || (a.id < b.id ? -1 : 1);
      });
      // the toll is the most it can take; those with the right defence ride it
      // out, so a prepared world loses fewer — not merely different souls
      for (var i = 0; i < toll && i < pool.length; i++) {
        if (disasterSaved(pool[i], due)) continue;
        disasterKill(w, pool[i], due); names.push(kithLabel(pool[i]));
      }
    }
    if (due.type === 'wildfire') burnPlants(w, due);
    if (!names.length) {
      var sparedText = kind.strike + ' But the folk had read the signs and run high, and it took no one.';
      chronicle(w, 'catastrophe', sparedText, 'ds' + due.id);
      events.push({ kind: 'spared', text: sparedText });
      return;
    }
    var who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    var line = kind.method === 'drown' ? ' It took ' + who + ' down into the water.'
      : kind.method === 'burn' ? ' ' + who + ' could not outrun it.'
      : kind.method === 'bury' ? ' ' + who + ' lie under the white now.'
      : ' It came down upon ' + who + '.';
    chronicle(w, 'catastrophe', kind.strike + line, 'ds' + due.id);
    events.push({ kind: 'catastrophe', text: names.length + (names.length === 1 ? ' of the folk was' : ' of the folk were') + ' lost to ' + kind.name + '.' });
  }

  function disasterTick(w, now, events) {
    var due = disasterDue(w.id, now);
    if (!due) return;
    var kind = DISASTER_KINDS[due.type] || DISASTER_KINDS.quake;
    if (now >= due.warnAt && !w.chronicle.some(function (e) { return e.id === 'dw' + due.id; })) {
      chronicle(w, 'omen', kind.warn, 'dw' + due.id);
      events.push({ kind: 'omen', text: kind.warn });
    }
    if (now >= due.strikeAt && !w.chronicle.some(function (e) { return e.id === 'ds' + due.id; })) {
      resolveStrike(w, due, kind, events);
    }
    if (now >= due.endAt && !w.chronicle.some(function (e) { return e.id === 'da' + due.id; })) {
      chronicle(w, 'aftermath', kind.after, 'da' + due.id);
      events.push({ kind: 'aftermath', text: kind.after });
    }
  }

  // Where a frightened kith runs: the highest reachable ground nearby. Purely
  // presentation (survival is decided by content), and free of randomness so
  // the world's deterministic stream is untouched.
  function fleeTarget(terrain, k) {
    var best = null, bestH = -Infinity;
    for (var i = 0; i < 12; i++) {
      var ang = i / 12 * Math.PI * 2;
      for (var step = 1; step <= 3; step++) {
        var rad = 0.08 * step;
        var x = Math.max(0.03, Math.min(0.97, k.x + Math.cos(ang) * rad));
        var y = Math.max(0.56, Math.min(0.97, k.y + Math.sin(ang) * rad));
        if (!canStandAt(terrain, k, x, y) || !reachableStraight(terrain, k, k.x, k.y, x, y)) continue;
        var h = terrainCell(terrain, x, y);
        if (h > bestH) { bestH = h; best = { x: x, y: y }; }
      }
    }
    return best;
  }

  /* ---------- the almanac ----------
   * A book of pages that write themselves. Each page is a riddle until the
   * world makes it true; then it fills with the date and the names, and
   * never unfills. Two pages are SEALED — invisible until the day they
   * happen — so the game's best surprises stay surprises. */

  function firstWhere(map, test) {
    var ids = Object.keys(map).sort();
    for (var i = 0; i < ids.length; i++) {
      if (test(map[ids[i]])) return map[ids[i]];
    }
    return null;
  }

  var ALMANAC_PAGES = [
    {
      id: 'hand-seed', title: 'A seed by your hand', riddle: 'Put something into the ground yourself.',
      test: function (w) { return !!firstWhere(w.plants, function (p) { return p.byHand; }); },
      note: function (w) { var p = firstWhere(w.plants, function (p2) { return p2.byHand; }); return 'the ' + p.species; }
    },
    {
      id: 'full-bloom', title: 'A bloom at its fullest', riddle: 'Wait for colour.',
      test: function (w) { return !!firstWhere(w.plants, function (p) { return p.growth >= 1; }); },
      note: function (w) { var p = firstWhere(w.plants, function (p2) { return p2.growth >= 1; }); return 'the ' + p.species; }
    },
    {
      id: 'named-kith', title: 'A name, bestowed', riddle: 'Call one of them something only you would choose.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return !!k.name; }); },
      note: function (w) { return firstWhere(w.kith, function (k) { return !!k.name; }).name; }
    },
    {
      id: 'emissary', title: 'An emissary blessed', riddle: 'Choose one to stand for this world.',
      test: function (w) { return !!(w.emissary && w.kith[w.emissary]); },
      note: function (w) { return kithLabel(w.kith[w.emissary]); }
    },
    {
      id: 'fast-friends', title: 'Two who chose each other', riddle: 'Friendship is made of crossings.',
      test: function (w) {
        var alive = livingKith(w);
        for (var i = 0; i < alive.length; i++) {
          for (var j = i + 1; j < alive.length; j++) {
            if ((alive[i].trust[alive[j].id] || 0) >= 0.5 && (alive[j].trust[alive[i].id] || 0) >= 0.5) return true;
          }
        }
        return false;
      }
    },
    {
      id: 'child-born', title: 'A child of this world', riddle: 'Where trust and fair weather meet.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return k.parents && k.origin !== 'merge'; }); },
      note: function (w) { return firstWhere(w.kith, function (k) { return k.parents && k.origin !== 'merge'; }).given; }
    },
    {
      id: 'full-days', title: 'A whole life, start to end', riddle: 'Some pages take a lifetime.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return k.passed && k.span && k.passed === k.born + k.span * DAY; }); },
      note: function (w) {
        var k = firstWhere(w.kith, function (k2) { return k2.passed && k2.span && k2.passed === k2.born + k2.span * DAY; });
        return kithLabel(k) + ', ' + k.span + ' days';
      }
    },
    {
      id: 'tribe', title: 'A tribe, self-named', riddle: 'Enough friendship becomes a people.',
      test: function (w) { return tribesOf(w).length > 0; },
      note: function (w) { var t = tribesOf(w)[0]; return t ? 'the ' + t.name : ''; }
    },
    {
      id: 'one-word', title: 'A word on every tongue', riddle: 'Let them agree on something.',
      test: function (w) {
        var alive = livingKith(w);
        if (alive.length < 3) return false;
        var concepts = Object.keys(alive[0].lex || {});
        for (var i = 0; i < concepts.length; i++) {
          var c = concepts[i];
          if (c === ':order') continue;
          var word = alive[0].lex[c].word;
          var everyone = alive.every(function (k) { return k.lex && k.lex[c] && k.lex[c].word === word; });
          if (everyone) return true;
        }
        return false;
      }
    },
    {
      id: 'feeling-worded', title: 'A feeling put into words', riddle: 'Not just things — what things mean.',
      test: function (w) {
        return !!firstWhere(w.kith, function (k) {
          return k.lex && Object.keys(k.lex).some(function (c) { return c.indexOf('mark:') === 0; });
        });
      }
    },
    {
      id: 'craft-seed', title: 'The way of seed-keeping', riddle: 'A curious mind and a well-loved plant.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('seedkeeping') > -1; }); },
      note: function (w) { return kithLabel(firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('seedkeeping') > -1; })); }
    },
    {
      id: 'craft-song', title: 'The first song', riddle: 'Some things are only found in storms.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('song') > -1; }); },
      note: function (w) { return kithLabel(firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('song') > -1; })); }
    },
    {
      id: 'craft-shelter', title: 'A roof against the rain', riddle: 'Stubbornness, soaked through.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('shelter') > -1; }); },
      note: function (w) { return kithLabel(firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('shelter') > -1; })); }
    },
    {
      id: 'craft-hearth', title: 'A fire kept alive', riddle: 'Warmth is a skill.',
      test: function (w) { return !!firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('hearth') > -1; }); },
      note: function (w) { return kithLabel(firstWhere(w.kith, function (k) { return knowsOf(k).indexOf('hearth') > -1; })); }
    },
    {
      id: 'village', title: 'A village', riddle: 'A fire, roofs around it, friends among them.',
      test: function (w) { return w.chronicle.some(function (e) { return e.text.indexOf('first village') > -1; }); }
    },
    {
      id: 'worlds-met', title: 'Worlds met', riddle: 'This world is not the only one.',
      test: function (w) { return (w.lineage || []).length > 0; },
      note: function (w) { return w.lineage[0] ? 'first: ' + w.lineage[0].name : ''; }
    },
    {
      id: 'hybrid-plant', title: 'A bloom of two worlds', riddle: 'Some seeds need a meeting.',
      test: function (w) { return !!firstWhere(w.plants, function (p) { return p.origin === 'merge'; }); },
      note: function (w) { return 'the ' + firstWhere(w.plants, function (p) { return p.origin === 'merge'; }).species; }
    },
    {
      id: 'wanderer-gift', title: 'A stranger, befriended', riddle: 'Be kind to those just passing through.',
      test: function (w) {
        return w.chronicle.some(function (e) {
          return e.id.indexOf('wd') === 0 && (e.text.indexOf('taught') > -1 || e.text.indexOf('seed from elsewhere') > -1);
        });
      }
    },
    {
      id: 'winter-weathered', title: 'A winter weathered', riddle: 'Endure the lean season.',
      test: function (w) {
        if (livingKith(w).length === 0) return false;
        var now = env.now();
        var firstIndex = seasonAt(w.born).index + 1;
        var lastIndex = seasonAt(now).index - 1;
        for (var i = firstIndex; i <= lastIndex && i < firstIndex + 400; i++) {
          if (SEASONS[((i % 4) + 4) % 4] === 'winter') return true;
        }
        return false;
      }
    },
    {
      id: 'gardener-named', title: 'Your name, given', sealed: true,
      test: function (w) { return !!w.gardenerNamed; },
      note: function (w) { return '“' + w.gardenerNamed.word + '”, first spoken by ' + (w.kith[w.gardenerNamed.by] ? kithLabel(w.kith[w.gardenerNamed.by]) : 'one of them'); }
    },
    {
      id: 'every-tongue', title: 'Your name on every tongue', sealed: true,
      test: function (w) {
        if (!w.gardenerNamed) return false;
        var alive = livingKith(w);
        return alive.length >= 3 && alive.every(function (k) { return k.lex && k.lex.gardener; });
      },
      note: function (w) { return '“' + w.gardenerNamed.word + '”'; }
    }
  ];

  function almanacTick(w) {
    if (!w.almanac) w.almanac = {};
    var events = [];
    ALMANAC_PAGES.forEach(function (page) {
      if (w.almanac[page.id]) return;
      var filled = false;
      try { filled = page.test(w); } catch (e) { /* a page that cannot yet be read */ }
      if (!filled) return;
      var note = '';
      try { note = page.note ? page.note(w) : ''; } catch (e) { /* let the date suffice */ }
      w.almanac[page.id] = { at: env.now(), note: note };
      bumpClock(w);
      events.push({ kind: 'almanac', text: '✦ The Almanac wrote a page: “' + page.title + '”' + (note ? ' — ' + note : '') + '.' });
    });
    return events;
  }

  function almanacPages() {
    return ALMANAC_PAGES.map(function (p) {
      return { id: p.id, title: p.title, riddle: p.riddle || '', sealed: !!p.sealed };
    });
  }

  var WHISPER_COOLDOWN = 20 * 3600 * 1000;

  function whisperWord(w, concept, rawWord) {
    var word = String(rawWord || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 10);
    if (!word || word.length < 2) return { ok: false, why: 'A whisper needs a small, simple word.' };
    if (w.whispered && env.now() - w.whispered < WHISPER_COOLDOWN) {
      return { ok: false, why: 'The world can only hold one whisper a day.' };
    }
    var e = w.emissary && w.kith[w.emissary];
    if (!e || e.passed) return { ok: false, why: 'Whispers need a living emissary to hear them.' };
    if (!e.lex) e.lex = {};
    e.lex[concept] = { word: word, s: 1, by: 'whisper' };
    e.g = (e.g || 0) + 0.4; // to be spoken to is to know someone is there
    e.u = bumpClock(w);
    w.whispered = env.now();
    chronicle(w, 'kith', 'Something on the wind whispered to ' + kithLabel(e) + ', who now calls ' +
      conceptLabel(concept) + ' “' + word + '”.');
    return { ok: true, word: word };
  }

  /* ---------- realms: the natures of worlds ----------
   * A world's realm is derived purely from its identity, like its land.
   * The realm decides what the land means: what fills the low places, what
   * the weather is called, what grows, what bodies the founders are born
   * with, and who may cross the deeps. Merges between realms are first
   * contact between natures. */

  var REALMS = {
    meadow: {
      name: 'the Meadowrealm', weight: 4, wl: [0.24, 0.4], pass: 'swim', finBias: 0.5,
      born: 'among the green vales', glowBias: 0.22, forms: null,
      biomes: { deep: 'deep water', shallows: 'shallows', shore: 'sandy shore', meadow: 'meadow', rock: 'rocky ground', peak: 'stony peaks' },
      wx: { rain: 'rain', mist: 'mist', storm: 'storm', breeze: 'breeze' }
    },
    lakewild: {
      name: 'the Lakewild', weight: 3, wl: [0.42, 0.56], pass: 'swim', finBias: 0.8,
      born: 'among a thousand waters', glowBias: 0.2, forms: null,
      biomes: { deep: 'deep water', shallows: 'shoals', shore: 'strand', meadow: 'isle-meadow', rock: 'skerries', peak: 'sea-crags' },
      wx: { rain: 'rain', mist: 'sea-mist', storm: 'gale', breeze: 'breeze' }
    },
    mistral: {
      name: 'the Mistral', weight: 3, wl: [0.34, 0.48], pass: 'swim', finBias: 0.6, limbBias: 0.45,
      born: 'upon the floating isles', glowBias: 0.3, forms: ['puff', 'tendril', 'spire', 'stalk'],
      biomes: { deep: 'open sky', shallows: 'cloud-sea', shore: 'islet edge', meadow: 'isle-green', rock: 'spirestone', peak: 'high crags' },
      wx: { rain: 'skydrift', mist: 'cloudbank', storm: 'shearwind', breeze: 'updraught' }
    },
    ember: {
      name: 'the Emberwaste', weight: 2, wl: [0.18, 0.3], pass: 'none', finBias: 0.25,
      born: 'in the shadow of the fire-country', glowBias: 0.45, forms: ['spire', 'pod', 'stalk', 'rosette'],
      biomes: { deep: 'lava pools', shallows: 'cooling crust', shore: 'cinder banks', meadow: 'ashfield', rock: 'scorched rock', peak: 'smoking crags' },
      wx: { rain: 'ashfall', mist: 'smoke-haze', storm: 'firestorm', breeze: 'hot wind' }
    },
    frostmere: {
      name: 'the Frostmere', weight: 2, wl: [0.3, 0.46], pass: 'all', finBias: 0.35, sizeBias: 1.12,
      born: 'under the pale lights of the frozen country', glowBias: 0.28, forms: ['spire', 'puff', 'rosette', 'stalk'],
      biomes: { deep: 'black ice', shallows: 'grey ice', shore: 'frost shore', meadow: 'snowfield', rock: 'frozen scree', peak: 'ice peaks' },
      wx: { rain: 'snowfall', mist: 'ice-fog', storm: 'whiteout', breeze: 'north wind' }
    },
    fungal: {
      name: 'the Fungal Deep', weight: 2, wl: [0.22, 0.36], pass: 'swim', finBias: 0.4,
      born: 'beneath the ceiling of the under-country', glowBias: 0.85, forms: ['puff', 'pod', 'tendril', 'rosette'],
      biomes: { deep: 'ink water', shallows: 'pale pools', shore: 'mycel banks', meadow: 'moss carpet', rock: 'cave stone', peak: 'stalagmite spires' },
      wx: { rain: 'sporefall', mist: 'spore-haze', storm: 'cave squall', breeze: 'deep draught' }
    },
    saltflats: {
      name: 'the Mirrorflats', weight: 2, wl: [0.12, 0.2], pass: 'none', finBias: 0.15,
      born: 'on the shining salt', glowBias: 0.15, forms: ['spire', 'stalk', 'rosette', 'pod'],
      biomes: { deep: 'brine mirrors', shallows: 'salt marsh', shore: 'crust banks', meadow: 'hardpan', rock: 'salt bluffs', peak: 'white mesas' },
      wx: { rain: 'rare rain', mist: 'mirage-shimmer', storm: 'salt-storm', breeze: 'dry wind' }
    },
    duskmoor: {
      name: 'the Duskmoor', weight: 2, wl: [0.3, 0.44], pass: 'swim', finBias: 0.55,
      born: 'in the long twilight of the moor-country', glowBias: 0.5, forms: ['tendril', 'puff', 'stalk', 'pod'],
      biomes: { deep: 'black tarns', shallows: 'bog water', shore: 'peat banks', meadow: 'heather moor', rock: 'tor stones', peak: 'dark fells' },
      wx: { rain: 'drizzle', mist: 'moor-mist', storm: 'howling dark', breeze: 'cold breath' }
    },
    coralshelf: {
      name: 'the Coralshelf', weight: 2, wl: [0.5, 0.62], pass: 'all', finBias: 0.9,
      born: 'beneath the surface of the endless shallows', glowBias: 0.6, forms: ['tendril', 'pod', 'puff', 'spire'],
      biomes: { deep: 'open sea', shallows: 'bright shallows', shore: 'coral shelf', meadow: 'kelp meadow', rock: 'reef stone', peak: 'coral towers' },
      wx: { rain: 'plankton-fall', mist: 'murk', storm: 'undertow', breeze: 'current' }
    },
    glasswold: {
      name: 'the Glasswold', weight: 1, wl: [0.2, 0.32], pass: 'none', finBias: 0.2,
      born: 'among the singing glass', glowBias: 0.55, forms: ['spire', 'rosette', 'stalk', 'pod'],
      biomes: { deep: 'molten glass', shallows: 'glass shallows', shore: 'shard banks', meadow: 'crystal flats', rock: 'prism stones', peak: 'glass spires' },
      wx: { rain: 'chiming rain', mist: 'refraction-haze', storm: 'shatterstorm', breeze: 'thin song' }
    }
  };

  var realmCache = {};

  function realmOf(worldId) {
    if (realmCache[worldId]) return realmCache[worldId];
    var rng = mulberry32(hash32(worldId + ':realm'));
    var keys = Object.keys(REALMS);
    var total = keys.reduce(function (n, k2) { return n + REALMS[k2].weight; }, 0);
    var roll = rng() * total;
    var key = keys[keys.length - 1];
    for (var i = 0; i < keys.length; i++) {
      roll -= REALMS[keys[i]].weight;
      if (roll <= 0) { key = keys[i]; break; }
    }
    realmCache[worldId] = { key: key, realm: REALMS[key] };
    return realmCache[worldId];
  }

  function realmBiome(worldId, biomeKey) {
    return realmOf(worldId).realm.biomes[biomeKey] || BIOMES[biomeKey].name;
  }

  /* ---------- the land ----------
   * Terrain is IDENTITY, not content: it is derived purely from the world's
   * id, never stored, never merged. When worlds merge, travellers arrive
   * onto the host world's own land and settle on it. */

  var TERRAIN_COLS = 120;
  var TERRAIN_ROWS = 56;
  var terrainCache = {};

  function valueNoise(rng, cols, rows, latW, latH) {
    // a random lattice sampled with smooth bilinear interpolation. The lattice
    // size sets the FREQUENCY: a small lattice makes broad continents, a large
    // one makes fine coves — summed, they make fractal, believable land.
    var latticeW = latW || 7, latticeH = latH || 4;
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
    var realmInfo = realmOf(worldId);
    var wl = realmInfo.realm.wl;
    var terrain = {
      cols: TERRAIN_COLS,
      rows: TERRAIN_ROWS,
      heights: heights,
      realm: realmInfo.key,
      waterline: wl[0] + rng() * (wl[1] - wl[0]) // the realm sets the flood
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
      // swimmers may arrive in (and stay in) the water; everyone else
      // settles onto land
      if (!canStandAt(terrain, k, k.x, k.y)) {
        var spot = findSpot(w, 'kith:' + id, isLandAt);
        k.x = spot.x; k.y = spot.y; k.tx = null; k.ty = null;
      }
    });
    Object.keys(w.structures || {}).forEach(function (id) {
      var s = w.structures[id];
      // buildings that arrive over water are rebuilt on the nearest ground
      if (!isLandAt(terrain, s.x, s.y)) {
        var spot = findSpot(w, 'struct:' + id, isLandAt);
        s.x = spot.x; s.y = spot.y;
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
    // the year leans on the sky: stormy winters, rainy springs
    var season = seasonAt(t).key;
    var storm = c.storm * (season === 'winter' ? 1.5 : season === 'autumn' ? 1.15 : 1);
    var rain = c.rain * (season === 'spring' ? 1.35 : season === 'summer' ? 0.8 : 1);
    var mist = c.mist * (season === 'autumn' ? 1.4 : 1);
    var breeze = c.breeze * (season === 'summer' ? 1.2 : 1);
    var kind = 'clear';
    if (roll < storm) kind = 'storm';
    else if (roll < storm + rain) kind = 'rain';
    else if (roll < storm + rain + mist) kind = 'mist';
    else if (roll < storm + rain + mist + breeze) kind = 'breeze';
    var label = kind === 'clear' ? 'clear' : (realmOf(worldId).realm.wx[kind] || kind);
    return { kind: kind, bucket: bucket, intensity: 0.5 + rng() * 0.5, label: label, season: season };
  }

  var STORM_TEXTS = [
    'A storm broke over {w}. The kith huddled while the sky argued with itself.',
    'Thunder walked across {w} for hours. Every leaf remembered it.',
    'A great storm scoured {w}; by morning the air tasted washed and new.'
  ];

  var SEASON_TEXTS = {
    spring: 'Spring came to {w}. The world quickens; everything green grows eager.',
    summer: 'Summer settled over {w}: long light, easy living.',
    autumn: 'Autumn arrived in {w}. Seeds ride the wind; the larder years for winter.',
    winter: 'Winter closed around {w}. The lean season — blooms will be few, and the hearth matters.'
  };

  // Called by any live session; chronicles each storm (and each turning of
  // the year) exactly once, with deterministic ids every copy agrees on.
  function weatherTick(w) {
    var now = env.now();
    var wx = weatherAt(w.id, now);
    if (wx.kind === 'storm') {
      var id = 's' + w.id + '-' + wx.bucket;
      var already = w.chronicle.some(function (e) { return e.id === id; });
      if (!already) {
        var textRng = mulberry32(hash32(id));
        chronicle(w, 'storm', pick(textRng, STORM_TEXTS).replace('{w}', w.name), id);
      }
    }
    var season = seasonAt(now);
    if (season.index > seasonAt(w.born).index) { // no season predates the world
      var seasonId = 'sn' + w.id + '-' + season.index;
      if (!w.chronicle.some(function (e) { return e.id === seasonId; })) {
        chronicle(w, 'storm', SEASON_TEXTS[season.key].replace('{w}', w.name), seasonId);
      }
    }
    return wx;
  }

  /* ---------- world ---------- */

  // Prospect candidate worlds until the land (and nature) fit the ask.
  function mineWorldId(temperament, nature) {
    var best = null, bestScore = -Infinity;
    var wantNature = nature && nature !== 'surprise' && REALMS[nature];
    var wantLand = temperament && temperament !== 'surprise';
    for (var i = 0; i < 60; i++) {
      var id = env.newId();
      var score = 0;
      if (wantNature) {
        if (realmOf(id).key === nature) score += 100;
        else if (i < 50) continue; // keep prospecting; settle late if unlucky
      }
      if (wantLand) {
        var s = terrainStats(id);
        if (temperament === 'lakeland') score += s.water;
        else if (temperament === 'highlands') score += s.high - Math.max(0, s.water - 0.25);
        else if (temperament === 'plains') score += s.soil - s.high - s.water;
        else if (temperament === 'drylands') score += -s.water + s.soil * 0.3;
      }
      if (score > bestScore) { bestScore = score; best = id; }
      if (wantNature && !wantLand && score >= 100) break; // any world of that nature will do
    }
    return best || env.newId();
  }

  function newWorld(opts) {
    opts = opts || {};
    var wantsChoice = (opts.temperament && opts.temperament !== 'surprise') ||
      (opts.nature && opts.nature !== 'surprise');
    var id = wantsChoice ? mineWorldId(opts.temperament, opts.nature) : env.newId();
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
    chronicle(w, 'born', 'The world ' + w.name + ' came into being ' + realmOf(id).realm.born + '.');
    plantSeed(w, true); // wild things grew here first —
    plantSeed(w, true); // — no founder starves before the first garden
    spawnFounderKith(w);
    return w;
  }

  function looksLikeWorld(obj) {
    return !!(obj && obj.format === 'driftgarden/1' && obj.id &&
      typeof obj.clock === 'number' && obj.plants && Array.isArray(obj.chronicle));
  }

  // Worlds preserved before the kith existed get theirs on first waking;
  // kith from before minds existed grow theirs.
  function ensureKith(w) {
    if (!w.kith) { w.kith = {}; w.emissary = null; }
    if (Object.keys(w.kith).length === 0) spawnFounderKith(w);
    migrateKith(w);
    ensureStructures(w); // worlds from before building get an empty commons
  }

  /* ---------- plants ---------- */

  function plantSeed(w, wild) {
    var rng = mulberry32(hash32(w.id + ':' + (w.clock + 1)));
    var id = env.newId();
    var terrain = makeTerrain(w.id);
    var flora = makeFlora(w.id);
    var spot = findSpot(w, 'seed:' + id, isSoilAt);
    var arch = flora.archetypes[Math.floor(rng() * flora.archetypes.length)];
    // an open question answered: a kith asked, and the gardener planted
    if (!wild && w.lastAsk && env.now() - w.lastAsk.at < 5 * 60 * 1000) {
      var asker = w.kith && w.kith[w.lastAsk.kithId];
      if (asker && !asker.passed) {
        asker.g = (asker.g || 0) + 0.5;
        asker.u = bumpClock(w);
        chronicle(w, 'contact', 'The gardener answered. ' + kithLabel(asker) +
          ' watched the seed go into the ground, and understood.');
      }
      w.lastAsk = null;
    }
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
      byHand: !wild,          // the gardener's own work, and the kith notice
      bornOfMerge: null,
      u: bumpClock(w)
    };
    w.plants[id] = plant;
    var whereName = realmBiome(w.id, biomeAt(terrain, spot.x, spot.y));
    if (wild) {
      plant.growth = 0.4 + mulberry32(hash32(id + ':wild'))() * 0.4; // already coming up
      chronicle(w, 'plant', 'A wild ' + plant.species + ' has grown in the ' +
        whereName + ' since before the world had its name.');
    } else {
      chronicle(w, 'plant', 'A ' + plant.species + ' seed was planted in the ' +
        whereName + '.');
    }
    return plant;
  }

  /* ---------- seasons: the year turns for every world at once ----------
   * A season lasts a real week; a year is 28 days. Seasons are a pure
   * function of absolute time, so every copy of every world agrees on
   * them without storing anything. */

  var SEASON_MS = 7 * DAY;
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var SEASON_GROWTH = { spring: 1.3, summer: 1.0, autumn: 0.85, winter: 0.5 };

  function seasonAt(t) {
    var index = Math.floor(t / SEASON_MS);
    return { key: SEASONS[((index % 4) + 4) % 4], index: index };
  }

  /* ---------- day & night ----------
   * The hour of the local clock, shared by the sky and by the kith: the
   * world sleeps roughly when its keeper does. Night behaviour is ephemeral
   * (never clocked, never merged), so it needs no cross-copy agreement. */
  function dayPhase(t) {
    var h = new Date(t).getHours();
    if (h >= 21 || h < 5) return 'night';
    if (h < 8) return 'dawn';
    if (h < 18) return 'day';
    return 'dusk';
  }
  function isNight(t) { return dayPhase(t) === 'night'; }

  // Effective growing-hours between two moments: the season multiplier
  // integrated EXACTLY across every boundary, so growth is identical no
  // matter how often (or when) a copy of the world samples it.
  function growingHours(t0, t1) {
    if (t1 <= t0) return 0;
    var hours = 0;
    var t = t0;
    for (var guard = 0; guard < 400 && t < t1; guard++) {
      var season = seasonAt(t);
      var boundary = (season.index + 1) * SEASON_MS;
      var end = Math.min(t1, boundary);
      hours += ((end - t) / 3600000) * SEASON_GROWTH[season.key];
      t = end;
    }
    return hours;
  }

  function advanceGrowth(w) {
    var now = env.now();
    Object.keys(w.plants).forEach(function (id) {
      var p = w.plants[id];
      if (p.growth >= 1) { p.tick = now; return; }
      var hours = growingHours(p.tick || p.planted, now);
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

  function makeKith(w, rng, genome, parents, origin, fixedId) {
    var id = fixedId || env.newId();
    var spot = findSpot(w, 'kith:' + id, isLandAt);
    var spanRng = mulberry32(hash32(id + ':span'));
    var kith = {
      id: id,
      genome: genome,
      brain: newKithBrain(rng),
      given: makeKithName(rng, genome.voice),
      name: null,             // a name the player bestows
      born: env.now(),
      span: 14 + Math.floor(spanRng() * 9), // days of life, decided at birth —
      passed: null,           // — so every copy records the same passing
      parents: parents || null,
      origin: origin || w.id,
      bornOfMerge: null,
      energy: 0.7 + rng() * 0.3,
      starving: null,
      taste: {},              // plantSpecies -> learned liking
      trust: {},              // kithId -> learned trust; >= 0.5 is a bond
      lex: {},                // concept -> {word, s, by}: its share of the tongue
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
    var realmKey = realmOf(w.id).key;
    var names = [];
    for (var i = 0; i < FOUNDER_COUNT; i++) {
      names.push(makeKith(w, rng, newKithGenome(rng, realmKey)).given);
    }
    chronicle(w, 'kith', 'Three small kith wandered in and made this world their home: ' +
      names[0] + ', ' + names[1] + ' and ' + names[2] + '.');
  }

  // Kith from before minds existed grow theirs on first waking — derived
  // from their own identity, so every copy grows the same mind.
  function migrateKith(w) {
    Object.keys(w.kith || {}).forEach(function (id) {
      var k = w.kith[id];
      if (!k.brain) {
        var rng = mulberry32(hash32(k.id + ':mind'));
        k.brain = newKithBrain(rng);
        var spanRng = mulberry32(hash32(k.id + ':span'));
        k.span = 14 + Math.floor(spanRng() * 9);
        k.passed = null;
        k.starving = null;
        k.taste = {};
        k.trust = {};
      }
      if (!k.lex) k.lex = {}; // kith from before language grow a voice
      modernKithGenome(k.genome); // kith from before shape keep the elder body-plan
    });
  }

  function isAlive(k) { return !k.passed && !k.departed; }

  function livingKith(w) {
    return Object.keys(w.kith || {}).map(function (id) { return w.kith[id]; }).filter(isAlive);
  }

  // Those present ON THE MAP: the living, minus any away beyond the edge. The
  // travelling are still alive and still counted among the folk — they are
  // simply not here to be fed, met, or drawn until they return.
  function presentKith(w) {
    return livingKith(w).filter(function (k) { return !k.expedition; });
  }

  function kithLabel(k) {
    return k.name ? k.name : k.given;
  }

  function kithStage(k, now) {
    if (k.passed) return 'passed';
    var days = (now - k.born) / 86400000;
    var span = k.span || 16;
    if (days < 1) return 'young';
    if (days < span * 0.72) return 'grown';
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

  /* ---------- mortality & birth: the deterministic backbone ----------
   * A kith's lifespan is decided at birth, so EVERY copy of a world records
   * the same passing at the same moment, with the same chronicle id — the
   * copies drift, but death and birth reconcile perfectly on merge. */

  var STARVE_HOURS = 48;

  function markPassing(w, k, at, cause) {
    if (k.passed) return null;
    k.passed = at;
    k.u = bumpClock(w);
    if (w.emissary === k.id) w.emissary = null;
    var text = cause === 'hunger'
      ? kithLabel(k) + ' grew too weak in a hungry season, and fell asleep beneath the soil.'
      : kithLabel(k) + ' grew old and full of days, and fell asleep beneath the soil. The world remembers.';
    chronicle(w, 'passing', text, 'd' + k.id);
    return { kind: 'passing', text: text };
  }

  function checkMortality(w, atTime) {
    var events = [];
    Object.keys(w.kith || {}).forEach(function (id) {
      var k = w.kith[id];
      if (k.passed) return;
      var dueAt = k.born + (k.span || 16) * DAY;
      if (atTime >= dueAt) {
        var e = markPassing(w, k, dueAt, 'age');
        if (e) events.push(e);
      } else if (k.starving && atTime - k.starving > STARVE_HOURS * 3600 * 1000) {
        var e2 = markPassing(w, k, k.starving + STARVE_HOURS * 3600 * 1000, 'hunger');
        if (e2) events.push(e2);
      }
    });
    return events;
  }

  /* A child of the same two parents on the same day has the same identity
   * in every copy of the world — births merge without duplication. */
  function birthChild(w, a, b, dayBucket) {
    var pairKey = [a.id, b.id].sort().join('+');
    var childId = 'c' + hash32(pairKey + ':' + dayBucket).toString(16) + hash32(dayBucket + ':' + pairKey).toString(16);
    if (w.kith[childId]) return null; // this pair already had today's child
    if (livingKith(w).length >= KITH_CAP) return null;
    var rng = mulberry32(hash32(childId));
    var parents = [a, b].sort(function (x, y) { return x.id < y.id ? -1 : 1; });
    var genome = crossGenomes(rng, parents[0].genome, parents[1].genome, KITH_GENE_SPEC);
    var child = makeKith(w, rng, genome, [parents[0].id, parents[1].id], w.id, childId);
    child.brain = crossGenomes(rng, parents[0].brain, parents[1].brain, BRAIN_SPEC);
    child.x = (a.x + b.x) / 2; child.y = (a.y + b.y) / 2;
    // born somewhere its own body can be: fall back to a parent's ground
    if (!canStandAt(makeTerrain(w.id), child, child.x, child.y)) {
      child.x = parents[0].x; child.y = parents[0].y;
    }
    a.energy = Math.max(0.2, a.energy - 0.3);
    b.energy = Math.max(0.2, b.energy - 0.3);
    a.u = bumpClock(w); b.u = bumpClock(w);
    var text = kithLabel(parents[0]) + ' and ' + kithLabel(parents[1]) + ' had a child: ' + child.given + '.';
    chronicle(w, 'born', text, 'b' + childId);
    greetNewKind(w, child);
    return { kind: 'born', text: text, child: child };
  }

  /* ---------- the heartbeat: minds at work ----------
   * Movement, hunger, moods and slow trust-drift are ephemeral flavour and
   * do NOT bump the logical clock; only milestones (bonds, births, deaths,
   * memories' first formation) are clocked content. */
  function kithTick(w, dt, beacon) {
    var now = env.now();
    var events = checkMortality(w, now);
    wandererTick(w, now, events);
    expeditionTick(w, now, events);
    predatorTick(w, now, events);
    disasterTick(w, now, events);
    var terrain = makeTerrain(w.id);
    var rng = mulberry32(hash32(w.id + ':' + Math.floor(now / 1000)));
    var wxNow = weatherAt(w.id, now);
    var storm = wxNow.kind === 'storm';
    var winter = wxNow.season === 'winter';
    var night = isNight(now);
    var mindEnv = { night: night, storm: storm };
    var disaster = disasterAt(w.id, now);
    var fleeing = !!disaster; // warning or strike — either way, run for high ground
    var call = (beacon && now < beacon.until) ? beacon : null;
    var alive = presentKith(w); // the travelling are off the map until they return
    var blooming = Object.keys(w.plants).map(function (id) { return w.plants[id]; })
      .filter(function (p) { return p.growth > 0.55; });
    var dayBucket = Math.floor(now / DAY);

    var structList = Object.keys(w.structures || {}).map(function (id) { return w.structures[id]; });

    alive.forEach(function (k) {
      var decayMul = storm && k.act !== 'shelter' ? 1.5 : 1;
      if (winter) decayMul *= 1.15; // the lean season takes its share
      if (k.act === 'shelter' && structList.some(function (s) {
        return s.type === 'leanto' && structDist(s, k.x, k.y) < 0.07;
      })) decayMul = 0.6; // a roof is worth more than a rock
      if (k.act === 'sleep') decayMul = 0; // the sleeping do not tire; they mend
      var decay = ENERGY_DECAY_PER_SEC * decayMul * dt;
      k.energy = Math.max(0, k.energy - decay);
      if (k.energy <= 0 && !k.starving) k.starving = now;

      // the inner life, read afresh each tick: the six pressures, the one that
      // presses hardest, and a plain word for it — all ephemeral, never merged,
      // a mind felt rather than stored. A specific errand below may overwrite
      // the intention with something concrete ("heading for the sunmoss").
      k.needs = Mind.needs(k, mindEnv);
      k.drive = Mind.dominant(k.needs);
      k.goal = Mind.goalFor(k.drive);
      k.intent = Mind.driveLabel(k.drive);
      // a project of one's own, still rising nearby, is a goal held across many
      // ticks — it reads over the idle mood until the thing stands built
      var rising = null;
      for (var si = 0; si < structList.length; si++) {
        var st0 = structList[si];
        if (st0.by === k.id && structRaised(st0, now) < 1 && structDist(st0, k.x, k.y) < 0.16) { rising = st0; break; }
      }
      if (rising) {
        k.goal = 'make';
        k.intent = rising.type === 'hearth' ? 'tending the new hearth' : 'raising the lean-to';
      }
      // the country turns on the folk: drop everything and run for high ground.
      // This is real to watch, but WHO lives is decided by content at the
      // strike, not by where the running left them.
      if (fleeing) {
        if (k.act === 'eat' || k.act === 'rest' || k.act === 'shelter' || k.act === 'sleep') {
          k.act = 'wander'; k.eating = null;
        }
        k.goal = 'safety'; k.drive = 'safety';
        k.intent = disaster.method === 'drown' ? 'fleeing for high ground'
          : disaster.method === 'burn' ? 'running from the fire'
          : disaster.method === 'bury' ? 'running from the mountain'
          : 'running for safety';
        var safe = fleeTarget(terrain, k);
        if (safe) { k.tx = safe.x; k.ty = safe.y; }
      }

      if (k.act === 'eat') {
        k.intent = 'sipping nectar'; k.drive = 'hunger';
        if (now >= k.actUntil) {
          var plant = k.eating ? w.plants[k.eating] : null;
          var meal = 0.5;
          if (plant) {
            var liking = inbornLiking(k.id, plant.species);
            meal = 0.55 + liking * 0.3;
            // grazing tires the bloom: it regrows over hours, so food comes
            // in cycles and a small garden cannot feed a large tribe
            plant.growth = Math.max(GRAZE_FLOOR, plant.growth - GRAZE_COST);
            attendConcept(w, k, 'plant:' + plant.species); // a thing eaten is a thing named
            // a meal from the gardener's hand is quietly remembered
            if (plant.byHand || (plant.watered && now - plant.watered < 24 * 3600 * 1000)) {
              k.g = (k.g || 0) + 0.15;
            }
            var learned = (k.taste[plant.species] === undefined);
            k.taste[plant.species] = liking; // it now KNOWS how this tastes
            // eureka: a curious mind, a well-loved plant, a spark
            if (liking > 0.45 && k.brain.curiosity > 0.7 &&
                knowsOf(k).indexOf('seedkeeping') === -1 && rng() < 0.15) {
              learn(w, k, 'seedkeeping');
              var eurekaText = kithLabel(k) + ' began saving seeds of the plants it loves — the first of the kith to garden.';
              chronicle(w, 'discovery', eurekaText, 'dk' + k.id);
              events.push({ kind: 'discovery', text: eurekaText });
            }
            if (learned) {
              // cap the memory; forget the blandest first, deterministically
              var species = Object.keys(k.taste);
              if (species.length > 12) {
                species.sort(function (s1, s2) { return Math.abs(k.taste[s1]) - Math.abs(k.taste[s2]) || (s1 < s2 ? -1 : 1); });
                delete k.taste[species[0]];
              }
              k.u = bumpClock(w);
            }
            plant.sipped = now;
          }
          k.energy = Math.min(1, k.energy + Math.max(0.15, meal));
          if (k.energy > 0.25) k.starving = null;
          k.act = 'wander'; k.eating = null; k.tx = null;
        }
        return; // stay put while sipping
      }
      if (k.act === 'sleep') {
        // wake at dawn, when a storm breaks, or if hunger grows sharp
        if (!night || storm || k.energy < 0.25) {
          k.act = 'wander'; k.tx = null;
          // a waking word at first light — the beginnings of a dawn chorus
          if (!night && rng() < 0.5) {
            var glad = attendConcept(w, k, 'mark:good');
            k.saying = glad.word; k.sayingUntil = now + 3000;
          }
        } else {
          k.intent = 'asleep'; k.drive = 'rest';
          // safe sleep mends faster: a roof, a hearth, or kin close by
          var sheltered = structList.some(function (s) { return s.type !== 'field' && structDist(s, k.x, k.y) < 0.09; });
          k.energy = Math.min(1, k.energy + ENERGY_DECAY_PER_SEC * (sheltered ? 3 : 1.4) * dt);
          // dreams: a remembered word murmured into the dark
          if (rng() < 0.04) {
            var vocab = Object.keys(k.lex || {}).filter(function (c) { return c !== ':order'; });
            if (vocab.length) {
              var dream = k.lex[vocab[Math.floor(rng() * vocab.length)]];
              k.saying = dream.word + '…'; k.sayingUntil = now + 3200;
            }
          }
          return;
        }
      }
      if (k.act === 'rest' || k.act === 'shelter') {
        k.intent = k.act === 'shelter' ? 'waiting out the storm' : 'resting a while';
        k.drive = k.act === 'shelter' ? 'safety' : 'rest';
        if (k.act === 'shelter' && !storm) { k.act = 'wander'; k.tx = null; }
        else if (k.act === 'rest' && now >= k.actUntil) { k.act = 'wander'; k.tx = null; }
        else if (k.act === 'shelter') {
          // huddled together against the weather: where song is born
          var huddled = alive.some(function (o) {
            return o.id !== k.id && o.act === 'shelter' &&
              Math.abs(o.x - k.x) < 0.08 && Math.abs(o.y - k.y) < 0.08;
          });
          if (huddled && knowsOf(k).indexOf('song') === -1 &&
              k.brain.patience > 0.65 && k.brain.sociability > 0.6 && rng() < 0.08) {
            learn(w, k, 'song');
            var songText = 'In the middle of the storm, ' + kithLabel(k) +
              ' began to sing — the first song this world has heard.';
            chronicle(w, 'discovery', songText, 'ds' + k.id);
            events.push({ kind: 'discovery', text: songText });
          }
          // a different mind, in the same weather, invents the roof
          if (knowsOf(k).indexOf('shelter') === -1 &&
              k.brain.curiosity > 0.6 && k.brain.boldness > 0.55 && rng() < 0.06) {
            learn(w, k, 'shelter');
            var shelterText = 'Soaked and stubborn, ' + kithLabel(k) +
              ' piled fallen stems against the stone — and the rain came no further. ' +
              'It has learned the craft of shelter.';
            chronicle(w, 'discovery', shelterText, 'db' + k.id);
            events.push({ kind: 'discovery', text: shelterText });
          }
          return; // the singing itself happens in the song pass, last of all
        }
        else return;
      }

      /* -- the mind chooses -- */
      // the pressures come straight from engine/mind.js now; only the momentary
      // whim to settle keeps its own coin-flip, so the world's determinism is
      // untouched. Same numbers, same order — but the reasoning has a home.
      var brain = k.brain;
      var urge = Mind.pressures(k, mindEnv);
      var hungerUrge = urge.hunger;
      var stormUrge = urge.safety;
      var socialUrge = urge.belonging;
      var wanderUrge = urge.curiosity;
      var restUrge = brain.patience * 0.3 * rng();

      if (fleeing) {
        // already running for high ground (target set above) — nothing else matters
      } else if (stormUrge > hungerUrge && stormUrge > 0.5) {
        // a lean-to first, if one stands near; else high ground; else hunker
        var refuge = null;
        var bestLeanto = null, bestLeantoD = 0.35;
        structList.forEach(function (s) {
          if (s.type !== 'leanto') return;
          var sd = structDist(s, k.x, k.y);
          if (sd < bestLeantoD) { bestLeantoD = sd; bestLeanto = s; }
        });
        if (bestLeanto) refuge = { x: bestLeanto.x, y: bestLeanto.y };
        for (var st = 0; st < 10 && !refuge; st++) {
          var sx = Math.max(0.03, Math.min(0.97, k.x + (rng() - 0.5) * 0.3));
          var sy = Math.max(0.56, Math.min(0.97, k.y + (rng() - 0.5) * 0.3));
          var sb = biomeAt(terrain, sx, sy);
          if (sb === 'rock' || sb === 'peak') { refuge = { x: sx, y: sy }; break; }
        }
        k.intent = 'making for shelter'; k.drive = 'safety';
        if (refuge && (Math.abs(refuge.x - k.x) > 0.02 || Math.abs(refuge.y - k.y) > 0.02)) {
          k.tx = refuge.x; k.ty = refuge.y;
        } else {
          k.act = 'shelter'; k.tx = null;
          k.intent = 'bracing against the storm';
          return;
        }
      } else if (night && k.energy > 0.35 && brain.boldness < 0.8) {
        // night falls: seek a bed — a shelter or a hearth if one is near,
        // else a safe spot underfoot — and sleep. The boldest roam the dark.
        var bed = null, bedD = 0.4;
        structList.forEach(function (s) {
          if (s.type === 'field') return; // you don't bed down in a ploughed field
          var d = structDist(s, k.x, k.y);
          if (d < bedD) { bedD = d; bed = s; }
        });
        k.intent = 'looking for a place to sleep'; k.drive = 'rest';
        if (bed && (Math.abs(bed.x - k.x) > 0.02 || Math.abs(bed.y - k.y) > 0.02)) {
          k.tx = bed.x; k.ty = bed.y;
        } else {
          k.act = 'sleep'; k.tx = null;
          k.intent = 'settling down to sleep';
          return;
        }
      } else if (hungerUrge > 0.45 && blooming.length > 0) {
        // seek food it LIKES, if it knows any; else the nearest bloom
        var best = null, bestScore = -Infinity;
        blooming.forEach(function (p) {
          var d = Math.sqrt((p.x - k.x) * (p.x - k.x) + (p.y - k.y) * (p.y - k.y));
          var known = k.taste[p.species];
          var fresh = (!p.sipped || now - p.sipped > 30 * 60 * 1000) ? 0 : -0.8;
          var score = (known !== undefined ? known * 0.6 : 0.15) - d * 2 + fresh;
          if (score > bestScore) { bestScore = score; best = p; }
        });
        if (best) {
          var bd = Math.sqrt((best.x - k.x) * (best.x - k.x) + (best.y - k.y) * (best.y - k.y));
          k.tx = best.x; k.ty = best.y;
          k.intent = 'heading for the ' + best.species; k.drive = 'hunger';
          if (bd < 0.035) {
            // strife, not gore: two hungry strangers at one bloom is a contest
            var rival = null;
            alive.forEach(function (o) {
              if (o.id === k.id || o.energy >= 0.5) return;
              var mutual = Math.max(k.trust[o.id] || 0, o.trust[k.id] || 0);
              if (mutual >= 0.5) return; // friends share
              var od = Math.sqrt((o.x - best.x) * (o.x - best.x) + (o.y - best.y) * (o.y - best.y));
              if (od < 0.03 && (!rival || od < rival.d)) rival = { o: o, d: od };
            });
            if (rival) {
              var opponent = rival.o;
              var kWins = k.brain.boldness !== opponent.brain.boldness
                ? k.brain.boldness > opponent.brain.boldness
                : k.id < opponent.id;
              var winner = kWins ? k : opponent;
              var loser = kWins ? opponent : k;
              // the loser is driven off carrying a grudge
              loser.trust[winner.id] = Math.max(-1, (loser.trust[winner.id] || 0) - 0.4);
              loser.energy = Math.max(0, loser.energy - 0.05);
              loser.act = 'wander';
              loser.eating = null;
              loser.tx = Math.max(0.03, Math.min(0.97, loser.x + (loser.x - best.x) * 8 + (rng() - 0.5) * 0.1));
              loser.ty = Math.max(0.56, Math.min(0.97, loser.y + (loser.y - best.y) * 8 + (rng() - 0.5) * 0.05));
              loser.u = bumpClock(w);
              loser.saying = '!';
              loser.sayingUntil = now + 1600;
              if (rng() < 0.35) {
                var strifeText = kithLabel(winner) + ' drove ' + kithLabel(loser) + ' from the ' +
                  best.species + '. ' + kithLabel(loser) + ' will remember.';
                chronicle(w, 'strife', strifeText);
                events.push({ kind: 'strife', text: strifeText });
              }
              if (!kWins) return; // we lost — flee, hungry still
            }
            k.act = 'eat'; k.eating = best.id;
            k.actUntil = now + EAT_SECONDS * 1000;
            k.intent = 'sipping nectar';
            return;
          }
        }
      } else if (socialUrge > wanderUrge && socialUrge > restUrge && alive.length > 1 && rng() < 0.5) {
        // seek company — the most trusted friend, or someone new if curious
        var friend = null, friendScore = -Infinity;
        alive.forEach(function (other) {
          if (other.id === k.id) return;
          var t = k.trust[other.id] || 0;
          var d2 = Math.sqrt((other.x - k.x) * (other.x - k.x) + (other.y - k.y) * (other.y - k.y));
          var s2 = t + brain.curiosity * 0.2 - d2;
          if (s2 > friendScore) { friendScore = s2; friend = other; }
        });
        if (friend) {
          var fd = Math.sqrt((friend.x - k.x) * (friend.x - k.x) + (friend.y - k.y) * (friend.y - k.y));
          k.drive = 'belonging';
          if (fd < 0.05) {
            // arrived beside them — linger; the encounter pass does the rest
            k.act = 'rest';
            k.actUntil = now + (3 + rng() * 5) * 1000;
            k.intent = 'sitting with ' + kithLabel(friend);
            return;
          }
          k.tx = friend.x; k.ty = friend.y;
          k.intent = 'going to find ' + kithLabel(friend);
        }
      } else if (k.tx === null || (Math.abs(k.tx - k.x) < 0.01 && Math.abs(k.ty - k.y) < 0.01)) {
        // a soft call on the wind — the curious answer it, and remember
        if (call && rng() < 0.25 + brain.curiosity * 0.55) {
          var bx = Math.max(0.03, Math.min(0.97, call.x + (rng() - 0.5) * 0.06));
          var by = Math.max(0.56, Math.min(0.97, call.y + (rng() - 0.5) * 0.04));
          if (canStandAt(terrain, k, bx, by)) {
            k.tx = bx; k.ty = by;
            k.intent = 'drawn by something on the wind'; k.drive = 'curiosity';
            if (k.gCallMark !== call.until) { k.g = (k.g || 0) + 0.08; k.gCallMark = call.until; }
          }
        } else if (rng() < brain.patience * 0.6) {
          k.act = 'rest';
          k.actUntil = now + (4 + rng() * 12) * 1000;
          k.intent = 'pausing a moment'; k.drive = 'rest';
          return;
        } else {
          // pick somewhere new to be — where this body can go, and can GET to
          // without crossing water. A kith with nothing pressing wanders on
          // purpose: restlessness looking for shape.
          k.intent = k.drive === 'purpose' ? 'off exploring, seeking something to do' : 'wandering the world';
          for (var tries = 0; tries < 8; tries++) {
            var range = 0.1 + k.brain.wanderlust * 0.5;
            var cx = Math.max(0.03, Math.min(0.97, k.x + (rng() - 0.5) * range * 2));
            var cy = Math.max(0.56, Math.min(0.97, k.y + (rng() - 0.5) * range));
            if (canStandAt(terrain, k, cx, cy) && reachableStraight(terrain, k, k.x, k.y, cx, cy)) {
              k.tx = cx; k.ty = cy; break;
            }
          }
        }
      }

      // move toward the target; the water's edge stops all but swimmers — and
      // stops them at ANY speed now, walked cell by cell so no warp step leaps it
      if (k.tx !== null) {
        var dx = k.tx - k.x, dy = k.ty - k.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.0001) {
          var stageSpeed = kithStage(k, now) === 'elder' ? 0.6 : 1;
          var limbSpeed = [0.8, 1, 1.15][k.genome.limbs || 0] || 1;
          var inWater = !isLandAt(terrain, k.x, k.y);
          var mediumSpeed = inWater ? 1.25 : 1; // a swimmer glides
          var step = Math.min(dist, k.genome.speed * stageSpeed * limbSpeed * mediumSpeed * dt);
          var walk = walkLine(terrain, k, k.x, k.y, dx / dist, dy / dist, step);
          if (walk.moved > 0) {
            k.x = walk.x; k.y = walk.y;
            if (Math.abs(dx) > 0.002) k.facing = dx > 0 ? 1 : -1;
          }
          if (walk.blocked) { k.tx = null; k.ty = null; } // the shore — think anew
        }
      }
    });

    /* -- encounters: whenever paths cross, hearts do the rest -- */
    for (var ai = 0; ai < alive.length; ai++) {
      for (var bi = ai + 1; bi < alive.length; bi++) {
        var ka = alive[ai], kb = alive[bi];
        if (ka.passed || kb.passed) continue;
        var ed = Math.sqrt((ka.x - kb.x) * (ka.x - kb.x) + (ka.y - kb.y) * (ka.y - kb.y));
        if (ed >= 0.05) continue;
        // together: trust grows (slow drift, not clocked) — and grows
        // warmer by a hearth
        var warmth = structList.some(function (s) {
          return s.type === 'hearth' && structDist(s, ka.x, ka.y) < 0.08;
        }) ? 0.05 : 0.03;
        var beforeA = ka.trust[kb.id] || 0;
        ka.trust[kb.id] = Math.min(1, beforeA + warmth);
        kb.trust[ka.id] = Math.min(1, (kb.trust[ka.id] || 0) + warmth);
        if (beforeA < 0.5 && ka.trust[kb.id] >= 0.5) {
          ka.u = bumpClock(w); kb.u = bumpClock(w);
          var bondText = kithLabel(ka) + ' and ' + kithLabel(kb) + ' became fast friends.';
          chronicle(w, 'kith', bondText);
          events.push({ kind: 'bond', text: bondText });
        }
        // trim trust memories of the faintest acquaintances
        [ka, kb].forEach(function (kk) {
          var known = Object.keys(kk.trust);
          if (known.length > 16) {
            known.sort(function (a2, b2) { return kk.trust[a2] - kk.trust[b2] || (a2 < b2 ? -1 : 1); });
            delete kk.trust[known[0]];
          }
        });
        // teaching: knowledge spreads along friendship, to willing minds
        if (ka.trust[kb.id] >= 0.5 && kb.trust[ka.id] >= 0.5 && rng() < 0.2) {
          var pairKnows = [[ka, kb], [kb, ka]];
          for (var ti = 0; ti < 2; ti++) {
            var teacher = pairKnows[ti][0], pupil = pairKnows[ti][1];
            var lesson = knowsOf(teacher).filter(function (s) { return knowsOf(pupil).indexOf(s) === -1; })[0];
            if (lesson && pupil.brain.curiosity > 0.35) {
              learn(w, pupil, lesson);
              var taughtText = kithLabel(teacher) + ' taught ' + kithLabel(pupil) + ' ' + skillName(lesson) + '.';
              chronicle(w, 'discovery', taughtText, 'dt' + pupil.id + lesson);
              events.push({ kind: 'discovery', text: taughtText });
              break;
            }
          }
        }

        // chatter: what is nearby is what gets named — and, more and more,
        // spoken about in sentences: a feeling and a thing, in this world's
        // own word order
        if (rng() < 0.4) {
          var wx2 = weatherAt(w.id, now).kind;
          var concept = null;
          var nearestSpecies = null, nearestPd = 0.15;
          Object.keys(w.plants).forEach(function (pid) {
            var p2 = w.plants[pid];
            var pd = Math.sqrt((p2.x - ka.x) * (p2.x - ka.x) + (p2.y - ka.y) * (p2.y - ka.y));
            if (pd < nearestPd) { nearestPd = pd; nearestSpecies = p2.species; }
          });
          if (ka.lex && ka.lex.gardener && rng() < 0.12) concept = 'gardener'; // your name travels
          else if (nearestSpecies && rng() < 0.6) concept = 'plant:' + nearestSpecies;
          else if (wx2 !== 'clear' && wx2 !== 'breeze' && rng() < 0.6) concept = wx2;
          else concept = rng() < 0.5 ? 'home' : (rng() < 0.5 ? 'sun' : 'water');
          var roles = rng() < 0.5 ? [ka, kb] : [kb, ka];
          var speaker = roles[0], listener = roles[1];
          if (rng() < 0.4) {
            // sometimes still a single word — the old game keeps converging
            speakBetween(w, speaker, listener, concept, now);
          } else {
            // the feeling is the speaker's own truth of the moment
            var intent;
            if (speaker.energy < 0.45) {
              intent = 'mark:want';
              if (!nearestSpecies) concept = 'water';
            } else if (wx2 === 'storm') {
              intent = 'mark:fear';
              concept = 'storm';
            } else if ((speaker.trust[listener.id] || 0) >= 0.5 && rng() < 0.4) {
              intent = 'mark:friend';
              concept = 'name:' + listener.given;
            } else {
              intent = 'mark:good';
            }
            speakSentence(w, speaker, listener, intent, concept, now);
          }
        }

        // courting: two bonded, hale, grown kith in fair weather
        if (!storm && ka.trust[kb.id] >= 0.5 && kb.trust[ka.id] >= 0.5 &&
            ka.energy > 0.65 && kb.energy > 0.65 &&
            kithStage(ka, now) === 'grown' && kithStage(kb, now) === 'grown') {
          var birth = birthChild(w, ka, kb, dayBucket);
          if (birth) events.push(birth);
        }
      }
    }

    /* -- the ripple: where, one day, one of them speaks to you -- */
    if (call) {
      alive.forEach(function (k) {
        var cd = Math.sqrt((k.x - call.x) * (k.x - call.x) + (k.y - call.y) * (k.y - call.y));
        if (cd >= 0.07) return;
        if (!w.gardenerNamed) {
          // the conditions of courage: a tended world, a trusting heart,
          // a curious mind, standing at the centre of your call
          if (now - w.born > 2 * DAY && (k.g || 0) >= 0.5 &&
              k.brain.curiosity > 0.55 && rng() < 0.25) {
            var gardenerWord = coinWord(k, 'gardener');
            k.lex.gardener = { word: gardenerWord, s: 0.6, by: k.id };
            w.gardenerNamed = { by: k.id, word: gardenerWord, at: now };
            k.u = bumpClock(w);
            k.saying = gardenerWord + '?';
            k.sayingUntil = now + 7000;
            var contactText = kithLabel(k) + ' came to the very centre of the ripple, looked up at ' +
              'nothing at all, and spoke into it: “' + gardenerWord + '?” — a word nothing in this ' +
              'world carries. It has named the unseen gardener. It is waiting.';
            chronicle(w, 'contact', contactText, 'fc' + k.id);
            events.push({ kind: 'contact', text: contactText });
          }
        } else if (k.lex && k.lex.gardener && rng() < 0.2) {
          // those who know your name may ask things of you
          if (k.energy < 0.5) {
            var wants = attendConcept(w, k, 'mark:want');
            var favourites2 = Object.keys(k.taste || {}).filter(function (s) { return k.taste[s] > 0.2; })
              .sort(function (a, b) { return k.taste[b] - k.taste[a] || (a < b ? -1 : 1); });
            var thing = favourites2.length
              ? attendConcept(w, k, 'plant:' + favourites2[0]).word
              : attendConcept(w, k, 'water').word;
            var askOrder = orderEntry(w, k).word;
            k.saying = (askOrder === 'mf' ? wants.word + ' ' + thing : thing + ' ' + wants.word) + '?';
            k.sayingUntil = now + 6000;
            w.lastAsk = { kithId: k.id, at: now };
          } else if (rng() < 0.5) {
            var glad = attendConcept(w, k, 'mark:good');
            var greetOrder = orderEntry(w, k).word;
            k.saying = greetOrder === 'mf'
              ? glad.word + ' ' + k.lex.gardener.word
              : k.lex.gardener.word + ' ' + glad.word;
            k.sayingUntil = now + 5000;
          }
        }
      });
    }

    /* -- song carries: a singer in the storm steadies every heart nearby.
     * The song is voiced here, after all chatter, so nothing talks over it. -- */
    if (storm) {
      alive.forEach(function (singer) {
        if (knowsOf(singer).indexOf('song') === -1 || singer.act !== 'shelter') return;
        singer.saying = '♪ ' + attendConcept(w, singer, 'song').word;
        singer.sayingUntil = now + 3500;
        alive.forEach(function (listener) {
          if (listener.id === singer.id) return;
          var sd = Math.sqrt((listener.x - singer.x) * (listener.x - singer.x) +
            (listener.y - singer.y) * (listener.y - singer.y));
          if (sd < 0.12) {
            listener.energy = Math.min(1, listener.energy + ENERGY_DECAY_PER_SEC * 0.75 * dt);
            listener.trust[singer.id] = Math.min(1, (listener.trust[singer.id] || 0) + 0.01);
          }
        });
      });
    }

    /* -- seed-keepers garden: one planting a day, identical in every copy -- */
    alive.forEach(function (k) {
      if (knowsOf(k).indexOf('seedkeeping') > -1 && k.energy > 0.5 && rng() < 0.06) {
        keeperPlant(w, k, dayBucket);
      }
      // a seasoned gardener opens new ground with fire — a field. Rolled on its
      // own seed (world+day+kith) so it never perturbs the shared tick stream.
      if (knowsOf(k).indexOf('seedkeeping') > -1 && k.energy > 0.6 && k.brain.wanderlust > 0.45) {
        if (mulberry32(hash32(w.id + ':fieldroll:' + dayBucket + ':' + k.id))() < 0.02) {
          var nearField = Object.keys(w.structures || {}).some(function (id) {
            var s = w.structures[id]; return s.type === 'field' && structDist(s, k.x, k.y) < 0.16;
          });
          if (!nearField) {
            var newField = clearField(w, k, dayBucket);
            if (newField) events.push({ kind: 'discovery', text: kithLabel(k) + ' cleared a field with fire — new ground for the garden.' });
          }
        }
      }
    });

    /* -- the warding: after a killing, a bold and caring soul stops sleeping
     * easy. It learns to keep the watch and to teach the folk to stand
     * together when the dark things come. A world that has never been hunted
     * has no reason to invent it. -- */
    if (w.chronicle.some(function (e) { return e.kind === 'predator'; })) {
      alive.forEach(function (k) {
        if (knowsOf(k).indexOf('ward') > -1) return;
        if (k.brain.boldness <= 0.6 || k.brain.sociability <= 0.55) return;
        if (rng() >= 0.05) return;
        var kin = alive.some(function (o) { return o.id !== k.id && Math.abs(o.x - k.x) < 0.12 && Math.abs(o.y - k.y) < 0.12; });
        if (!kin) return;
        learn(w, k, 'ward');
        var wardText = 'After the killing, ' + kithLabel(k) + ' would not sleep easy. It began to keep the watch, ' +
          'and to teach the others to stand together when the dark comes. It knows the warding now.';
        chronicle(w, 'discovery', wardText, 'dw' + k.id);
        events.push({ kind: 'discovery', text: wardText });
      });
    }

    /* -- builders build: a lean-to where none stands, a hearth among
     * shelters. One work per builder per day, identical in every copy -- */
    alive.forEach(function (k) {
      if (k.energy < 0.6) return;
      var skills = knowsOf(k);
      if (skills.indexOf('shelter') > -1 && rng() < 0.05) {
        var crowded = structList.some(function (s) { return structDist(s, k.x, k.y) < 0.12; });
        if (!crowded) {
          var builtLeanto = buildStructure(w, k, 'leanto', dayBucket);
          if (builtLeanto) {
            structList.push(builtLeanto);
            events.push({ kind: 'discovery', text: kithLabel(k) + ' raised a lean-to.' });
          }
        }
      }
      // hearth-keeping is invented at night, beside one's own shelter
      var nearLeanto = structList.some(function (s) {
        return s.type === 'leanto' && structDist(s, k.x, k.y) < 0.1;
      });
      if (nearLeanto && skills.indexOf('shelter') > -1 && skills.indexOf('hearth') === -1 &&
          k.brain.sociability > 0.65 && rng() < 0.04) {
        learn(w, k, 'hearth');
        var hearthText = 'By the shelters in the dark, ' + kithLabel(k) +
          ' learned to keep something warm alive. It knows the keeping of hearths.';
        chronicle(w, 'discovery', hearthText, 'dh' + k.id);
        events.push({ kind: 'discovery', text: hearthText });
      }
      if (nearLeanto && skills.indexOf('hearth') > -1 && rng() < 0.05) {
        var hearthNear = structList.some(function (s) {
          return s.type === 'hearth' && structDist(s, k.x, k.y) < 0.15;
        });
        if (!hearthNear) {
          var builtHearth = buildStructure(w, k, 'hearth', dayBucket);
          if (builtHearth) {
            structList.push(builtHearth);
            events.push({ kind: 'discovery', text: kithLabel(k) + ' set a hearth by the shelters.' });
          }
        }
      }
    });

    /* -- a raising, finished: the day the roof or the fire is done. Told once,
     * identically in every copy (progress is time, not tick-count) -- */
    structList.forEach(function (s) {
      if (s.type === 'field') return; // a field opens at once; it does not "rise"
      if (s.start == null || structRaised(s, now) < 1) return;
      var doneId = 'sc' + s.id;
      if (w.chronicle.some(function (e) { return e.id === doneId; })) return;
      var where = realmBiome(w.id, biomeAt(terrain, s.x, s.y));
      var maker = w.kith[s.by];
      var who = maker ? kithLabel(maker) + '’s ' : '';
      var doneText = s.type === 'hearth'
        ? who + 'hearth in the ' + where + ' is lit at last. Warmth has a home here.'
        : who + 'lean-to in the ' + where + ' stands finished. The weather will have to try harder now.';
      chronicle(w, 'discovery', doneText, doneId);
      events.push({ kind: 'discovery', text: doneText });
    });

    /* -- where shelters ring a hearth and a tribe lives among them,
     * that is a village — declared once, identically in every copy -- */
    structList.forEach(function (hearth) {
      if (hearth.type !== 'hearth') return;
      var villageId = 'v' + hearth.id;
      if (w.chronicle.some(function (e) { return e.id === villageId; })) return;
      var ring = structList.filter(function (s) {
        return s.type === 'leanto' && structDist(s, hearth.x, hearth.y) < 0.15;
      });
      if (ring.length < 2) return;
      var tribeHere = tribesOf(w).filter(function (tribe) {
        return tribe.members.some(function (m) { return structDist(hearth, m.x, m.y) < 0.2; });
      })[0];
      if (!tribeHere) return;
      var villageText = 'Around the hearth, ' + (ring.length) + ' shelters stand together, and the ' +
        tribeHere.name + ' live among them. This world has its first village.';
      chronicle(w, 'kind', villageText, villageId);
      events.push({ kind: 'village', text: villageText });
    });

    /* -- three or more mutual bonds are the birth of a tribe, chronicled
     * once per founding trio (the three senior members, stable as the
     * tribe grows, identical in every copy) -- */
    tribesOf(w).forEach(function (tribe) {
      if (tribe.members.length < 3) return;
      var founders = tribe.members.map(function (m) { return m.id; }).sort().slice(0, 3).join('');
      var tribeId = 'tr' + hash32(founders).toString(16);
      if (!w.chronicle.some(function (e) { return e.id === tribeId; })) {
        var tribeText = 'A tribe has formed. They call themselves the ' + tribe.name + ': ' +
          tribe.members.map(kithLabel).join(', ') + '.';
        chronicle(w, 'kith', tribeText, tribeId);
        events.push({ kind: 'tribe', text: tribeText });
      }
    });

    /* -- and the almanac reads the world, and writes what it finds -- */
    almanacTick(w).forEach(function (e) { events.push(e); });

    return events;
  }

  /* ---------- catch-up: the world lives while the file sleeps ---------- */

  var CATCHUP_BUCKET_MS = 6 * 3600 * 1000;
  var CATCHUP_MAX_BUCKETS = 12; // at most three days of remembered happenings

  function catchUp(w) {
    var now = env.now();
    var slept = now - (w.touched || now);
    if (slept < 2 * 3600 * 1000) return [];
    advanceGrowth(w); // what bloomed while the file slept counts as food
    var events = [];
    var buckets = Math.min(CATCHUP_MAX_BUCKETS, Math.floor(slept / CATCHUP_BUCKET_MS));
    var start = now - buckets * CATCHUP_BUCKET_MS;
    var anyBloom = Object.keys(w.plants).some(function (id) { return w.plants[id].growth > 0.55; });

    for (var i = 1; i <= buckets; i++) {
      var t = start + i * CATCHUP_BUCKET_MS;
      events = events.concat(checkMortality(w, t));
      var living = livingKith(w);

      living.forEach(function (k) {
        if (anyBloom) {
          k.energy = Math.max(k.energy, 0.7);
          k.starving = null;
        } else {
          k.energy = Math.max(0, k.energy - 0.35);
          if (k.energy <= 0 && !k.starving) k.starving = t;
        }
      });

      // quiet lives went on: bonded grown pairs may have had children
      if (anyBloom) {
        var bucketDay = Math.floor(t / DAY);
        for (var a2 = 0; a2 < living.length; a2++) {
          for (var b2 = a2 + 1; b2 < living.length; b2++) {
            var ka = living[a2], kb = living[b2];
            if ((ka.trust[kb.id] || 0) >= 0.5 && (kb.trust[ka.id] || 0) >= 0.5 &&
                kithStage(ka, t) === 'grown' && kithStage(kb, t) === 'grown') {
              var roll = mulberry32(hash32([ka.id, kb.id].sort().join('+') + ':catch:' + bucketDay))();
              if (roll < 0.15) {
                var birth = birthChild(w, ka, kb, bucketDay);
                if (birth) events.push(birth);
              }
            }
          }
        }
      }

      // only the last day's storms are worth retelling
      if (now - t < DAY) {
        var wx = weatherAt(w.id, t);
        if (wx.kind === 'storm') {
          var sid = 's' + w.id + '-' + wx.bucket;
          if (!w.chronicle.some(function (e) { return e.id === sid; })) {
            var textRng = mulberry32(hash32(sid));
            chronicle(w, 'storm', pick(textRng, STORM_TEXTS).replace('{w}', w.name), sid);
          }
        }
      }
    }
    return events;
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
      if (k.passed) return; // the dead do not lead meetings
      if (!best || k.born < best.born) best = k;
    });
    return best;
  }

  function mergeSide(w, other) {
    // A world's chosen emissary leads the meeting; a world that never chose
    // one (or whose emissary has passed) is represented by its eldest kith.
    var e = w.emissary && w.kith && w.kith[w.emissary];
    return (e && !e.passed) ? e : eldestKith(w.kith);
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

    // Minds are derived from each kith's own identity, so migrating both
    // sides before the union gives identical results in every copy.
    if (!w.kith) w.kith = {};
    migrateKith(w);
    if (other.kith) migrateKith(other);

    var beforePlants = Object.keys(w.plants).length;
    var beforeKith = Object.keys(w.kith || {}).length;

    // Champions and emissaries must be chosen from each side's own world
    // as it stood BEFORE the union.
    var ourPlantParent = proudestPlant(w.plants);
    var theirPlantParent = proudestPlant(other.plants);
    var ourEmissary = mergeSide(w, other);
    var theirEmissary = mergeSide(other, w);
    // Each side's tongue, as it was before the meeting — for the record.
    var ourTongue = worldLexicon(w);
    var theirTongue = worldLexicon({ kith: other.kith || {} });
    var ourOrder = worldOrder(w);
    var theirOrder = worldOrder({ kith: other.kith || {} });

    var weKnowThem = w.lineage.some(function (l) { return l.id === other.id; });
    var theyKnowUs = (other.lineage || []).some(function (l) { return l.id === w.id; });
    var firstMeeting = other.id !== w.id && !weKnowThem && !theyKnowUs;

    // Unions — never lossy.
    unionByU(w.plants, other.plants, w.id, other.id);
    if (!w.kith) w.kith = {};
    unionByU(w.kith, other.kith || {}, w.id, other.id);
    ensureStructures(w);
    unionByU(w.structures, other.structures || {}, w.id, other.id);
    // almanac pages: the EARLIEST filling wins — a page written in either
    // copy stays written, dated to whichever copy lived it first
    if (!w.almanac) w.almanac = {};
    Object.keys(other.almanac || {}).forEach(function (pid) {
      if (!w.almanac[pid] || other.almanac[pid].at < w.almanac[pid].at) {
        w.almanac[pid] = other.almanac[pid];
      }
    });

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

      // first contact between NATURES is worth a line of its own
      var realmA = realmOf(sortedIds[0]).realm, realmB = realmOf(sortedIds[1]).realm;
      if (realmA !== realmB) {
        chronicle(w, 'merge', 'One world is of ' + realmA.name + '; the other of ' + realmB.name +
          '. Natures that had never touched now share one soil.',
          'rlm' + sortedIds.join('') + '-' + mergeClock, sortedIds[0]);
      }

      // The emissaries meet first — their child leads the new generation.
      if (ourEmissary && theirEmissary && ourEmissary.id !== theirEmissary.id) {
        var kithParents = [ourEmissary, theirEmissary].sort(function (a, b) { return a.id < b.id ? -1 : 1; });
        var childId = 'k' + sortedIds.join('') + '-' + mergeClock;
        var childGenome = crossGenomes(rng, kithParents[0].genome, kithParents[1].genome, KITH_GENE_SPEC);
        var childSpanRng = mulberry32(hash32(childId + ':span'));
        child = {
          id: childId,
          genome: childGenome,
          brain: crossGenomes(rng, kithParents[0].brain, kithParents[1].brain, BRAIN_SPEC),
          given: makeKithName(rng, childGenome.voice),
          name: null,
          born: now,
          span: 14 + Math.floor(childSpanRng() * 9),
          passed: null,
          parents: [kithParents[0].id, kithParents[1].id],
          origin: 'merge',
          bornOfMerge: {
            worlds: canonicalNames.slice(),
            parents: [kithLabel(kithParents[0]), kithLabel(kithParents[1])]
          },
          energy: 1,
          starving: null,
          taste: {},
          trust: {},
          lex: {},
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
        greetNewKind(w, child, sortedIds[0]);
      }

      // Language contact: where the two tongues named the same thing
      // differently, the chronicle keeps the moment of first hearing.
      var sharedConcepts = Object.keys(ourTongue).filter(function (c) {
        return theirTongue[c] && ourTongue[c][0] && theirTongue[c][0] &&
          ourTongue[c][0].word !== theirTongue[c][0].word;
      }).sort();
      if (sharedConcepts.length > 0) {
        var contactConcept = sharedConcepts[0];
        var wordPair = w.id < other.id
          ? [ourTongue[contactConcept][0].word, theirTongue[contactConcept][0].word]
          : [theirTongue[contactConcept][0].word, ourTongue[contactConcept][0].word];
        chronicle(w, 'kith', 'In ' + canonicalNames[0] + ' they call ' + conceptLabel(contactConcept) +
          ' “' + wordPair[0] + '”; in ' + canonicalNames[1] + ' it is “' + wordPair[1] +
          '”. Both words live here now.', 'lx' + sortedIds.join('') + '-' + mergeClock, sortedIds[0]);
      }

      // Two grammars under one sky: when the worlds order their words
      // differently, the chronicle keeps the moment the ways of speaking met.
      if (ourOrder && theirOrder && ourOrder !== theirOrder) {
        var mfName = (w.id < other.id ? (ourOrder === 'mf') : (theirOrder === 'mf'))
          ? canonicalNames[0] : canonicalNames[1];
        var cfName = mfName === canonicalNames[0] ? canonicalNames[1] : canonicalNames[0];
        chronicle(w, 'kith', 'In ' + mfName + ' the feeling comes first when they speak; in ' +
          cfName + ', the thing itself. Two ways of speaking now share one world.',
          'gx' + sortedIds.join('') + '-' + mergeClock, sortedIds[0]);
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
      var living = livingKith(w);
      if (living.length > KITH_CAP) {
        // BOTH sides' emissaries are protected, so each copy evicts the same
        // wanderers and the merged worlds stay content-identical. Those who
        // have passed are memory, never evicted, and never crowd the field.
        var protectedIds = {};
        if (w.emissary) protectedIds[w.emissary] = true;
        if (other.emissary) protectedIds[other.emissary] = true;
        var surplus = living
          .filter(function (k) { return !protectedIds[k.id] && !k.bornOfMerge && !k.name && !k.wanderer; })
          .sort(function (a, b) { return b.born !== a.born ? b.born - a.born : (a.id < b.id ? -1 : 1); })
          .slice(0, living.length - KITH_CAP);
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
    text = String(text);
    // sanity cap: no honest world is this heavy; a hostile one gets no parse
    if (text.length > 24 * 1024 * 1024) return null;
    text = text.trim();
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
    realmOf: realmOf,
    realmBiome: realmBiome,
    REALMS: REALMS,
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
    seasonAt: seasonAt,
    dayPhase: dayPhase,
    isNight: isNight,
    growingHours: growingHours,
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
    isAlive: isAlive,
    livingKith: livingKith,
    checkMortality: checkMortality,
    catchUp: catchUp,
    inbornLiking: inbornLiking,
    coinWord: coinWord,
    attendConcept: attendConcept,
    speakBetween: speakBetween,
    exchangeWord: exchangeWord,
    speakSentence: speakSentence,
    orderEntry: orderEntry,
    worldOrder: worldOrder,
    worldLexicon: worldLexicon,
    conceptLabel: conceptLabel,
    whisperWord: whisperWord,
    tribesOf: tribesOf,
    tribeOfKith: tribeOfKith,
    knowsOf: knowsOf,
    learn: learn,
    keeperPlant: keeperPlant,
    familiesOf: familiesOf,
    kindOf: kindOf,
    greetNewKind: greetNewKind,
    skillName: skillName,
    buildStructure: buildStructure,
    clearField: clearField,
    ensureStructures: ensureStructures,
    structRaised: structRaised,
    BUILD_MS: BUILD_MS,
    wandererDue: wandererDue,
    wandererTick: wandererTick,
    expeditionDue: expeditionDue,
    expeditionTick: expeditionTick,
    predatorDue: predatorDue,
    predatorAt: predatorAt,
    predatorTick: predatorTick,
    disasterDue: disasterDue,
    disasterAt: disasterAt,
    disasterTick: disasterTick,
    presentKith: presentKith,
    almanacTick: almanacTick,
    almanacPages: almanacPages,
    modernKithGenome: modernKithGenome,
    isSwimmer: isSwimmer,
    canStandAt: canStandAt,
    reachableStraight: reachableStraight,
    KITH_GENE_SPEC: KITH_GENE_SPEC,
    plantLabel: plantLabel,
    mergeWorlds: mergeWorlds,
    WATER_COOLDOWN: WATER_COOLDOWN,
    KITH_CAP: KITH_CAP
  };
});
