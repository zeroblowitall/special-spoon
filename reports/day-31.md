# Day 31 — 9 July 2026

## Factions & drama — leaders rise, and the one who turns

The villages have a place, a life, and rites (Days 27–30). Now they have **politics and danger from within**: a tribe finds its voice in a leader, and — rarely, darkly — a lone, friendless soul turns against the folk, until the village's champion stands against it.

## What got built (v0.31.0 — 306 KB, 330/330 checks green)

**Leaders rise.** A tribe of bonded folk comes to have a **voice** — the most-tied and most-seasoned among them (standing = bonds within the tribe + age + the crafts it knows). The rise is told once — *"Nolush came to be the voice of the Fefeno — the folk look to it now"* — and the leader wears a gold, crown-like ring on the map and reads as *"leads the Fefeno — its voice"* in its panel. Leadership is derived from the bond graph, so it's the same in every copy and shifts as the ties shift.

**The one who turns** *(the emergent villain, at last).* Sometimes a kith who is **bold, cold, grown, and friendless** — an outcast in no tribe — turns against the folk: *"Fefer, friendless and hard, turned against the folk. It began to take in the night what it would not be given."* A world holds at most one such villain at a time, and only where there is a **village** to prey on. It wears a pulsing red ring, and its intention reads *"prowling, turned against the folk."*

**It raids.** Night by night the turned one **strips the village's gardens** — the ripest plot laid bare: *"In the night, Fefer stripped the Fefeno's garden bare. The folk woke to bare stems."* Real harm to the fields the village worked to grow.

**And a hero rises.** After some days, the **reckoning**: the village's champion — its leader, the folk together — stands against the villain and **drives it out beyond the edge of the world**. Usually cleanly; sometimes at a cost — the champion carries away a long scar, or, rarest and hardest, *"fell driving it out. The folk are free of it now, and grieve the one who freed them."* Either way the village is delivered, and the drama closes.

## Why the merge stays sacred
It was tempting to build this on grudges — but grudges come from position-dependent contests that drift between copies. So everything here is grounded in **stable content and seeds**: leaders from the bond graph; *who* turns from traits (bold + cold + outcast) and a per-kith seed; *when* it raids and *how* the reckoning falls from the villain's own id. `led` / `turned` / `departed` are content that merges by the clock; every beat is chronicled with a deterministic id and dedupes on merge. Every copy sees the same rise and the same reckoning; reunited worlds hold each **once**.

## Verified three ways
1. **Node suite — 330 checks** incl. 11 new: a tribe has a leader, recognised once; a lone hard soul turns against the folk (and **not** where there's no village); it raids the gardens; a champion drives it out; **the reckoning falls the same way in every copy**; reunited copies hold one reckoning, not two.
2. **In-browser engine** — drove a full arc and read the prose live: the turn, and *"Nolush of the Fefeno stood against Fefer, and the folk drove it out beyond the edge of the world. It was not seen again."* (I caught and fixed a double-"the" in the generated line along the way.)
3. **Live DOM** — a turned kith renders a pulsing red ring and reads *"⚠ turned against the folk"* in its panel; a tribe's leader renders a gold crown-ring. No console errors.

## The society is whole
Bonds → tribes → villages (place, fields, rites) → **and now leaders, a villain, and a hero.** A Driftgarden village is a small society with a history you can read: it works its land, keeps its watch, mourns its dead, welcomes its young, sings in the evening, follows its leader, and, once in a while, must find a hero to face the one of its own who turned.

## What's left (ROADMAP.md)
- **Auto-biographies** — gather each kith's life into a readable story (rise, loves, deeds, end).
- **Myth** — the folk's word for *you* becoming legend.
- **The player as a force** — deeper tools & dialogue (answer prayers, name places, gift tools, tip the scales in a rivalry).
- The **appropriate-to-land defence tree**, the **3-Body chaos realm**, and a **balance pass + playtest**.

## Time & credit note

All green, all pushed. Let a village grow and a friendless, hard soul live at its edge — and one day you'll watch the two of them come to their reckoning, and see who the folk find to face it.
