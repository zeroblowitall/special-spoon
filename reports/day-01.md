# Day 1 — 7 July 2026

## The pivot, and the decision

The first attempt today (Lantern, an offline single-file school — see the `An_Application` repo) was a good product in a crowded category. Simon's feedback was right: better-offline-education exists many times over. He asked for a genuinely empty category and offered three candidates; he chose **Mergeable Worlds**. This repo is now committed to it.

**Driftgarden: a living world in a single HTML file. Copies drift apart; when they meet again, they merge.** No game has ever made *divergent save-files merging* the core mechanic. There is no server and no multiplayer infrastructure — the social layer is human relationships and the physical movement of files. Play by diaspora. The vision and fixed principles are in [MISSION.md](../MISSION.md).

## What got built (v0.1.0 — 36.4 KB)

**The living file:**
- A world is born the first time the file is opened — named, chronicled, autosaved
- **Preserve**: the game rewrites *itself* — it reads its own style and code out of the page and emits a fresh, complete HTML file with the current world embedded. The downloaded file IS the world
- A seed file opened again resumes your most recent world; a world file opened after local play resumes whichever is newer

**The garden:** procedurally drawn swaying plants from a six-gene genome (hue, height, branches, petals, leaf, growth rate); real-time growth over ~36 hours from seed to bloom; watering (hourly per plant); naming plants and worlds; a day/dawn/dusk/night sky keyed to the real clock; an append-only **Chronicle** of everything that ever happened.

**The merge** (the flagship): drag another Driftgarden file anywhere onto the page (or use the picker, or paste). Rules, all verified live in a browser:
- **Lossless union** — every plant and chronicle entry from both worlds survives, ordered by logical clock
- **Deterministic** — both copies merging each other produce the identical world (canonical ordering everywhere the RNG looks)
- **Births** — a first meeting crosses the proudest plant of each side into a new hybrid species: my test run produced *"the Clovebloom — child of Grandfather the Thistledrop and Old Marta the Frostcap"*
- **Reunions** — re-merging a known world weaves in only what's new: no duplicate hybrids, no duplicate history
- **Lineage** — worlds permanently remember every world woven into them ("Silver Slope · woven from 2 worlds")

## Bugs found by testing, fixed before shipping

1. A literal `</script>` in the import parser would have broken the self-writing file (the build now guards against this class of bug).
2. Hybrid parents were chosen after the union, so no hybrid was ever born.
3. Fresh seed files spawned a new world on every open instead of resuming — a player would have "lost" their garden by closing the browser.
4. Re-merging the same file birthed a spurious hybrid each time — introduced first-meeting/reunion semantics.

## Next session (Day 2)

1. A Node test harness for the merge (including the mirrored-merge determinism proof A⊕B ≡ B⊕A)
2. Manual breeding — choose two of your own plants to cross
3. Gift-seeds: export a single plant to a friend without a full world merge
4. The world's family tree rendered visually from lineage
5. First outside playtest: Simon merges a world with a friend

## Time & credit note

This was the second half of a split day (first half went to Lantern before the pivot). Session held within budget; all verification done in a real browser.
