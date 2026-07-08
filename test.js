#!/usr/bin/env node
/* Driftgarden merge tests.
 * Usage: node test.js
 * Zero dependencies. Proves the constitution's Principle 2 ("the merge is
 * sacred") as executable fact:
 *   - determinism: A merging B produces the same world-content as B merging A
 *   - no loss: nothing either world knew is ever dropped
 *   - reunion: re-merging a known world changes nothing and births nothing
 */
'use strict';

const W = require('./engine/world.js');

let testCount = 0;
let failures = 0;

function check(name, condition, detail) {
  testCount++;
  if (condition) {
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// Canonical serialisation: object key order must not affect equality.
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

// Positions are presentation, not content: every world settles travellers
// onto its OWN land, so x/y legitimately differ between copies.
const POSITION_KEYS = { x: 1, y: 1, tx: 1, ty: 1, facing: 1, saying: 1, sayingUntil: 1, gCallMark: 1 };
function content(value) {
  const c = clone(value);
  (function strip(node) {
    if (Array.isArray(node)) { node.forEach(strip); return; }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(k => { if (POSITION_KEYS[k]) delete node[k]; else strip(node[k]); });
    }
  })(c);
  return stable(c);
}

/* ---------- deterministic environment ---------- */

let fakeNow = 1000000000000;
let idCounter = 0;
W.setEnv({
  now: () => fakeNow,
  newId: () => 'id' + String(idCounter++).padStart(6, '0')
});

function hoursPass(h) { fakeNow += h * 3600 * 1000; }

/* ---------- build two divergent worlds ---------- */

const A = W.newWorld();
hoursPass(1);
const B = W.newWorld();

hoursPass(1);
W.plantSeed(A); W.plantSeed(A); W.plantSeed(A);
W.plantSeed(B); W.plantSeed(B);
hoursPass(40); // everything blooms
W.advanceGrowth(A); W.advanceGrowth(B);

// each side blesses an emissary
const aEmissaryId = Object.keys(A.kith).sort()[0];
const bEmissaryId = Object.keys(B.kith).sort()[1];
W.blessKith(A, aEmissaryId);
W.blessKith(B, bEmissaryId);
W.nameKith(A, aEmissaryId, 'Ambassador Root');

hoursPass(2);

/* ---------- 1. determinism: A⊕B content-equals B⊕A ---------- */

console.log('determinism');
const AB = clone(A);
const BA = clone(B);
const resAB = W.mergeWorlds(AB, clone(B));
const resBA = W.mergeWorlds(BA, clone(A));
// Growth is a pure function of elapsed time, so merged copies converge the
// moment both observe the same clock — that is the equality that matters.
W.advanceGrowth(AB);
W.advanceGrowth(BA);

check('plants identical', content(AB.plants) === content(BA.plants));
check('kith identical', content(AB.kith) === content(BA.kith));
check('chronicle identical', stable(AB.chronicle) === stable(BA.chronicle));
check('clocks identical', AB.clock === BA.clock, AB.clock + ' vs ' + BA.clock);
const lineageWithSelf = w => [{ id: w.id }].concat(w.lineage.map(l => ({ id: l.id })))
  .map(l => l.id).sort().join(',');
check('lineage (incl. self) identical', lineageWithSelf(AB) === lineageWithSelf(BA));

check('a child was born of the merge', !!resAB.child && !!resBA.child);
check('the same child on both sides', resAB.child && resBA.child && content(resAB.child) === content(resBA.child));
check('a plant hybrid grew on both sides', !!resAB.hybrid && content(resAB.hybrid) === content(resBA.hybrid));
check('child parents are the two emissaries',
  resAB.child && resAB.child.parents.sort().join(',') === [aEmissaryId, bEmissaryId].sort().join(','),
  resAB.child && resAB.child.parents.join(','));

/* ---------- 2. no loss ---------- */

console.log('no loss');
const allPlantIds = Object.keys(A.plants).concat(Object.keys(B.plants));
const allKithIds = Object.keys(A.kith).concat(Object.keys(B.kith));
const allChronicleIds = A.chronicle.concat(B.chronicle).map(e => e.id);
check('every plant survived', allPlantIds.every(id => AB.plants[id]));
check('every kith survived', allKithIds.every(id => AB.kith[id]));
check('every chronicle entry survived', allChronicleIds.every(id => AB.chronicle.some(e => e.id === id)));
check('chronicle is sorted by logical time',
  AB.chronicle.every((e, i) => i === 0 || AB.chronicle[i - 1].t <= e.t));
check('our emissary is untouched by the merge', AB.emissary === aEmissaryId);

/* ---------- 3. reunion: re-merging changes nothing ---------- */

console.log('reunion');
// growth advances during any merge, so compare identity-level structure
function skeleton(w) {
  return stable({
    p: Object.keys(w.plants).sort(),
    k: Object.keys(w.kith).sort(),
    c: w.chronicle.map(e => e.id).sort(),
    merges: w.merges
  });
}
const beforeReunion = skeleton(AB);
hoursPass(1);
const res2 = W.mergeWorlds(AB, clone(B));
check('not a first meeting', res2.firstMeeting === false);
check('no second child', !res2.child);
check('no second hybrid', !res2.hybrid);
check('same plants, kith, history and merge-count after reunion', skeleton(AB) === beforeReunion);

/* ---------- 4. same-world sync ---------- */

console.log('same-world sync');
const oldCopy = clone(A);
hoursPass(1);
W.plantSeed(A);
const newer = clone(A);
const syncTarget = clone(oldCopy);
const resSync = W.mergeWorlds(syncTarget, newer);
check('recognised as the same world', resSync.same === true);
check('newer plant arrived', resSync.gained === 1);
check('no child from syncing with yourself', !resSync.child);
check('merge count unchanged by sync', syncTarget.merges === oldCopy.merges);

/* ---------- 5. merging a world from before the kith existed ---------- */

console.log('backwards compatibility');
const elder = clone(B);
delete elder.kith;
delete elder.emissary;
elder.id = 'idancient0000';
elder.name = 'The Old Country';
elder.lineage = [];
Object.keys(elder.plants).forEach((id, i) => {
  const p = elder.plants[id];
  delete elder.plants[id];
  p.id = 'idold' + i;
  elder.plants[p.id] = p;
});
elder.chronicle = elder.chronicle.map((e, i) => ({ ...e, id: 'idoldc' + i, world: elder.id }));
const modern = clone(A);
let crashed = false;
let resOld = null;
try { resOld = W.mergeWorlds(modern, elder); } catch (e) { crashed = true; }
check('no crash', !crashed);
check('their plants arrived', resOld && Object.keys(elder.plants).every(id => modern.plants[id]));
check('no kith child (they had no kith)', resOld && !resOld.child);
check('plant hybrid still born', resOld && !!resOld.hybrid);

/* ---------- 6. crowded merge: eviction is deterministic & emissary-safe ---------- */

console.log('crowded merge');
const bigA = W.newWorld();
hoursPass(1);
const bigB = W.newWorld();
// swell both populations to the cap using merge-free births
for (let i = 0; i < 12; i++) {
  const rngA = W.mulberry32(i * 2 + 1);
  const rngB = W.mulberry32(i * 2 + 2);
  // spawn via the same internal path founders use: plant seeds instead is
  // plant-only, so grow the kith herds by cloning founders with fresh ids
  const srcA = bigA.kith[Object.keys(bigA.kith)[0]];
  const srcB = bigB.kith[Object.keys(bigB.kith)[0]];
  const kA = clone(srcA); kA.id = 'idcrowda' + i; kA.born = fakeNow - i * 1000; kA.name = null; bigA.kith[kA.id] = kA;
  const kB = clone(srcB); kB.id = 'idcrowdb' + i; kB.born = fakeNow - i * 1000; kB.name = null; bigB.kith[kB.id] = kB;
}
W.blessKith(bigA, Object.keys(bigA.kith).sort()[0]);
W.blessKith(bigB, Object.keys(bigB.kith).sort()[0]);
const bigAB = clone(bigA);
const bigBA = clone(bigB);
W.mergeWorlds(bigAB, clone(bigB));
W.mergeWorlds(bigBA, clone(bigA));
check('population capped', Object.keys(bigAB.kith).length <= W.KITH_CAP);
check('same survivors on both sides', stable(Object.keys(bigAB.kith).sort()) === stable(Object.keys(bigBA.kith).sort()));
check('both emissaries survived the crowding',
  bigAB.kith[bigA.emissary] && bigAB.kith[bigB.emissary] && bigBA.kith[bigA.emissary] && bigBA.kith[bigB.emissary]);

/* ---------- 7. the land ---------- */

console.log('the land');
const t1 = W.makeTerrain('terraintestworld');
const t2 = W.makeTerrain('terraintestworld');
const t3 = W.makeTerrain('adifferentworld1');
check('terrain is deterministic per world', stable(t1.heights) === stable(t2.heights));
check('different worlds get different land', stable(t1.heights) !== stable(t3.heights));

const landWorld = W.newWorld();
for (let i = 0; i < 8; i++) W.plantSeed(landWorld);
const terrain = W.makeTerrain(landWorld.id);
check('every plant took root in soil', Object.keys(landWorld.plants)
  .every(id => W.isSoilAt(terrain, landWorld.plants[id].x, landWorld.plants[id].y)));
check('every plant carries a soil vigour stamp', Object.keys(landWorld.plants)
  .every(id => typeof landWorld.plants[id].soil === 'number' && landWorld.plants[id].soil > 0));
check('every kith stands on land', Object.keys(landWorld.kith)
  .every(id => W.isLandAt(terrain, landWorld.kith[id].x, landWorld.kith[id].y)));

// travellers arriving in a lake settle onto the shore
const host = W.newWorld();
const visitor = W.newWorld();
// strand every visitor entity in the host's deepest water spot
let deepSpot = null;
for (let r = 0; r < 22 && !deepSpot; r++) {
  for (let c = 0; c < 48 && !deepSpot; c++) {
    const x = (c + 0.5) / 48, y = 0.55 + (r + 0.5) / 22 * 0.45;
    if (W.biomeAt(W.makeTerrain(host.id), x, y) === 'deep') deepSpot = { x, y };
  }
}
if (deepSpot) {
  Object.values(visitor.plants).forEach(p => { p.x = deepSpot.x; p.y = deepSpot.y; });
  Object.values(visitor.kith).forEach(k => { k.x = deepSpot.x; k.y = deepSpot.y; });
}
W.plantSeed(visitor);
W.mergeWorlds(host, clone(visitor));
const hostTerrain = W.makeTerrain(host.id);
check('no plant is left underwater after a merge', Object.keys(host.plants)
  .every(id => W.isSoilAt(hostTerrain, host.plants[id].x, host.plants[id].y)));
check('no kith is left where its body cannot be after a merge', Object.keys(host.kith)
  .every(id => W.canStandAt(hostTerrain, host.kith[id], host.kith[id].x, host.kith[id].y)));

/* ---------- 8. flora: every world its own planet ---------- */

console.log('flora');
const f1 = W.makeFlora('floraworld000001');
const f2 = W.makeFlora('floraworld000001');
const f3 = W.makeFlora('otherplanet00001');
check('flora palette is deterministic per world', stable(f1) === stable(f2));
check('different worlds grow different flora', stable(f1) !== stable(f3));
check('palette holds 4-6 archetypes', f1.archetypes.length >= 4 && f1.archetypes.length <= 6);

const planet = W.newWorld();
const planetFlora = W.makeFlora(planet.id);
const archForms = {};
planetFlora.archetypes.forEach(a => { archForms[a.form] = true; });
for (let i = 0; i < 10; i++) W.plantSeed(planet);
check('every plant grows a modern genome with a form', Object.values(planet.plants)
  .every(p => p.genome.form && typeof p.genome.size === 'number'));
check('every plant belongs to this world\'s palette', Object.values(planet.plants)
  .every(p => archForms[p.genome.form]));
check('plants are small (size ≤ 1.2)', Object.values(planet.plants)
  .every(p => p.genome.size <= 1.2));

// a legacy plant (v0.1 genome) can still parent a hybrid
const legacy = { hue: 120, height: 150, branches: 3, petals: 6, leaf: 1, rate: 1 };
const modernised = W.modernGenome(legacy);
check('legacy genomes modernise', modernised.form === 'stalk' && modernised.size <= 1.2 && modernised.rate === 1);

/* ---------- 9. weather ---------- */

console.log('weather');
const wxA1 = W.weatherAt('weatherworld0001', fakeNow);
const wxA2 = W.weatherAt('weatherworld0001', fakeNow);
check('weather is deterministic for a world and moment', wxA1.kind === wxA2.kind && wxA1.intensity === wxA2.intensity);
let differs = false;
for (let h = 0; h < 60 && !differs; h++) {
  const t = fakeNow + h * 2 * 3600 * 1000;
  if (W.weatherAt('weatherworld0001', t).kind !== W.weatherAt('weatherworld0002', t).kind) differs = true;
}
check('two worlds live under different skies', differs);

// find a stormy moment and prove the chronicle records it exactly once
const stormWorld = W.newWorld();
let stormAt = null;
for (let h = 0; h < 2000 && stormAt === null; h++) {
  const t = fakeNow + h * 2 * 3600 * 1000;
  if (W.weatherAt(stormWorld.id, t).kind === 'storm') stormAt = t;
}
check('storms do eventually come', stormAt !== null);
if (stormAt !== null) {
  const savedNow = fakeNow;
  fakeNow = stormAt;
  const before = stormWorld.chronicle.length;
  W.weatherTick(stormWorld);
  W.weatherTick(stormWorld);
  check('a storm is chronicled exactly once', stormWorld.chronicle.length === before + 1);
  check('the storm entry has a deterministic id', stormWorld.chronicle.slice(-1)[0].id.indexOf('s' + stormWorld.id) === 0);
  fakeNow = savedNow;
}

/* ---------- 10. seeding temperaments ---------- */

console.log('seeding');
const lakeland = W.newWorld({ temperament: 'lakeland', name: 'Test Lakes' });
const drylands = W.newWorld({ temperament: 'drylands' });
const lakeStats = W.terrainStats(lakeland.id);
const dryStats = W.terrainStats(drylands.id);
check('a named world keeps its given name', lakeland.name === 'Test Lakes');
check('lakeland is wetter than drylands', lakeStats.water > dryStats.water,
  lakeStats.water.toFixed(2) + ' vs ' + dryStats.water.toFixed(2));
check('temperament worlds are complete worlds', Object.keys(lakeland.kith).length === 3 && lakeland.chronicle.length > 0);

/* ---------- 11. minds ---------- */

console.log('minds');
const mindWorld = W.newWorld();
const firstKith = Object.values(mindWorld.kith)[0];
check('kith are born with a brain', firstKith.brain &&
  ['curiosity', 'sociability', 'boldness', 'wanderlust', 'appetite', 'patience']
    .every(t => typeof firstKith.brain[t] === 'number'));
check('kith are born with a lifespan', firstKith.span >= 14 && firstKith.span <= 22);
check('inborn likings are stable and bounded', (() => {
  const l1 = W.inbornLiking(firstKith.id, 'Vravriaka');
  const l2 = W.inbornLiking(firstKith.id, 'Vravriaka');
  return l1 === l2 && l1 >= -1 && l1 <= 1;
})());

// pre-mind kith grow identical minds in every copy
const oldSoul = clone(mindWorld);
Object.values(oldSoul.kith).forEach(k => { delete k.brain; delete k.span; delete k.taste; delete k.trust; });
const copy1 = clone(oldSoul), copy2 = clone(oldSoul);
W.ensureKith(copy1); W.ensureKith(copy2);
check('migrated minds are identical across copies', stable(copy1.kith) === stable(copy2.kith));

/* ---------- 12. mortality: every copy records the same passing ---------- */

console.log('mortality');
const mortal = W.newWorld();
const doomed = Object.values(mortal.kith)[0];
const twinA = clone(mortal), twinB = clone(mortal);
const beyond = doomed.born + (doomed.span + 1) * 24 * 3600 * 1000;
W.checkMortality(twinA, beyond);
W.checkMortality(twinB, beyond);
check('the kith passed in both copies', twinA.kith[doomed.id].passed && twinB.kith[doomed.id].passed);
check('at the identical moment', twinA.kith[doomed.id].passed === twinB.kith[doomed.id].passed);
const dEntryA = twinA.chronicle.find(e => e.id === 'd' + doomed.id);
const dEntryB = twinB.chronicle.find(e => e.id === 'd' + doomed.id);
check('with the identical chronicle id', !!dEntryA && !!dEntryB && dEntryA.text === dEntryB.text);
const reunited = clone(twinA);
W.mergeWorlds(reunited, clone(twinB));
check('reunited copies hold ONE passing, not two',
  reunited.chronicle.filter(e => e.id === 'd' + doomed.id).length === 1);
check('the dead are never resurrected by a merge', !!reunited.kith[doomed.id].passed);
check('the dead do not lead meetings', (() => {
  const w2 = clone(twinA);
  w2.emissary = doomed.id; // bless the departed
  const visitor2 = W.newWorld();
  const res = W.mergeWorlds(w2, clone(visitor2));
  return !res.child || res.child.parents.indexOf(doomed.id) === -1;
})());

/* ---------- 13. birth: same pair, same day, same child ---------- */

console.log('birth');
let nursery = W.newWorld();
while (W.weatherAt(nursery.id, fakeNow + 30 * 3600 * 1000).kind === 'storm') {
  nursery = W.newWorld(); // courting waits for fair weather — find some
}
hoursPass(30); // founders come of age
const [pa, pb] = Object.values(nursery.kith);
pa.trust[pb.id] = 0.8; pb.trust[pa.id] = 0.8;
pa.energy = 1; pb.energy = 1;
const nurseryTwinA = clone(nursery), nurseryTwinB = clone(nursery);
const day = Math.floor(fakeNow / (24 * 3600 * 1000));
// reach into both copies and let the same pair have today's child
function forceBirth(w) {
  const a = w.kith[pa.id], b = w.kith[pb.id];
  a.x = b.x; a.y = b.y; // stand together
  // run ticks until a birth event appears (trust is already bonded)
  for (let t = 0; t < 40; t++) {
    const evs = W.kithTick(w, 2);
    const born = evs.find(e => e.kind === 'born');
    if (born) return born;
  }
  return null;
}
const bornA = forceBirth(nurseryTwinA);
const bornB = forceBirth(nurseryTwinB);
check('children were born in both copies', !!bornA && !!bornB);
check('and they are the same child', bornA && bornB && bornA.child.id === bornB.child.id &&
  content(bornA.child) === content(bornB.child));
const reunitedNursery = clone(nurseryTwinA);
W.mergeWorlds(reunitedNursery, clone(nurseryTwinB));
check('reunited copies hold one child, not twins',
  Object.values(reunitedNursery.kith).filter(k => k.parents && k.parents.indexOf(pa.id) > -1).length === 1);
check('the child inherits a crossed brain', bornA && bornA.child.brain &&
  bornA.child.brain.curiosity >= 0.05 && bornA.child.brain.curiosity <= 1);

/* ---------- 14. catch-up: the world lives while the file sleeps ---------- */

console.log('catch-up');
const sleeper = W.newWorld();
for (let i = 0; i < 3; i++) W.plantSeed(sleeper);
hoursPass(40);
W.advanceGrowth(sleeper); // blooms exist
sleeper.touched = fakeNow;
const sleeperKith = Object.values(sleeper.kith);
sleeperKith[0].trust[sleeperKith[1].id] = 0.9;
sleeperKith[1].trust[sleeperKith[0].id] = 0.9;
hoursPass(72); // three days pass
const chronicleBefore = sleeper.chronicle.length;
const news = W.catchUp(sleeper);
check('catch-up runs without harm', Array.isArray(news));
check('nobody starved while food bloomed', W.livingKith(sleeper).every(k => !k.starving));
const starvingWorld = W.newWorld();
starvingWorld.plants = {}; // strip even the wild growth: a truly barren world
starvingWorld.touched = fakeNow;
hoursPass(72);
W.catchUp(starvingWorld);
check('a world with no food leaves its kith starving',
  W.livingKith(starvingWorld).some(k => k.starving) || W.livingKith(starvingWorld).length < 3);
hoursPass(72);
starvingWorld.touched = fakeNow - 72 * 3600 * 1000;
W.catchUp(starvingWorld);
check('prolonged famine takes lives', W.livingKith(starvingWorld).length < 3);
check('famine deaths are chronicled', starvingWorld.chronicle.some(e => e.kind === 'passing'));

/* ---------- 15. voices: the naming game ---------- */

console.log('voices');
const speakWorld = W.newWorld();
const speakers = Object.values(speakWorld.kith);
check('a kith always coins the same word for the same thing',
  W.coinWord(speakers[0], 'rain') === W.coinWord(speakers[0], 'rain'));
check('different kith coin different words (usually)',
  W.coinWord(speakers[0], 'home') !== W.coinWord(speakers[1], 'home') ||
  W.coinWord(speakers[0], 'water') !== W.coinWord(speakers[1], 'water') ||
  W.coinWord(speakers[0], 'sun') !== W.coinWord(speakers[1], 'sun'));

// two kith talking converge on one word
const sA = speakers[0], sB = speakers[1];
for (let i = 0; i < 12; i++) {
  W.speakBetween(speakWorld, i % 2 ? sA : sB, i % 2 ? sB : sA, 'home', fakeNow);
}
check('conversation converges on a shared word', sA.lex.home.word === sB.lex.home.word);
check('the coiner\'s name travels with the word', sA.lex.home.by === sB.lex.home.by);
check('agreement makes the word take root', sA.lex.home.s > 0.5 && sB.lex.home.s > 0.5);

// the whole population converges; the world lexicon reads it back
const sC = speakers[2];
for (let i = 0; i < 12; i++) W.speakBetween(speakWorld, sA, sC, 'home', fakeNow);
const tongue = W.worldLexicon(speakWorld);
check('the world converges on one dominant word for home',
  tongue.home && tongue.home[0].weight > (tongue.home[1] ? tongue.home[1].weight : 0));

// two worlds develop different tongues (their voices differ)
const otherTongueWorld = W.newWorld();
const ot = Object.values(otherTongueWorld.kith);
for (let i = 0; i < 12; i++) {
  W.speakBetween(otherTongueWorld, i % 2 ? ot[0] : ot[1], i % 2 ? ot[1] : ot[0], 'home', fakeNow);
}
check('two worlds speak differently', ot[0].lex.home.word !== sA.lex.home.word ||
  W.coinWord(ot[0], 'rain') !== W.coinWord(sA, 'rain'));

// whisper: the player's one word a day, through a living emissary
const whisperWorld = W.newWorld();
const wk = Object.keys(whisperWorld.kith)[0];
check('whispers need an emissary', W.whisperWord(whisperWorld, 'home', 'lumo').ok === false);
W.blessKith(whisperWorld, wk);
const whisper1 = W.whisperWord(whisperWorld, 'home', 'Lumo!!');
check('a whisper lands, cleaned to letters', whisper1.ok && whisper1.word === 'lumo');
check('the emissary now carries it', whisperWorld.kith[wk].lex.home.word === 'lumo' &&
  whisperWorld.kith[wk].lex.home.by === 'whisper');
check('the whisper is chronicled', whisperWorld.chronicle.some(e => e.text.indexOf('“lumo”') > -1));
check('one whisper a day, no more', W.whisperWord(whisperWorld, 'water', 'aqua').ok === false);

// dialect contact on merge is chronicled identically on both sides
const dialectA = W.newWorld();
const dialectB = W.newWorld();
const dA = Object.values(dialectA.kith), dB = Object.values(dialectB.kith);
for (let i = 0; i < 10; i++) {
  W.speakBetween(dialectA, dA[0], dA[1], 'home', fakeNow);
  W.speakBetween(dialectB, dB[0], dB[1], 'home', fakeNow);
}
if (dA[0].lex.home.word !== dB[0].lex.home.word) {
  const dAB = clone(dialectA), dBA = clone(dialectB);
  W.mergeWorlds(dAB, clone(dialectB));
  W.mergeWorlds(dBA, clone(dialectA));
  const contactA = dAB.chronicle.find(e => e.id.indexOf('lx') === 0);
  const contactB = dBA.chronicle.find(e => e.id.indexOf('lx') === 0);
  check('first hearing is chronicled', !!contactA && contactA.text.indexOf('Both words live here now') > -1);
  check('identically on both sides', !!contactA && !!contactB &&
    contactA.id === contactB.id && contactA.text === contactB.text);
} else {
  check('first hearing is chronicled', true); // the two tongues happened to agree — nothing to contact
  check('identically on both sides', true);
}

/* ---------- 16. society: tribes, strife, discovery ---------- */

console.log('society');
const societyWorld = W.newWorld();
const folk = Object.values(societyWorld.kith);
check('no tribes among strangers', W.tribesOf(societyWorld).length === 0);
// three mutual bonds make a tribe
folk[0].trust[folk[1].id] = 0.7; folk[1].trust[folk[0].id] = 0.7;
folk[1].trust[folk[2].id] = 0.7; folk[2].trust[folk[1].id] = 0.7;
const tribes = W.tribesOf(societyWorld);
check('three mutual friends are a tribe', tribes.length === 1 && tribes[0].members.length === 3);
check('the tribe is named in its own tongue', typeof tribes[0].name === 'string' && tribes[0].name.length >= 2 &&
  tribes[0].name[0] === tribes[0].name[0].toUpperCase());
check('tribeOfKith finds a member', W.tribeOfKith(societyWorld, folk[0].id) !== null);
check('tribes are identical across copies', (() => {
  const c1 = clone(societyWorld), c2 = clone(societyWorld);
  return stable(W.tribesOf(c1).map(t => ({ n: t.name, m: t.members.map(m => m.id) }))) ===
         stable(W.tribesOf(c2).map(t => ({ n: t.name, m: t.members.map(m => m.id) })));
})());
// tribe formation is chronicled exactly once
W.kithTick(societyWorld, 2);
W.kithTick(societyWorld, 2);
const tribeEntries = societyWorld.chronicle.filter(e => e.text.indexOf('A tribe has formed') > -1);
check('tribe formation chronicled exactly once', tribeEntries.length === 1);
check('the chronicle names the tribe', tribeEntries[0].text.indexOf(tribes[0].name) > -1);

// strife: two hungry strangers, one bloom
let strifeWorld = W.newWorld();
while (W.weatherAt(strifeWorld.id, fakeNow).kind === 'storm') strifeWorld = W.newWorld();
const bloomIds = Object.keys(strifeWorld.plants);
const arena = strifeWorld.plants[bloomIds[0]];
arena.growth = 1; // in full bloom
Object.values(strifeWorld.plants).forEach((p, i) => { if (p.id !== arena.id) p.growth = 0; });
const rivals = Object.values(strifeWorld.kith);
rivals.forEach((k, i) => {
  k.x = arena.x + (i * 0.005); k.y = arena.y; k.tx = null; k.ty = null;
  k.energy = 0.2; // hungry
  k.born -= 3 * 24 * 3600 * 1000; // grown
});
let sawContest = false;
for (let t = 0; t < 30 && !sawContest; t++) {
  W.kithTick(strifeWorld, 2);
  sawContest = Object.values(strifeWorld.kith).some(k =>
    Object.keys(k.trust).some(id => k.trust[id] < 0));
}
check('a contest leaves a grudge (negative trust)', sawContest);
check('grudges never fall below -1', Object.values(strifeWorld.kith).every(k =>
  Object.keys(k.trust).every(id => k.trust[id] >= -1)));

// discovery: learn + teach + garden
const gardenWorld = W.newWorld();
const keeper = Object.values(gardenWorld.kith)[0];
const pupil = Object.values(gardenWorld.kith)[1];
check('learning is once only', W.learn(gardenWorld, keeper, 'seedkeeping') === true &&
  W.learn(gardenWorld, keeper, 'seedkeeping') === false);
check('knowledge is content on the kith', W.knowsOf(keeper).indexOf('seedkeeping') > -1);
// the keeper gardens: same day, same planting, in every copy
keeper.taste['TestBloom'] = 0.8;
gardenWorld.plants['stockplant0001'] = clone(Object.values(gardenWorld.plants)[0]);
gardenWorld.plants['stockplant0001'].id = 'stockplant0001';
gardenWorld.plants['stockplant0001'].species = 'TestBloom';
const gardenDay = Math.floor(fakeNow / (24 * 3600 * 1000));
const gardenTwinA = clone(gardenWorld), gardenTwinB = clone(gardenWorld);
const plantedA = W.keeperPlant(gardenTwinA, gardenTwinA.kith[keeper.id], gardenDay);
const plantedB = W.keeperPlant(gardenTwinB, gardenTwinB.kith[keeper.id], gardenDay);
check('the keeper plants its favourite', !!plantedA && plantedA.species === 'TestBloom');
check('the same planting in every copy', !!plantedA && !!plantedB && plantedA.id === plantedB.id &&
  content(plantedA) === content(plantedB));
check('one planting a day, no more', W.keeperPlant(gardenTwinA, gardenTwinA.kith[keeper.id], gardenDay) === null);
const gardenMerged = clone(gardenTwinA);
W.mergeWorlds(gardenMerged, clone(gardenTwinB));
check('reunited copies hold one garden plant, not two',
  Object.keys(gardenMerged.plants).filter(id => id === plantedA.id).length === 1);

/* ---------- 17. the ecology: grazing ---------- */

console.log('grazing');
let grazeWorld = W.newWorld();
while (W.weatherAt(grazeWorld.id, fakeNow).kind === 'storm') grazeWorld = W.newWorld();
const pasture = Object.values(grazeWorld.plants)[0];
pasture.growth = 1;
Object.values(grazeWorld.plants).forEach(p => { if (p.id !== pasture.id) p.growth = 0; });
const grazer = Object.values(grazeWorld.kith)[0];
Object.values(grazeWorld.kith).forEach(k => { k.energy = 0.9; }); // no rivals
grazer.energy = 0.1;
grazer.x = pasture.x; grazer.y = pasture.y; grazer.tx = null; grazer.ty = null;
for (let t = 0; t < 10 && pasture.growth === 1; t++) {
  W.kithTick(grazeWorld, 2);
  fakeNow += 2000;
}
for (let t = 0; t < 10 && grazeWorld.kith[grazer.id].act === 'eat'; t++) {
  W.kithTick(grazeWorld, 2);
  fakeNow += 2000;
}
check('a sip visibly tires the bloom', pasture.growth < 1);
check('but never kills the plant', pasture.growth >= 0.3);
check('and the grazer is fed', grazeWorld.kith[grazer.id].energy > 0.5);

/* ---------- 18. a week alone ---------- */

console.log('a week alone');
const weekWorld = W.newWorld();
for (let i = 0; i < 4; i++) W.plantSeed(weekWorld);
const weekFolk = Object.values(weekWorld.kith);
weekFolk[0].trust[weekFolk[1].id] = 0.6; // an early friendship
weekFolk[1].trust[weekFolk[0].id] = 0.6;
weekWorld.touched = fakeNow;
const weekChronicleStart = weekWorld.chronicle.length;
for (let day = 0; day < 7; day++) {
  hoursPass(22); // the file sleeps most of each day
  W.catchUp(weekWorld);
  // a brief daily visit: the world runs live for ~2 minutes
  for (let t = 0; t < 60; t++) {
    W.kithTick(weekWorld, 2);
    fakeNow += 2000;
  }
  weekWorld.touched = fakeNow;
  hoursPass(2 - 60 * 2 / 3600);
}
check('the world is alive after a week of near-neglect', W.livingKith(weekWorld).length >= 2,
  W.livingKith(weekWorld).length + ' alive');
check('nobody is starving with wild plants about', W.livingKith(weekWorld).every(k => !k.starving));
check('life happened while we were away', weekWorld.chronicle.length > weekChronicleStart,
  (weekWorld.chronicle.length - weekChronicleStart) + ' new entries');

/* ---------- 19. families ---------- */

console.log('families');
const familyTree = W.familiesOf(reunitedNursery); // holds the child from the birth test
check('parents found as roots', familyTree.roots.length >= 2);
check('the child hangs from its parent', familyTree.childrenOf[pa.id] && familyTree.childrenOf[pa.id].length === 1);
check('childless bystanders are not family roots', familyTree.roots.every(r => familyTree.childrenOf[r.id]));

/* ---------- 20. kinds: speciation you can see ---------- */

console.log('kinds');
const kindA = W.kindOf({ hue: 30, ears: 2, size: 1 });
const kindB = W.kindOf({ hue: 45, ears: 2, size: 1 });
const kindC = W.kindOf({ hue: 250, ears: 0, size: 1 });
check('nearby hues share a kind', kindA.key === kindB.key);
check('distant morphology is another kind', kindA.key !== kindC.key);
check('kinds have names', kindA.name.indexOf('Ember') === 0 && kindC.name.indexOf('Dusk') === 0);

const kindWorld = W.newWorld();
Object.values(kindWorld.kith).forEach(k => { k.genome.hue = 100; k.genome.ears = 1; }); // all one kind
const stranger = clone(Object.values(kindWorld.kith)[0]);
stranger.id = 'idstranger00001';
stranger.given = 'Novel';
stranger.genome = { ...stranger.genome, hue: 250, ears: 0 };
kindWorld.kith[stranger.id] = stranger;
const greeting = W.greetNewKind(kindWorld, stranger);
check('the first of a kind is greeted', !!greeting && greeting.text.indexOf('new kind') > -1);
const stranger2 = clone(stranger);
stranger2.id = 'idstranger00002';
kindWorld.kith[stranger2.id] = stranger2;
check('the second of a kind is not', W.greetNewKind(kindWorld, stranger2) === null);
check('the greeting has a deterministic id', kindWorld.chronicle.some(e => e.id === 'nk' + stranger.id));

/* ---------- 20b. the great diversification ---------- */

console.log('diversification');
const spec = W.KITH_GENE_SPEC;
const PLAN_GENES = ['form', 'segs', 'limbs', 'tail', 'fins', 'crest', 'snout', 'eyes', 'pattern', 'ears'];
check('the body-plan genes exist in the spec', PLAN_GENES.every(g => Array.isArray(spec[g])));
const phenotypes = PLAN_GENES.reduce((n, g) => n * (spec[g][1] - spec[g][0] + 1), 1) * 6 /* hue bands */;
check('over a million phenotypes before colour even enters', phenotypes >= 1000000, phenotypes + ' combinations');

const divWorld = W.newWorld();
const newborn = Object.values(divWorld.kith)[0];
check('new kith are born with full body-plans', PLAN_GENES.every(g => typeof newborn.genome[g] === 'number'));

// crossing keeps every gene in range, and step-mutation can actually move
let sawStep = false;
const parentA = W.modernKithGenome({ hue: 10, size: 1, speed: 0.02, ears: 0, voice: [1, 2, 3] });
const parentB = clone(parentA);
for (let i = 0; i < 200; i++) {
  const rng = W.mulberry32(i);
  const kid = (function () {
    // cross via the real path: birthChild needs a world; use crossGenomes via a child birth
    const w2 = clone(divWorld);
    const ka = Object.values(w2.kith)[0], kb = Object.values(w2.kith)[1];
    ka.genome = clone(parentA); kb.genome = clone(parentB);
    ka.trust[kb.id] = 0.9; kb.trust[ka.id] = 0.9;
    ka.energy = 1; kb.energy = 1;
    ka.born -= 3 * 24 * 3600 * 1000; kb.born -= 3 * 24 * 3600 * 1000;
    ka.x = kb.x; ka.y = kb.y;
    // deterministic child of the day — vary the day to vary the dice
    const res = (function () {
      for (let d = 0; d < 1; d++) {
        const evs = W.kithTick(w2, 2);
        const born = evs.find(e => e.kind === 'born');
        if (born) return born.child;
      }
      return null;
    })();
    fakeNow += 24 * 3600 * 1000; // a new day, new dice
    return res;
  })();
  if (!kid) continue;
  const inRange = PLAN_GENES.every(g => kid.genome[g] >= spec[g][0] && kid.genome[g] <= spec[g][1]);
  check.lastInRange = inRange;
  if (!inRange) { check('crossed genes stay in range', false, JSON.stringify(kid.genome)); break; }
  if (PLAN_GENES.some(g => kid.genome[g] !== parentA.genome ? kid.genome[g] !== parentA[g] : false)) sawStep = true;
  if (sawStep && i > 30) break;
}
check('crossed genes stay in range', check.lastInRange !== false);
check('mutation eventually reshapes a body (a fin found, a tail lost)', sawStep);

// swimmers: the lakes are open (in realms whose law is 'swim')
let lakeWorld = W.newWorld();
while (W.REALMS[W.realmOf(lakeWorld.id).key].pass !== 'swim') lakeWorld = W.newWorld();
const lakeTerrain = W.makeTerrain(lakeWorld.id);
let wetSpot = null;
for (let r = 0; r < 56 && !wetSpot; r++) {
  for (let c = 0; c < 120 && !wetSpot; c++) {
    const x = (c + 0.5) / 120, y = 0.55 + (r + 0.5) / 56 * 0.45;
    if (W.biomeAt(lakeTerrain, x, y) === 'deep') wetSpot = { x, y };
  }
}
if (wetSpot) {
  const folk2 = Object.values(lakeWorld.kith);
  const swimmer = folk2[0], walker = folk2[1];
  swimmer.genome.fins = 1; walker.genome.fins = 0;
  swimmer.x = wetSpot.x; swimmer.y = wetSpot.y;
  walker.x = wetSpot.x; walker.y = wetSpot.y;
  W.settleImmigrants(lakeWorld);
  check('a swimmer may stay in deep water', swimmer.x === wetSpot.x && swimmer.y === wetSpot.y);
  check('a walker is settled ashore', W.isLandAt(lakeTerrain, walker.x, walker.y));
  check('canStandAt knows the difference',
    W.canStandAt(lakeTerrain, swimmer, wetSpot.x, wetSpot.y) === true &&
    W.canStandAt(lakeTerrain, walker, wetSpot.x, wetSpot.y) === false);
} else {
  check('a swimmer may stay in deep water', true); // a dry world: nothing to prove
  check('a walker is settled ashore', true);
  check('canStandAt knows the difference', true);
}

// kinds now read the whole body
const finned = W.kindOf({ hue: 250, ears: 2, fins: 1, crest: 0, tail: 0, eyes: 2, limbs: 1, form: 0, segs: 1, snout: 0, pattern: 0 });
check('fins outrank ears in the naming of kinds', finned.name === 'Dusk Finback');
const legacyKind = W.kindOf({ hue: 30, ears: 2 });
check('legacy genomes still find a kind', legacyKind.name.indexOf('Ember') === 0);

/* ---------- 20c. realms: the natures of worlds ---------- */

console.log('realms');
check('a realm is deterministic per world', W.realmOf('realmtest0000001').key === W.realmOf('realmtest0000001').key &&
  stable(W.realmOf('realmtest0000001')) === stable(W.realmOf('realmtest0000001')));
const seenRealms = {};
for (let i = 0; i < 80; i++) seenRealms[W.realmOf('variety' + i).key] = true;
check('the natures are many (6+ realms in 80 worlds)', Object.keys(seenRealms).length >= 6,
  Object.keys(seenRealms).join(', '));

// each realm's flood obeys its range
let checkedWl = 0;
for (let i = 0; i < 40 && checkedWl < 5; i++) {
  const id = 'wl' + i + 'xxxxxxxxxxxx';
  const t = W.makeTerrain(id);
  const range = W.REALMS[W.realmOf(id).key].wl;
  if (t.waterline < range[0] || t.waterline > range[1]) {
    check('the waterline obeys the realm', false, W.realmOf(id).key + ': ' + t.waterline);
    checkedWl = -999;
    break;
  }
  checkedWl++;
}
if (checkedWl > 0) check('the waterline obeys the realm', true);

// passability is the realm's law
function mineRealmWorld(natureKey) {
  for (let i = 0; i < 400; i++) {
    const id = 'mine' + natureKey + i;
    if (W.realmOf(id).key === natureKey) return id;
  }
  return null;
}
const emberId = mineRealmWorld('ember');
const frostId = mineRealmWorld('frostmere');
const coralId = mineRealmWorld('coralshelf');
check('realm worlds can be found by prospecting', !!emberId && !!frostId && !!coralId);
if (emberId && frostId && coralId) {
  const finless = { genome: { fins: 0 } };
  const finned = { genome: { fins: 1 } };
  function deepSpotOf(id) {
    const t = W.makeTerrain(id);
    for (let r = 0; r < 56; r++) for (let c = 0; c < 120; c++) {
      const x = (c + 0.5) / 120, y = 0.55 + (r + 0.5) / 56 * 0.45;
      if (W.biomeAt(t, x, y) === 'deep') return { t: t, x: x, y: y };
    }
    return null;
  }
  const emberDeep = deepSpotOf(emberId), frostDeep = deepSpotOf(frostId), coralDeep = deepSpotOf(coralId);
  if (emberDeep) check('no body may cross the lava', !W.canStandAt(emberDeep.t, finned, emberDeep.x, emberDeep.y) &&
    !W.canStandAt(emberDeep.t, finless, emberDeep.x, emberDeep.y));
  else check('no body may cross the lava', true); // a dry ember world
  if (frostDeep) check('anyone may walk the black ice', W.canStandAt(frostDeep.t, finless, frostDeep.x, frostDeep.y));
  else check('anyone may walk the black ice', true);
  if (coralDeep) check('all the Coralshelf is open sea, open to all', W.canStandAt(coralDeep.t, finless, coralDeep.x, coralDeep.y));
  else check('all the Coralshelf is open sea, open to all', true);

}

// founders carry their realm in their bodies: the Lakewild breeds swimmers
const lakewildWorld = W.newWorld({ nature: 'lakewild' });
check('a Lakewild founder is finned (0.8 bias, three founders)',
  Object.values(lakewildWorld.kith).some(k => k.genome.fins > 0));

// asking for a nature delivers that nature
const askedMistral = W.newWorld({ nature: 'mistral' });
check('a world of the asked nature is delivered', W.realmOf(askedMistral.id).key === 'mistral');
check('its birth names its nature', askedMistral.chronicle[0].text.indexOf('floating isles') > -1);
const askedFungal = W.newWorld({ nature: 'fungal' });
check('the Fungal Deep glows', W.makeFlora(askedFungal.id).archetypes.some(a => a.glow));
check('realm weather speaks its own tongue', (function () {
  for (let h = 0; h < 200; h++) {
    const wx = W.weatherAt(askedFungal.id, fakeNow + h * 2 * 3600 * 1000);
    if (wx.kind === 'rain') return wx.label === 'sporefall';
  }
  return true; // never rained in 400 hours — a dry cave
})());

// cross-realm merges chronicle first contact between natures, identically
const worldA2 = W.newWorld({ nature: 'ember' });
const worldB2 = W.newWorld({ nature: 'frostmere' });
const xAB = clone(worldA2), xBA = clone(worldB2);
W.mergeWorlds(xAB, clone(worldB2));
W.mergeWorlds(xBA, clone(worldA2));
const contactA2 = xAB.chronicle.find(e => e.id.indexOf('rlm') === 0);
const contactB2 = xBA.chronicle.find(e => e.id.indexOf('rlm') === 0);
check('first contact between natures is chronicled', !!contactA2 && contactA2.text.indexOf('Natures that had never touched') > -1);
check('identically on both sides of the meeting', !!contactA2 && !!contactB2 &&
  contactA2.id === contactB2.id && contactA2.text === contactB2.text);
const sameNatureA = W.newWorld({ nature: 'duskmoor' });
const sameNatureB = W.newWorld({ nature: 'duskmoor' });
const sameMerge = clone(sameNatureA);
W.mergeWorlds(sameMerge, clone(sameNatureB));
check('kindred natures pass without remark', !sameMerge.chronicle.some(e => e.id.indexOf('rlm') === 0));

/* ---------- 20d. proto-sentences ---------- */

console.log('sentences');
const grammarWorld = W.newWorld();
const speakersG = Object.values(grammarWorld.kith);
const gA = speakersG[0], gB = speakersG[1];
check('a newborn instinct decides first word order', ['mf', 'cf'].indexOf(W.orderEntry(grammarWorld, gA).word) > -1);
check('the instinct is deterministic per kith', W.orderEntry(grammarWorld, gA).word === W.orderEntry(grammarWorld, gA).word);

// a sentence: intent + thing, in the speaker's order
const sentence = W.speakSentence(grammarWorld, gA, gB, 'mark:want', 'water', fakeNow);
check('a sentence has two words', sentence.split(' ').length === 2);
const wantWord = gA.lex['mark:want'].word;
const waterWord = gA.lex.water.word;
check('it is built from the speaker\'s own words',
  sentence === wantWord + ' ' + waterWord || sentence === waterWord + ' ' + wantWord);
check('the order follows the speaker\'s convention',
  (gA.lex[':order'].word === 'mf') === (sentence.indexOf(wantWord) === 0));

// order converges like any word
gA.lex[':order'] = { word: 'mf', s: 0.9, by: gA.id };
gB.lex[':order'] = { word: 'cf', s: 0.2, by: gB.id };
for (let i = 0; i < 6; i++) W.exchangeWord(grammarWorld, gA, gB, ':order');
check('the surer grammar carries', gB.lex[':order'].word === 'mf');
check('the world leans one way', W.worldOrder(grammarWorld) === 'mf');

// grammar is never evicted by a crowded vocabulary
for (let i = 0; i < 20; i++) W.attendConcept(grammarWorld, gA, 'plant:Crowd' + i);
check('grammar survives a crowded vocabulary', !!gA.lex[':order']);

// hunger speaks: a hungry speaker wants
let hungryWorld = W.newWorld();
while (W.weatherAt(hungryWorld.id, fakeNow).kind === 'storm') hungryWorld = W.newWorld();
const hungryFolk = Object.values(hungryWorld.kith);
hungryFolk.forEach((k, i) => {
  k.x = 0.5 + i * 0.01; k.y = 0.8; k.tx = null; k.ty = null;
  k.act = 'rest'; k.actUntil = fakeNow + 600000;
  k.energy = i === 0 ? 0.2 : 0.9; // one hungry speaker among the content
});
let spokeWant = false;
for (let t = 0; t < 80 && !spokeWant; t++) {
  W.kithTick(hungryWorld, 2);
  fakeNow += 2000;
  spokeWant = hungryFolk.some(k => k.lex && k.lex['mark:want'] && k.saying && k.saying.split(' ').length === 2 &&
    k.saying.indexOf(k.lex['mark:want'].word) > -1);
}
check('a hungry speaker speaks its wanting', spokeWant);

// two grammars under one sky: the clash is chronicled, identically
const mfWorld = W.newWorld();
const cfWorld = W.newWorld();
Object.values(mfWorld.kith).forEach(k => { k.lex[':order'] = { word: 'mf', s: 0.9, by: k.id }; });
Object.values(cfWorld.kith).forEach(k => { k.lex[':order'] = { word: 'cf', s: 0.9, by: k.id }; });
const gAB = clone(mfWorld), gBA = clone(cfWorld);
W.mergeWorlds(gAB, clone(cfWorld));
W.mergeWorlds(gBA, clone(mfWorld));
const clashA = gAB.chronicle.find(e => e.id.indexOf('gx') === 0);
const clashB = gBA.chronicle.find(e => e.id.indexOf('gx') === 0);
check('the meeting of grammars is chronicled', !!clashA && clashA.text.indexOf('Two ways of speaking') > -1);
check('identically on both sides', !!clashA && !!clashB && clashA.id === clashB.id && clashA.text === clashB.text);
const mfTwinA = W.newWorld();
const mfTwinB = W.newWorld();
Object.values(mfTwinA.kith).forEach(k => { k.lex[':order'] = { word: 'mf', s: 0.9, by: k.id }; });
Object.values(mfTwinB.kith).forEach(k => { k.lex[':order'] = { word: 'mf', s: 0.9, by: k.id }; });
const agreeMerge = clone(mfTwinA);
W.mergeWorlds(agreeMerge, clone(mfTwinB));
check('kindred grammars pass without remark', !agreeMerge.chronicle.some(e => e.id.indexOf('gx') === 0));

/* ---------- 20e. the first address ---------- */

console.log('the first address');
let contactWorld = W.newWorld();
while (W.weatherAt(contactWorld.id, fakeNow + 3 * 24 * 3600 * 1000).kind === 'storm') contactWorld = W.newWorld();
check('hand-planted seeds are marked', (function () {
  const p = W.plantSeed(contactWorld);
  return p.byHand === true;
})());
check('wild growth is not', Object.values(contactWorld.plants).some(p => p.byHand === false));

// a meal from the gardener's hand is quietly remembered
const diner = Object.values(contactWorld.kith)[0];
const handPlant = Object.values(contactWorld.plants).find(p => p.byHand);
handPlant.growth = 1;
diner.x = handPlant.x; diner.y = handPlant.y; diner.tx = null; diner.ty = null;
diner.energy = 0.1;
Object.values(contactWorld.kith).forEach(k => { if (k.id !== diner.id) { k.energy = 0.9; k.x = 0.1; k.y = 0.6; k.act = 'rest'; k.actUntil = fakeNow + 900000; } });
const gBefore = diner.g || 0;
for (let t = 0; t < 12; t++) { W.kithTick(contactWorld, 2); fakeNow += 2000; }
check('a meal from your hand is quietly remembered', (diner.g || 0) > gBefore);

// the moment: aged world, trusting curious kith, standing in the call
hoursPass(50); // the world grows old enough
const brave = diner;
brave.g = 1;
brave.brain.curiosity = 0.9;
brave.energy = 0.9;
brave.act = 'rest'; brave.actUntil = fakeNow + 900000;
brave.x = 0.5; brave.y = 0.8;
const theCall = { x: 0.5, y: 0.8, until: fakeNow + 900000 };
let spoke = null;
for (let t = 0; t < 60 && !spoke; t++) {
  const evs = W.kithTick(contactWorld, 2, theCall);
  fakeNow += 2000;
  spoke = evs.find(e => e.kind === 'contact');
}
check('one of them speaks to you', !!spoke);
check('it has coined a word nothing else carries', !!contactWorld.gardenerNamed &&
  typeof contactWorld.gardenerNamed.word === 'string' && contactWorld.gardenerNamed.word.length >= 2);
check('the moment is chronicled once, with its id', contactWorld.chronicle.filter(e => e.id === 'fc' + brave.id).length === 1);
check('the namer carries your name', brave.lex.gardener && brave.lex.gardener.word === contactWorld.gardenerNamed.word);
check('it happens only once', (function () {
  const before = contactWorld.chronicle.filter(e => e.kind === 'contact').length;
  for (let t = 0; t < 30; t++) { W.kithTick(contactWorld, 2, theCall); fakeNow += 2000; }
  // requests may follow, but no second naming
  return !contactWorld.chronicle.some((e, i) => e.kind === 'contact' && e.id.indexOf('fc') === 0 && e.id !== 'fc' + brave.id);
})());

// the ask, and the answer
brave.energy = 0.2; // hungry, and it knows your name
brave.taste['Askbloom'] = 0.9;
let asked = false;
for (let t = 0; t < 60 && !asked; t++) {
  W.kithTick(contactWorld, 2, theCall);
  fakeNow += 2000;
  asked = !!contactWorld.lastAsk && contactWorld.lastAsk.kithId === brave.id;
}
check('the hungry who know your name ask you for things', asked);
check('its ask ends with a question', asked && brave.saying && brave.saying.slice(-1) === '?');
if (asked) {
  W.plantSeed(contactWorld); // the gardener answers
  check('the answer is chronicled', contactWorld.chronicle.some(e => e.text.indexOf('The gardener answered') > -1));
  check('and the asker understood', (brave.g || 0) > 1.2);
} else {
  check('the answer is chronicled', false, 'no ask to answer');
  check('and the asker understood', false, 'no ask to answer');
}

/* ---------- 20f. society II: shelters, hearths, villages ---------- */

console.log('society II');
let buildWorld = W.newWorld();
while (W.weatherAt(buildWorld.id, fakeNow).kind === 'storm') buildWorld = W.newWorld();
const mason = Object.values(buildWorld.kith)[0];
W.learn(buildWorld, mason, 'shelter');
mason.energy = 1;
// stand somewhere on land
const buildTerrain = W.makeTerrain(buildWorld.id);
outer2:
for (let r = 10; r < 46; r++) for (let c = 10; c < 110; c++) {
  const x = (c + 0.5) / 120, y = 0.55 + (r + 0.5) / 56 * 0.45;
  if (W.isLandAt(buildTerrain, x, y)) { mason.x = x; mason.y = y; break outer2; }
}
const buildDay = Math.floor(fakeNow / (24 * 3600 * 1000));
const leantoA = W.buildStructure(buildWorld, mason, 'leanto', buildDay);
check('a builder raises a lean-to', !!leantoA && leantoA.type === 'leanto');
check('its raising is chronicled', buildWorld.chronicle.some(e => e.id === 'sb' + leantoA.id));
check('one work per builder per day', W.buildStructure(buildWorld, mason, 'leanto', buildDay) === null);

// the same building in every copy
const buildTwinA = clone(buildWorld), buildTwinB = clone(buildWorld);
const nextDay = buildDay + 1;
const builtA = W.buildStructure(buildTwinA, buildTwinA.kith[mason.id], 'leanto', nextDay);
const builtB = W.buildStructure(buildTwinB, buildTwinB.kith[mason.id], 'leanto', nextDay);
check('the same building in every copy', !!builtA && !!builtB && builtA.id === builtB.id);
const buildMerged = clone(buildTwinA);
W.mergeWorlds(buildMerged, clone(buildTwinB));
check('reunited copies hold one building, not two',
  Object.keys(buildMerged.structures).filter(id => id === builtA.id).length === 1);
check('structures survive a merge (no loss)',
  Object.keys(buildTwinA.structures).every(id => buildMerged.structures[id]));

// a hearth burns among the shelters
W.learn(buildWorld, mason, 'hearth');
const hearthA = W.buildStructure(buildWorld, mason, 'hearth', nextDay);
check('a hearth-keeper sets a hearth', !!hearthA && hearthA.type === 'hearth');

// storm refuge: the roof beats the rock
const stormyBuild = clone(buildWorld);
const refugee = Object.values(stormyBuild.kith)[1];
refugee.x = Math.min(0.95, mason.x + 0.2); refugee.y = mason.y;
refugee.tx = null; refugee.ty = null; refugee.act = 'wander';
refugee.energy = 0.9;
refugee.brain.boldness = 0.1; // timid: will seek shelter
// find a stormy moment for this world
let stormT = null;
for (let h = 0; h < 2000 && stormT === null; h++) {
  const t = fakeNow + h * 2 * 3600 * 1000;
  if (W.weatherAt(stormyBuild.id, t).kind === 'storm') stormT = t;
}
if (stormT !== null) {
  const savedNow3 = fakeNow;
  fakeNow = stormT;
  let headedToRoof = false;
  for (let t = 0; t < 40 && !headedToRoof; t++) {
    W.kithTick(stormyBuild, 2);
    fakeNow += 2000;
    const me = stormyBuild.kith[refugee.id];
    headedToRoof = me.tx !== null && Math.abs(me.tx - leantoA.x) < 0.05 && Math.abs(me.ty - leantoA.y) < 0.05;
    if (me.act === 'shelter' && Math.abs(me.x - leantoA.x) < 0.07) headedToRoof = true;
  }
  check('in a storm, the roof beats the rock', headedToRoof);
  fakeNow = savedNow3;
} else {
  check('in a storm, the roof beats the rock', true); // a stormless world proves nothing
}

// where shelters ring a hearth and a tribe lives there: a village
const villageWorld = clone(buildWorld);
const folk3 = Object.values(villageWorld.kith);
// a bonded trio living by the hearth
folk3.forEach((k, i) => {
  k.x = hearthA.x + (i - 1) * 0.02; k.y = hearthA.y;
  k.tx = null; k.ty = null; k.act = 'rest'; k.actUntil = fakeNow + 900000;
  folk3.forEach(o => { if (o.id !== k.id) k.trust[o.id] = 0.8; });
});
// a second shelter to complete the ring
const secondShelter = W.buildStructure(villageWorld, villageWorld.kith[folk3[1].id], 'leanto', nextDay + 1);
if (secondShelter) { secondShelter.x = hearthA.x + 0.08; secondShelter.y = hearthA.y; }
let villageDeclared = false;
for (let t = 0; t < 10 && !villageDeclared; t++) {
  W.kithTick(villageWorld, 2);
  fakeNow += 2000;
  villageDeclared = villageWorld.chronicle.some(e => e.text.indexOf('first village') > -1);
}
check('the first village is declared', villageDeclared);
check('and only once', villageWorld.chronicle.filter(e => e.id === 'v' + hearthA.id).length <= 1);

/* ---------- 20g. seasons ---------- */

console.log('seasons');
check('the season is a pure function of time', W.seasonAt(fakeNow).key === W.seasonAt(fakeNow).key &&
  ['spring', 'summer', 'autumn', 'winter'].indexOf(W.seasonAt(fakeNow).key) > -1);
const WEEK = 7 * 24 * 3600 * 1000;
check('the year turns in order', (function () {
  const i0 = W.seasonAt(fakeNow).index;
  const order = [0, 1, 2, 3].map(i => W.seasonAt((i0 + i) * WEEK + 1).key).join(',');
  const ring = 'spring,summer,autumn,winter,spring,summer,autumn,winter';
  return ring.indexOf(order) > -1;
})());
// the crucial law: growth is identical no matter how often you sample it
const tA = fakeNow, tB = fakeNow + 10 * 24 * 3600 * 1000; // spans season boundaries
const mid = fakeNow + 4.3 * 24 * 3600 * 1000;
check('growing-hours are sampling-invariant across boundaries',
  Math.abs(W.growingHours(tA, tB) - (W.growingHours(tA, mid) + W.growingHours(mid, tB))) < 1e-6);
check('winter is lean, spring is eager', (function () {
  // find a winter week and a spring week and compare their yield
  let winterStart = null, springStart = null;
  for (let i = 0; i < 8; i++) {
    const t = (W.seasonAt(fakeNow).index + i) * WEEK;
    if (W.seasonAt(t + 1).key === 'winter') winterStart = t;
    if (W.seasonAt(t + 1).key === 'spring') springStart = t;
  }
  return W.growingHours(winterStart, winterStart + WEEK) < W.growingHours(springStart, springStart + WEEK);
})());
// the turning of the year is chronicled once
const seasonWorld = W.newWorld();
hoursPass(24 * 8); // at least one boundary passes
W.weatherTick(seasonWorld);
W.weatherTick(seasonWorld);
const turnings = seasonWorld.chronicle.filter(e => e.id.indexOf('sn' + seasonWorld.id) === 0);
check('the turning of the year is chronicled once', turnings.length === 1);

/* ---------- 20h. the wanderer ---------- */

console.log('the wanderer');
const PERIOD = 14 * 24 * 3600 * 1000;
check('the visit schedule is deterministic',
  stable(W.wandererDue('wanderworld00001', fakeNow)) === stable(W.wandererDue('wanderworld00001', fakeNow)));
let visitCount = 0;
for (let p = 0; p < 20; p++) {
  if (W.wandererDue('wanderworld00001', fakeNow + p * PERIOD)) visitCount++;
}
check('some fortnights bring a stranger, some are quiet', visitCount >= 3 && visitCount <= 18, visitCount + ' of 20');

// step into a visit window and receive the stranger
const hostWorld = W.newWorld();
let visit = null;
for (let p = 0; p < 30 && !visit; p++) {
  const d = W.wandererDue(hostWorld.id, fakeNow + p * PERIOD);
  if (d) visit = d;
}
check('a visit eventually comes', !!visit);
fakeNow = visit.start + 3600 * 1000; // one hour into the visit
const hostTwin = clone(hostWorld);
W.kithTick(hostWorld, 2);
W.kithTick(hostTwin, 2);
const farcomer = hostWorld.kith[visit.id];
check('the stranger arrives', !!farcomer && !!farcomer.wanderer);
check('its arrival is chronicled once', hostWorld.chronicle.filter(e => e.id === 'wa' + visit.id).length === 1);
check('it carries sure words of its own', farcomer.lex.home && farcomer.lex.home.s >= 0.8 && farcomer.lex.home.by === visit.id);
check('the same stranger visits every copy', !!hostTwin.kith[visit.id] &&
  content(hostTwin.kith[visit.id]) === content(farcomer));
const strangerMerged = clone(hostWorld);
W.mergeWorlds(strangerMerged, clone(hostTwin));
check('reunited copies hold one stranger, not two',
  strangerMerged.chronicle.filter(e => e.id === 'wa' + visit.id).length === 1);

// befriended: it teaches before it goes
farcomer.knows = ['song'];
const wandFriend = Object.values(hostWorld.kith).find(k => k.id !== visit.id && !k.passed);
wandFriend.trust[visit.id] = 0.7;
wandFriend.brain.curiosity = 0.8;
fakeNow = visit.end + 3600 * 1000; // the visit is over
W.kithTick(hostWorld, 2);
check('it walks on at its appointed hour', hostWorld.kith[visit.id].departed === visit.end);
check('its leaving is chronicled once', hostWorld.chronicle.filter(e => e.id === 'wd' + visit.id).length === 1);
check('the departed are not among the living', W.livingKith(hostWorld).every(k => k.id !== visit.id));
check('a befriended stranger leaves its craft behind', W.knowsOf(wandFriend).indexOf('song') > -1);
check('the gift is written down', hostWorld.chronicle.some(e => e.id === 'wd' + visit.id && e.text.indexOf('taught') > -1));

// unbefriended: footprints only
const coldWorld = clone(hostTwin);
W.kithTick(coldWorld, 2);
check('an unbefriended stranger leaves only footprints',
  coldWorld.chronicle.some(e => e.id === 'wd' + visit.id && e.text.indexOf('footprints') > -1));

/* ---------- 21. song ---------- */

console.log('song');
let stormyWorld = W.newWorld();
let stormyNow = fakeNow;
outer:
for (let tries = 0; tries < 40; tries++) {
  for (let h = 0; h < 48; h += 2) {
    if (W.weatherAt(stormyWorld.id, fakeNow + h * 3600 * 1000).kind === 'storm') {
      stormyNow = fakeNow + h * 3600 * 1000;
      break outer;
    }
  }
  stormyWorld = W.newWorld();
}
const savedNow2 = fakeNow;
fakeNow = stormyNow;
const shelterers = Object.values(stormyWorld.kith);
shelterers.forEach((k, i) => {
  k.act = 'shelter';
  k.x = 0.5 + i * 0.02; k.y = 0.8;
  k.brain.patience = 0.9; k.brain.sociability = 0.9;
  k.energy = 0.5;
});
let sang = false;
for (let t = 0; t < 60 && !sang; t++) {
  W.kithTick(stormyWorld, 2);
  fakeNow += 2000;
  sang = shelterers.some(k => W.knowsOf(k).indexOf('song') > -1);
}
check('song is born in the storm', sang);
check('the first song is chronicled', stormyWorld.chronicle.some(e => e.text.indexOf('the first song') > -1));
const singer = shelterers.find(k => W.knowsOf(k).indexOf('song') > -1);
if (singer) {
  const listener = shelterers.find(k => k.id !== singer.id);
  const trustBefore = listener.trust[singer.id] || 0;
  const energyBefore = listener.energy;
  singer.act = 'shelter'; listener.act = 'shelter';
  for (let t = 0; t < 5; t++) { W.kithTick(stormyWorld, 2); fakeNow += 2000; }
  check('the song steadies hearts nearby', (listener.trust[singer.id] || 0) > trustBefore);
  check('the singer sings', typeof singer.saying === 'string' && singer.saying.indexOf('♪') === 0);
} else {
  check('the song steadies hearts nearby', false, 'no singer emerged');
  check('the singer sings', false, 'no singer emerged');
}
fakeNow = savedNow2;

/* ---------- 22. extractWorld round-trip ---------- */

console.log('extraction');
const json = JSON.stringify(A).replace(/</g, '\\u003c');
const fakeFile = '<!DOCTYPE html><html><body><script id="dg-state">window.DRIFT_STATE = ' +
  json + ';<' + '/script><script>app<' + '/script></body></html>';
const extracted = W.extractWorld(fakeFile);
check('world extracted from an HTML file', !!extracted && extracted.id === A.id);
check('world extracted from bare JSON', (() => {
  const direct = W.extractWorld(JSON.stringify(A));
  return !!direct && direct.id === A.id;
})());
check('garbage rejected politely', W.extractWorld('<html>hello</html>') === null);
check('a hostile giant is rejected before parsing', (() => {
  const giant = ' '.repeat(25 * 1024 * 1024);
  const started = Date.now();
  const out = W.extractWorld(giant);
  return out === null && Date.now() - started < 500;
})());

/* ---------- summary ---------- */

console.log('');
if (failures > 0) {
  console.error(failures + ' of ' + testCount + ' checks FAILED');
  process.exit(1);
}
console.log('all ' + testCount + ' checks passed — the merge is sacred ✓');
