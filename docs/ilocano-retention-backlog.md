# Ilocano retention backlog

The first backlog (`docs/ilocano-backlog.md`) filled gaps in the content. This one is
about **remembering** it: safe progress, longer spacing, a daily nudge, more
English→Ilocano recall, words in context, and mixed review. One item per PR,
top-down. Tick an item when its PR is merged.

**Accuracy rule:** no new Ilocano word or phrase unless it comes from Wikivoyage's
*Ilocano phrasebook*, Wikipedia's Ilocano pages or Wiktionary, or follows a pattern
the lessons already teach. Anything else goes under **Needs a native speaker** in
`docs/ilocano-backlog.md`. Dialogues and review drills recombine phrases the lessons
already teach; they don't introduce new ones.

**Card rule:** progress is keyed by a card's question text (item 1), so cards can go
anywhere in `flashcards.json`, but rewording a card's `q` resets its progress: reword
only to fix a mistake.

## Backlog

- [x] 1. **Stable flashcard ids.** Progress is keyed by array position (`ilocano:12`), so inserting a card moves every later card's progress onto the wrong card. Key it by the question text instead, and migrate existing progress once (every topic, local cache and server snapshot). Cards are now `<topic>:c:<hash of q>`; old positional keys move to the card at that position today, once, in the browser cache and the server snapshot. The validator now rejects duplicate questions. — PR #22
- [x] 2. **Longer Leitner spacing.** The top box comes back every 16 days; a language you want to keep for years needs steps beyond that (e.g. 30 and 60 days). Add boxes without demoting anyone's existing cards. Added box 6 (30 days) and box 7 (60 days); the server's clamp went from 5 to 7, or it would have quietly knocked them back to box 5. — PR #23
- [x] 3. **"Due today" on Home.** Home doesn't say how many cards are waiting. Show a total and the topics with due cards, each linking to its review. Home already had a "Due today" number, but it counted never-seen cards as due (1,065 on a fresh install), so the real reviews were invisible. Now: due = seen cards whose date has come, new cards are counted apart, Home lists the decks with reviews waiting, and a due session deals reviews before new cards (with a 25-card cap, a box-3 review used to sort behind every unseen card). — PR #24
- [x] 4. **Production cards, lessons 1–5.** Add English→Ilocano ("Say…") cards where these lessons only have recognition or grammar cards. Lesson 2 already had nine; added 16 for lessons 1, 3, 4 and 5 (1 + 4 + 5 + 6), each placed with its lesson's cards. Every phrase is quoted from the lesson; the one built sentence, *Dakkel ti aso ni Ben*, is lesson 4's own Check-yourself question made from *Dakkel ti balay* + *ti balay ni Ana*. — PR #25
- [x] 5. **Production cards, lessons 6–10.** Same, for the middle lessons. Added 20 (L6 3, L7 4, L8 3, L9 4, L10 6); lesson 10 had none. Every Ilocano phrase is quoted verbatim from the lessons (script-checked); no built sentences this round. — PR #26
- [ ] 6. **Production cards, lessons 11–14.** Same, for the last lessons.
- [ ] 7. **Dialogues, lessons 1–5.** A 4–6 line dialogue per lesson, built only from that lesson's (and earlier lessons') phrases.
- [ ] 8. **Dialogues, lessons 6–10.** Same.
- [ ] 9. **Dialogues, lessons 11–14.** Same.
- [ ] 10. **Cumulative review drills.** Speaking drills that mix lessons 1–4, 1–8 and 1–12, so recall isn't always cued by the lesson you just read.

## Done
