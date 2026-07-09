/* Driftgarden — the mind.
 * A kith's inner life: the pressures that push on it, the trait-weighted way
 * it feels them, the one that presses hardest right now, and the plain words
 * for what it means to do about it.
 *
 * This is "grown" intelligence, not borrowed: no network, no model, no chat.
 * A kith decides from NEEDS + TRAITS + WORLD — nothing else — which is why two
 * copies of a world, given the same clock, always reach the same conclusion,
 * and why the merge stays sacred. Every function here is a pure function of a
 * kith and its moment: no clock, no randomness, no DOM. It runs identically in
 * the browser and in `node test.js`, and it never writes anything that has to
 * be merged — a mind is felt, not stored.
 *
 * See ROADMAP.md — this is the spine of "Inner Lives" (v2): give the kith
 * pressure, purpose, and a legible intention, so watching becomes reading.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DriftMind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  // The six pressures every kith lives under. Their order is their priority
  // when two press equally hard — safety before hunger before the rest — but
  // in practice the weights decide. Kept as a list so callers can iterate.
  var NEEDS = ['safety', 'hunger', 'rest', 'belonging', 'curiosity', 'purpose'];

  /* ---------- behaviour: the pressures that actually move a kith ----------
   * These are the exact urges the tick has always used, gathered into one
   * place and given names. Nothing random lives here, so the tick's own
   * randomness — and therefore the determinism of the whole world — is
   * untouched by asking the mind what it wants. */
  function pressures(k, env) {
    var b = k.brain;
    return {
      hunger: (1 - k.energy) * (0.6 + b.appetite * 0.8),
      safety: env && env.storm ? (1.2 - b.boldness) : 0,
      belonging: b.sociability * 0.55,
      curiosity: 0.15 + b.curiosity * 0.35
    };
  }

  /* ---------- feeling: the six needs, for the player to read ----------
   * A fuller, gentler picture than the raw behavioural urges — normalised to
   * 0..1 so it can be drawn as bars, and weighted by the kith's TRAITS so the
   * same situation feels different to different minds. A glutton feels hunger
   * sooner; a timid one feels the dark; a restless one is never quite at ease
   * when everything is fine. This is the kith's personality, made visible. */
  function needs(k, env) {
    var b = k.brain;
    var night = !!(env && env.night);
    var storm = !!(env && env.storm);
    var lack = 1 - k.energy;

    var hunger = clamp01(lack * (0.55 + b.appetite * 0.6));
    // sleepiness: low energy tires, the dark invites rest, the patient settle
    // more readily — but the bold shrug off the night
    var rest = clamp01(lack * 0.35 + (night ? 0.45 - b.boldness * 0.25 : 0.03) + b.patience * 0.12);
    // unease: sharp in a storm for the timid, a low hum in the open dark
    var safety = clamp01(storm ? (1.05 - b.boldness) : (night ? 0.22 - b.boldness * 0.18 : 0.04));
    // the wish for company, cooled a little by a full belly's contentment
    var belonging = clamp01(b.sociability * 0.6 - hunger * 0.15);
    var curiosity = clamp01(0.12 + b.curiosity * 0.5 - hunger * 0.2);
    // restlessness for something to make of oneself — only once the body is
    // answered; a hungry, frightened kith has no room for ambition yet
    var ease = 1 - Math.max(hunger, safety, rest * 0.6);
    var purpose = clamp01((b.wanderlust * 0.45 + b.curiosity * 0.3) * ease);

    return {
      safety: safety, hunger: hunger, rest: rest,
      belonging: belonging, curiosity: curiosity, purpose: purpose
    };
  }

  // Which need presses hardest — the kith's state of mind in one word. Ties
  // break by the fixed NEEDS priority (deterministic, no coin to flip).
  function dominant(feel) {
    var best = NEEDS[0], bestVal = -1;
    for (var i = 0; i < NEEDS.length; i++) {
      var n = NEEDS[i];
      if (feel[n] > bestVal + 1e-9) { bestVal = feel[n]; best = n; }
    }
    return best;
  }

  // A plain-language reading of a drive, for when the kith is between actions
  // and hasn't a more specific errand. The tick overrides this with something
  // concrete ("heading for the sunmoss") whenever it can.
  var DRIVE_WORDS = {
    safety: 'ill at ease',
    hunger: 'looking for something to eat',
    rest: 'ready to rest',
    belonging: 'wanting company',
    curiosity: 'curious about the world',
    purpose: 'restless for something to do'
  };
  function driveLabel(drive) { return DRIVE_WORDS[drive] || 'lost in thought'; }

  // Short, poetic gloss of a drive — for a compact need-bar caption.
  var DRIVE_GLOSS = {
    safety: 'safe', hunger: 'fed', rest: 'rested',
    belonging: 'together', curiosity: 'seeing', purpose: 'making'
  };

  return {
    NEEDS: NEEDS,
    pressures: pressures,
    needs: needs,
    dominant: dominant,
    driveLabel: driveLabel,
    DRIVE_WORDS: DRIVE_WORDS,
    DRIVE_GLOSS: DRIVE_GLOSS
  };
});
