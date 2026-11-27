// Pull one "## Heading" section out of a lesson's Markdown, for the topic
// review sheet. Every lesson ends with "## Key takeaways" (CONTENT_GUIDE §3),
// so a topic's takeaways laid end to end are a ready-made one-page summary.

export function extractSection(markdown, heading = 'Key takeaways') {
  const lines = (markdown || '').split('\n')
  const want = heading.toLowerCase()
  let start = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    const m = line.match(/^##\s+(.+?)\s*$/)
    if (!m) continue
    if (start === -1) {
      if (m[1].toLowerCase() === want) start = i + 1
    } else {
      // The next H2 (or higher) ends the section.
      return lines.slice(start, i).join('\n').trim()
    }
  }
  return start === -1 ? '' : lines.slice(start).join('\n').trim()
}
