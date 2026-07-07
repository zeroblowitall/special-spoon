# Day 9 — 7 July 2026 (a correction: it has been one extraordinary day + sessions 6–8 were mislabelled as 8 July; the calendar says otherwise)

## Kinds, song, and what a lost browser taught us

While the human playtest (PLAYTEST.md) runs its four-day course on Simon's side, the engine gained its two queued evolutions and one humbling lesson.

## What got built (v0.9.0 — 129 KB, 121/121 checks green)

**Kinds — speciation you can see.** A kith's *kind* is a pure function of its visible morphology (colour family × ear form: Ember Longear, Dusk Smoothbrow, eighteen possible kinds), identical in every copy of every world. Inheritance keeps children near their parents' kind; mutation eventually crosses a boundary — and the world greets it: *"A kith of a new kind: Novel, the first Dusk Smoothbrow this world has seen."* First-of-kind greetings fire on both birth paths (courtship and meeting-stone), with deterministic ids so drifted copies remember one arrival. Panels now read like field guides: *"a young Ember Longear kith."* This is the honest version of speciation for 20-creature worlds — visible variety with named moments — and it lays the rail for deeper genetic clustering when populations earn it.

**The second Discovery: Song.** Born only in storms: when kith shelter huddled together, a sufficiently patient and sociable one may begin to sing — *"In the middle of the storm, X began to sing — the first song this world has heard."* Singers show ♪ above their heads (their song has a *word*, coined in their own voice, spreadable like any word); a singing shelterer steadies every heart nearby — slower exhaustion, growing trust toward the singer — so storms, the game's harshest moments, become where its warmest bonds form. Song is teachable along friendships like seed-keeping (teaching texts now name the skill being taught).

**Long histories stay readable.** The Chronicle now opens folded to the latest 60 entries with *"Show all N entries — back to the world's first day"*. Nothing is ever deleted; principle 3 intact.

**The lesson: the test browser lost its memory.** Between sessions, the preview browser's localStorage was wiped — Waking Commons, Hidden Clearing, Mirrormere: gone (test-harness profile reset, not an app bug; all real proofs live in the Node suite, which is immune). But it demonstrated a genuine user risk, and the design already had the answer — **the file is the true save**. So the game now says it at the right moment: a world with real history that hasn't been preserved in a day gets one gentle nudge — *"Press Preserve — the file is the only copy that can never be lost"* — and the About page says it plainly: *a browser can lose its memory; a file cannot.*

Also corrected: reports 06–08 were dated 8 July; the calendar insists all of it happened on the 7th. One extraordinary day.

## Tests: 121

New proofs: kinds are banded and deterministic; the first of a kind is greeted, the second is not, with deterministic ids; song is born in storms, is chronicled, steadies hearts, and is sung aloud.

## Next session (Day 10)

Playtest findings, if Simon's first meeting has happened — their confusion becomes the bug list. Otherwise: Discovery #3 candidates (way-marking? gift-giving?), the merge UX polish pass (the meeting stone deserves a visible moment), and first thoughts on the mobile experience.

## Time & credit note

All green, all pushed. The worlds now have kinds to marvel at and songs against the dark.
