# Day 27 — 9 July 2026

## World & villages — a smoother land, a closer eye, and names on the map

Simon liked the creatures but said the world itself "looks jagged and unfinished." This session is mostly a graphics pass on the land — and it makes the world look like a place, not a grid — plus a closer default camera and villages you can actually see.

## What got built (v0.26.0 — 275 KB, 290/290 checks green)

**The jagged coast is gone.** The land was painted by classifying each pixel into a biome using the terrain *grid cell* — so the colour stepped in hard ~8-pixel stairs at every cell edge, worst of all along the coastline. Now the land is coloured as a **smooth function of the (already-smoothed) height**: deep water melts up into the shallows, beach melts into meadow, meadow into rock, rock into peak — no hard edges anywhere. A **soft line of foam** is drawn right at the water's edge, so the coastline reads as a coast, not a staircase. The paint is rendered at higher resolution (1120×600) and the browser smooths it as it scales.

**A framing vignette** darkens the far corners a touch, giving the land depth and a finished, composed look.

**A closer eye.** The default camera now **fills the frame with the land** — close and immersive, a little sky and mostly world — instead of sitting back to show the whole map with margins. The creatures are bigger and the smoothed ground fills the view.

**Villages you can see.** Villages have existed since Day 16 (shelters ringing a hearth, a tribe living among them) but only as a line in the chronicle. Now, where a hearth has gathered a village, the map shows a **cleared commons** (a soft trodden patch of ground) and the **village's name** — the tribe's own word for it — floating above it. A world with a settled people now looks settled.

**None of this touches the world's truth.** Every change is presentation — the canvas paint, the camera, the labels. The simulation, the merge, and all determinism are exactly as they were; the 290 checks pass untouched.

## Verified
1. **Node suite — 290 checks**, unchanged and green (pure rendering changes).
2. **In-browser** — sampled the painted terrain down a column: the land now varies as a smooth gradient (meadow → rock blends over tens of pixels) with foam only at the true water's edge; the vignette and the higher-res image render; the camera frames closer (a tighter viewBox); a village draws its commons and its name ("Fenowe"). A screenshot confirms smooth, organic, foam-edged coastlines and a settled, painterly land. No console errors.

## Deferred (recorded in ROADMAP.md)
Kept out to stay shippable and to avoid destabilising the identity-derived terrain and the sim:
- **A genuinely larger land map** — more contiguous land, real room to spread. (Today's "bigger" is delivered as *closer* + *smoother*; enlarging the terrain itself is a Day 27b task because it changes every world's shape and the sim's assumptions.)
- **Clearing-with-fire → farmland** — a kith burns a patch to make ground for gardens. A new mechanic, next time.
- The **appropriate-to-land defence tree** (firebreaks, high-ground lore) still pending from the jeopardy sessions.

## Next session (Day 28, from ROADMAP.md)

**Rituals, myth & biographies; balance & a playtest.** Or Simon may want the deferred **larger map + clearing-with-fire** as a Day 27b, or **illness & disease** to finish the jeopardy trio. His steer decides.

## Time & credit note

All green, all pushed. Open your world — the coasts are smooth now, the eye sits closer, and if your folk have raised a village, you'll see its name on the ground.
