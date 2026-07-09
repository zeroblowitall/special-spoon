# Day 20 — 9 July 2026

## The Almanac

Goals as stories, never quests: a book whose pages are riddles until the world makes them true.

## What got built (v0.19.0 — 209 KB, 213/213 checks green)

**Twenty-one pages.** Each begins as a faded riddle — *"Put something into the ground yourself." "Wait for colour." "Two who chose each other." "Some pages take a lifetime." "Endure the lean season." "Be kind to those just passing through."* — and when the world makes one true, the page **writes itself**: dated, and naming what happened (*"✦ A seed by your hand · 9 Jul · the Shigrika"*). Pages cover the whole game: planting, blooming, naming, blessing, friendship, birth, a full life lived, tribes, a word on every tongue, a feeling put into words, all four crafts, the village, worlds met, hybrid blooms, a befriended wanderer, a weathered winter.

**Two pages are sealed.** Invisible — not even a riddle — until the day they happen, so the game's best surprise stays a surprise. But when any sealed page remains unwritten, the book confesses one thing: *"The book feels thicker than its pages."* Players will count nineteen, sense twenty-one, and wonder.

**The rules of the book:** a page fills once and **never unfills** (proven); each filling is announced with a toast (*"✦ The Almanac wrote a page…"*); and on a merge, **the earliest telling wins** — a page written in either copy stays written, dated to whichever copy lived it first (proven). The book lives at ✦ in the topbar.

**Design note:** everything is *derived detection* — the almanac tick simply reads the world each heartbeat and writes what it finds, so no game system needed modifying to know about pages, and future pages are one entry in a table.

## Tests: 213 — unique page ids, riddle-less sealed pages, fresh-world emptiness, self-writing on truth, announcement, once-only filling, name-notes, sealed-until-the-day, earliest-telling merge rule, no page lost to a merge.

## Next session (Day 21)

From the fun roadmap, in my order of conviction: **night & dreams** (kith sleeping in shelters at real night, murmuring remembered words), or **elders retelling the chronicle at hearths**. Or Simon's playtest findings, which outrank everything.

## Time & credit note

All green, all pushed. Open the book (✦) before you do anything else tonight — then try to fill a page on purpose.
