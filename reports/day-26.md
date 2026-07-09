# Day 26 — 9 July 2026

## Realm-borne catastrophe — the world itself as antagonist

Simon's idea, and the second face of jeopardy: some countries can turn on the folk all at once. The sea gathers and comes ashore; the fire-mountain wakes; the dry grass catches and runs; the peak lets go its snow; the ground itself heaves. Each realm has its own, and each unfolds in three acts — a **warning** the folk read and flee, a **strike**, and an **aftermath**.

## What got built (v0.25.0 — 272 KB, 290/290 checks green)

**Six catastrophes, keyed to their country.** **Tsunami** (coralshelf/lakewild), **flood** (meadow/lakewild/duskmoor/fungal), **wildfire** (meadow/duskmoor/saltflats — dry country), **eruption** (ember), **avalanche** (frostmere/mistral peaks), **earthquake** (glasswold/mistral/fungal/saltflats). Which one a world faces, and when, derives from world identity and time exactly like the weather — so every copy of a world suffers the same calamity at the same hour.

**Three acts.** A **warning** is chronicled and sounded (*"Far out, the sea is drawing back from the shore — further than the sea should. Something is coming."*), and the folk **drop everything and run for high ground** — a real thing to watch, legible as intention (*"fleeing for high ground"*). The **strike** takes its toll. The **aftermath** is written, and it isn't all grief: *"The fire burned itself out. Black ground now — but under the ash the soil lies rich for what comes next."*

**Who is lost — deterministic, and merge-sacred.** The hard part again: a catastrophe kills *several* of a real world's folk. WHO is chosen from **stable content alone** — the young, the old, the timid, the un-defended — never from a copy's live positions. So every copy grieves the same souls at the same hour, and reunited worlds grieve once. A calamity comes only to a **peopled** world (four or more), a quarter pass as **near-misses** that take no one, and the toll is bounded so a world is never wiped.

**Defences that actually save.** The toll is the *most* it can take — and the **right defence gives a real chance to live**, reducing the loss rather than merely shifting it. A **swimmer rides out the water**; the **sheltered outlast the fire and the snow**; the bold react fast; the young are slower. Verified: a flood takes far fewer of the finned than the footed.

**Wildfire clears and renews.** At the strike, about half the growth **burns to the ground** — and grows back from the ash (deterministic, merging by the plant clock). The country is scorched, then green again.

**You can see it all.** Full-scene overlays per calamity: a climbing **wave** with a moving crest, a line of licking **flame** and smoke, falling **ash**, driving **snow**, and for the quake the whole frame **shakes**. A pulsing **⚠ alarm** in the topbar names the coming danger and turns to *"run!"* at the strike. A kith lost to the world reads its end in its panel (*"was taken by the sea when the great wave came"*, *"lies under the snow the mountain let go"*).

## Verified three ways
1. **Node suite — 290 checks** incl. 14 new: the calamity is a pure function of world and time; it unfolds warning → strike → aftermath; the warning, strike, and aftermath are each chronicled once; the strike takes a bounded toll from content; **the same souls are lost in every copy**; one calamity, one strike; **reunited copies grieve once**; and **a drowning takes fewer of the finned than the footed**.
2. **In-browser render** — forced each phase live: the fire overlay paints with 24 animated flames and a strike vignette; the topbar alarm reads *"⚠ a wildfire — run!"*; the svg carries `cata-fire cata-strike`. No console errors.
3. **In-browser engine** — drove a wildfire through all three acts and read the prose live: warning, *"…Ketata and (another) could not outrun it."* (2 lost), and the ashen-but-hopeful aftermath. Exact parity with Node.

## Still to come under Jeopardy (roadmapped)
- **Illness & disease** (Simon's ask): contagion along the bond graph + a tending/herb-lore cure.
- **The appropriate-to-enemy / appropriate-to-land defence tree**: high-ground lore, firebreaks, watch-fires — invented under their own pressure (today catastrophes lean on existing defences: swimming, shelter).
- **The 3-Body chaotic-seasons realm.**
- **Social darkness:** feuds, a kith who turns, the village's response.

## Next session (Day 27, from ROADMAP.md)

Either **illness & disease** (to complete the trio of predators + catastrophe + plague) or **World & villages** (bigger map, closer zoom, clearing-with-fire, 1–2 villages). Simon's steer decides.

## Time & credit note

All green, all pushed. Open a peopled world and wait — or `?warp=3000`. When the alarm sounds, watch the folk run for the high ground; teach them to swim, and build them shelter, and more of them will see the morning.
