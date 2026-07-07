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
const POSITION_KEYS = { x: 1, y: 1, tx: 1, ty: 1, facing: 1 };
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

/* ---------- 15. extractWorld round-trip ---------- */

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
