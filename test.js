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

/* ---------- 8. extractWorld round-trip ---------- */

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
