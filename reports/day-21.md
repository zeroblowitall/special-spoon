# Day 21 — 9 July 2026

## Night & dreams

Two different games per day: the busy daylight world, and the quiet dark.

## What got built (v0.20.0 — 213 KB, 219/219 checks green)

**Night falls, and the kith sleep.** When the local clock crosses into night (the same hours the sky already uses — so it works under `?warp` too), most kith seek a bed: a lean-to if one stands near, then a hearth, else a safe patch of ground underfoot. They settle, close their eyes, and a soft **"z"** drifts up. **The boldest few (boldness ≥ 0.8) roam the dark instead** — every world keeps a handful of night-owls. Hungry kith (energy below the threshold) still forage; a storm still calls everyone to shelter first.

**Sleep mends.** The sleeping do not tire — and near a roof or a hearth they recover energy nearly three times faster than in the open. A world whose kith sleep safe wakes rested, which quietly ties night back into the whole shelter/hearth/village economy: a village isn't just warmth against storms, it's a good night's sleep.

**Dreams.** A sleeping kith occasionally murmurs a **remembered word** into the dark (*"omu…"*) — drawn from its own lexicon, spreading nothing, meaning nothing, just the sound of a mind at rest. At first light there's the beginning of a **dawn chorus**: waking kith greet the day with their word for gladness.

**Determinism note:** night behaviour is pure ephemeral flavour — act, energy, murmurs — never clocked, never merged, so it needs no cross-copy agreement and touches none of the merge algebra. Each player simply experiences their own world's night, roughly when they do.

**A warp fix found along the way.** Verifying under `?warp=2000`, I caught that the sky only repainted on the ~30-second full-render cadence, so at high warp it lagged far behind the racing day/night clock. Now **the scene repaints the instant the light turns** (dawn, day, dusk, nightfall) — vital under warp, and free at normal speed (four phase-changes a day). The sky now cycles visibly: night `#0b1026` → dawn → day, confirmed live.

## Verified three ways
1. Node suite — 219 checks incl. six new: day/night pure-of-clock, the calm bed down, the sleeping mend not tire, the bold roam, waking by day.
2. In-browser engine — drove the built file's engine at a fixed night: 3/3 kith slept, a sleeper mended 0.500 → 0.503. Exact parity with Node.
3. Live sky — confirmed the day/night colours cycling under warp with the new phase-render.

## Next session (Day 22)

From the roadmap: **elders retelling the chronicle at hearths** (unheard tales die with their tellers), or **auto-biographies on panels**. Simon's playtest findings outrank both.

## Time & credit note

All green, all pushed. Open your world after dark tonight — or `?warp=1000` and watch night fall and lift in under a minute.
