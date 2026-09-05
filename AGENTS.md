# AGENTS.md

This file provides guidance to any assistant or runtime working with code in this repository.

## Objectif final

Voir `docs/architecture/final-objective.md`.

Cette page constitue la source de vérité du produit et définit l'objectif final de Loop Engine.

Tout assistant ou runtime doit s’y référer avant toute évolution structurante.

## What this is

Loop Engine is a local, deterministic governance and orchestration engine over projects declared in `projects.yaml`. It reports Git state, checks required docs, surfaces roadmap candidates, prepares bounded context/prompt payloads, and exposes explicit execution contracts. Read/plan paths remain non-destructive by default; write-capable paths exist only behind explicit governed modes and scope guards. It now also covers:

- project piloting (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`);
- context and handoff generation (`context`, `handoff`, `prompt`) for pasting into an assistant;
- a local RAG index and search (`rag-index`, `rag-search`);
- an executable Audit Engine with human and JSON reports, profiles, and a strict CI mode (`audit`);
- human-readable and JSON reports across the CLI (`--json` on most commands).

Loop Engine supports governed orchestration by small lots — see `docs/architecture/looprunner-execute-validation-repair.md` for the current execution contract and `docs/architecture/autonomous-loop-runner.md` for the historical LoopRunner architecture. `plan` remains the default and never calls an agent. An explicitly configured Codex or Claude Code provider can run `execute` in a temporary isolated Git worktree; explicit `commit` remains bounded and `publish` can create only a validated internal candidate ref, never a push/merge or user-branch mutation.

## Runtime IA principal

Dans le workflow interactif normal, **ChatGPT + Development Workspace** est le runtime IA principal. Loop Engine fournit la gouvernance, les contrats déterministes et les validations ; il ne déclenche pas un second modèle simplement parce qu'un raisonnement est nécessaire.

Claude Code, Codex et les autres runtimes sont des spécialistes **opt-in**. Leur indisponibilité ne doit pas bloquer le fonctionnement normal, et aucune API IA payante n'est un fallback implicite.

**Core philosophy (non-negotiable, enforced throughout the codebase):**

- No automatic AI calls by default — deterministic planning, roadmap, policy, gates, history and validation stay model-free; an AI runtime is invoked only through an explicit admitted execution path.
- No automatic commit, no automatic push.
- Commit and push only happen under an explicitly selected mode (`commit`, `publish`); the default mode (`plan`) never commits or pushes.
- Watched projects are read-only by default. The only current write exception is the explicitly configured `execution_decision` governance artifact: after human approval, Loop Engine may publish that single file at the configured in-project path using the bounded transactional/validated publication path. This does not authorize general writes or business-logic changes in the watched project.
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

CLI commands (see `src/cli.ts` for the full routing table): `help`, `summary [--json]`, `status`, `doctor`, `json-check`, `rag-index`, `rag-search`, `audit [--json] [--strict] [--profile <name>]`, `handoff <project> [--json]`, `context <project> [--json]`, `validate <project>`, `review <project> [--json]`, `next <project> [--json]`, `prompt <project> [--json]`, `run <project> [--mode plan|execute|commit|publish] [--json]`. `execute` requires an explicit provider executable; `commit` additionally requires an explicit message; `publish` creates only a bounded validated candidate ref and never pushes or merges it.

Loop Engine is self-hosted: it's declared in `projects.yaml` as project `loop-engine` (path `.`), so `pnpm loop context loop-engine`, `pnpm loop validate loop-engine`, etc. all work against this repo itself.

## Architecture

Layering is strict and one-directional: `cli.ts` → `commands/` →
`composition/` → Core application services and internal domain layers. Never
skip the application assembly boundary from a command.

- **`src/cli.ts`** — routes argv to a command handler. Contains no business logic, no direct Git/doc/roadmap access. Just: read command → resolve project (if needed) → call the command.
- **`src/commands/`** — one file per user-facing command (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`, `prompt`, `run`, `help`). Each command consumes only the injected `LoopApplicationAssembly`, loads a `ProjectSnapshot` (or, for `run`, a `LoopRunResult`) through that contract, and renders it (text or `--json`); it must not import Core or internal implementation layers directly.
- **`src/composition/`** — the single concrete application assembly layer. `createLoopApplicationAssembly(...)` wires Core application services and optional concrete providers behind the immutable `LoopApplicationAssembly` contract. Core must never depend on this layer.
- **`src/loop/`** — the LoopRunner core for `plan`, explicit `execute`, bounded validation/repair, `commit` and candidate `publish`. It owns execution plans, evidence, scope/content guards and run-state transitions while delegating project-state computation to `intelligence/project-snapshot.ts`. See `docs/architecture/looprunner-execute-validation-repair.md`.
- **`src/intelligence/`** — the engine. `project-snapshot.ts` builds the central `ProjectSnapshot` (see `src/intelligence/snapshot.ts` for the type) by merging declarative config (`projects.yaml`) with computed state (Git, docs, roadmap). `roadmap.ts` is the roadmap reader (see below). **This is the single source of truth commands must consume — never have a command re-read Git/docs/roadmap directly.**
- **`src/core/`** — small, deterministic low-level primitives: `config.ts` (loads/parses `projects.yaml`), `git.ts` (shells out to `git`, always fails soft to `"unknown"`/`null`), `docs.ts` (file existence checks), `project.ts` (project lookup/arg parsing).
- **`src/ui/terminal.ts`** — the only place that formats terminal output; commands call `terminal.*` rather than inlining styling.

Before adding a new command: check whether the data already exists on `ProjectSnapshot`; if not, extend `intelligence/` rather than computing it ad hoc inside the command.

### Roadmap reader (`src/intelligence/roadmap.ts`)

Deterministic, keyword-based, intentionally naive — no NLP, no dependency resolution between lots.

- A line becomes a **candidate** if it matches patterns like `- [ ]`, `TODO`, `Prochain`, `Lot `, `H1-L`/`H2-L`/`H3-L`, `⏳`, etc. (`CANDIDATE_PATTERNS`).
- Each candidate gets a **status**: `todo` / `in_progress` (`⏳`, "en cours") / `done` (`- [x]`) / `unknown`.
- Each candidate gets a **kind** via keyword matching on the lowercased line:
  - `blocked`: `production finale`, `mise en production`, `paiement`, `migration`, `delete`, `supprimer`. Note `prod` alone is _not_ blocking (avoids false positives on `produit`).
  - `warning`: `déploiement`/`deploiement`, `vps`, `dns`, `bascule`, `sécurité`/`securite`.
  - otherwise `safe`.
- `selectRoadmapCandidate` preserves the canonical declaration order: it ignores completed candidates, examines the first remaining candidate only, and never skips it because a later lot is safer or has a higher priority marker. If that first open candidate is not admissible, no later candidate is selected. `kind` and `priority` remain descriptive/risk metadata, not a license to reorder the roadmap.

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
- `docs/architecture/application-assembly-contract.md` — application assembly contract, provider wiring and dependency direction.
- `docs/architecture/commands.md` — layering rules for `cli.ts` / `commands/` / `composition/` / Core / `ui/`.
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
