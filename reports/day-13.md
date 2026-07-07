# Day 13 — 7 July 2026 (small hours)

## Realms — variety until it hurts

Simon's brief: don't stop at his three suggestions. So the realm system shipped with **ten natures**, weighted so the familiar is common and the strange is precious.

## What got built (v0.13.0 — 166 KB, 147/147 checks green)

**Ten realms, derived from world identity** like the land itself — never stored, never merged, each steering the terrain's flood-level, the palette of every biome, the colour of noon and midnight, which flora forms grow (and how much of it glows), what bodies the founders are born with, what the weather is *called*, and **who may cross the deeps**:

- **Meadowrealm** — the green familiar (common)
- **Lakewild** — a thousand waters; founders are almost all swimmers
- **Mistral** — floating isles over a cloud-sea; limbless gliders drift its islet-greens
- **Emberwaste** — lava pools, ashfall, firestorms; *no body may cross the lava*
- **Frostmere** — snowfields under pale lights; *anyone may walk the black ice*
- **Fungal Deep** — a lightless under-country where 85% of flora glows and the rain is sporefall
- **Mirrorflats** — blinding salt, brine mirrors, salt-storms, almost no water at all
- **Duskmoor** — perpetual twilight, heather moors, black tarns, the howling dark
- **Coralshelf** — Simon's underwater world: *everything* is sea and every body may cross it
- **Glasswold** (rare) — molten glass, chiming rain, shatterstorms

**Cross-realm merges are first contact between natures**, chronicled with deterministic ids, identical on both sides: *"One world is of the Emberwaste; the other of the Frostmere. Natures that had never touched now share one soil."* Kindred natures pass without remark (tested). Travellers keep their bodies; the host's realm decides where those bodies may stand — the passability laws are proven in the suite: lava blocks everyone, ice bears everyone, the open sea welcomes all.

**The Worlds door asks two questions now:** a world's *nature* (any of the ten, or surprise) and its *land* (lakeland/highlands/plains/drylands), delivered by honest prospecting.

**Seen live:** *Cinderfall*, born "in the shadow of the fire-country" — rust-smoke sky, ashfields, glowing lava pools; and *The Bright Shallows*, born "beneath the surface of the endless shallows" — sea-light from above, coral-pink shelf, a kith already out in the open sea. Two worlds, one game, unrecognisable as siblings.

**A note for existing worlds:** realm assignment reaches backwards — an old world will reveal its true nature on next waking (most will be Meadowrealm; a few will surprise their keepers). Pre-1.0 and narratively defensible: the world was always this; you only now have the words for it.

## Tests: 147 — realm determinism, 6+ natures in 80 worlds, waterline ranges obeyed, passability laws (lava/ice/open-sea), Lakewild founders finned, asked natures delivered, birth lines name the nature, sporefall in the Fungal Deep, first-contact chronicles identical across both sides, kindred natures silent.

## Next session (Day 14 — Voices II: proto-sentences)

Two-slot utterances from their own words; word-order as a per-world convention that clashes at merges. Then Day 15: speaking to the gardener.

## Time & credit note

All green, all pushed. Ask the Worlds door for the Fungal Deep after dark. Bring sound.
