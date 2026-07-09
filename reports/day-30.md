# Day 30 — 9 July 2026

## Gatherings & rituals — the life of a village

The counterweight to all the jeopardy. We spent Days 25, 26 and 28 giving the world teeth — the beast at the edge, the world's own turning, the sickness within. This day gives the folk the thing that answers all of it: **each other, gathered at the hearth.** A village stops being a cluster of roofs and becomes a people who mourn their dead, welcome their newborn, and gather in the evening to be together.

## What got built (v0.30.0 — 298 KB, 319/319 checks green)

**Funerals.** When one of the folk is lost — to age, to hunger, to a beast, to a fever, to the world itself, or off beyond the edge — and it had ties among the living, and there is a **hearth** to gather at, the folk come together to mourn it. The rite names those who loved it and remembers **what it was**, drawn from its own life: *"The folk gathered at the hearth to mourn Takel, who sang against the storms. Salusar, Vivikesh will remember."* A healer is mourned as one who tended the sick; a watcher as one who kept the watch; a traveller as one home at last; a parent as one who leaves children behind. A solitary passing, or one in a world with no hearth, stays quiet as before — a funeral is a *village's* act.

**Naming-days.** When a child is born among the roofs, the folk gather at the hearth to welcome it into the tribe by name: *"At the hearth, the folk gathered to welcome the newborn Talul into the Vivir — a naming-day."* New life, formally received by its people.

**The evening gathering.** Now and then — a seeded chance, at its own appointed hour — a village simply comes together at the hearth. If one of them knows the **song**, it is raised and the others take it up; otherwise they are *"glad of one another."* It ties the song discovery, the seasons, and the village into one living settlement.

**You watch them gather.** Each rite lights a **warm ring at the hearth** (pale and slow for mourning, golden for a naming or a song), and the folk near enough **draw toward it** — their intention becomes *"gathering to mourn," "gathering for the naming," "gathering to sing."* The gathering is the one ephemeral part; it's real to watch but never merged.

## Why the merge stays sacred
Every rite is **keyed to the deterministic event that occasions it** — a death (`fnl` + the kith's id), a birth (`nmd` + the child's id), a day (`gth` + hearth + day) — and fires **once**, gated to *recent* events so a world loading with old losses doesn't hold a hundred funerals at once. The `mourned`/`welcomed` marks are content and merge by the clock; the chronicle dedupes each rite by its id; the gathering itself is ephemeral flavour. Reunited worlds hold each rite exactly once. Same discipline as everything since Day 22, now turned to the gentle things.

## Verified three ways
1. **Node suite — 319 checks** incl. 7 new: a funeral is held for a mourned one at the hearth, once; **reunited copies hold one funeral, not two**; no hearth → no funeral; a solitary passing gets no rite; a naming-day welcomes a newborn born into a village.
2. **In-browser** — injected a hearth into a world that had recently lost several kith: it held funerals for each with the right elegies (*"who sang against the storms"*), welcomed the newborns into their tribe, and set a gathering; the warm glow rendered at the hearth. No console errors.
3. **In-browser engine** — confirmed the folk converge: a kith near an active gathering took the intention *"gathering to sing"* (while one that was sleepy at night chose bed instead — the rites yield to real need, as they should).

## The village is alive
Between this and Day 27 (visible commons + names) and Day 27b (fields), a village now has a **place** (commons, hearth, fields), a **name**, and a **life** — it works the land, and it mourns, welcomes, and sings. This is the emotional heart the jeopardy was always for.

## What's left (ROADMAP.md)
- **Auto-biographies & myth** — every kith a living biography; myths that form (their word for *you* becoming legend). (This day did the *rituals* third of that pillar; the biographies and myths remain.)
- The **appropriate-to-land defence tree** (firebreaks, high-ground lore, palisades).
- **Factions & drama** — now that the map is big enough for two villages, they could trade or rival.

## Time & credit note

All green, all pushed. Raise a hearth and let a village grow around it — then stay a while. When one of them falls, you'll see the others gather to remember; when one is born, to welcome it; and some evening, for no reason but each other.
