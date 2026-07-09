# Day 27b — 9 July 2026

## Fields — clearing with fire — and an honest note on the larger map

The two pieces held over from Day 27. One shipped cleanly and is a genuine new mechanic; the other I built, hit a real snag with, and made the disciplined call to hold back rather than break the suite.

## What got built (v0.27.0 — 280 KB, 298/298 checks green)

**Clearing with fire → fields.** A seasoned gardener — a seed-keeper with a restless streak — now learns to open new ground the old way: it **sets a careful fire, clears a patch of wild growth, and breaks the ash-rich earth beneath into a field**. A field is tilled ground where the garden grows **richer and faster** (the soil counts for 1.6× a wild patch), so seed-keepers who plant near a field plant *into* it, and the crop comes on thick. Fields render as **ploughed plots** — dark broken earth with furrow rows — drawn under the plants that grow in them, so a settled, farmed patch reads at a glance. This is the visible farmland that makes a village look like a village that *works* the land.

It obeys every law of the world: a field is **world content** with a **deterministic id per gardener per day**, it lives among the structures and **merges like any other** (reunited copies hold one field, not two), and the clearing itself is chronicled once. The clearing-fire **spares the gardener's own careful plantings** and burns back only the wild growth in the patch. Fields don't count as shelters, beds, or against the village ring — a field is a field.

**An honest note on "a genuinely larger land map."** I built it — the terrain's noise was really *one* frequency summed three times (which is why the land read as uniform), so I made it truly fractal: broad continents, hills and bays, then fine coves. It looked better. But reshaping the terrain — which is derived from world identity, and which the whole simulation is spatially built on — **shifted where the kith walk**, and through the test suite's conditional-loop timing that **drifted the global clock** and cascaded into the wanderer- and predator-window tests (7 reds). In isolation every affected behaviour was correct; the failures were **test-suite fragility** (a shared, drifting `fakeNow`), not a bug in the world. Rather than paper over green by rewriting tests to accommodate, I **reverted the terrain change** and recorded it in the roadmap: the larger map lands the moment the suite's clock discipline is hardened (the change itself is a small edit — the `valueNoise` lattice-size parameter is already in place). Protecting the merge and the green suite outranks a nice-to-have this session.

## Verified
1. **Node suite — 298 checks** incl. 8 new: a gardener clears a field with fire; the clearing is chronicled; one field per gardener per day; the same field is cleared in every copy; the gardener plants into the field; field ground is richer than wild ground (soil ≥ 1.5); reunited copies hold one field, not two.
2. **In-browser** — a field renders as a furrowed, tilled plot under its plants; `clearField` is exported and runs; no console errors. A screenshot confirms the ploughed patch on the land (and Day 27's smooth coasts holding up at night).

## Still deferred (ROADMAP.md)
- **The genuinely larger land map** — pending a pass to harden the test suite's `fakeNow` discipline, after which the fractal terrain drops in.
- The **appropriate-to-land defence tree** (firebreaks, high-ground lore) from the jeopardy days.

## Next session (Day 28, from ROADMAP.md)

**Rituals, myth & biographies; balance & a playtest** — or the deferred **larger map** (with a test-hardening pass first), or **illness & disease**. Simon's steer decides.

## Time & credit note

All green, all pushed. Give a world a gardener with a restless streak and some time — it will burn a clearing and start a field, and the garden there will come on faster and thicker than the wild.
