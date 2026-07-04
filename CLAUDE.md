# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Loop Engine is a local, deterministic CLI orchestrator that reads and inspects a small set of local projects declared in `projects.yaml` (Creatyss, lp-infra, n8n, and itself). It reports Git state, checks required docs, surfaces roadmap candidates, and prepares short context/prompt payloads — all without ever touching the projects it inspects.

**Core philosophy (non-negotiable, enforced throughout the codebase):**
- No automatic AI calls in V0/V1 — Loop Engine only prepares context for a human to paste into an assistant.
- No automatic commit, no automatic push.
- No modification of watched projects (Creatyss, lp-infra, n8n) — read-only.
- Zero token consumption by default.
- Local validations always come before any AI review.
- Human stays in control of decisions; the roadmap reader is deliberately naive/conservative rather than clever.

When adding a feature, do not silently violate any of the above — if a task seems to require it, flag it instead of implementing it.

## Commands

```bash
pnpm loop <command>       # run the CLI (tsx src/cli.ts)
pnpm run typecheck        # tsc --noEmit
pnpm run test             # tsx --test tests/**/*.test.ts
pnpm run validate         # typecheck + test (run this before considering work done)
```

Run a single test file directly: `pnpm exec tsx --test tests/intelligence/roadmap.test.ts`

CLI commands (see `src/cli.ts` for the full routing table): `help`, `summary [--json]`, `status`, `doctor`, `context <project> [--json]`, `validate <project>`, `review <project> [--json]`, `next <project> [--json]`, `prompt <project> [--json]`.

Loop Engine is self-hosted: it's declared in `projects.yaml` as project `loop-engine` (path `.`), so `pnpm loop context loop-engine`, `pnpm loop validate loop-engine`, etc. all work against this repo itself.

## Architecture

Layering is strict and one-directional: `cli.ts` → `commands/` → `intelligence/` → `core/`. Never skip a layer.

- **`src/cli.ts`** — routes argv to a command handler. Contains no business logic, no direct Git/doc/roadmap access. Just: read command → resolve project (if needed) → call the command.
- **`src/commands/`** — one file per user-facing command (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`, `prompt`, `help`). Each command loads a `ProjectSnapshot` and renders it (text or `--json`); it must not re-derive information that the snapshot already computes.
- **`src/intelligence/`** — the engine. `project-snapshot.ts` builds the central `ProjectSnapshot` (see `src/intelligence/snapshot.ts` for the type) by merging declarative config (`projects.yaml`) with computed state (Git, docs, roadmap). `roadmap.ts` is the roadmap reader (see below). **This is the single source of truth commands must consume — never have a command re-read Git/docs/roadmap directly.**
- **`src/core/`** — small, deterministic low-level primitives: `config.ts` (loads/parses `projects.yaml`), `git.ts` (shells out to `git`, always fails soft to `"unknown"`/`null`), `docs.ts` (file existence checks), `project.ts` (project lookup/arg parsing).
- **`src/ui/terminal.ts`** — the only place that formats terminal output; commands call `terminal.*` rather than inlining styling.

Before adding a new command: check whether the data already exists on `ProjectSnapshot`; if not, extend `intelligence/` rather than computing it ad hoc inside the command.

### Roadmap reader (`src/intelligence/roadmap.ts`)

Deterministic, keyword-based, intentionally naive — no NLP, no dependency resolution between lots.

- A line becomes a **candidate** if it matches patterns like `- [ ]`, `TODO`, `Prochain`, `Lot `, `H1-L`/`H2-L`/`H3-L`, `⏳`, etc. (`CANDIDATE_PATTERNS`).
- Each candidate gets a **status**: `todo` / `in_progress` (`⏳`, "en cours") / `done` (`- [x]`) / `unknown`.
- Each candidate gets a **kind** via keyword matching on the lowercased line:
  - `blocked`: `production finale`, `mise en production`, `paiement`, `migration`, `delete`, `supprimer`. Note `prod` alone is *not* blocking (avoids false positives on `produit`).
  - `warning`: `déploiement`/`deploiement`, `vps`, `dns`, `bascule`, `sécurité`/`securite`.
  - otherwise `safe`.
- `selectRoadmapCandidate` ignores `done` candidates, then prefers `safe` > `warning` > `blocked` (a `blocked`-only result should never be presented as a safe next micro-lot — the `next` command must make that distinction, not silently recommend it).

When adjusting keyword lists, favor precision (avoid blocking ordinary work) over recall, and keep any new pattern covered by a test in `tests/intelligence/roadmap.test.ts`.

## JSON output contract

`summary`, `context`, `next`, `prompt`, and `review` support `--json` for external consumers (scripts, OpenClaw, n8n, a future dashboard). Rules:

- Every JSON payload includes `schemaVersion: 1`.
- Never remove a field without bumping `schemaVersion`; prefer adding optional fields.
- Any new/changed JSON output must be covered in `tests/commands/json-output.test.ts`.
- JSON consumers are read-only by contract: they must never trigger a commit, push, deletion, or automatic AI call. See `docs/integrations/json-consumers.md` for consumer-specific usage (OpenClaw, n8n).

## Docs worth reading before structural changes

- `docs/architecture/commands.md` — layering rules for `cli.ts` / `commands/` / `core/` / `intelligence/` / `ui/`.
- `docs/architecture/project-intelligence.md` — `ProjectSnapshot` contract and roadmap candidate classification.
- `docs/architecture/roadmap-reader.md` — roadmap reader formats, states, and keyword refinement history.
- `docs/integrations/json-consumers.md` — JSON contract and per-consumer (OpenClaw/n8n) expectations.

## Working method

Work in small, reversible lots.

Before a significant change:
- read the relevant docs and source files;
- prefer an audit/design lot when architecture is unclear;
- avoid broad refactors unless explicitly requested.

For every code lot:
- keep the patch minimal;
- run `pnpm run validate`;
- list modified files;
- do not commit unless explicitly asked.
