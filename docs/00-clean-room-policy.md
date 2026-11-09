# Clean-Room & Legal Policy (operational form of the master prompt guardrails)

## Rules
1. **Observe → describe in own words → implement independently.** Observation notes and implementation are separate steps, ideally separate commits.
2. **Never copy:** proprietary source, system prompts, CSS, icons, logos, fonts, copy text, brand identity.
3. **Allowed targets only:** (a) things the user owns, (b) open-source projects (Open WebUI, LibreChat — check each license before reading code; note GPL/AGPL/other-license implications — read for behavior, do not copy code), (c) public documentation of the Anthropic API, (d) behavior observable by an ordinary user.
4. **Forbidden:** bypassing auth/rate limits/ToS; calling or replicating private or undocumented endpoints; credential harvesting; capturing other users' data.
5. **Identity:** own name (DeepResearchAI), own logo, palette, typography, wording. No claim or implication of Anthropic affiliation. Footer/about text states it is independent. Model names appear only as factual API identifiers.
6. **Stop condition:** if a step would break 1–5, stop and tell the user.

## Checklist before any recon step (Phase 2)
- [ ] Target is owned / open source / public docs
- [ ] License recorded
- [ ] No auth bypass, no private endpoint
- [ ] Output goes into the evidence log in my own words, no pasted proprietary text

## Asset provenance register (maintained from M0)
Every logo, icon, font, illustration used by the app gets a row: asset, author/source, license. Icons: use a permissively licensed set (e.g. Lucide, ISC) and record it. Fonts: system stack or an OFL font.

## Note on the "claude.ai/new" reference
The prompt names claude.ai/new only as inspiration for *general chat-assistant patterns*. This project does **not** analyze claude.ai's private frontend or endpoints. Pattern knowledge comes from open-source chat UIs, public API docs and ordinary-user observation.
