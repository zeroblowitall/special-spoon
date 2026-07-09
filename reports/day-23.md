# Day 23 — 9 July 2026

## Goals & Projects — purpose you can act on, and the water made real

Day 22 gave the kith needs and a visible intention. Day 23 gives those intentions **somewhere to go** (a goal that holds across ticks and a project you watch rise) and gives the world a **real edge** (water that cannot be crossed or leapt).

## What got built (v0.22.0 — 228 KB, 251/251 checks green)

**The pressing need names a goal.** The mind (`engine/mind.js`) now maps the loudest need onto a pursuit: safety → *shelter*, hunger → *forage*, rest → *rest*, belonging → *kinship*, curiosity → *wander*, **purpose → *make***. Every kith carries a `goal` each tick — the lightest of planners, a heading rather than a twitch. It's the "why" behind the moment-to-moment steps, and it's what turns yesterday's felt *purpose* into something a kith can act on.

**Projects you watch rise.** Buildings are no longer conjured whole. When a kith decides to raise a lean-to or set a hearth, a **project begins** and the structure **grows from the ground over about three-quarters of an hour** — low and translucent at first, a scatter of stems or stones at its foot, rising to stand finished. Progress is a pure function of *elapsed time*, not tick-count, so every copy of a world agrees exactly how far along a build is (and once merged, on the one true start time). The day the roof or the fire is done is chronicled **once**, identically in every copy. The builder, meanwhile, reads *"raising the lean-to"* / *"tending the new hearth"* — a goal held across many ticks until the thing stands. (Structures from before today have no start and simply stand, already finished — nothing old is disturbed.)

**Water is a real barrier now — at any speed.** The movement bug Simon hit under `?warp` is fixed: a step used to check only its *endpoint*, so a big warp step could leap clean across a lake. Now every step is **walked cell by cell**, finer than the terrain grid, and stops dead at the first spot a body can't stand on. Land-kith also **won't set off toward a place they'd only stall at the shore of** — when choosing where to wander, they require a clear overland path. The water's edge is a wall; only swimmers cross it. This is the barrier that will, in time, *create the need for boats*.

## Why this keeps the merge sacred
Goals, drives, needs and intentions are all **ephemeral** — felt fresh each tick, never stored, never merged (added to the test suite's strip list). Projects live in world content, but their progress is **time-derived** and their ids **deterministic**, so drifted copies converge exactly and a finished-building is told once across a merge. The behavioural pressures still come straight from the same formulas, so nothing in the old algebra moved.

## Verified three ways
1. **Node suite — 251 checks** incl. 18 new: every drive names a goal and every ticked kith holds one; a walker cannot see a clear path across water while a swimmer can; **a colossal warp step cannot leap a lake**; a build begins at 0, is half-raised at half its time, stands at its full time; old start-less structures are already finished; a completed raising is chronicled once and survives a merge as a single telling.
2. **In-browser render** — a just-begun lean-to draws squashed to ~12% height and 40% opacity (rising); a finished hearth draws whole. No console errors.
3. **In-browser engine** — the water and project logic run identically to Node (same module, same results).

## Simon's disasters idea — folded into the roadmap
Simon proposed **realm-borne catastrophes** (3-Body-Problem-style chaotic seasons; tsunamis on sea worlds, avalanches on snowy peaks, eruptions, quakes, droughts, floods, wildfires). It's a superb fit — realms and deterministic weather already exist, so a disaster is just a timed, seeded event keyed to a realm, mergeable like a storm. Recorded in **ROADMAP.md** as new **pillar 11** and folded into **Day 25 (Jeopardy)**, with a note it may split into Day 25 + 25b. It's the headline reason the mind and goals matter: a world needs kith with purpose to survive its own planet. The 3-Body chaotic-seasons realm is captured as a distinctive mode.

## Next session (Day 24, from ROADMAP.md)

**Expeditions beyond the edge** — the likely killer feature. A restless kith (curious/bold/outcast) walks off the map and returns days later changed: a generated story, a foreign treasure, a scar, a new skill — or never returns, and is mourned. Narrative-first, deterministic, mergeable. The goal system shipped today is exactly what decides *who* leaves.

## Time & credit note

All green, all pushed. Under `?warp=1000`, watch a builder's lean-to climb out of the ground — and try to walk a land-kith across a lake; it will pace the shore instead.
