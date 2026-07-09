# Day 22 — 9 July 2026

## The Mind I — needs, personality, and a visible intention

The first day of *Inner Lives* (v2). Until now a kith wandered, ate, and chatted by a tangle of one-off "urges" buried in the tick — real behaviour, but illegible: you watched motion, not mind. Today the kith get an inner life you can **read**, and it lives in a module of its own.

## What got built (v0.21.0 — 223 KB, 233/233 checks green)

**A brain file: `engine/mind.js`.** A new sibling to `world.js` — bundled just before it in the single file, `require`d directly under Node, so the tick and the test suite see exactly the same mind. It is pure: a function of a kith and its moment, with no clock, no randomness, and no DOM. That matters more than it sounds — it means two copies of a world still reach the same conclusions, so **the sacred merge is untouched**. This is grown intelligence, not a borrowed one: no network, no model, no chat, ever.

**Six needs, felt through personality.** Every kith now lives under six competing pressures — **hunger, rest, safety, belonging, curiosity, purpose** — and its **traits colour how it feels each one**. The same empty belly gnaws harder at a glutton; the same dark night unsettles a timid kith and barely touches a bold one; the sociable ache for company the solitary never miss. The pressure that presses hardest *is the kith's state of mind in that moment* — its personality, made visible. And **purpose** is a luxury of the answered body: a starving, frightened kith has no room for ambition, but a content one grows restless "for something to do" — the seed of tomorrow's projects.

**A visible current intention on every kith.** The headline change. Each kith now carries a plain-language reading of what it's about — *heading for the sunmoss*, *sitting with Ambassador Root*, *making for shelter*, *settling down to sleep*, *off exploring, seeking something to do*. It floats faintly beneath the kith on the canvas (yielding to a speech bubble, hushed in sleep), headlines the kith's panel, and appears beside every name in **The Folk**. A crowd of kith now reads as a village of purposes, not random drift.

**The panel shows the pressures.** Click a kith and you see its intention and six little bars — the needs weighing on it, with the loudest highlighted. You can watch a belly fill, a night's unease rise, a restlessness grow.

**Behaviour is unchanged — on purpose.** The tick now *asks the mind* for its pressures instead of computing them inline, but the numbers and the order are identical, and the one random whim (a momentary wish to pause) keeps its own coin-flip. So every one of the previous 219 checks still passes untouched: this is a refactor that adds a soul, not a rewrite that risks the merge. Day 23 is when goals begin to genuinely *reorder* behaviour and the first multi-day project rises.

**A quiet but important fix:** the self-writing **Preserve** file now carries `mind.js` too. Without it, a preserved world would have opened to a missing brain and crashed — caught and fixed before it could ship.

## Verified three ways
1. **Node suite — 233 checks** incl. 14 new: the six needs read as pressures in 0..1; a glutton feels hunger sooner than an ascetic; the timid feel the night and the bold don't; purpose stirs only once the body is answered; the behavioural pressures match the ancient formulas exactly; and every kith wears a legible mind after a tick.
2. **In-browser engine** — drove a live world 300 ticks: **all six drives emerged** (rest, belonging, hunger, curiosity, purpose) and intentions varied richly — foraging, sipping nectar, seeking and sitting with friends, wandering, and purpose-driven exploring.
3. **Live DOM** — 20 kith each wearing an intention caption (correctly yielding to speech and sleep); the panel's intention line and six need-bars render, with the loudest need highlighted coherently against the tallest bar. No console errors.

## Next session (Day 23, from ROADMAP.md)

**Goals & Projects** — a goal library + light planner where the pressing need genuinely selects and sustains a goal across ticks; the first multi-day construction you watch rise; and **water becomes a real barrier** (plus the warp water-leap bug fix). Purpose, shipped today as a felt pressure, becomes something a kith can *act on*.

## Time & credit note

All green, all pushed. Open a world and click any kith — its mind is on its sleeve now. Watch one grow restless when it's fed and safe: that's purpose, looking for a shape.
