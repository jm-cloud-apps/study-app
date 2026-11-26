// Flashcard tags → the "Focus" filter on the flashcards setup screen.
//
// Every card can carry free-form `tags` (see content/CONTENT_GUIDE.md), and
// until now nothing read them. A deck that spans several exams or sub-areas —
// k8s-certs mixes CKA, CKAD and CKS; OpenShift mixes storage, networking and
// troubleshooting — is much more useful when you can study one slice of it.

// Tags on fewer cards than this aren't offered: a two-card "session" isn't
// worth a chip, and a long tail of one-off tags would bury the useful ones.
export const MIN_TAG_CARDS = 3
export const MAX_TAG_CHIPS = 12

/**
 * The tags worth offering as focus chips, most common first.
 * @returns {{ tag: string, count: number }[]}
 */
export function topTags(cards, { min = MIN_TAG_CARDS, max = MAX_TAG_CHIPS } = {}) {
  const counts = new Map()
  for (const card of cards || []) {
    // A card tagged twice with the same word still counts once.
    for (const tag of new Set(card.tags || [])) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts]
    // A tag on every card filters nothing, so it isn't a choice.
    .filter(([, count]) => count >= min && count < (cards?.length || 0))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag, count]) => ({ tag, count }))
}

/**
 * Cards carrying ANY of the selected tags. No selection means the whole deck.
 * OR rather than AND: picking "cka" and "ckad" should mean "both exams", not
 * "only the cards that happen to be tagged with both".
 */
export function filterByTags(cards, selected) {
  if (!selected || selected.length === 0) return cards
  const want = new Set(selected)
  return cards.filter((card) => (card.tags || []).some((tag) => want.has(tag)))
}
