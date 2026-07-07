# 🌱 Driftgarden

**A living world in a single file. Copies drift apart. When they meet again, they merge.**

Driftgarden is a game genre that hasn't existed before: **play by diaspora.** Your garden lives *inside the HTML file itself* — no server, no account, no internet, ever. Give copies to people you know. Each copy grows differently on each machine: different plants, different names, different histories. And when two copies find each other again, drag one onto the other and the worlds **merge** — every plant and every line of history from both survives, and the meeting gives birth to a **hybrid species neither world could have grown alone**.

> 📥 **Play now:** download [`dist/driftgarden.html`](dist/driftgarden.html) (≈36 KB), open it in any browser. A world is born the moment you open it.

## How it works

1. **Tend.** Plant seeds. Water them. Name the ones you love. The garden grows in real time — even while the file sleeps.
2. **Preserve.** One button, and the game *rewrites itself* into a fresh file with your world embedded. That downloaded file **is** your world.
3. **Set it free.** Email it, USB-stick it, drop it in a family folder. Every copy starts drifting the moment it leaves you.
4. **Reunite.** Drag another Driftgarden file onto yours (or paste it). The worlds become one: union of every plant, both chronicles braided into a single history, lineage remembered forever — and a hybrid is born from the proudest plant of each side. *"From the meeting, a new species was born: the Clovebloom — child of Grandfather the Thistledrop and Old Marta the Frostcap."*

Merging is **lossless, deterministic, and repeatable**: both copies merging each other produce the identical world, nothing is ever overwritten or lost, and re-merging the same file is a harmless reunion, not a duplicate. Worlds only give birth the *first* time they meet.

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
| `engine/` | The whole game — vanilla JS/CSS/HTML, zero dependencies |
| `build.js` | The whole build system — one Node script |
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
