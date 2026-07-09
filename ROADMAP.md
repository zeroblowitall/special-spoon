# Driftgarden — Roadmap to *Inner Lives* (v2)

*Written 2026-07-09, after the playtest that changed the project's direction. This is the most important document in the repo right now. A fresh session should read MISSION.md, then this, then the latest `reports/day-NN.md`.*

## Why this exists

After ~21 daily sessions, Driftgarden is a beautiful, genuinely novel, single-file world: deterministic mergeable "play by diaspora", emergent language with per-world dialects, ten realms, procedural bodies (a million+ phenotypes), seasons, night, culture, discoveries, a self-writing Almanac and Chronicle — all offline, zero-dependency, 213 KB, 219 passing tests.

But a playtest surfaced the honest truth: **it is a remarkable social/technical *concept*, not yet a compelling *game*.** The kith wander, eat, chat, drift apart — without visible purpose, ambition, or jeopardy. The player mostly watches. This document is the plan to give the kith **inner lives** and the player **real agency**, without breaking the constitution.

## Diagnosis — the three missing things

1. **Pressure (needs).** Today: only hunger/energy. Real agent-sims run on several *competing* needs (hunger, rest, safety, belonging, curiosity, purpose). Which need currently dominates a kith *is its personality in that moment*.
2. **Purpose (goals & plans).** Today: pure tick-to-tick reaction. No ambitions, no multi-day projects, no legible intention. Goals make behaviour readable, make the player predict and *care*.
3. **Stakes (consequence).** Today: nothing meaningfully threatens them; nothing they do leaves a mark you'd mourn or celebrate. No jeopardy = no drama.

And for the **player**: agency. Watching is not enough. The player needs tools, decisions, and moral weight — choices with visible consequences.

## The brain — a dedicated, in-file mind (NOT an external LLM)

The plan: a distinct `engine/mind.js` module — a real "brain file" in the codebase, still bundled into the single shipped artifact. It layers:

- **Needs**: hunger, energy, safety, belonging, curiosity, purpose — each decaying/spiking with situation.
- **Traits** (from the existing brain genome, expanded): weight the needs and set thresholds, so the *same situation* produces *different* choices in different kith → genuine, heritable personality.
- **Goals & a light planner** (utility-ranked, GOAP-flavoured): the most-pressing need selects a goal; the kith pursues it over many ticks; goals can be interrupted, can fail, can be abandoned.
- **A visible current intention** surfaced to the player ("walking to the shore to build a boat").

**Why not an external/LLM brain** (it was on the table, and it's the wrong call): it would need the internet (breaks offline-forever), cost money per kith, and — fatally — make two copies of a world diverge, **destroying the deterministic merge that is Driftgarden's entire thesis**. The emergent stories we want (the outcast who turns violent, the explorer who returns with treasure, the team that raises a hall) come from *needs + traits + goals + world state*, not from a chatbot. This is "grown/architected intelligence" — sovereign, offline, mergeable, and frankly more impressive.

## The pillars — the systems that make it 1000× more interesting

1. **Needs & personality.** The pressure model above. Instantly makes kith read as individuals.
2. **Goals, plans & visible intentions.** Purpose you can see. The single highest-leverage change.
3. **Projects & construction you watch rise.** Multi-day builds: boats, bridges, great-halls, totems, burned-and-cleared farmland. Villages grow visibly, not by a "build" button but because kith *decide* to.
4. **Expeditions beyond the edge** *(likely the killer feature)*. A restless kith (curious/bold/outcast) walks off the map and returns days later changed — a procedurally generated story, a foreign treasure, a scar, a companion, a new skill — or never returns, and is mourned (the Almanac notes it). Merge-lite for a world's *own* kith; pure deterministic narrative generation.
5. **Jeopardy & the emergent villain.** Real danger (drowning in open water, blight, a beast that wanders in, a brutal winter) and real social darkness: grudges → feuds; a wronged, bold, low-empathy kith turns to theft, sabotage, even violence; the village must respond (exile, reconciliation, a hero rises). Tune-able (see decisions).
11. **Realm-borne catastrophe** *(Simon's idea, 2026-07-09 — the world itself as antagonist).* Each of the ten realms brings its own rare, deterministic disaster, seeded from `worldId + time` exactly like storms and the Wanderer, so **every copy of a world suffers the same catastrophe at the same hour and it merges losslessly**. Candidates by realm: **tsunami** (coralshelf/lakewild — the sea withdraws, then returns; low-lying kith must flee to high ground), **avalanche** (frostmere/mistral peaks), **eruption + ashfall** (ember), **earthquake** (any mountainous), **drought** (saltflats/duskmoor — plants wither, water recedes), **flood** (lakewild/meadow after long rain), **wildfire** (meadow/duskmoor in a dry season — spreads, clears land, fertilises after). A disaster is a *timed event with phases* (warning → strike → aftermath) the mind reacts to with real goals: flee, shelter, huddle, rebuild, mourn. Framed with restraint (Q2: gentle hand, never gore) — the elegy of a village rebuilding after the fire. **The 3-Body idea:** a distinctive realm (a new "chaoswold" or a mode) whose seasons come not from the tidy 28-day cycle but from a **chaotic multi-sun function** — long killing winters and scorching stable-eras arriving unpredictably, making mere survival the game. This pillar lands in **Day 25 (Jeopardy)** and is the headline reason the mind/goals of Days 22–23 matter: a world needs kith with purpose to survive its own planet.
6. **Factions & drama.** Tribes compete for scarce food/land; leaders rise; alliances and rivalries; the player can tip the scales.
7. **The player as a force.** Beyond the gardener: answer prayers/needs (the First Address grown into an ongoing dialogue), name places into their myth and language, set blessings/decrees the emissary spreads, gift tools & seeds, call gatherings — choices with visible, sometimes moral, weight. (Exact model: see decisions.)
8. **Rituals, myth & legible biographies.** Funerals, naming-days, harvest gatherings, songs sung together; myths that form (their word for *you* becomes legend). Every kith gets a living biography and a visible intention, so "random movement" becomes "story".
9. **Water as a real barrier.** Fix the bug (movement checks only the destination, so at warp a step can leap a lake — sample along the step / clamp step length). Then land-kith *avoid* water, which *creates the need for boats* — barrier becomes purpose.
10. **A bigger world, closer zoom, room for villages.** Larger terrain, default closer camera, space for 1–2 villages and clearing-with-fire.

## Constitution compatibility (non-negotiable — MISSION.md)

- The brain is **in-file, deterministic, mergeable**. No network, ever.
- Expeditions, stories, treasures, events are **generated from seeds** (world id + logical time), so every copy of a world agrees exactly.
- All new state merges by the **existing laws**: deterministic ids, last-writer-wins by `u`-clock, earliest-telling-wins for records (Almanac), union-never-lossy.
- Every new system ships with **Node tests**; `node test.js` stays green. Verify in a real browser each session.

## Phased plan (one ~2h session each; order/scope flexes with the decisions)

- **Day 22 — The Mind I:** `engine/mind.js` scaffold; multi-need model; trait-weighted need-pressure; most-urgent-need → goal; **visible current intention on every kith**. (Biggest perceived change for the least code.)
- **Day 23 — Goals & Projects:** goal library + planner; first multi-day construction you watch rise; **water becomes a barrier + fix the warp water-leap bug**.
- **Day 24 — Expeditions:** the restless leave and return with generated stories/treasure/scars — or are mourned.
- **Day 25 — Predators (SHIPPED as the first cut of Jeopardy):** realm-keyed beasts that come, stalk, and kill — deterministically seeded like weather/expeditions, so every copy suffers the same hunt and it merges losslessly. Recognisable generative monsters, three kill methods (drag-to-the-depths / devour-where-they-stand / carry-off-to-the-brood), darker prose (Q2 revised). Plus the first invented **defence** ('the warding' — a bold, sociable kith learns to keep watch after a killing; enough warders drive the beast back). Simon's asks for this pillar: predators easily recognisable, world-relevant, huge variety, killing in different ways; darker tone; invented, appropriate defences.
- **STILL TO COME under Jeopardy (Day 26 / 26b — deferred from the original Day 25 to keep sessions shippable):**
  - **Illness & disease** *(Simon's ask):* contagious, deterministic sickness — a plague seeded per world/time that spreads kith-to-kith along contact/bonds, sickens (slows, weakens, can kill), and passes; a 'tending'/'herb-lore' discovery to treat it. Must stay deterministic+mergeable (spread derived from contact graph + seed, not live positions).
  - **Realm-borne catastrophe (pillar 11):** tsunami/avalanche/eruption/quake/drought/flood/wildfire with warning→strike→aftermath phases; the 3-Body chaotic-seasons realm.
  - **The appropriate-to-enemy / appropriate-to-land defence TREE:** beyond the generic warding — palisades & watch-fires vs land beasts, staying-from-deep-water & lookouts vs drowners, fire vs cold-country packs, high-ground vs floods. Each invented under its own pressure, realm/enemy-specific.
  - **Social darkness:** feuds, a kith who turns to theft/sabotage/violence, the village's response (exile/reconciliation/a hero rises).
- **Day 26 — The player as a force:** the stepped-up toolset & dialogue.
- **Day 27 — World & villages (PARTLY SHIPPED):** DONE — a **graphics overhaul** of the land (Simon: "the world looks jagged and unfinished"): terrain now coloured by *smoothed* height with soft biome blends and an anti-jagged coastline (foam at the water's edge), higher-res paint, a framing vignette; **closer default camera** (the land fills the frame); and **villages made visible** (a cleared commons + the tribe's name on the map where a hearth has gathered a village). STILL DEFERRED to a Day 27b: a **genuinely larger land map** (more contiguous land / room to spread — deliberately not done yet to avoid changing identity-derived terrain shape and destabilising the sim), and **clearing-with-fire → farmland** (a kith burns a patch to make ground for gardens; a new mechanic). Also the appropriate-to-land defence tree (firebreaks, high-ground lore) still pending from Days 25–26.
- **Day 28 — Rituals, myth & biographies; balance & playtest.**

## Decisions — ANSWERED 2026-07-09 (these are now settled; build to them)

- **Q1 — Brain approach: RICH IN-FILE AGENT AI.** A dedicated `engine/mind.js` — needs + traits + goals/plans (GOAP-flavoured). NOT an external LLM, NOT (for now) evolved neural nets. Deterministic, offline, mergeable. This is the spine of everything below.
- **Q2 — Darkness/tone: REAL STAKES, GENTLE HAND → now REVISED DARKER (Simon, 2026-07-09).** Originally: loss and even a killing allowed, but never gore, register elegiac. **Simon has now explicitly asked to "move a little towards gore"** with the arrival of predators. New setting: **the killing is allowed to be visceral** — a kith dragged thrashing beneath the water and the surface reddening, a beast tearing into one where it stands, prey carried off screaming to a brood. Still *literary*, not splatter-for-its-own-sake: "a little towards gore," grim and real, not exploitative. The world between horrors stays lovely to sit in; the contrast is the point. This supersedes "never gore" for predators, disasters, and violent ends.
- **Q3 — Beyond the edge: BOTH, NARRATIVE FIRST.** Ship narrative expeditions first (a kith vanishes off-map and returns with a generated story/treasure/scar, or is mourned — deterministic, mergeable). Grow a **real explorable frontier later**, once the mind and projects are solid.
- **Q4 — Player role: DEEPER INDIRECT INFLUENCE.** Stay the unseen gardener-god — no direct commands, no embodiment (for now). But give real tools and real *dialogue*: answer prayers/needs, name places into their myth & language, set blessings the emissary spreads, gift tools & seeds, call gatherings — choices with visible, sometimes moral, weight.

*The phased plan above already matches these answers; no reordering needed. Expeditions (Day 24) are narrative-first with a real frontier deferred to a later era.*

## For whoever picks this up

Read MISSION.md → this → latest `reports/day-NN.md` → the auto-memory. Keep `node test.js` green. Ship **one pillar per session**, verify in a real browser *and* the Node suite, write the daily report, commit & push. The soul of the project is the deterministic merge and the single sovereign file — protect both above all features.
