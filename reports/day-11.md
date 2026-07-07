# Day 11 — 7 July 2026 (late session)

## The camera, and the painted world

Simon's playtest surfaced a real bug (fullscreen cut the scene off top and bottom) and a fair judgement (the world looked flat). Both fixed — and his realm ideas are now the committed arc.

## What got built (v0.11.0 — 145 KB, 122/122 checks green)

**A real camera.** The old fixed viewport cropped whatever didn't fit; now the viewBox is computed to match the window's aspect exactly, so nothing is ever silently cut off. Mouse-wheel zooms toward the cursor; drag pans (with a clean tap still being the beckon — a 7-pixel threshold separates them); two fingers pinch on phones; +/−/⌖ buttons sit bottom-left; the default framing always shows the whole of the land whatever the window shape, and recomputes on resize. The backdrop extends far beyond the scene so a zoomed-out camera never finds the void. Verified live: aspect-matched viewBox, ground fully visible, zoom/reset/wheel/drag/tap all behaving.

**The land gained its third dimension** — the 2.5D promise: **relief lighting** (slopes facing the light glow, slopes falling away shade — computed per pixel from the height field), **depth-shaded water** (darker with depth, greener in the shallows), **per-biome texture** (meadow tufts, shore ripples, rock speckle), **horizon haze** that makes distance read as distance, and a soft vignette pulling the eye in. Same painterly style, twice the depth. Screenshot of the evening light on Mossy Bank says it better than this paragraph.

**Answers of record (Simon's questions):**
1. *Buildings/villages* — structures will be world-content placed by discoveries (lean-tos, hearths, way-stones), drawn procedurally in this same style; villages emerge where tribes live, because structures follow friendship geography. Society II arc.
2. *True 3D* — deliberate no (WebGL rewrite, charm risk); 2.5D relief + depth cues shipped instead; isometric projection of the same world-data is the future option if wanted.
3. *Phones via Pages* — working, confirmed by Simon.
4. *Zoom/scaling* — shipped, as above.
5. *Realms* — committed: world-nature derived from identity (Meadowrealm / Lakewild / **Mistral**, the gas-giant sky-world of floating islets, and stranger), steering palette, terrain, flora and body-plan biases — making merges first contact between natures. Lands after body-plans.

## Revised arc

Day 12: **The Great Diversification** — procedural body-plans (segments, limbs, fins, tails, crests; millions of forms; evolution acts on shape; kinds generalise). Day 13: **Realms**. Day 14: proto-sentences. Day 15: speaking to the gardener. Then the Play Store.

## Time & credit note

All green, all pushed. Zoom out once — the whole land in one view is worth seeing.
