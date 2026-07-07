# Day 8 — 8 July 2026 (third session)

## Balance — and the door to the first real playtest

Before two strangers' worlds meet for real, the ecology had to be honest and the week-alone case had to be *proven*, not hoped.

## What got built (v0.8.0 — 124 KB, 111/111 checks green)

**Grazing: food is real now.** A kith's sip visibly tires a bloom (−0.12 growth, floored at 0.3 so no plant ever dies of being loved), and the bloom regrows over hours. Food now comes in cycles: hunger has geography and timing, gardens genuinely matter, a small garden cannot feed a large tribe, and the contest/grudge system finally has real fuel. Alongside it, metabolism moved from demo-speed to **world-speed**: kith get hungry roughly hourly rather than every five minutes, which makes a persistent world behave like one.

**A week alone, proven.** The suite now simulates the exact case the playtest depends on: a world tended briefly, then visited two minutes a day for seven days, sleeping ~22 hours at a stretch. After the simulated week: everyone alive, nobody starving, and dozens of new chronicle entries — *the world is demonstrably safe to neglect and interesting to return to.* (A barren world still starves; neglect only kills when there is genuinely nothing to eat.)

**Beckon.** The gentlest god-verb: click bare land and a golden ripple spreads — *"You call softly. The curious will come."* Kith answer in proportion to their curiosity; the beacon fades in 45 seconds; the water does not listen. Verified live: the flock crossed the map and gathered on the called spot. Never persisted, never merged — a call is a moment, not a fact.

**Families.** From the Chronicle, a genealogy of the world's bloodlines, root to leaf: *"the line of Irinol → Irinonor"* — with the departed marked *(remembered)* and the emissary badged. Children of two worlds hang from both parents' lines.

**The playtest guide.** [PLAYTEST.md](../PLAYTEST.md): "The First Meeting" — a warm, complete script for two people over four days: seed two worlds, name and bless, drift *without coordinating*, then exchange preserved files and merge both ways — ending with the quiet miracle: both machines holding identical contents (same merge-child, same name, same braided history) on two different lands.

**Audit.** File: 124 KB — 16× under the 2 MB principle. Simulation cost: O(population²) per 2s tick with a 20-kith cap — negligible. Known growth: the chronicle is append-only by principle; at natural event rates it stays comfortably within limits for years. Flagged for a future compaction *display* (never deletion).

## A testing lesson (self-inflicted)

Live verification first "showed" the beckon failing — because positions save to storage on a 30-second heartbeat, and I was reading storage mid-window. The DOM told the truth: the kith had already arrived. Noted in the project memory: measure the living world from the DOM, not the save file.

## Deferred

Scatter (planting already covers it), speciation (needs generations of real inheritance data — soon).

## Next session (Day 9)

**The first real playtest** — Simon and a friend, per PLAYTEST.md — plus whatever their confusion teaches us. Engine-side: speciation if the data allows, and first thoughts on Discoveries #2 and #3.

## Time & credit note

Third session today. All green, all pushed. The game is ready for its first strangers.
