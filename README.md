# 🌱 Driftgarden

**A living world in a single file. Copies drift apart. When they meet again, they merge.**

Driftgarden is a game genre that hasn't existed before: **play by diaspora.** Your garden lives *inside the HTML file itself* — no server, no account, no internet, ever. Give copies to people you know. Each copy grows differently on each machine: different plants, different names, different histories. And when two copies find each other again, drag one onto the other and the worlds **merge** — every plant and every line of history from both survives, and the meeting gives birth to a **hybrid species neither world could have grown alone**.

> 📥 **Play now:** download [`dist/driftgarden.html`](dist/driftgarden.html) (≈137 KB), open it in any browser. A world is born the moment you open it. *(On a phone, open the saved file with Chrome or Firefox — the built-in HTML viewer can't run JavaScript. Better yet, use the hosted copy below.)*
>
> 📱 **On a phone:** once GitHub Pages is enabled for this repo (Settings → Pages → deploy from `main`, folder `/docs`), the game lives at a plain URL — the same file, reachable anywhere, still offline-first after the first visit.
>
> 👥 **Playing with a friend?** Read [The First Meeting](PLAYTEST.md) — a guide to growing two worlds apart on purpose, and then letting them meet. Safety habit: *open files you made; merge files you receive.*
>
> 🔊 **Turn your sound on.** The world is synthesised live — wind, rain, thunder, the small voices of the kith, and, if you're lucky, a song in a storm. No audio files; the file sings for itself.

## How it works

1. **Know your land.** Every world is born with its own landscape, grown from its identity: lakes and shallows, sandy shores, fertile meadow, rocky ground, stony peaks. Some worlds are lakelands, some are dry. Plants only take root in soil and carry their native soil's vigour for life; kith won't walk into deep water. Your land is permanently, unmistakably *yours* — travellers who arrive in a merge settle onto it. The land also sets the **climate**: lake-worlds rain and mist, peak-worlds storm — and every copy of a world lives under the same skies, with each storm chronicled exactly once.
2. **Know your flora.** Every world is its own planet: it grows 4–6 alien plant archetypes in six body-forms (stalks, rosettes, puffs, crystal spires, tendrils, glowing pods), coloured its own way and named in the world's own tongue — one world grows *Vravriaka*, another *Ilousso*. Foreign flora arriving in a merge visibly transforms a world.
3. **Tend.** Plant seeds. Water them. Name the ones you love. The garden grows in real time — even while the file sleeps. Begin again whenever you wish: the ⌂ Worlds door lets you keep several worlds in one browser, start a fresh one (choose a name and a land temperament — Lakeland, Highlands, Plains, Drylands — or be surprised), or respectfully let a world go.
4. **Meet the kith.** Small beings live among your plants — and no two are built alike: **shape itself is heritable**. Body forms, segments, limbs (or none), tails, crests, snouts, one to four eyes, coat patterns — over a million distinct body-plans before colour even enters, all crossing and mutating, so evolution acts on *shape*. A fin can be found in a single generation — and **the finned swim**: the lakes are open to them. Every one is also born with a **mind of its own**: evolvable weights for curiosity, sociability, boldness, wanderlust, appetite and patience that shape everything it does. Kith learn which plants agree with them and remember it; they grow to trust the kith whose paths cross theirs, become fast friends, and — bonded, grown, and in fair weather — have children whose bodies *and temperaments* cross both parents. They shelter on high ground when storms roll in. And they do not live forever: each kith is born with its allotted days, grows old, and falls asleep beneath the soil, remembered in the chronicle and by everyone who merged with its world. Life goes on while the file sleeps — reopen it and the chronicle tells you who was born and who passed. A neglected world *can* fall silent; a tended one raises generations. Click any kith to meet it; give it a name it will carry across every world it ever reaches.
5. **Listen to them.** The kith are naming their world. Each coins words in its own voice for the things it meets — a plant it ate, the rain, the sun, home — and words spread from mouth to mouth when paths cross: agreement takes root, disagreement ends with the surer voice carrying. Every world converges on **a tongue of its own** (watch the small words above their heads; read the **Lexicon** for the dictionary, with each word's first speaker remembered). When worlds merge, dialects meet — and the chronicle keeps the moment of first hearing: *"In Waking Commons they call the rain 'fefe'; in Thistle Reach it is 'shava'. Both words live here now."* Once a day, you may **whisper** a word to your emissary and see if it spreads.
6. **Watch a society form.** Friendship clusters become **tribes**, named in their own tongue for their word for home — *"A tribe has formed. They call themselves the Fefeno."* Scarcity brings **strife, not gore**: hungry strangers contest a bloom, the bolder drives the other off, and the loser carries a grudge that only time and kindness heal. And ideas are *grown*, not scripted: a curious kith that loves a plant may discover **seed-keeping** — and begin gardening on its own, teaching friends, until the world feeds itself. Knowledge, grudges, tribes and kinship all travel with the kith through every merge.
7. **Bless an emissary.** Choose one kith as *yours* — your token in the world. When worlds merge, your emissary leads the meeting. And when you want the kith near, **click bare land to call softly** — the curious will come. Food is real now, too: grazing tires a bloom (it regrows over hours), so hunger comes in cycles, gardens matter, and a small garden cannot feed a large tribe.
8. **Preserve.** One button, and the game *rewrites itself* into a fresh file with your world embedded. That downloaded file **is** your world.
9. **Set it free.** Email it, USB-stick it, drop it in a family folder. Every copy starts drifting the moment it leaves you.
10. **Reunite.** Drag another Driftgarden file onto yours (or paste it). The worlds become one: every plant, every kith, both chronicles braided into a single history, lineage remembered forever. On a first meeting, the two emissaries meet at the meeting stone and **a child of both worlds is born** — and the proudest plants of each side cross into a new species. *"The emissaries Rutaruk and Queen Meloa met at the meeting stone. A child was born of the two worlds: Mifemir."*

Merging is **lossless, deterministic, and repeatable** — and that is not a slogan, it's a test suite (`node test.js`): both copies merging each other produce the identical world, nothing is ever overwritten or lost, and re-merging a known world is a quiet reunion, not a duplicate. Worlds only give birth the *first* time they meet.

## Why this matters beyond a game

Every shared digital world today depends on a server that will someday shut down. Driftgarden demonstrates **serverless togetherness**: a shared world whose "network" is human relationships and the physical movement of files. The pattern underneath — self-contained state, conflict-free merge, permanent lineage — is bigger than gardens. This repo is the friendly proof. Read the [MISSION](MISSION.md).

## Build it yourself

Requires only [Node.js](https://nodejs.org) — no packages:

```
node build.js
```

## Repository map

| Path | What it is |
|---|---|
| `dist/driftgarden.html` | **The product.** A seed file: a world is born when it's opened. |
| `engine/world.js` | All world truth: genomes, growth, kith, chronicle, the merge. Runs identically in the browser and in Node |
| `engine/app.js` | The interface: rendering, panels, heartbeats |
| `build.js` | The whole build system — one Node script |
| `test.js` | The merge proven as executable fact — determinism, no-loss, reunion |
| `MISSION.md` | What this project is and refuses to stop being |
| `reports/` | One-page diary of each working session |

## The rules the code lives by

1. **One file, forever** — works from `file://`, offline, zero dependencies.
2. **The merge is sacred** — never lossy, always deterministic.
3. **The chronicle never lies** — history is append-only and survives every merge.
4. **Drift is a feature** — there is no canonical world, only reunions.
5. **Charm over content** — plants sway; names matter.
6. **No telemetry, no accounts, no network calls. Ever.**

## Licence

[MIT](LICENSE). Copy it, remix it, give it away — that's the point.
