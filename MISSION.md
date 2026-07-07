# The Mission

## One sentence

**Driftgarden is the first game where separated copies of a world grow apart and then merge back together — a living world that spreads from person to person as a single file, carrying the history of everyone who ever tended it.**

## The idea nobody has built

Every game ever made treats a save file as *yours*: it sits on your disk or in a company's cloud, it belongs to one player, and two saves of the same game have nothing to say to each other.

Driftgarden inverts this. Here, **the file is the organism**:

- The game is one self-contained HTML file. The world lives *inside the file itself* — when you preserve your garden, the game rewrites itself into a fresh copy with your world embedded.
- Give a copy to a friend. On their machine it **drifts**: their plants, their names, their history. Two copies of the same world become two different worlds.
- When two copies meet again — drag one file onto the other — they **merge**. Nothing is lost: every plant from both gardens, both chronicles interleaved into one history. And the meeting itself creates life: a **hybrid species is born from the merge** that neither garden could have grown alone.
- Every world remembers its **lineage**. A file that has been emailed, copied to USB sticks, and merged across a family or a classroom for years accumulates a deep, braided history of everyone who touched it.

There is no multiplayer server. There are no accounts. The social layer of this game is *human relationships and the physical movement of files* — play by diaspora.

## Why it matters

- It proves a new shape of software: **serverless togetherness.** Shared digital worlds today die when their servers die. A Driftgarden world literally cannot be shut down, and it is shared not through infrastructure but through trust — you hand your world to people you know.
- It creates a new kind of artifact: a file that is part game, part garden, part guestbook, part family history — something worth keeping for decades and passing on.
- The underlying pattern (self-contained state + conflict-free merge + lineage) is bigger than a game. Driftgarden is the friendly, joyful proof-of-concept.

## Principles

1. **One file, forever.** The shipped artifact is a single HTML file that works from `file://`, offline, with zero dependencies, run-time or build-time.
2. **The merge is sacred.** Merging two worlds may never lose a plant, a name, or a chronicle entry. Merge must be deterministic: both copies merging each other produce the same world.
3. **The chronicle never lies.** History is append-only. Every planting, naming, meeting, and merge is recorded and survives every merge.
4. **Drift is a feature.** Copies are *supposed* to diverge. There is no "canonical" world, no conflict to resolve — only reunion.
5. **Charm over content.** A small world that feels alive beats a big world that feels like a database. Plants sway. Names matter.
6. **The learner owns everything** — carried over from this project's ancestor: no telemetry, no accounts, no network calls. Ever.

## The long game

- **Phase 1 — The living file** (now): a garden that grows in real time, self-saving file, chronicle, and the first working world-merge with hybrid birth.
- **Phase 2 — Deeper life:** creatures, seasons, plant breeding, genetics with visible inheritance.
- **Phase 3 — The social fabric:** gardener identities, gift-seeds (export one plant to a friend without a full merge), world family trees rendered visually.
- **Phase 4 — Beyond the garden:** document the merge pattern so others can build mergeable worlds of their own.

*This file is the fixed star. Daily work may change tactics; it may not drift from this mission. (The mission is the one thing that doesn't drift.)*
