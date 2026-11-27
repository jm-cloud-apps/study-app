// "Pick up where you left off" — the last lesson this browser opened.
//
// Deliberately device-local and separate from the synced progress snapshot:
// it's a convenience hint, not progress, and keeping it out of the
// /api/state payload means the server format doesn't change.

const KEY = 'studyforge.recent.v1'

export function rememberLesson(topicId, slug) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ topicId, slug, at: Date.now() }))
  } catch {
    /* private mode or storage full: the hint is optional */
  }
}

export function getRecentLesson() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v && typeof v.topicId === 'string' && typeof v.slug === 'string' ? v : null
  } catch {
    return null
  }
}
