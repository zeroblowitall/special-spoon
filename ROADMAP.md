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
- **Day 25 — Jeopardy & the villain:** danger, loss, feuds, a kith who turns; the village responds.
- **Day 26 — The player as a force:** the stepped-up toolset & dialogue.
- **Day 27 — World & villages:** bigger map, closer zoom, clearing-with-fire, 1–2 villages.
- **Day 28 — Rituals, myth & biographies; balance & playtest.**

## Decisions — ANSWERED 2026-07-09 (these are now settled; build to them)

- **Q1 — Brain approach: RICH IN-FILE AGENT AI.** A dedicated `engine/mind.js` — needs + traits + goals/plans (GOAP-flavoured). NOT an external LLM, NOT (for now) evolved neural nets. Deterministic, offline, mergeable. This is the spine of everything below.
- **Q2 — Darkness/tone: REAL STAKES, GENTLE HAND.** Death, danger, illness, theft/sabotage, *rare* violence, expeditions that can end in loss — framed with restraint and melancholy, **never gore**. Jeopardy you feel, in a world still lovely to sit in. (This refines the old "strife, not gore" rule upward: loss and even a killing are allowed, but the register stays elegiac, not brutal.)
- **Q3 — Beyond the edge: BOTH, NARRATIVE FIRST.** Ship narrative expeditions first (a kith vanishes off-map and returns with a generated story/treasure/scar, or is mourned — deterministic, mergeable). Grow a **real explorable frontier later**, once the mind and projects are solid.
- **Q4 — Player role: DEEPER INDIRECT INFLUENCE.** Stay the unseen gardener-god — no direct commands, no embodiment (for now). But give real tools and real *dialogue*: answer prayers/needs, name places into their myth & language, set blessings the emissary spreads, gift tools & seeds, call gatherings — choices with visible, sometimes moral, weight.

*The phased plan above already matches these answers; no reordering needed. Expeditions (Day 24) are narrative-first with a real frontier deferred to a later era.*

## For whoever picks this up

Read MISSION.md → this → latest `reports/day-NN.md` → the auto-memory. Keep `node test.js` green. Ship **one pillar per session**, verify in a real browser *and* the Node suite, write the daily report, commit & push. The soul of the project is the deterministic merge and the single sovereign file — protect both above all features.
