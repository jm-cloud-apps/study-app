import { useEffect, useState } from 'react'
import { readTheme, setTheme, watchSystemTheme } from '../lib/theme.js'

// A three-way segmented control rather than a single sun/moon button, because
// "follow my system" is a real preference and a two-state toggle silently
// throws it away the first time you tap it.
const OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'system', label: 'System', icon: '💻' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
]

export default function ThemeToggle() {
  const [theme, setLocal] = useState(readTheme)

  // Keep following the OS while the choice is "system".
  useEffect(() => watchSystemTheme(() => setLocal(readTheme())), [])

  const choose = (value) => setLocal(setTheme(value))

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-full border border-line/10 bg-fill/5 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            title={`${opt.label} theme`}
            onClick={() => choose(opt.value)}
            className={`grid h-7 w-7 place-items-center rounded-full text-xs transition ${
              active ? 'bg-fill/10 shadow-sm' : 'opacity-50 hover:opacity-100'
            }`}
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="sr-only">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
