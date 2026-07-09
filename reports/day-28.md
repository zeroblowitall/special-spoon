# Day 28 — 9 July 2026

## Illness & disease — a sickness among the folk

The third face of jeopardy, after the predator at the edge and the world's own catastrophes: a sickness that rises from within and runs through the folk along the ties that bind them. It's the darkest kind of danger because it travels on the very thing that makes a village a village — closeness.

## What got built (v0.28.0 — 289 KB, 311/311 checks green)

**A plague spreads along the bonds, not by chance.** Now and then a sickness breaks out in a peopled world — a shivering fever, the grey cough, a wasting, the heavy sleep — seeded from world identity and time like the weather. It does **not** travel by who-happens-to-be-standing-near-whom (that would drift between copies); it travels along the **bond graph** — you take it from your friends and your kin, the people you're closest to. Every infection has a **seeded incubation** and a **seeded course**, so every copy of a world suffers the same outbreak, the same spread, the same losses, at the same hours — and reunited worlds grieve exactly once.

**It runs a real course.** The first to take it is chosen from stable content (the least hardy, deterministically). Over days it spreads to bonded kin; each sick kith, after its own seeded span, either **recovers — and is then immune, and will never take that sickness again** — or is **lost to it**. While sick, a kith goes **pale and grey**, tires fast, drags its feet, keeps to itself, and does not court or set out on expeditions — its whole intention becomes *"unwell — low and slow."* When no one is left sick, the sickness **passes out of the world**, and the chronicle says so.

**And the folk learn to heal.** When a sickness comes, a caring, patient soul learns the **tending** — which leaves bring a fever down, how to sit with the sick through the long nights — and teaches the others. A sick kith with a living, well friend who knows the tending is **far likelier to live**. Proven in the suite: a tended world loses fewer to the same outbreak than a bare one. The tending spreads by teaching, like every craft, and joins the warding as the folk's growing defence against the dark.

**You can see it.** A fever-mark of three faint, wavering heat-lines hangs over the sick; their colour drains toward grey; the topbar quietly notes *"a sickness is among the folk"* (no alarm — illness is a slow dread, not a wave you flee); the panel and census read *"unwell with the grey cough,"* mark the healers, and remember those who *"weathered a sickness, and carry its memory in the blood."*

## Why the merge stays sacred
`k.sick` and `k.hadPlague` (immunity) are content and merge by the clock. But nothing about the spread is random-in-the-moment: contagion, incubation, course, and fate are all **pure functions of the plague's id, the kith's id, and the trust between them**. Two copies with the same bonds compute the same epidemic. Deaths use deterministic timing like every other passing, and each is chronicled with a deterministic id. It's the same discipline as the predator and the catastrophe, applied to a graph instead of a clock.

## Verified three ways
1. **Node suite — 311 checks** incl. 13 new: the outbreak is a pure function of world and time; it breaks out with one patient, chronicled once; **the same soul takes it first in every copy**; it spreads to more than its first; some recover and are immune; **the immune are never taken by that same sickness again**; the passing is chronicled once; **the same souls are lost in every copy**; **a tended world loses fewer than a bare one**; reunited copies hold one telling; and **with no bonds, a sickness cannot spread**.
2. **In-browser** — a real, unscripted outbreak: the world's own scheduled "grey cough" broke out during catch-up and spread along the bonds to 7 of 15 folk. The sick render pale with wavering fever-marks; the panel reads "unwell with the grey cough" and names a healer; the topbar notes the sickness. No console errors.
3. **A screenshot** confirms the pale, fever-marked sick on the smooth land.

## Jeopardy is complete (predators + catastrophe + plague)
With illness shipped, the three threats the mind and goals of Days 22–23 were built to face are all in: **the beast at the edge, the world's own turning, and the sickness within.** Each has its own invented defence (the **warding**, high-ground/shelter, and the **tending**).

## Next session (Day 28+, from ROADMAP.md)

**Rituals, myth & biographies; balance & a playtest** — the elegiac counterweight to all this danger — or the deferred **larger land map** (with a test-hardening pass first), or the **appropriate-to-land defence tree**. Simon's steer decides.

## Time & credit note

All green, all pushed. Open a peopled world and wait — or `?warp=3000`. If a sickness comes, watch it move friend to friend; teach one of them the tending, and more of them will see it through.
