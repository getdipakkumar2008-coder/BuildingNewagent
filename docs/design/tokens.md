# Design Tokens (original to DeepResearchAI)

Created from scratch for this project (clean-room policy). Palette idea: deep-sea teal with an amber accent — chosen to read as "research/depth" and to be visually distinct from other assistants. Implemented as CSS variables in `src/app/globals.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #f7f9fa | #0b1418 | page |
| `--surface` | #ffffff | #111d23 | cards, composer |
| `--surface-2` | #eef2f4 | #17272f | hover, code bg |
| `--border` | #d5dde1 | #243842 | dividers |
| `--text` | #11232b | #e6f0f3 | body |
| `--text-muted` | #4a5f69 | #9bb2bc | secondary |
| `--brand` | #0e7490 | #5eead4 | primary actions, links |
| `--accent` | #b45309 | #fbbf24 | highlights, citations |
| `--danger` | #b91c1c | #f87171 | errors |

Typography: system font stack (no webfonts to license). Radius 12 px. Focus ring: 2 px `--focus`, offset 2 px. Motion: disabled under `prefers-reduced-motion`.

Contrast: **not yet measured**. Contrast ratios (≥4.5:1 body text, ≥3:1 UI) must be verified with axe/manual check in M1; until then treat the values as unverified.

Logo: `public/logo.svg` — original geometric mark (magnifier ring + diamond), authored in this repo.
