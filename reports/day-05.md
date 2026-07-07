# Day 5 — 7 July 2026 (fifth session)

## Minds

The kith stopped being wanderers and became *someone*. This was the deepest engineering session yet, because life and death had to be made **merge-safe**: copies of a world simulate independently, so births and deaths must reconcile perfectly when copies reunite.

## What got built (v0.5.0 — 99 KB, 73/73 checks green)

**Brains.** Every kith is born with six evolvable weights — curiosity, sociability, boldness, wanderlust, appetite, patience — crossed (with mutation) from its parents. Behaviour follows from the mind: the hungry seek food, the sociable seek friends, the patient doze, the bold ignore storms, wanderlust sets how far a kith roams. Selection now quietly reshapes temperament over generations. Kith from older files grow identical minds in every copy, derived from their own identity.

**Memories.** Kith learn: each has an inborn, physiology-level compatibility with every plant species (fixed and identical in every copy), discovered by eating — after which it *remembers*, seeks out what it likes, avoids what disagrees with it ("has a taste for Vravriaka; can't abide Thoulis"). Encounters build **trust**; trust past the threshold becomes a **bond**, chronicled ("became fast friends"). Both memory stores are capped, evicting the faintest entries deterministically.

**Birth.** Bonded, grown, well-fed kith who meet in fair weather have children. The design keystone: *a child of the same two parents on the same day has the same identity in every copy of the world* — so when drifted copies re-merge, they hold one child, not twins. Proven in the suite, and live in the browser: **"Irinol and Taponol had a child: Irinonor"** — born in the rain, crossed brain, 15-day lifespan, through the entire natural pipeline.

**Mortality.** Every kith is born with its allotted days. Because lifespan is decided at birth, **every copy of a world records the identical passing at the identical moment with the identical chronicle id** — reunions hold one death, never two, and the dead are never resurrected by a merge nor allowed to lead meetings. Passings are gentle: "grew old and full of days, and fell asleep beneath the soil. The world remembers." The departed stay in the world's records as memory — a memorial panel, not an empty slot. Starvation is the second door: 48 foodless hours takes a life, which makes **neglect and barren worlds genuinely fatal** (Simon's ask). New worlds now begin with wild plants so founders survive to the first garden.

**Storm shelter.** Weather matters now: timid kith make for rocky high ground when storms roll in; the bold shrug and carry on (energy drains faster for those caught out). Courting waits for fair weather.

**Catch-up.** A file that slept lives its missed time on waking (bounded at three days): growth advances first, the fed thrive, the hungry starve, the old pass, bonded pairs may have had children — all with deterministic identities — and the player is greeted with the news: *"While the world slept: 2 children were born, and one of the kith fell asleep beneath the soil. The chronicle remembers everything."*

**Tests: 73 checks.** The new proofs are the important ones: identical passings across copies (one death after reunion, never two), identical children across copies (one child, never twins), migrated minds identical, famine takes lives and chronicles them, dead emissaries cannot lead meetings.

## Design decision of the day

Courtship was first buried inside the "socialise" behaviour roll — unreliable and untestable. Redesigned: **encounters are their own pass** — whenever two kith's paths cross, trust grows, bonds form, and hearts do the rest, whatever each was busy doing. Better behaviour, better algebra, and it made the failing tests pass for the right reason.

## Next session (Day 6 — Voices)

The naming game: kith coin words for the things they attend to, vocabularies converge within worlds and diverge between them, dialects meet when worlds merge. Speech bubbles, the Lexicon panel, whisper-a-word.

## Time & credit note

Fifth session of an extraordinary day. All green, all pushed, verified live.
