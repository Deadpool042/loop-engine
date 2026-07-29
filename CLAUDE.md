# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Objectif final

Voir `docs/architecture/final-objective.md`.

Cette page constitue la source de vérité du produit et définit l'objectif final de Loop Engine.

Claude doit s’y référer avant toute évolution structurante.

## What this is

Loop Engine is a local CLI orchestrator for projects declared in `projects.yaml`. It exposes project inspection, roadmap selection, bounded context, validation, audit, declarative Runtime contracts, guarded inbound execution and a bounded LoopRunner cycle.

Current user-facing capabilities include:

- project piloting (`summary`, `status`, `doctor`, `context`, `validate`, `review`, `next`);
- context and handoff generation (`context`, `handoff`, `prompt`);
- local RAG (`rag-index`, `rag-search`);
- the executable Audit Engine (`audit`, strict mode and profiles);
- stable human and JSON outputs;
- LoopRunner `plan` and V14.4 `execute/validate/repair` orchestration.

The historical LoopRunner contract is in `docs/architecture/autonomous-loop-runner.md`. The current execute-mode contract is `docs/architecture/looprunner-execute-validation-repair.md`.

### LoopRunner status

- **V7.2 `plan`** — `runLoopPlan(...)` is the default and remains synchronous, forecast-only and non-destructive. It calls no agent, modifies no file, commits nothing and publishes nothing.
- **V7.4/V7.5 planning evidence** — plan mode exposes a forecast `agentPolicy` and bounded `contextPackage`.
- **V14.4 `execute`** — `runLoopExecute(...)` resolves policy with `mode: "execute"`, builds bounded context, calls one injected `LoopExecutor`, validates through an injected `LoopValidator`, and may call an injected `LoopRepairer` within a finite `maxRepairs` budget.
- **CLI safety** — no concrete provider is configured by default. `pnpm loop run <project> --mode execute` therefore fails closed with `failure.code = "executor_unavailable"`; it must never pretend execution happened.
- **Closed modes** — `commit` and `publish` remain rejected with `Loop run mode not implemented: <mode>`.

### Core philosophy

- No automatic AI call by default.
- Zero token consumption by default.
- `plan` is the default and cannot modify a worktree.
- `execute` must be selected explicitly and can act only through an injected, policy-admitted executor on the explicitly targeted project.
- No automatic commit, push, tag or publication.
- Validation follows execution and every repair is followed by validation.
- Repair budgets are finite; exhaustion fails closed.
- Human decisions define mode, permissions, provider configuration and limits.

Do not silently widen any authority or replace an unavailable dependency with a fake success.

## Commands

```bash
pnpm loop <command>            # run the CLI (tsx src/cli.ts)
pnpm run typecheck             # tsc --noEmit
pnpm run test                  # full Node test inventory
pnpm run validate              # typecheck + test + json-check
pnpm run audit:strict          # strict JSON audit
pnpm run audit:profiles        # all public audit profiles
pnpm run audit:release-check   # release worktree check
pnpm run ci                    # complete reference validation
```

Run a single test directly with `pnpm exec tsx --test <test-file>`.

`pnpm run ci` must pass before merge or release.

CLI routing includes:

```text
help
summary [--json]
status
doctor
json-check
rag-index
rag-search
audit [--json] [--strict] [--profile <name>]
handoff <project> [--json]
context <project> [--json]
validate <project>
review <project> [--json]
next <project> [--json]
prompt <project> [--json]
run <project> [--mode plan|execute|commit|publish] [--max-repairs <n>] [--json]
```

Loop Engine is self-hosted as project `loop-engine` with path `.`.

## Architecture

Layering remains explicit: `cli.ts` routes, `commands/` adapts, domain modules implement contracts, and Core exposes reviewed integration boundaries.

- **`src/cli.ts`** — argv parsing and routing only. It validates `--mode` and `--max-repairs`, then delegates.
- **`src/commands/`** — user-facing adapters. `run.ts` renders a `LoopRunResult`; it does not implement execution or validation logic.
- **`src/loop/`** — LoopRunner domain:
  - `types.ts` — `LoopRunMode`, states, steps, failures, validation evidence and `LoopRunResult`;
  - `state-machine.ts` — the only legal transition table;
  - `planner.ts` / `runner.ts` — deterministic `plan` mode;
  - `execution.ts` — `LoopExecutor`, `LoopValidator`, `LoopRepairer`, default configured-validation adapter and unavailable executor;
  - `execute-runner.ts` — V14.4 execute/validate/repair orchestration.
- **`src/intelligence/`** — `ProjectSnapshot`, roadmap reading and candidate selection. Commands and runners consume this source of truth instead of re-reading project state ad hoc.
- **`src/core/`** — low-level primitives and reviewed integration surfaces. `loop-execution-cycle.ts` exports the V14.4 application boundary. `prepared-inbound-runtime-execution.ts` owns the V14.3 inbound-to-Runtime vertical slice.
- **`src/agents/`** — profile types, registry, smallest-capable-first selector and explicit escalation. Profiles are declarations, not executable provider integrations.
- **`src/policy/`** — derives requirements and resolves policy. In plan mode the resolution is forecast evidence; in execute mode V14.4 treats a resolved selected profile as mandatory admission before calling the injected executor. The policy module itself never invokes a provider.
- **`src/context/`** — bounded deterministic context construction with path confinement and stable truncation.
- **`src/runtime/`** and **`src/transports/`** — guarded Runtime/Transport contracts and opt-in implementations.
- **`src/providers/`** — provider planning contracts and static declarations. V14.4 does not make these a concrete LoopExecutor.
- **`src/inbound-security/`** — pure fail-closed inbound security contracts. Concrete identity, ACL, replay persistence and the first inbound adapter are V14.5 scope.
- **`src/audit/`** — executable architecture and contract checks. AUDIT-495 guards the complete V14.4 boundary rather than individual helper tokens.
- **`src/ui/terminal.ts`** — terminal formatting only.

Before adding a command, check whether its data already exists on `ProjectSnapshot` or another reviewed Core result. Extend the owning layer instead of deriving data in the command.

### V14.4 invariants

- Policy rejection causes zero executor calls.
- The executor has one call site and is invoked at most once per cycle.
- Validation starts only after executor completion.
- Repair requires an injected `LoopRepairer`, consumes a finite budget and is followed by revalidation.
- Executor, validator and repairer exceptions are converted to stable redacted failures.
- Modified-file paths are normalized, deduplicated and sorted.
- `commit` and `publication` remain `null` on every V14.4 outcome.
- No direct network, environment-secret discovery, provider SDK, commit, push, tag or force operation belongs in `src/loop/execute-runner.ts`.

### Roadmap reader (`src/intelligence/roadmap.ts`)

The reader is deterministic and keyword-based. It intentionally does not perform NLP or dependency resolution.

- Candidates come from explicit roadmap markers such as unchecked tasks, TODO, lot identifiers and in-progress markers.
- Status is `todo`, `in_progress`, `done` or `unknown`.
- Risk kind is `safe`, `warning` or `blocked` based on conservative keywords.
- Selection ignores completed candidates and prefers `safe`, then `warning`, then `blocked`.

Keep keyword changes precise and covered by `tests/intelligence/roadmap.test.ts`.

## JSON output contract

Public JSON payloads use `schemaVersion: 1`.

- Prefer additive fields; do not remove a field without a schema bump.
- New or changed public JSON must be covered by command tests and `json-check`.
- `run --mode execute --json` returns a `LoopRunResult` even on an execution-cycle failure such as `executor_unavailable`.
- Argument and unsupported-mode errors use the separate `{ schemaVersion, ok: false, error }` envelope.
- JSON consumers cannot infer permission to commit, publish or call a provider.

## Docs worth reading before structural changes

- `docs/architecture/final-objective.md`
- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/looprunner-execute-validation-repair.md`
- `docs/architecture/prepared-inbound-runtime-execution.md`
- `docs/architecture/execution-architecture-rfc.md`
- `docs/architecture/agent-orchestration.md`
- `docs/architecture/agent-policy-engine.md`
- `docs/architecture/minimal-context-builder.md`
- `docs/architecture/provider-adapters.md`
- `docs/architecture/transport-adapters.md`
- `docs/architecture/inbound-boundary-security-contract.md`
- `docs/architecture/commands.md`
- `docs/architecture/project-intelligence.md`
- `docs/architecture/roadmap-reader.md`
- `docs/architecture/audit-engine.md`
- `docs/audits/release-checklist.md`
- `docs/audits/stable-tags.md`
- `docs/integrations/json-consumers.md`

## Working method

Work in coherent, reversible capability lots.

Before a significant change:

- read the relevant current contract and implementation;
- verify that the roadmap candidate is still active;
- prefer one vertical slice over adapter/facade/test micro-lots;
- avoid broad refactors without a demonstrated need.

For every code lot:

- preserve default-deny behavior;
- add adversarial coverage with the capability;
- run `pnpm run ci`;
- review the complete diff;
- do not commit or publish a targeted project unless an explicitly implemented mode authorizes it.
