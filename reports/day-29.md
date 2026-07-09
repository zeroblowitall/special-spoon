# Day 29 — 9 July 2026

## The larger land map — and the root cause that was blocking it

The one I held back on Day 27b. This time it landed — not by forcing it past the tests, but by finding and fixing the real reason it was breaking them. The world is now built of real continents.

## What got built (v0.29.0 — 289 KB, 312/312 checks green)

**Real continents, not noise.** The terrain's three "octaves" were all generated at the *same* frequency — so the land read as uniform noise rather than land with structure. They're now true fractal octaves: **broad continents** (a coarse 3×2 lattice), **hills and bays** (7×4), and **fine coves** (15×8), summed with falling weight, at a **higher resolution** (160×74). The result — visible in the screenshot — is large, contiguous landmasses with big, organically-shaped lakes and bays, and plenty of room for the folk to spread and for villages to grow. Paired with Day 27's smooth coastlines and closer camera, the world finally reads as a *place*.

**The root cause, found and fixed.** On Day 27b this same change broke 7 tests, and I diagnosed it (correctly, in the end) as *"something about the global clock,"* reverted, and deferred. This time I chased it all the way down. It was subtler and more interesting: **`climateOf` derived each world's weather from `terrainStats`** — the actual fraction of water and high ground in its coastline. And several tests avoid storms by looping `world = newWorld()` until they draw a fair-weather world. So when the terrain reshaped, the weather changed, those loops discarded a *different number* of worlds, and the whole **id sequence drifted** — which is why a completely unrelated language test started failing (its kith got different ids, and two of its coined words happened to collide). Not a global-clock problem at all; a *weather-depends-on-coastline* problem.

The fix is a genuine improvement to the model: **weather is now unbound from the terrain shape.** Climate follows a world's **realm nature** (a sea realm is rainier and mistier; storms come from the world's own seed) rather than the precise heightmap. So the land can be reshaped — bigger, finer, anything — without a single storm shifting, and the merge and the tests stay rock-stable. This is why the larger map now drops in cleanly where before it cascaded. (I also made the one fragile language test collision-proof — it compared word *positions* by substring, which a prefix could fool.)

## Verified
1. **Node suite — 312 checks**, all green, incl. a new regression test: *the land forms real continents (a long unbroken run of ground)* — which would catch any slip back to flat noise. Every prior check still passes, unchanged.
2. **In-browser** — a screenshot confirms the new terrain: broad green continents, large smooth-shored lakes, foam coastlines. No console errors. (The existing world's coastline is reshaped, as expected — terrain is derived from world identity, never stored, so it re-generates in the new, better form.)

## A note for future terrain work
The lesson is recorded in the roadmap and the code: **weather must not depend on the terrain heightmap** (it now depends on realm + seed). With that decoupling in place, the terrain can be reshaped freely in future — this was the one hidden coupling that made terrain changes cascade through the deterministic id sequence.

## What's left (ROADMAP.md)
- **Rituals, myth & biographies; balance & a playtest** (the elegiac counterweight to the jeopardy trio).
- The **appropriate-to-land defence tree** (firebreaks, high-ground lore, palisades).
- Deeper **villages** (clearing-with-fire is in; visible commons + names are in; village *growth* and life could go further).

## Time & credit note

All green, all pushed. Open your world — the land is bigger and more of a place now, its lakes broad and its shores smooth. Same seed, same soul; a better country to live it in.
