// Theme (dark / light / follow the system).
//
// The palette lives entirely in CSS variables (src/index.css), so switching is
// one attribute on <html> — no component carries a `dark:` variant, which is
// the only reason a light theme was tractable across every page at once.
//
// Three states, not two: "system" is the default, so a learner who studies in
// the evening gets the dark theme without ever opening a menu. An explicit
// choice is remembered and always wins.

export const THEME_KEY = 'studyforge.theme.v1'
export const THEMES = ['system', 'light', 'dark']

export function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return THEMES.includes(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersLight() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
}

// Resolve "system" down to the theme actually being painted right now.
export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme
  return systemPrefersLight() ? 'light' : 'dark'
}

// Suppress transitions for one frame while swapping. Without this every
// element carrying a `transition` class animates its colours independently,
// so the page spends ~150ms half-dark and half-light — which reads as a
// rendering bug, not a fade.
export function applyTheme(theme) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.setAttribute('data-theme', resolveTheme(theme))
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-switching'))
  })
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'system'
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    /* storage unavailable — the theme still applies for this session */
  }
  applyTheme(next)
  return next
}

// Re-apply when the OS flips, but only while we're actually following it.
export function watchSystemTheme(onChange) {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia('(prefers-color-scheme: light)')
  const handler = () => {
    if (readTheme() === 'system') {
      applyTheme('system')
      onChange?.()
    }
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
