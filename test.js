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
const POSITION_KEYS = { x: 1, y: 1, tx: 1, ty: 1, facing: 1, saying: 1, sayingUntil: 1 };
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
check('no kith is left underwater after a merge', Object.keys(host.kith)
  .every(id => W.isLandAt(hostTerrain, host.kith[id].x, host.kith[id].y)));

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

/* ---------- 20. extractWorld round-trip ---------- */

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

/* ---------- summary ---------- */

console.log('');
if (failures > 0) {
  console.error(failures + ' of ' + testCount + ' checks FAILED');
  process.exit(1);
}
console.log('all ' + testCount + ' checks passed — the merge is sacred ✓');
