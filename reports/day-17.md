# Day 17 — 8 July 2026

## The timewarp, the smooth light, and the year

Simon's three asks: a 1000× test accelerator, the banding lines fixed, and ten-plus ideas against boredom — with the deepest one implemented today.

## What got built (v0.17.0 — 188 KB, 186/186 checks green)

**The timewarp (a maker's tool, not a player's).** Append `?warp=1000` to the URL and the whole world — growth, weather, seasons, ageing, births, deaths, teaching, building — runs a thousand times faster, sub-stepped so behaviour stays sane (a ⚡×1000 badge shows while active; nothing persists; remove the parameter and time walks again). Possible in one session only because every clock in the engine already flows through one injectable source. Watched live: in under two real minutes, Sasaumam taught Elaelairi two crafts, Elaelairi raised its own lean-to, the weather cycled, and *summer settled over Evening Terrace*. Divergence testing is now a spectator sport. (Deliberately undocumented anywhere player-facing.)

**The banding, fixed.** The visible lines were relief shading sampled from raw grid cells — light striping at row boundaries. Shading and water depth now sample **smoothly interpolated heights** (biome *edges* stay cell-crisp, so the picture never disagrees with the simulation about what a place is), and the terrain canvas render resolution rose 40%. Hills now shade like hills.

**Seasons — the retention lever, shipped.** A season lasts a real week; a year is 28 days; every world on Earth turns together (a pure function of absolute time — nothing stored, merge-trivial). Spring quickens growth (×1.3) and leans the sky to rain; summer is long light; autumn mists; **winter is the lean season** (×0.5 growth, stormier skies, hungrier kith — shelters and hearths suddenly matter the way they should). Each turning is chronicled once per world: *"Winter closed around X. The lean season — blooms will be few, and the hearth matters."* The engineering heart: growing-hours **integrate exactly across season boundaries**, so copies of a world that sample at different moments still agree perfectly (proven: sampling-invariance test).

## The ten-plus ways to keep players returning (Simon's #3)

1. **Seasons** — shipped today; the world is different every week, and winter gives shelter/hearth/gardening their true purpose.
2. **The Wanderer** — a mysterious kith that visits a world for a single day, carrying words and skills from nowhere, then leaves: a built-in "merge-lite" for solo players. *(Highest-value next.)*
3. **The Almanac** — a book of blank pages ("a word every living kith speaks", "a kith that lived its full span", "your name, given") that fill themselves when they happen: goals as stories, not quests.
4. **Night & dreams** — kith sleep in shelters at real night, murmur remembered words in their sleep, dawn chorus; two different games per day.
5. **Elders tell stories** — chronicle events retold at hearths; unheard tales die with their tellers: a reason to keep elders warm.
6. **Auto-biographies** — panels that read like lives: "Vivimi, who survived the second winter, who coined 'omu', who bears a grudge against Tor."
7. **Place-names** — the player names lakes and hills; the names enter the kith lexicon as concepts *they then speak*.
8. **Gift-seeds** — export a single plant or word as a tiny string to send a friend: the low-commitment social loop below full merges.
9. **Blight & trouble** — a plant sickness that spreads and is cured by a new kith discovery ("tending"); protective purpose without violence.
10. **Era summaries** — every ~2 weeks the chronicle folds an age into a saga paragraph ("The Age of the Fefeno…"), shareable as text.
11. **Realm spectacles** — one signature rare event per realm: auroras over the Frostmere, geyser days in the Emberwaste, seed-jelly drifts in the Mistral.
12. **Real-calendar moments** — solstices and the world's own birthday, chronicled with a rare gift.

## Tests: 186 — seasons pure-of-time, year-in-order, sampling-invariance, winter-lean/spring-eager, turning-chronicled-once; plus one legacy test made realm-aware (it predated passability law).

## Next session (Day 18)

**The Wanderer**, unless Simon reorders. Then the Almanac.

## Time & credit note

All green, all pushed. Try `?warp=1000` on your Pages URL tonight and watch a year of your world pass before bed.
