# Day 25 — 9 July 2026

## Predators — the world grows teeth

The first cut of Jeopardy, and a real change of register. Until now the worst that befell a kith was hunger, a storm, old age, or the silence of an expedition that never came home. Now something hunts them. A beast comes out of the country — suited to it, and to its own dark craft — stalks, and kills. The world between horrors is still lovely; that's the point of the contrast.

**A note on tone:** Simon asked to move "a little towards gore," and this session takes him up on it. The killings are visceral now — grim and real, still literary rather than splatter. ROADMAP Q2 is revised to record the change.

## What got built (v0.24.0 — 255 KB, 276/276 checks green)

**Beasts that suit their world.** Each realm brings its own hunters — the **drowner** and **reef-jaws** in the waters, the **meadow-cat** and **brood-mother** in the green, the **white pack** across the snow, the **ash-hound pack** out of the fire-country's smoke, the **salt-wyrm** bursting up through the crust, the **sky-raptor** stooping from the cloud, the **hound of the moor**, the **deep-lurker**. Ten kinds across the ten realms, and each individual is **generated from the hunt's own seed** — size, colour, eyes, spines, teeth all vary — so no two look quite alike. On the map they're **recognisable at a glance**: big, dark, realm-tinted silhouettes with catching eyes and a breathing shadow, drawn as serpents, prowlers, packs, raptors, worms, or shades.

**Three ways to die** (Simon's vision, exactly): the **drag-to-the-depths** kinds take a kith down into the water and the surface reddens and closes; the **devourers** fall on one where it stands; the **carry-off** kinds seize a kith in their claws and bear it off to their brood, and the screaming carries a long way and then stops. Each kind kills in its own way, and the chronicle tells it darkly.

**Deterministic, and merge-sacred even in death.** This was the hard part. **When** a hunter comes and **what** it is derive from world identity and time, like the weather. **Who** it takes is chosen from **stable content alone** — the young, the old, the timid, the solitary, the unwatched — never from a copy's fleeting positions. So every copy of a world suffers the same killing at the same hour, with the same deterministic id, and reunited worlds mourn exactly once. A hunter comes only to a **peopled** world (four or more present), not a tiny founding band.

**And the folk learn to fight back.** When predators are about, a bold, caring soul stops sleeping easy: after a killing, a kith can invent **the warding** — it keeps the watch and teaches the others to stand together when the dark comes. A world with enough bold watchers can **turn the beast back**: *"…but the folk stood together, and Kefe drove it back into the dark. No one was taken this time."* The warding spreads by teaching, like every craft. It is the first of what will become a whole tree of defences appropriate to each land and each enemy (roadmapped).

## Verified three ways
1. **Node suite — 276 checks** incl. 13 new: the hunt is a pure function of world and time; the beast suits its realm; **no hunter comes to too small a world**; it takes exactly one of the folk; the killing is chronicled once, darkly, with the method remembered; **the same soul is taken in every copy**; one hunt, one killing; reunited copies mourn once; **a well-warded world drives the beast off**, chronicled once.
2. **In-browser render** — forced a live hunt: the beast renders as a positioned, realm-tinted silhouette with a breathing aura, stalking toward its chosen prey; the map self-corrects when the victim is taken. No console errors.
3. **In-browser engine** — drove a world to the strike and read the prose live: *"The ash-hound pack poured out of the smoke and tore into Osuosusash where it stood. When it had fed, there was little left for the world to bury."* Grim, and true to the new tone.

## Deferred (recorded in ROADMAP.md) — the rest of Simon's asks
Kept out of this session so it stays shippable; each is its own next pillar:
- **Illness & disease** (Simon's ask): contagious, deterministic sickness spreading along the contact/bond graph, with a 'tending'/herb-lore cure.
- **Realm-borne catastrophes** (pillar 11): tsunami/avalanche/eruption/quake/drought/flood/wildfire + the 3-Body chaotic-seasons realm.
- **The appropriate-to-enemy defence tree**: palisades & watch-fires, staying-from-deep-water, fire vs cold-country packs, high-ground vs floods — each invented under its own pressure.
- **Social darkness**: feuds, a kith who turns, the village's response.

## Next session (Day 26, from ROADMAP.md)

Most likely **illness & disease** (to pair sickness with the predators as the second face of jeopardy) or the **realm catastrophes**. Simon's steer decides.

## Time & credit note

All green, all pushed. Open a peopled world and wait — or `?warp=3000` — and sooner or later something will come out of the dark. Teach your folk to stand together, and watch them turn it back.
