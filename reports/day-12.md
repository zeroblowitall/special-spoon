# Day 12 — 7 July 2026 (night session)

## The Great Diversification

Simon's ask, delivered: *"can literally millions of different types of creatures be possible from the start, then evolution takes place from there?"* Yes. Provably.

## What got built (v0.12.0 — 154 KB, 132/132 checks green)

**Shape is heritable now.** The single bunny body-plan became a **body-plan genome**: four torso forms (round, tall, long, pear), one or two segments, limbs (none / two / four — limbless gliders sit low and slide), five tails (none, nub, curl, plume, spike), fins, four crests (spikes, frill, fan), three snouts (soft, beak, muzzle), one to four eyes, five coat patterns (plain, belly, spots, stripes, mask). The test suite does the arithmetic as a check: **1,036,800 structural phenotypes before colour enters** (~373 million with it). Every gene crosses and *step-mutates* — a fin found, a tail lost, a third eye opened in a single generation — so evolution finally acts on bodies, not just colours. Elder kith keep "the elder body-plan" (deterministic defaults, identical in every copy).

**The lakes are open.** Fins make a swimmer: swimmers wander into shallows and deeps, glide faster in water than ashore, and are drawn half-sunk with a ripple at the waterline; walkers still stop at the shore. Merges respect bodies — a swimmer arriving in your world may settle *in your lake* (the test literally asserts "a swimmer may stay in deep water; a walker is settled ashore"). Panels say it plainly: "a swimmer: at home in the water."

**Kinds grew up with the bodies.** The most distinctive feature names the creature — Finback, Fancrest, Frillcrest, Spineback, Plumetail, Curltail, Spiketail, Trigaze, Manygaze, Oneeye, Strider, Glider, or the old ear-words — placed by colour family: *Dusk Finback, Ember Spineback, Moss Fancrest*. First-of-kind greetings work unchanged over the vastly larger kind-space.

**Seen live:** a staged Menagerie of fifteen kinds — a purple long-bodied Curltail, a one-eyed magenta pear with a beak, a tan glider lying low, a green Tuftear mid-sentence, and a teal Finback at the water's edge — every silhouette legibly different at a glance.

**Bugs the suite caught this session:** my own "millions" claim was arithmetically false at first build (279,936) — expanded gene ranges and renderer until it was honestly true; the old merge test wrongly beached swimmers; and chatter could talk over a singer's ♪ (singing now happens after all chatter, in the song pass — nothing talks over the song).

## Next session (Day 13 — Realms)

World-nature as identity: **Meadowrealm**, **Lakewild** (almost all water — the swimmers' kingdom), **Mistral** (floating islets over a cloud-sea), steering palette, terrain, flora and body-plan biases — so merges become first contact between natures.

## Time & credit note

All green, all pushed. Open a new world and meet body-plans no world has seen before.
