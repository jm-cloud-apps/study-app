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
- [ ] 2. **Longer Leitner spacing.** The top box comes back every 16 days; a language you want to keep for years needs steps beyond that (e.g. 30 and 60 days). Add boxes without demoting anyone's existing cards.
- [ ] 3. **"Due today" on Home.** Home doesn't say how many cards are waiting. Show a total and the topics with due cards, each linking to its review.
- [ ] 4. **Production cards, lessons 1–5.** Add English→Ilocano ("Say…") cards where these lessons only have recognition or grammar cards.
- [ ] 5. **Production cards, lessons 6–10.** Same, for the middle lessons.
- [ ] 6. **Production cards, lessons 11–14.** Same, for the last lessons.
- [ ] 7. **Dialogues, lessons 1–5.** A 4–6 line dialogue per lesson, built only from that lesson's (and earlier lessons') phrases.
- [ ] 8. **Dialogues, lessons 6–10.** Same.
- [ ] 9. **Dialogues, lessons 11–14.** Same.
- [ ] 10. **Cumulative review drills.** Speaking drills that mix lessons 1–4, 1–8 and 1–12, so recall isn't always cued by the lesson you just read.

## Done
