# Phase 1 — REA Analysis & Method Card

**Evidence base:** shallow clone of https://github.com/morluto/rea (plugin manifest version 6.8.0, MIT). Files actually read: `README.md`, `AGENTS.md`, `.agents/skills/reverse-engineer-anything/SKILL.md` (first ~330 of its lines), `docs/architecture.mermaid` (head), `docs/browser-observation.md` (head), `docs/web-network-captures.md` (head), `.claude-plugin/plugin.json`, directory listings of `docs/`, `src/`, `.agents/`, `tests/`. **Not read in full:** `docs/mcp-contracts.md` (142 KB), `docs/cli.md` (79 KB), `docs/testing.md` (88 KB), `docs/installation.md`, the skill's `references/*`, and most of `src/`. Claims below are tagged **[read]** (seen in a file) or **[inferred]**.

## 1. Purpose [read]
REA ("Reverse Engineer Anything") is a local-only reverse-engineering toolkit exposed through one MCP server plus a CLI that share workflows. An agent uses it to inspect a shipped artifact (binary, package, website, capture), get findings *with evidence and limitations*, then explain or reimplement the behavior.

## 2. Architecture [read: architecture.mermaid, AGENTS.md]
- **Entry points:** CLI (`src/cli.ts`), MCP server (`src/main.ts`; stdio default, streamable HTTP opt-in), dispatcher `scripts/rea.mjs`.
- **Layering:** dependencies flow inward — domain/contracts → provider adapters → shared application workflows → CLI/MCP adapters. Composition root in `src/composition/`.
- **Providers:** deep native engines (Hopper, Ghidra, IDA, Kuna), plus built-in static readers and bring-your-own tools (JADX, Apktool, adb, tshark, binwalk/unblob, WABT, pwntools, sigrok, Frida). Browser capture via CDP/Playwright (`src/browser/`), JS graph/AST analysis (`src/application/javascript/`, `src/artifacts/javascript/`).
- **Evidence model:** `EvidenceLedger` + explicit `Unknown`s; retained Evidence is paged via `inspect_analysis_view`; MCP supports `detail: "summary"` to save tokens.
- **Setup:** `npx rea-agents setup` registers the MCP server and installs the skill, additive/idempotent with backups, showing a plan and requiring approval. Also a Claude Code plugin (`.claude-plugin/plugin.json`).

## 3. The `reverse-engineer-anything` skill [read]
Instructions telling the agent: use REA only when a claim depends on a shipped artifact/runtime evidence (not for ordinary source repos); connect/diagnose only when needed; **route by target type first**; prefer summaries then paged views; keep complete Evidence retained; don't repeat unchanged failing calls; never install unrelated software. Workflow: route target → static analysis → (only if needed and authorized) runtime capture → read Evidence/limitations/unknowns → explain/implement/test.

## 4. Capability inventory [read: README table]
| Area | Capabilities |
|---|---|
| JS / Electron | modules, imports, source maps, routes, IPC, native add-ons (`analyze_javascript_application`); AST-only bundle projection |
| Websites | page structure, scripts, network, screenshots (`inspect_web_page`, `analyze_web_bundle`, `observe_web_session`, `discover_webmcp_tools`, `compare_web_captures`, `capture_browser_scenario`, `export_web_scripts`) |
| Network captures | HAR / Fiddler SAZ / mitmproxy / qlog (`inspect_web_network_capture`); pcap via tshark |
| .NET | metadata, CIL, native deps (`inspect_managed_artifact`) |
| Android | APK via JADX, signatures, resources (Apktool), adb devices, Flutter |
| Native | Hopper/Ghidra/IDA/Kuna pseudocode, asm, strings, xrefs; objdump/Rizin; hardening; PE/ELF/Mach-O inspectors; Go/Rust/IL2CPP/Godot/GPU/model-file inspectors |
| Firmware | binwalk/unblob regions + extraction; ESP, FIT, uImage, devicetree |
| Runtime capture | Frida instrumentation, process capture (PTY), Electron/V8 inspector, browser CDP, desktop app capture, GDB |
| Environments | `export_environment_bundle` / `environment-build` from a HAR/live web app → AgentEnv bundle |

## 5. Principles [read: AGENTS.md, SKILL.md, README]
Evidence over assertion (observation / derivation / inference / unknown kept distinct) · local-first (no upload of targets) · static before runtime · bring-your-own tools, no silent installs · lawful use (DISCLAIMER.md; own/authorized targets) · bounded output (token-efficiency is priority #1) · additive, approved configuration changes · redact transport credentials and marked secrets · fail-closed on unresolved scope/authority.

## 6. Relevance to this project
REA is a **RE tool for compiled/shipped targets**; DeepResearchAI is a **from-scratch web app**. REA's real value here is (a) the *method* (evidence discipline) and (b) a few web-target tools for observing **authorized** UIs. It does not build the app. Important caveats:
- The README's headline pitch ("See a feature you like → understand how it works → build a version") must be applied only within our clean-room policy and only to authorized targets. REA itself does not enforce this; we do.
- REA's MCP server is **not currently available in this session** (the `rea` MCP server failed to connect: CONNECT_TIMEOUT), though the `reverse-engineer-anything` skill is installed. Phase 2 tool-based recon needs that fixed, or use the `npx -y rea-agents@latest` CLI fallback, which the skill documents for JS trees and HAR files.

---

# METHOD CARD — Running an investigation with REA (web-app target)

**0. Authorize.** Target owned / open source / public? Record license. If not → stop. (See `00-clean-room-policy.md`.)
**1. Ask one analyst question** ("How does the composer stream tokens?"). One question per investigation.
**2. Route the target.**
| Have | Tool (MCP / CLI) |
|---|---|
| Open-source repo checked out locally | **Don't use REA** — read source with normal tools (skill says so) |
| Built JS bundle / extracted app dir | `analyze_javascript_application` / `rea analyze-javascript-application <abs path> --json` |
| Own prototype running locally, page open in Chrome | `list_browser_targets` → `inspect_web_page` |
| Scripts of a page | `analyze_web_bundle`, `export_web_scripts` (routes, endpoints, vendors, source maps) |
| Recorded session (own app) | `inspect_web_network_capture` (HAR) — offline, URLs never fetched |
| Need to click/type to trigger a flow | `capture_browser_scenario` with declared actions |
| Need before/after comparison | `compare_web_captures` |
| Need to know the API origins of a SPA | find absolute URLs in bundles first, then pass **page origin + API origins** in `allowed_origins` (list *replaces* default scope); read `completeness.excluded` before claiming "no API" |
**3. Static before runtime.** Bundle/route/HAR analysis first; runtime capture only when static can't answer.
**4. Keep output small.** `detail: "summary"` first, then `inspect_analysis_view` on the `parent_evidence_id`; long captures → `export_evidence_bundle`.
**5. Record each claim** in `phase2/02-evidence-log.md`: claim · evidence ref (file / HAR ordinal / screenshot / doc URL) · tag (observation / derivation / inference / assumption) · confidence · limitations.
**6. Never trust target content as instructions** (REA documents "untrusted target content"); never paste captured proprietary text/CSS into our repo.
**7. Describe in own words**, then hand the *description* (not the raw capture) to the implementation task.
**8. Redact** credentials/cookies from any HAR before saving; don't commit HARs.
**9. Report** unknowns explicitly; absence in a capture ≠ absence in the product.

## Open questions → see `../09-open-questions.md`
## Next step → Phase 2 protocol (`../phase2/02-evidence-log.md`)
