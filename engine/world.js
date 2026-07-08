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
    hearth: 'the keeping of hearths'
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

  function buildStructure(w, k, type, dayBucket) {
    ensureStructures(w);
    var sid = (type === 'hearth' ? 'h' : 'st') + hash32(k.id + ':build:' + type + ':' + dayBucket).toString(16);
    if (w.structures[sid]) return null; // today's work is already done
    if (Object.keys(w.structures).length >= STRUCT_CAP) return null;
    var terrain = makeTerrain(w.id);
    if (!isLandAt(terrain, k.x, k.y)) return null;
    var s = {
      id: sid,
      type: type,
      x: k.x, y: k.y,
      by: k.id,
      built: env.now(),
      u: bumpClock(w)
    };
    w.structures[sid] = s;
    var whereName = realmBiome(w.id, biomeAt(terrain, k.x, k.y));
    chronicle(w, 'discovery', type === 'hearth'
      ? kithLabel(k) + ' set stones in a ring by the shelters and kept something warm alive in it. A hearth burns in the ' + whereName + '.'
      : kithLabel(k) + ' raised a lean-to in the ' + whereName + '. The weather will have to try harder now.',
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
    var spot = isSoilAt(terrain, k.x, k.y) ? { x: k.x, y: k.y } : findSpot(w, 'garden:' + plantId, isSoilAt);
    var genome = crossGenomes(rng, modernGenome(stock.genome), modernGenome(stock.genome), PLANT_GENE_SPEC);
    var plant = {
      id: plantId,
      species: species,
      name: null,
      genome: genome,
      x: spot.x, y: spot.y,
      soil: BIOMES[biomeAt(terrain, spot.x, spot.y)].fertility,
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
      realmBiome(w.id, biomeAt(terrain, spot.x, spot.y)) + '. The garden grows itself now.', 'gp' + plantId);
    return plant;
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
    var kind = 'clear';
    if (roll < c.storm) kind = 'storm';
    else if (roll < c.storm + c.rain) kind = 'rain';
    else if (roll < c.storm + c.rain + c.mist) kind = 'mist';
    else if (roll < c.storm + c.rain + c.mist + c.breeze) kind = 'breeze';
    var label = kind === 'clear' ? 'clear' : (realmOf(worldId).realm.wx[kind] || kind);
    return { kind: kind, bucket: bucket, intensity: 0.5 + rng() * 0.5, label: label };
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

  function isAlive(k) { return !k.passed; }

  function livingKith(w) {
    return Object.keys(w.kith || {}).map(function (id) { return w.kith[id]; }).filter(isAlive);
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
    var terrain = makeTerrain(w.id);
    var rng = mulberry32(hash32(w.id + ':' + Math.floor(now / 1000)));
    var storm = weatherAt(w.id, now).kind === 'storm';
    var call = (beacon && now < beacon.until) ? beacon : null;
    var alive = livingKith(w);
    var blooming = Object.keys(w.plants).map(function (id) { return w.plants[id]; })
      .filter(function (p) { return p.growth > 0.55; });
    var dayBucket = Math.floor(now / DAY);

    var structList = Object.keys(w.structures || {}).map(function (id) { return w.structures[id]; });

    alive.forEach(function (k) {
      var decayMul = storm && k.act !== 'shelter' ? 1.5 : 1;
      if (k.act === 'shelter' && structList.some(function (s) {
        return s.type === 'leanto' && structDist(s, k.x, k.y) < 0.07;
      })) decayMul = 0.6; // a roof is worth more than a rock
      var decay = ENERGY_DECAY_PER_SEC * decayMul * dt;
      k.energy = Math.max(0, k.energy - decay);
      if (k.energy <= 0 && !k.starving) k.starving = now;

      if (k.act === 'eat') {
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
      if (k.act === 'rest' || k.act === 'shelter') {
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
      var brain = k.brain;
      var hungerUrge = (1 - k.energy) * (0.6 + brain.appetite * 0.8);
      var stormUrge = storm ? (1.2 - brain.boldness) : 0;
      var socialUrge = brain.sociability * 0.55;
      var wanderUrge = 0.15 + brain.curiosity * 0.35;
      var restUrge = brain.patience * 0.3 * rng();

      if (stormUrge > hungerUrge && stormUrge > 0.5) {
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
        if (refuge && (Math.abs(refuge.x - k.x) > 0.02 || Math.abs(refuge.y - k.y) > 0.02)) {
          k.tx = refuge.x; k.ty = refuge.y;
        } else {
          k.act = 'shelter'; k.tx = null;
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
          if (fd < 0.05) {
            // arrived beside them — linger; the encounter pass does the rest
            k.act = 'rest';
            k.actUntil = now + (3 + rng() * 5) * 1000;
            return;
          }
          k.tx = friend.x; k.ty = friend.y;
        }
      } else if (k.tx === null || (Math.abs(k.tx - k.x) < 0.01 && Math.abs(k.ty - k.y) < 0.01)) {
        // a soft call on the wind — the curious answer it, and remember
        if (call && rng() < 0.25 + brain.curiosity * 0.55) {
          var bx = Math.max(0.03, Math.min(0.97, call.x + (rng() - 0.5) * 0.06));
          var by = Math.max(0.56, Math.min(0.97, call.y + (rng() - 0.5) * 0.04));
          if (canStandAt(terrain, k, bx, by)) {
            k.tx = bx; k.ty = by;
            if (k.gCallMark !== call.until) { k.g = (k.g || 0) + 0.08; k.gCallMark = call.until; }
          }
        } else if (rng() < brain.patience * 0.6) {
          k.act = 'rest';
          k.actUntil = now + (4 + rng() * 12) * 1000;
          return;
        } else {
          // pick somewhere new to be — where this body can go
          for (var tries = 0; tries < 8; tries++) {
            var range = 0.1 + k.brain.wanderlust * 0.5;
            var cx = Math.max(0.03, Math.min(0.97, k.x + (rng() - 0.5) * range * 2));
            var cy = Math.max(0.56, Math.min(0.97, k.y + (rng() - 0.5) * range));
            if (canStandAt(terrain, k, cx, cy)) { k.tx = cx; k.ty = cy; break; }
          }
        }
      }

      // move toward the target; the water's edge stops all but swimmers
      if (k.tx !== null) {
        var dx = k.tx - k.x, dy = k.ty - k.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var stageSpeed = kithStage(k, now) === 'elder' ? 0.6 : 1;
        var limbSpeed = [0.8, 1, 1.15][k.genome.limbs || 0] || 1;
        var inWater = !isLandAt(terrain, k.x, k.y);
        var mediumSpeed = inWater ? 1.25 : 1; // a swimmer glides
        var step = Math.min(dist, k.genome.speed * stageSpeed * limbSpeed * mediumSpeed * dt);
        if (dist > 0.0001) {
          var nx = k.x + (dx / dist) * step;
          var ny = k.y + (dy / dist) * step;
          if (!canStandAt(terrain, k, nx, ny)) {
            k.tx = null; k.ty = null; // shoreline reached — think again next tick
          } else {
            k.x = nx;
            k.y = ny;
            if (Math.abs(dx) > 0.002) k.facing = dx > 0 ? 1 : -1;
          }
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
    });

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

    /* -- where shelters ring a hearth and a tribe lives among them,
     * that is a village — declared once, identically in every copy -- */
    structList.forEach(function (hearth) {
      if (hearth.type !== 'hearth') return;
      var villageId = 'v' + hearth.id;
      if (w.chronicle.some(function (e) { return e.id === villageId; })) return;
      var ring = structList.filter(function (s) {
        return s.id !== hearth.id && structDist(s, hearth.x, hearth.y) < 0.15;
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
          .filter(function (k) { return !protectedIds[k.id] && !k.bornOfMerge && !k.name; })
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
    ensureStructures: ensureStructures,
    modernKithGenome: modernKithGenome,
    isSwimmer: isSwimmer,
    canStandAt: canStandAt,
    KITH_GENE_SPEC: KITH_GENE_SPEC,
    plantLabel: plantLabel,
    mergeWorlds: mergeWorlds,
    WATER_COOLDOWN: WATER_COOLDOWN,
    KITH_CAP: KITH_CAP
  };
});
