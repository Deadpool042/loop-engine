# Loop Engine Roadmap — Post-V15 Strategic Plan (V16–V20 bilan)

Status: SUPERSEDED as an active planning document — kept as historical
strategic reference and reconciled bilan.
Baseline: state of `main` after V15.1
Planning horizon at authoring time: V16 through V20
Reconciliation review: 2026-08-24, against `main` at V24.4
(`docs/roadmap/loop-engine.md` is now the authoritative source for the next
executable lot; see `docs/roadmap/loop-engine.md` for the current candidate.)

## Real status as of 2026-08-24 (evidence-based reconciliation)

The self-hosted roadmap (`docs/roadmap/loop-engine.md`) advanced through
V22–V24 without following the V16–V20 macro-lot sequence below literally.
Several capabilities described here were delivered under different lot
numbers and names, several remain genuinely undelivered, and one recommended
next step in this document was already superseded before this reconciliation.
This section records what evidence in the repository actually shows; it does
not replace the detailed macro-lot text further below, which remains as
directional strategic context.

| Macro-lot | Real status | Evidence | Remaining gap |
| --- | --- | --- | --- |
| V16 — Isolated Durable Worker Platform | PARTIAL | Isolated worktrees and workspace allocation: `src/execution/workspace-manager.ts`, `src/execution/isolated-worker-platform.ts`. Recoverable per-project locks with a real burn-in on `lp-infra`: `src/execution/project-lock-manager.ts`, `src/execution/adapters/local-project-lock-manager.ts`, documented as V23.1 in `docs/roadmap/loop-engine.md`. Bounded cancellation (SIGTERM/SIGKILL of the direct CLI process): `src/gui/desktop/execution-session.ts`, `loop:execution-cancel` IPC. | No lease heartbeat/renewal (locks rely on static PID liveness, not periodic renewal); cancellation does not terminate or account for provider descendant processes; the GUI intentionally allows only one active session at a time rather than real concurrent unrelated jobs. |
| V17 — Secure Orchestration Service | PARTIAL, mostly undelivered | Auth/ACL/anti-replay primitives are real and wired into the V14.5 inbound pilot: `src/inbound-security/*`. The HTTP/stdio service transport and persistent auth store exist as code (`src/service/node-http-service-adapter.ts`, `src/service/orchestration-service-persistent-auth-store.ts`) but are not imported outside `src/service` itself — no CLI command, no composition wiring, no consumer. No migrations, no SQLite/PostgreSQL persistence, no n8n-invocable service exists; the only real n8n integration is read-only JSON consumption. | Everything needed to turn `src/service/**` into an actually invoked service (routing, composition wiring, a CLI entrypoint or equivalent), or an explicit decision to remove/retire that code. |
| V18 — Economic Intelligence Engine | NOT_IMPLEMENTED (beyond static pricing) | `src/text-only-provider/pricing.ts` is a static cost calculator used only for roadmap-propose display, not a ledger. Run History (V24.2) persists terminal run outcomes but is explicitly documented as pure observability — "aucun détecteur de stagnation, circuit breaker ou cap de dépense cumulée" (`docs/architecture/autonomous-loop-runner.md`). No budget reservation/consumption/release, no adaptive provider selection from historical outcomes. | Everything; deliberately deferred pending demonstrated need per existing doctrine. |
| V19 — Durable End-to-End Delivery Lifecycle | PARTIAL, narrow scope delivered | Bounded explicit commit exists and was burned in on a real project: V14.6, `docs/audits/real-controlled-commit-pilot.md`. `src/automation/adapters/github/github-automation-forge.ts` exists but `src/automation/**` is not imported outside itself except by an audit rule checking its internal dependency direction — no CLI command, no composition wiring, no real branch/PR/CI/review/merge lifecycle. | The entire durable branch→PR→CI→review→merge lifecycle remains undelivered; `src/automation/**` is currently unconsumed code. |
| V20 — Production Hardening and Provider Ecosystem | NOT_IMPLEMENTED, except provider abstraction | No structured logs/metrics/traces, no backup/restore, no multi-host persistence found. A real multi-provider abstraction exists and is used (`src/providers/{claude-code,codex,openclaw}.ts`, `mapping/`, `registry.ts`, `selector.ts`), but no formal provider conformance suite was found. | Everything except the provider abstraction itself. |

### Recommended-next-lot correction

The "Recommended Next Lot" section below (V16.1 — Isolated Execution Workspace
and Project Lock) is superseded: isolated worktrees, per-project locks with
recoverable ownership, and a real burn-in were already delivered as V23.1 in
`docs/roadmap/loop-engine.md`, which also documents cancellation delivered
after that. This document must not be read as still recommending that work.
It is kept below only as a record of the original planning rationale.

## Purpose (original, at authoring time)

This roadmap is the authoritative strategic reference for the next phase of Loop Engine.

The architecture is now sufficiently mature. The next phase must prioritize operational closure: isolated execution, durable control, secure orchestration, economic intelligence, end-to-end delivery, and production hardening.

This document intentionally replaces a stream of narrow micro-lots with five coherent macro-lots. Each macro-lot may still be delivered through focused pull requests, but every PR must contribute directly to one declared acceptance criterion.

## Product Vision

Loop Engine is the orchestration brain for reliable, economical, provider-independent agent execution.

The target operating model is:

- Loop Engine owns planning, selection, execution control, recovery, policy, budgets, history, and delivery state.
- Providers and agents are interchangeable workers behind explicit ports.
- n8n or another external orchestrator may supervise, trigger, and observe Loop Engine, but must not contain the core decision logic.
- Execution is local-first and retrieval-first.
- The smallest capable agent is selected first.
- Escalation occurs only when deterministic policy or observed failure justifies it.
- Every material transition is durable, auditable, recoverable, and bounded by cost and security policy.

## Current Baseline After V15.1

The project has established the main architectural foundations required for the production phase:

- explicit Core boundaries and public contracts;
- application assembly centralized behind a public assembly contract;
- provider wiring and command injection separated from Core policy;
- multi-provider abstractions and deterministic selection mechanisms;
- durable execution concepts, leases, receipts, and lifecycle controls;
- production orchestration gateway contracts;
- strict inbound validation and trusted-boundary checks;
- deterministic audits protecting architectural and CI contracts;
- mandatory GitHub `CI gate` aggregation;
- protected `main` branch and pull-request delivery workflow.

The remaining gap is primarily operational rather than architectural. The repository must now prove that the existing contracts can drive safe, isolated, durable, observable, and economical real execution.

## Maturity Snapshot

The following estimates are directional planning indicators, not release claims:

| Dimension                       | Estimated maturity |
| ------------------------------- | -----------------: |
| Architecture and contracts      |             85–90% |
| Local supervised execution      |             75–80% |
| Single-host product readiness   |             65–70% |
| Multi-host production readiness |             40–50% |
| Autonomous delivery readiness   |             55–60% |

These estimates must be revised at the end of each macro-lot using evidence from tests, production-like scenarios, and operational acceptance criteria.

## Guiding Engineering Principles

### Deterministic Core

Core decisions must be pure or explicitly dependency-injected. Time, randomness, process execution, filesystem access, networking, provider APIs, and persistence remain adapter concerns.

### Fail Closed

Invalid, ambiguous, stale, unauthenticated, unauthorized, replayed, over-budget, or lease-invalid inputs must be rejected before side effects.

### Ports and Adapters

Production capabilities are introduced through explicit contracts. No provider, database, transport, process, or GitHub implementation may leak into Core policy.

### Durable State Before Side Effects

A material transition must be persisted before externally visible execution begins whenever recovery or duplicate suppression depends on it.

### Isolation by Default

Independent projects, attempts, providers, and repair cycles must not share mutable execution state unless an explicit contract permits it.

### Observable and Auditable Operation

Every execution must expose stable identifiers, transitions, outcomes, usage, cost, error classification, and recovery decisions.

### Economic Discipline

Provider selection and escalation must account for capability, historical success, latency, token consumption, and monetary budget.

### Incremental Delivery

Each PR must be reviewable, independently validated, and protected by targeted tests plus the repository `CI gate`. Macro-lots are not permission for broad, untestable changes.

## Priority Model

### P0 — Required Before Production Execution

1. Real execution isolation.
2. Lease heartbeat and active cancellation.
3. Durable lifecycle across the full execution pipeline.
4. Gateway authentication, authorization, nonce validation, and anti-replay protection.

### P1 — Required for Operable Service Deployment

1. Real orchestration service transport.
2. Multi-host persistence and migrations.
3. Logs, metrics, traces, and operational health signals.
4. Actual token and cost accounting.

### P2 — Required for Adaptive Economic Performance

1. Historical success feedback into selection.
2. Adaptive provider choice and escalation.
3. Provider SDK and additional providers.

### P3 — Required for Autonomous Software Delivery

1. Full GitHub branch-to-merge lifecycle.
2. CI and review feedback loops.
3. Explicit operator approval gates where policy requires them.

# Macro-Lot V16 — Isolated Durable Worker Platform

Status: PARTIAL (see reconciliation table above — worktrees and recoverable
locks delivered as V23.1; heartbeat, descendant-process cancellation and real
multi-job concurrency remain undelivered)
Priority: P0
Depends on: V15 durable execution and orchestration contracts

## Objective

Turn the existing execution-control contracts into a real single-host worker platform that safely runs concurrent jobs in isolated environments and survives interruption.

## Scope

- per-project and per-attempt concurrency control;
- isolated Git worktrees or equivalent execution directories;
- deterministic workspace allocation and cleanup;
- worker leases with heartbeat and renewal;
- active cancellation propagation;
- provider-process termination and timeout enforcement;
- crash detection and recovery;
- idempotent resume and duplicate suppression;
- durable worker state transitions;
- adapter boundaries for process, filesystem, Git, clock, and persistence concerns.

## Deliverables

- public worker-platform contracts;
- production single-host worker adapter;
- isolated workspace manager;
- lease heartbeat loop;
- cancellation controller;
- recovery coordinator;
- deterministic cleanup policy;
- targeted integration tests using real temporary repositories and processes;
- architecture documentation and audit coverage only where they protect material boundaries.

## Acceptance Criteria

- two unrelated jobs can execute concurrently without sharing mutable workspaces;
- two conflicting jobs for the same project are serialized or rejected according to policy;
- a worker that loses its lease cannot continue committing side effects;
- cancellation terminates active provider work and reaches a durable terminal state;
- process crash or host restart can be detected and reconciled without duplicate execution;
- temporary worktrees and execution directories are cleaned deterministically;
- retry and resume behavior is idempotent;
- all tests and `CI gate` pass.

## Risks

- race conditions between lease expiry, cancellation, and process completion;
- orphaned worktrees or processes;
- platform-specific process semantics;
- accidental coupling of Core policy to Git or filesystem implementations.

## Exit Condition

Loop Engine can safely operate as a durable, concurrent, single-host worker platform under production-like failure scenarios.

# Macro-Lot V17 — Secure Orchestration Service

Status: PARTIAL, mostly undelivered (see reconciliation table above — auth/ACL/
replay primitives are real and wired into the V14.5 pilot; the HTTP/stdio
service transport and persistent auth store exist but are unconsumed code)
Priority: P0/P1
Depends on: V16 worker platform

## Objective

Expose Loop Engine as a secure, operable service that external supervisors such as n8n can invoke without owning internal orchestration logic.

## Scope

- HTTP and/or stdio service adapter;
- versioned request and response contracts;
- authentication and authorization;
- signed requests or HMAC validation;
- nonce and timestamp validation;
- anti-replay storage and policy;
- rate and concurrency controls;
- health, readiness, and diagnostics endpoints;
- configuration loading and validation;
- graceful startup and shutdown;
- SQLite production baseline;
- PostgreSQL-ready persistence port and migrations;
- reference n8n integration template.

## Deliverables

- production service entrypoint;
- secure gateway middleware or adapter chain;
- persistent replay protection;
- deployment configuration schema;
- health and readiness probes;
- migration mechanism;
- n8n example workflow and operator documentation;
- threat model and security acceptance tests.

## Acceptance Criteria

- unauthenticated, unauthorized, stale, malformed, or replayed requests are rejected before execution;
- authorized requests are traceable from ingress through terminal execution state;
- restart does not lose accepted durable work;
- readiness accurately reflects persistence and worker availability;
- shutdown stops accepting work and drains or safely abandons leases according to policy;
- an n8n workflow can submit, inspect, cancel, and retrieve the result of an execution without embedding Loop Engine policy;
- all tests and `CI gate` pass.

## Risks

- security logic duplicated across transports;
- replay protection inconsistencies in multi-host mode;
- configuration drift;
- service availability being confused with worker readiness.

## Exit Condition

Loop Engine is deployable as a secure single-host orchestration service with a credible path to multi-host operation.

# Macro-Lot V18 — Economic Intelligence Engine

Status: NOT_IMPLEMENTED beyond static pricing display (see reconciliation
table above — deliberately deferred pending demonstrated need per existing
doctrine; Run History V24.2 is observability only, not this)
Priority: P1/P2
Depends on: V17 service telemetry and durable persistence

## Objective

Make provider and escalation decisions using actual usage, monetary cost, observed quality, latency, and historical success rather than static capability rules alone.

## Scope

- normalized token and usage ledger;
- provider price model and cost calculation;
- budget reservation, consumption, release, and exhaustion;
- per-run, per-project, per-provider, and time-window accounting;
- latency and success statistics;
- failure taxonomy suitable for selector feedback;
- adaptive provider scoring;
- smallest-capable-provider-first policy;
- escalation based on deterministic evidence;
- cost and quality reporting.

## Deliverables

- durable economic ledger contracts and adapters;
- normalized provider usage receipts;
- budget controller;
- historical outcome repository;
- adaptive selection policy behind an explicit interface;
- economic reports and operational metrics;
- replayable decision tests using fixed historical datasets.

## Acceptance Criteria

- every provider call records attributable usage and cost or an explicit unknown-cost state;
- a run cannot exceed a hard budget through concurrent reservations;
- unused reservations are released deterministically;
- provider selection can explain capability, cost, latency, history, and escalation factors;
- identical inputs and historical snapshots produce identical decisions;
- failure feedback changes future selection only through declared policy;
- all tests and `CI gate` pass.

## Risks

- provider usage schemas differ or arrive late;
- inaccurate or changing pricing data;
- feedback loops that overfit sparse history;
- cost optimization degrading completion quality.

## Exit Condition

Loop Engine can enforce budgets and make explainable, adaptive, economically informed provider decisions.

# Macro-Lot V19 — Durable End-to-End Delivery Lifecycle

Status: PARTIAL, narrow scope delivered (see reconciliation table above —
bounded explicit commit delivered as V14.6; `src/automation/**` GitHub/PR/CI
lifecycle code exists but is unconsumed — no CLI command, no composition
wiring)
Priority: P3
Depends on: V16 worker durability and V18 economic controls

## Objective

Persist and execute the complete software-delivery lifecycle from candidate selection through merged change, including validation, repair, CI, review, and operator gates.

## Scope

- durable candidate, plan, execution, validation, repair, commit, publish, PR, CI, review, approval, and merge states;
- Git branch and commit adapters;
- GitHub pull-request adapter;
- CI status ingestion;
- review-comment ingestion and repair planning;
- bounded repair loops;
- merge policy and operator approval gates;
- resume after interruption at every material stage;
- terminal delivery receipts.

## Deliverables

- versioned delivery state machine;
- Git and GitHub ports and production adapters;
- durable repair-loop coordinator;
- CI and review event handlers;
- approval-policy contract;
- end-to-end integration scenarios against disposable repositories;
- operator runbook.

## Acceptance Criteria

- an accepted candidate can progress durably from plan to PR;
- failed validation or CI enters a bounded, explainable repair cycle;
- review feedback is linked to the exact code state it evaluates;
- restart at any lifecycle stage resumes without duplicate branches, commits, PRs, or merges;
- merge occurs only when required checks and approval policy are satisfied;
- every terminal result includes a complete delivery receipt;
- all tests and `CI gate` pass.

## Risks

- stale CI or review events applied to newer commits;
- unbounded repair loops;
- duplicate GitHub side effects;
- unsafe automated merge policy.

## Exit Condition

Loop Engine can autonomously and durably deliver a bounded software change from selection through merge under explicit policy.

# Macro-Lot V20 — Production Hardening and Provider Ecosystem

Status: NOT_IMPLEMENTED except provider abstraction (see reconciliation table
above — a real multi-provider abstraction exists and is used; no
observability, backup/restore, multi-host or conformance suite found)
Priority: P1/P2
Depends on: V16 through V19

## Objective

Harden Loop Engine for sustained production use, multi-host deployment, operational support, and provider ecosystem expansion.

## Scope

- structured logs, metrics, and distributed traces;
- SLOs and alerting signals;
- PostgreSQL production adapter;
- schema migrations and compatibility policy;
- retention, archival, backup, and restore;
- multi-host lease and replay semantics;
- load, soak, chaos, and recovery testing;
- provider SDK and conformance suite;
- additional providers such as OpenClaw or Gemini where justified;
- deployment packaging and upgrade documentation;
- security review and dependency hardening.

## Deliverables

- observability contracts and production exporters;
- multi-host persistence deployment profile;
- backup and recovery runbook;
- provider SDK;
- provider conformance test harness;
- production deployment reference;
- release and migration policy;
- operational readiness report.

## Acceptance Criteria

- operators can identify saturation, failure, latency, cost, and stuck lifecycle states;
- backup restore is tested and documented;
- rolling upgrade and schema migration paths are defined and validated;
- multi-host execution preserves lease, idempotency, and anti-replay guarantees;
- provider implementations pass a shared conformance suite;
- load and failure tests meet declared service objectives;
- all tests and `CI gate` pass.

## Risks

- premature provider expansion before platform stability;
- observability cost and cardinality explosion;
- migration incompatibilities;
- distributed coordination weakening single-host guarantees.

## Exit Condition

Loop Engine meets documented production-readiness criteria and supports controlled provider and deployment expansion.

# Global Production-Readiness Criteria

Loop Engine may be described as production-ready only when all of the following are evidenced:

1. Execution isolation is enforced under concurrency and failure.
2. Accepted work is durably recoverable.
3. Cancellation, timeout, and lease loss stop further side effects.
4. Service ingress is authenticated, authorized, freshness-checked, and replay-protected.
5. Budgets are enforced against actual or explicitly estimated usage.
6. Every run is observable from ingress through terminal outcome.
7. Persistence has migrations, retention, backup, and restore procedures.
8. CI, review, repair, and merge transitions are idempotent and bounded.
9. Provider selection is explainable and provider implementations are conformant.
10. Security, load, recovery, and upgrade scenarios pass documented acceptance tests.

# Roadmap Governance

## Source of Truth

This file is the strategic source of truth for V16 through V20. Detailed design documents may refine implementation but must not silently change macro-lot objectives or exit conditions.

## Related Provider-Specific Roadmap

`docs/roadmap/anthropic-provider-evolution.md` tracks Anthropic-specific provider consolidation and telemetry (status: complete, gated—R1/R2/R4 delivered, R3/Batch/Files blocked on documented gates) as a parallel, narrowly scoped track outside the V16–V20 macro-lot sequence above.

## Status Values

Each macro-lot uses one of:

- `PLANNED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `SUPERSEDED`

Status changes require evidence linked to merged pull requests and validation results.

## Pull-Request Discipline

- Every implementation PR must identify its macro-lot and acceptance criterion.
- Product code, documentation, tests, and audits should be changed together when necessary for one coherent capability.
- New audit rules are justified only when they protect a material invariant that ordinary tests cannot adequately enforce.
- Direct pushes to `main` remain prohibited.
- Required checks, including `CI gate`, must pass before merge.
- A macro-lot remains `IN_PROGRESS` until its exit condition is demonstrated, not merely documented.

## Scope Control

The following are explicitly discouraged until required by an active acceptance criterion:

- new abstractions without an operational consumer;
- additional providers before the provider SDK and conformance model are stable;
- micro-lots that rename or relocate code without closing a production gap;
- audit growth that does not protect a meaningful architectural or operational invariant;
- multi-host complexity before single-host durability is proven.

# Recommended Next Lot (original, superseded — see reconciliation above)

This section is kept only as a historical record. It is superseded: the work
it recommends was delivered as V23.1 in `docs/roadmap/loop-engine.md`. Do not
treat it as an actionable recommendation.

Begin V16 with a concrete vertical slice rather than another contract-only phase:

## V16.1 — Isolated Execution Workspace and Project Lock

The first implementation slice should:

1. define the minimum workspace and project-lock ports;
2. create isolated Git worktrees or equivalent temporary execution directories;
3. enforce per-project conflict policy;
4. persist allocation and cleanup state;
5. prove concurrent unrelated jobs and serialized conflicting jobs through integration tests;
6. leave heartbeat, active cancellation, and crash recovery for subsequent V16 slices built on this foundation.

This slice provides the operational base required by every later V16 capability while remaining independently reviewable and testable.
