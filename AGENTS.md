# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Objectif final

Voir `docs/architecture/final-objective.md`.

Cette page constitue la source de vérité du produit et définit l'objectif final de Loop Engine.

Codex doit s’y référer avant toute évolution structurante.

## What this is

Loop Engine is a local, deterministic CLI orchestrator that reads and inspects a small set of local projects declared in `projects.yaml` (Creatyss, lp-infra, n8n, and itself). It reports Git state, checks required docs, surfaces roadmap candidates, and prepares short context/prompt payloads — all without ever touching the projects it inspects. It now also covers:

- project piloting (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`);
- context and handoff generation (`context`, `handoff`, `prompt`) for pasting into an assistant;
- a local RAG index and search (`rag-index`, `rag-search`);
- an executable Audit Engine with human and JSON reports, profiles, and a strict CI mode (`audit`);
- human-readable and JSON reports across the CLI (`--json` on most commands).

Loop Engine now also targets autonomous orchestration by small lots — see `docs/architecture/autonomous-loop-runner.md` for the LoopRunner architecture (planning → executing → validating → repairing → completed/blocked/failed/cancelled, and the `plan`/`execute`/`commit`/`publish` modes). As of V7.2, `pnpm loop run <project>` implements only the `plan` mode (default mode): it plans a cycle via `runLoopPlan` (`src/loop/runner.ts`) without calling any agent, without modifying the worktree, and without committing or pushing. `execute`, `commit`, and `publish` are rejected explicitly and remain for later lots.

**Core philosophy (non-negotiable, enforced throughout the codebase):**
- No automatic AI calls by default — Loop Engine only prepares context for a human to paste into an assistant.
- No automatic commit, no automatic push.
- Commit and push only happen under an explicitly selected mode (`commit`, `publish`); the default mode (`plan`) never commits or pushes.
- No modification of watched projects (Creatyss, lp-infra, n8n) — read-only.
- Zero token consumption by default.
- Local validations always come before any AI review, and always before any commit or publication.
- Human stays in control of decisions; the roadmap reader is deliberately naive/conservative rather than clever.

When adding a feature, do not silently violate any of the above — if a task seems to require it, flag it instead of implementing it.

## Commands

```bash
pnpm loop <command>            # run the CLI (tsx src/cli.ts)
pnpm run typecheck             # tsc --noEmit
pnpm run test                  # tsx --test tests/**/*.test.ts
pnpm run validate              # typecheck + test + json-check
pnpm run audit:strict          # tsx src/cli.ts audit --json --strict
pnpm run audit:profiles        # scripts/audit-profile-check.ts (checks all public audit profiles)
pnpm run audit:release-check   # scripts/audit-release-check.ts (release worktree check)
pnpm run ci                    # validate + audit:strict + audit:profiles — the full reference validation
```

Run a single test file directly: `pnpm exec tsx --test tests/intelligence/roadmap.test.ts`

`pnpm run ci` is the full reference validation and must pass before any commit or release.

CLI commands (see `src/cli.ts` for the full routing table): `help`, `summary [--json]`, `status`, `doctor`, `json-check`, `rag-index`, `rag-search`, `audit [--json] [--strict] [--profile <name>]`, `handoff <project> [--json]`, `context <project> [--json]`, `validate <project>`, `review <project> [--json]`, `next <project> [--json]`, `prompt <project> [--json]`, `run <project> [--mode plan] [--json]` (V7.2: only `--mode plan`, the default, is implemented; `execute`/`commit`/`publish` are rejected with a non-zero exit code).

Loop Engine is self-hosted: it's declared in `projects.yaml` as project `loop-engine` (path `.`), so `pnpm loop context loop-engine`, `pnpm loop validate loop-engine`, etc. all work against this repo itself.

## Architecture

Layering is strict and one-directional: `cli.ts` → `commands/` → `loop/` → `intelligence/` → `core/`. Never skip a layer.

- **`src/cli.ts`** — routes argv to a command handler. Contains no business logic, no direct Git/doc/roadmap access. Just: read command → resolve project (if needed) → call the command.
- **`src/commands/`** — one file per user-facing command (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`, `prompt`, `run`, `help`). Each command loads a `ProjectSnapshot` (or, for `run`, a `LoopRunResult`) and renders it (text or `--json`); it must not re-derive information that layer below already computes.
- **`src/loop/`** — the LoopRunner core (V7.2, `plan` mode only): `types.ts` (`LoopRunMode`, `LoopRunStatus`, `LoopRunResult`, …), `state-machine.ts` (`canTransition`), `planner.ts` (`planLoopCycle`, composes `intelligence/project-snapshot.ts` without duplicating it), `runner.ts` (`runLoopPlan`). See `docs/architecture/autonomous-loop-runner.md`.
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

- `docs/architecture/final-objective.md` — final objective and product source of truth (see top of this file).
- `docs/architecture/autonomous-loop-runner.md` — LoopRunner architecture and contracts for the autonomous small-lot cycle (plan/execute/commit/publish modes, state machine, `LoopRunResult`).
- `docs/architecture/commands.md` — layering rules for `cli.ts` / `commands/` / `core/` / `intelligence/` / `ui/`.
- `docs/architecture/project-intelligence.md` — `ProjectSnapshot` contract and roadmap candidate classification.
- `docs/architecture/roadmap-reader.md` — roadmap reader formats, states, and keyword refinement history.
- `docs/architecture/audit-engine.md` — Audit Engine architecture, profiles, and CI integration.
- `docs/audits/release-checklist.md` — release checklist to follow before publishing an audit tag.
- `docs/audits/stable-tags.md` — source of truth for the current stable audit tags.
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
