# Day 19 — 8 July 2026

## The Wanderer

The solo player's merge-lite, from the fun roadmap: every so often, a stranger walks out of the edge of the world.

## What got built (v0.18.0 — 198 KB, 200/200 checks green)

**The visit.** Roughly every other fortnight — you never know quite when — a wanderer arrives at the edge of the world and stays about a day. It is *foreign in every way*: a body-plan drawn without the realm's bias (a Finback may walk out of the Emberwaste's ash), a name in its own voice, **a tongue no one here taught it** — it arrives with *sure* words (strength 0.85) for home, sun, water, rain, wanting and gladness, so in chatter its dialect *wins exchanges and spreads* — plus its own word-order conviction, and, more often than not, **a craft** (seed-keeping, song, shelter, or hearth-keeping).

**The determinism, as always, is the soul.** Visits derive from world-identity and time, exactly like weather: `wandererDue(worldId, t)` — so **every copy of a world is visited by the same stranger at the same hour**, its identity, body and words seeded from the visit itself. Arrival and departure are chronicled with deterministic ids; reunions never hold two of it (proven).

**The stay.** While present it is a full citizen: it chats (spreading its words), bonds, contests, shelters — and yes, if it bonds fast and deep enough, it may even court: a child of the wanderer stays when the wanderer doesn't. It cannot be evicted by a crowded merge, and it wears a slow grey travelling ring; its panel says plainly: *"A wanderer — not of this world. It will walk on soon; whatever it carries goes with it, unless it is befriended."*

**The leaving.** At its appointed hour it walks on (the same moment in every copy). If anyone came to trust it: **it leaves a gift** — its craft taught to its most curious bonded friend (*"Before it left, it taught Vivimi the song."*), or, failing that, **a seed from elsewhere** planted where it last stood — a species this world's flora could never have grown. If nobody bothered: *"It left nothing but footprints and a few strange words."* Either way the strange words linger in whoever heard them — visits permanently enrich a world's language.

**A self-inflicted bruise, disclosed:** I corrupted the test file mid-session by editing it with a PowerShell one-liner (encoding mangled every curly quote and ♪); restored from git, re-applied properly, lesson re-learned — files get edited with the editor.

## Tests: 200 — deterministic schedule, quiet fortnights and busy ones, same-stranger-in-every-copy (content-identical), single arrival/departure chronicles, appointed-hour departure, the craft-gift to the befriended, footprints for the cold.

## Next session (Day 20)

The Almanac (self-filling pages), or Simon's next playtest findings — his call. The Play Store arc remains parked until the $25 account exists.

## Time & credit note

All green, all pushed. Keep half an eye on the edges of your world — and be kind to anyone you don't recognise.
