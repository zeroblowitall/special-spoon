# Day 14 — 8 July 2026

## Voices II: proto-sentences

The kith crossed the line from words to **language**: they now combine what they know into two-slot utterances — a feeling and a thing — and the *order* of those slots is itself a convention each world settles for itself.

## What got built (v0.14.0 — 171 KB, 159/159 checks green)

**Intents.** Four inner states became speakable concepts — *wanting, fear, gladness, friendship* — coined in each speaker's own voice like any word, spread by the same naming game, shown in the Lexicon with their first speakers.

**Sentences from real state, not scripts.** When kith chat, the feeling is the speaker's own truth of the moment: a hungry speaker *wants* ("mark:want" + the nearest plant's word, or water); in a storm they speak *fear* of it; beside a bonded friend, *friendship* + the friend's own name; otherwise *gladness* about whatever is near. Proven in the suite: "a hungry speaker speaks its wanting."

**Grammar as a convention.** Every kith is born with an instinct (deterministic from its identity): feeling-first or thing-first. The instinct converges into a world-wide convention through exchange — the surer grammar carries — and the Lexicon now declares it with a living example: watched live in The Bright Shallows: *"The grammar of this world: the feeling comes first, then the thing — they say 'kenoke kenonor'"* (gladness-home: *I love this world*). Overheard on the field: *kenoke iriirife* (glad-water), *kenoke elairi* (glad-Shiazlaum) — a feeling-first tongue in action, decodable only through the Lexicon. Grammar is never evicted from a crowded vocabulary and travels with the kith through every merge.

**Two grammars under one sky.** When merging worlds order their words differently, the chronicle keeps the moment, with deterministic ids, identical on both sides: *"In A the feeling comes first when they speak; in B, the thing itself. Two ways of speaking now share one world."* Kindred grammars pass without remark (tested).

**Under the hood:** the naming-game core was factored into `exchangeWord` (one step of the game over any concept), with `speakBetween` (single words), `speakSentence` (ordered pairs), and `worldOrder` (the world's grammatical lean) built on it.

## Tests: 159 — instinct determinism, two-word composition from the speaker's own words, order obeying the speaker's convention, grammar convergence, eviction-immunity, hunger speaking, and the grammar-clash chronicle identical across both sides.

## Next session (Day 15 — Speaking to the Gardener)

The wall breaks, on the kith's terms: they will address *you* — in their own tongue, from their real needs — at the beckon-ripple. "*tapo?*" from a hungry kith is a request you can only understand if you've read your Lexicon. Answering (planting what was asked, whispering back) builds their trust in the unseen gardener.

## Time & credit note

All green, all pushed. Stand your kith together and eavesdrop — then open the Lexicon and translate what you overheard.
