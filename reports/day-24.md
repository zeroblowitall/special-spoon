# Day 24 — 9 July 2026

## Expeditions beyond the edge — the killer feature

The roadmap called this the likely killer feature, and it earns the name. Now and then one of a world's own kith — a restless, bold, curious soul — **walks off the edge of the map** and is gone for days. It comes home **changed**: a relic from nowhere, a craft learned far away, a scar and a hard story — or it never returns, and is mourned. A whole small saga, generated from seeds, mergeable to the last word.

## What got built (v0.23.0 — 239 KB, 263/263 checks green)

**The mirror of the Wanderer.** Day 19 gave us strangers who arrive from the edge and leave. Day 24 inverts it: a *local* kith leaves, and returns. The hard part — and the reason it took the mind and goals of Days 22–23 first — is that this must stay **deterministic and mergeable** even though it changes a real, permanent member of the world.

- **When** a party sets out, and how long it's gone (three to eight days), derives from **world identity and time**, exactly like the weather.
- **Who** goes is chosen from **stable content only** — traits (curiosity + boldness + wanderlust), grown-not-young-not-old, standing (the emissary stays home to lead merges), and a check that they'll outlast the journey — never from a copy's fleeting mood or position. So every copy sends the *same soul* on the *same day*.
- **What** is found derives from the **expedition's own seed**: the place, the deed, and the outcome. Every copy tells the *same tale*.

**While away, they are off the map.** A new `presentKith` splits "on the map" from "of the folk": the travelling aren't fed, met, or drawn — but they're still counted, still in The Folk, still mourned if they fall. When they leave, the map quietly loses them; when they return, it finds them again.

**The homecoming, five ways.** At the appointed hour the seed decides: a **relic** carried back (*"a light-holding feather"*, *"a carved stone"*); a **craft learned** far away (*"came home having learned the craft of shelter"*); a **scar** and fewer words; a **seed** from a bloom that grows nowhere here, planted where they returned; or — about one in six — **lost**, never returned, mourned in the chronicle: *"It did not come home. The world keeps a place for it."* Restraint, not gore (Q2's gentle hand): the register stays elegiac.

**The story reads like a story.** Each journey is a sentence built from seeded fragments: *"Beyond the edge, Iriruiri found a canyon that sang in the wind, where it was carried a while by a great slow beast, and came home carrying a carved stone."* Ten places, eight deeds, a scatter of relics — enough that no two feel alike.

## Why the merge stays sacred
Kith merge whole, last-clock-wins. An expedition bumps the traveller's clock on departure and again on return, so the **more-travelled version always outranks the one still waiting** — a copy that never saw the journey catches up on it the moment two worlds meet, and the chronicle dedupes the telling by id (`xd…` out, `xr…` home). Relics, crafts, scars and foreign seeds are all deterministic content that reconciles by the existing laws. This is the roadmap's "merge-lite for a world's own kith" — robust, and proven in the suite.

## Verified three ways
1. **Node suite — 263 checks** incl. 12 new: the schedule is a pure function of world and time; one of the folk sets out; the traveller is off the map yet still of the folk; **the same soul goes in every copy**; it doesn't set out twice; it comes home (or is mourned) at its hour, told once; **changed the same way in every copy** (full content-equality); reunited copies hold one journey, not two.
2. **In-browser engine** — drove real worlds through whole journeys: departures, off-map counts, and every outcome including the mourned. Read the generated prose end to end — it's evocative and gentle.
3. **Live DOM** — a kith sent away vanishes from the map (17 → 16); The Folk shows it *"away beyond the edge — it went looking for what lies past the map"* with a dash where Visit would be; a returned traveller carries its relic and scar in its panel and reads as a *far-traveller* in the census. No console errors.

## Next session (Day 25, from ROADMAP.md)

**Jeopardy & the villain — now carrying Simon's realm-borne catastrophes** (pillar 11): realm-keyed deterministic disasters (tsunami, avalanche, eruption, quake, drought, flood, wildfire) with warning → strike → aftermath phases the mind reacts to, plus the 3-Body chaotic-seasons realm. Expeditions already give the world a way to *lose* someone to the unknown; Day 25 gives the ground itself teeth. It may split into Day 25 + 25b.

## Time & credit note

All green, all pushed. Give a world a restless soul and some time (`?warp=2000`) and watch someone walk off the edge — then wait to see who, or what, comes back.
