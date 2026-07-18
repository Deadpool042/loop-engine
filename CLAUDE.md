# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Objectif final

Voir `docs/architecture/final-objective.md`.

Cette page constitue la source de vérité du produit et définit l'objectif final de Loop Engine.

Claude doit s’y référer avant toute évolution structurante.

## What this is

Loop Engine is a local, deterministic CLI orchestrator that reads and inspects a small set of local projects declared in `projects.yaml` (Creatyss, lp-infra, n8n, and itself). It reports Git state, checks required docs, surfaces roadmap candidates, and prepares short context/prompt payloads — all without ever touching the projects it inspects. It now also covers:

- project piloting (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`);
- context and handoff generation (`context`, `handoff`, `prompt`) for pasting into an assistant;
- a local RAG index and search (`rag-index`, `rag-search`);
- an executable Audit Engine with human and JSON reports, profiles, and a strict CI mode (`audit`);
- human-readable and JSON reports across the CLI (`--json` on most commands).

Loop Engine now also targets autonomous orchestration by small lots — see `docs/architecture/autonomous-loop-runner.md` for the LoopRunner architecture (planning → executing → validating → repairing → completed/blocked/failed/cancelled, and the `plan`/`execute`/`commit`/`publish` modes). As of V7.2, `pnpm loop run <project>` implements only the `plan` mode (default mode): it plans a cycle via `runLoopPlan` (`src/loop/runner.ts`) without calling any agent, without modifying the worktree, and without committing or pushing. `execute`, `commit`, and `publish` are rejected explicitly and remain for later lots.

As of V7.4, `runLoopPlan` additionally resolves a **forecast-only** agent policy for the selected candidate via `src/policy/` (see `docs/architecture/agent-policy-engine.md`): which capabilities/permissions/effort/budget the lot would need, and which registered agent profile would be selected — exposed as `LoopRunResult.agentPolicy`, never used to call an agent.

As of V7.5, `runLoopPlan` additionally builds a bounded, deterministic **Minimal Context Package** via `src/context/` (see `docs/architecture/minimal-context-builder.md`) whenever a plan cycle reaches `completed`, using `agentPolicy.requirements.contextBudget` — sources are limited to `snapshot.docs.required` and `snapshot.roadmap.paths`, every read stays confined under `snapshot.project.path`, and the result never exceeds `maxFiles`/`maxCharacters`/`maxEstimatedTokens`. Exposed as `LoopRunResult.contextPackage`, `null` for `blocked`/`failed` cycles exactly like `agentPolicy`.

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
- **`src/agents/`** — the agent orchestration layer (V7.3, local/deterministic only): `types.ts` (`AgentRuntime`, `AgentProvider`, `AgentCapability`, `AgentPermission`, `AgentEffort`, `AgentBudget`, `AgentProfile`), `registry.ts` (`AgentRegistry`), `selector.ts` (`selectAgentProfile`, smallest-capable-first with rejection explainability), `escalation.ts` (`escalateAgentProfile`, triggered only by an explicit failure). No network calls, no provider SDK, no `execute` mode, not wired into any CLI command; consumed only by `src/policy/` and a future `LoopExecutor`, never the reverse. See `docs/architecture/agent-orchestration.md`.
- **`src/policy/`** — the Agent Policy Engine (V7.4, local/deterministic only): `types.ts` (`AgentPolicyMode`, `LoopTaskCategory`, `ContextBudget`, `LoopTaskRequirements`, `AgentPolicy`, `AgentPolicyResolution`), `defaults.ts` (per-mode permission ceilings and budgets, restrictive-merge helpers, context budget by effort), `resolver.ts` (`classifyLoopTaskCategory`, `deriveTaskRequirements`, `resolvePolicy`). Depends on `src/agents/` and, read-only, on `src/intelligence/roadmap.js`'s `RoadmapCandidate` type; never depends on `src/loop/`, `src/commands/`, or `src/cli.ts` — the `LoopRunner` consumes it, never the reverse. No network calls, no `execute` mode: `resolvePolicy` only ever produces a forecast selection, never an invocation. See `docs/architecture/agent-policy-engine.md`.
- **`src/context/`** — the Minimal Context Builder (V7.5, local/deterministic only): `types.ts` (`MinimalContextPackage`, `ContextFile`, `ContextOmission`, reusing `ContextBudget` from `src/policy/types.ts`), `path.ts` (`resolveContextPath`, confinement under `snapshot.project.path`), `sources.ts` (`collectContextSources`, limited to `docs.required` and `roadmap.paths`, stable order), `context-cost-estimator.ts` (`estimateTokens`, a documented `ceil(length/4)` approximation), `builder.ts` (`buildMinimalContext`, deduplication + strict budget enforcement + deterministic truncation). Depends on `src/intelligence/snapshot.js` and `src/policy/types.js` (types only); never depends on `src/commands/`, `src/loop/`, or `src/cli.ts` — the `LoopRunner` consumes it, never the reverse, and `src/policy/`/`src/agents/` never depend on it either. No network calls, no file writes. See `docs/architecture/minimal-context-builder.md`.
- **`src/providers/`** — Provider Adapter contracts (V10.2, Core-only and inert): static OpenClaw, Claude Code and Codex stubs translate a `RuntimeRequest` to a normalized `ProviderExecutionPlan` without calling a transport. They depend only on Runtime/agent/policy types, cannot bypass policy, spawn a process, access network/secrets/environment, or appear in CLI/LoopRunner. `src/runtime/local-process.ts` remains a provider-agnostic transport primitive. See `docs/architecture/provider-adapters.md`.
- **`src/transports/`** — Transport Adapter contracts (V10.3, Core-only): the static `local-process` transport validates explicit transport authorization, then delegates exclusively to the guarded V10.1 backend and normalizes its result. It does not know Provider protocols, spawn independently, load secrets/environment, access the network, or appear in CLI/LoopRunner. See `docs/architecture/transport-adapters.md`.
- **`src/providers/openclaw/`** — OpenClaw protocol design (V10.4): a typed Loop Engine internal planning schema for the abstract `plan` operation. It validates a safe envelope and emits deterministic non-executable diagnostics only; it has no official executable mapping, command, credentials, network, Runtime/Transport dependency, CLI, or LoopRunner integration. See `docs/architecture/openclaw-provider-protocol.md`.
- **`src/providers/mapping/`** — Executable Mapping contracts (V10.5, Core-only): immutable compatibility declarations between a validated Provider protocol and a future transport-neutral intent. The sole OpenClaw declaration is disabled and unconfigured; mappings have no commands, executable metadata, transport invocation, process/network/environment access, CLI, or LoopRunner exposure. See `docs/architecture/executable-mapping.md`.
- **`src/providers/intent/`** — Transport Intent contracts (V10.6, Core-only): immutable desired-transport declarations with Provider/Runtime/Mapping/policy requirements. The sole OpenClaw intent is inactive and unconfigured; it creates no TransportRequest and is not consumed by the TransportAdapter, CLI, or LoopRunner. See `docs/architecture/transport-intent.md`.
- **`src/policy/`** — Capability & Policy Engine (V10.7, Core-only): extends the existing forecast policy module with immutable capability, policy, and authorization-decision contracts for transport intents. Its static `default-deny` rule evaluates compatibility only; it creates no TransportRequest and invokes no Provider, Runtime, or Transport. See `docs/architecture/capability-policy-engine.md`.
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
- `docs/architecture/agent-orchestration.md` — agent orchestration layer (`src/agents/`): types, registry, selector, escalation strategy — local and deterministic, no execute mode.
- `docs/architecture/agent-policy-engine.md` — Agent Policy Engine (`src/policy/`): requirements derivation, per-mode permission ceilings, restrictive budget/provider/runtime merging, forecast-only selection integrated into the LoopRunner's plan mode.
- `docs/architecture/minimal-context-builder.md` — Minimal Context Builder (`src/context/`): bounded/deterministic context package construction, path confinement, deduplication, truncation rules, integrated into the LoopRunner's plan mode.
- `docs/architecture/provider-adapters.md` — Provider Adapter contracts (`src/providers/`): inert provider planning, static registry/selection and the transport boundary.
- `docs/architecture/transport-adapters.md` — Transport Adapter contracts (`src/transports/`): explicit Core-only execution boundary, local-process delegation and result normalization.
- `docs/architecture/openclaw-provider-protocol.md` — OpenClaw internal planning schema (`src/providers/openclaw/`): protocol validation, non-executable plans and missing mapping evidence.
- `docs/architecture/executable-mapping.md` — Executable mapping contracts (`src/providers/mapping/`): disabled capability declarations, policy gates and transport separation.
- `docs/architecture/transport-intent.md` — Transport intent contracts (`src/providers/intent/`): inactive declarations and the intentional Adapter boundary.
- `docs/architecture/capability-policy-engine.md` — Capability & Policy Engine (`src/policy/`): default-deny theoretical authorization after transport intent and before any future transport boundary.
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
