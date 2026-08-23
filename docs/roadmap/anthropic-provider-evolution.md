# Anthropic Provider Evolution Roadmap

Status: R1 done, R2 done, R3 blocked on evidence, R4 done
Baseline: state of `main` at `341ed14`
Scope: Anthropic-specific provider consolidation and telemetry only — not a new macro-lot in the `roadmap-v16.md` V16–V20 sequence, and not a routing/architecture rewrite.

## Purpose

This document turns an already human-validated audit of Loop Engine's two Anthropic integrations into an ordered, execution-ready roadmap. It is intentionally narrow: it governs incremental hardening of an _existing_ Anthropic API provider and clarifies its boundary with the _existing_ Claude Code CLI executor. It does not introduce a new provider, a new generic framework, or a new routing system.

Durable architectural decisions belong in `docs/architecture/**`. This roadmap is a lot-by-lot execution tracker; it must stay reviewable without re-running a full audit for every PR, but it is not itself doctrine and must not contradict `docs/architecture/**` or `AGENTS.md`.

## Verified starting point

Inspected directly, not assumed:

- `src/loop/claude-code-cli-executor.ts` (316 lines) — a real, wired `LoopExecutor` that spawns the official `claude` CLI via `node:child_process`. It is Loop Engine's development-time interactive runtime integration. It is never enabled by default (`execute` mode requires an explicitly configured provider executable).
- `src/text-only-provider/anthropic-api-provider.ts` (393 lines) — a real HTTP client calling the Anthropic Messages API (`/v1/messages`) directly, with `tool_choice: { type: "none" }` (line 305) and `output_config.format` structured outputs already wired (line 308, schema built around line 101). It captures `input_tokens`/`output_tokens` (lines 176–185) and structured error fields (`providerErrorType`, `requestId`, `diagnosticMessage`, line 139) but has no `cache_control`, no batch usage, and no retry loop — a single attempt is made per call.
- `src/text-only-provider/pricing.ts` — declares the supported Anthropic model IDs (`"claude-haiku-4-5" | "claude-sonnet-5"`) and their pricing table.
- `src/policy/resolver.ts` (`docs/architecture/agent-policy-engine.md`) — `preferredCapabilityTier` and capability/permission/effort/budget-based agent selection already exist and are the sole mechanism used to prefer or select an agent profile; `selectAgentProfile` remains a pure lookup.
- `docs/architecture/provider-adapters.md` — describes the V10.2 Provider layer (`src/providers/`) as three inert stubs (`openclaw`, `claude-code`, `codex`) that only build a `not_implemented` `ProviderExecutionPlan`. This is accurate for that specific internal Provider-adapter layer, but it does not describe `src/loop/claude-code-cli-executor.ts` or `src/text-only-provider/anthropic-api-provider.ts`, which are separate, real, wired code paths outside `src/providers/`. Readers of `provider-adapters.md` alone could wrongly conclude no Anthropic integration is wired anywhere in the repository; this roadmap treats that as a documentation gap to close (see R1).

Model IDs are duplicated, hardcoded, with no central indirection, in exactly four places:

- `src/agents/registry.ts` (lines 41, 62, 83)
- `src/intelligence/roadmap-proposal-routing.ts` (lines 32–34)
- `src/cli.ts:268`
- `src/text-only-provider/pricing.ts` (lines 9, 21, 28, 46)

## Boundary: Claude Code / Anthropic API / Loop Engine

This boundary must remain explicit in code, docs, and every lot below:

- **Claude Code (`src/loop/claude-code-cli-executor.ts`)** is the interactive development-time runtime/tooling. Loop Engine spawns the official `claude` CLI as one possible `LoopExecutor` in `execute` mode; it never reimplements Claude Code's own capabilities (file editing, tool use, agentic loop) inside Loop Engine.
- **Anthropic API (`src/text-only-provider/anthropic-api-provider.ts`)** is a direct model provider used only for consultative governance decisions (roadmap-proposal, gate-reassessment) — `tool_choice: none`, no tool use, no project capability, no file access. It is governed entirely by Loop Engine: Loop Engine decides when to call it, with what context, under what budget, and what to do with the structured output.
- **Loop Engine** owns orchestration, governance, routing, contracts, audits, and validation for both integrations. Neither integration is ever presented as a source of truth or as a replacement for the other: the Anthropic API provider is not a substitute for Claude Code, and Claude Code is not a channel for governance decisions.

## Capability snapshot (Anthropic API provider only)

| Capability                                                     | State                | Note                                                                                                              |
| -------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Direct Messages API call, `tool_choice: none`                  | EXISTING             | `anthropic-api-provider.ts`                                                                                       |
| Structured outputs (`output_config.format`)                    | EXISTING             | schema wired, `strict: true` set since R1                                                                         |
| Secrets via macOS Keychain, never exposed to Electron renderer | EXISTING             | per validated audit                                                                                               |
| Capability-based routing (`preferredCapabilityTier`)           | EXISTING             | `src/policy/resolver.ts` — not extended by this roadmap                                                           |
| Token accounting (input/output)                                | PARTIAL              | no cache write/read tokens                                                                                        |
| Budget enforcement                                             | PARTIAL              | static limits only, no cumulative tracking                                                                        |
| Prompt caching (`cache_control`)                               | ABSENT               |                                                                                                                   |
| Batch API (`/v1/messages/batches`)                             | ABSENT               |                                                                                                                   |
| Files API (`/v1/files`)                                        | ABSENT               |                                                                                                                   |
| Streaming                                                      | ABSENT               |                                                                                                                   |
| Retries on transient errors                                    | EXISTING             | bounded/deterministic since R1 — 429 and transient 5xx only, max 3 attempts                                       |
| General tool use in the text-only provider                     | SHOULD_NOT_IMPLEMENT | no demonstrated use case                                                                                          |
| Anthropic-hosted memory as source of truth                     | SHOULD_NOT_IMPLEMENT | the `memory_20250818` tool is entirely client-side; Anthropic stores nothing persistently on Loop Engine's behalf |

Documentation is evidence of what is _documented_, _described_, or _specified_ — never by itself evidence of what is _implemented_, _active_, _used_, or _operational_. Every claim above is backed by the file/line references in "Verified starting point"; capability-snapshot rows without such a direct code reference at lot execution time must be re-verified before being marked EXISTING.

## Decisions

### MUST / SHOULD — carried into R1–R2, gated into R3, scoped for R4

- **R1 is consolidation, not creation.** The Anthropic API provider already exists (`anthropic-api-provider.ts`). R1 must not be framed, planned, or reported as building a new provider.
- A minimal single source of truth for supported/priced Anthropic models is required — not a generic provider catalogue/framework.
- Duplicated hardcoded model IDs are removed at the four locations listed above where justified, by pointing them at that single source.
- `strict: true` for structured outputs is enabled where the current API and the existing output contract already support it, without changing the contract's shape.
- Retries are bounded and deterministic, and apply **only** to clearly transient errors (429, retryable 5xx, cases the Anthropic API/SDK documents as retryable). A bounded number of attempts, bounded backoff, respect for `Retry-After` where present, no infinite loop, no error hiding, never retried: authentication errors, validation errors, non-transient 4xx. Behavior must be observable and auditable (visible in the structured error/usage output). No generic retry framework.
- Error and usage reporting stay consistent with each other (a retried/failed call must not silently disappear from usage/cost telemetry).
- `provider-adapters.md` is corrected if, at execution time, the divergence identified above is reconfirmed — the fix must clarify that `src/providers/` stubs and `src/loop/claude-code-cli-executor.ts` / `src/text-only-provider/anthropic-api-provider.ts` are distinct, without merging the two areas conceptually.
- R2 captures, when available: actual model used, input/output tokens, cache write/create tokens, cache read tokens, cost, duration, request ID, errors, batch info (for later use). Output must be structured so it can feed future routing/cost decisions — but this roadmap does not build that consumer. No generic observability platform.

### SHOULD, conditional — R3 (Prompt Caching)

Prompt caching is relevant but explicitly gated. R3 only becomes `READY` when R2 has demonstrated, with real captured telemetry, a stable/repeated context (e.g. `AGENTS.md`, stable architecture excerpts, stable contracts, stable project context) with a measurable benefit (token/cost reduction observed in R2 data, not assumed). Until that evidence exists, R3 stays `BLOCKED_ON_EVIDENCE`. If executed, R3 must orchestrate the native Anthropic `cache_control` primitive only — it must never recreate an equivalent proprietary cache.

### R4 — Governed Project Memory

Before drafting or implementing R4, verify whether Loop Engine already has a durable-memory mechanism, rather than assuming a new engine is needed. It does: the local RAG layer (`docs/architecture/local-rag-index.md`, `docs/architecture/memory-layer.md`, `.loop-engine/rag-index.json`, `pnpm run rag-index` / `rag-search`) is already a governed, read-only, reconstructible, source-of-truth-in-docs memory layer scoped to this project. R4's job is therefore consolidation/integration of Anthropic-specific telemetry and governance context into that existing model, not creation of a new memory engine, and not a vector database / proprietary RAG build.

Any durable memory belonging to Loop Engine — existing or extended under R4 — must keep: explicit project scope, provenance, auditability, permissions, isolation, deletion, explicit retention/expiration where relevant, and exportability where relevant. An Anthropic-hosted memory primitive (e.g. the client-side `memory_20250818` tool, if ever adopted) never becomes an opaque source of truth: the repository, the architecture docs, and Loop Engine's own governed memory remain authoritative.

### LATER, with explicit gates

- **Batch API**: not implemented before a concrete gate is met — recurring volume of non-interactive tasks, demonstrable significant cost savings, and a real need for deferred execution. None of these is currently demonstrated.
- **Files / Large Context API**: not implemented before a real need not already covered by current context mechanisms (`src/context/`, `docs/architecture/minimal-context-builder.md`) is demonstrated, and the API is judged sufficiently mature.

### REJECT / NOT PLANNED

- No general-purpose tool use in the text-only provider without a demonstrated use case.
- The consultative Anthropic API provider is never turned into a general-purpose agent.
- Loop Engine never duplicates Claude Code.
- No new generic routing chantier is opened by this roadmap. `preferredCapabilityTier` and capability-based routing (`src/policy/resolver.ts`, `docs/architecture/agent-policy-engine.md`) already exist and are sufficient; routing is only extended if a genuinely new capability requires it, and that extension — if it ever happens — is out of scope for this document.

## Lots

Global status: **R1, R2, and R4 done**. R3 stays `BLOCKED_ON_EVIDENCE` (see R2 decisions below, unchanged by R4). The LATER lots below have not begun.

### R1 — Anthropic Provider Consolidation

- Status: `DONE`
- Prerequisites: none (existing provider code already in `main`)
- Entry criteria: this roadmap merged; no other in-flight change to `src/text-only-provider/**`
- Scope: single source of truth for supported/priced model IDs; remove duplicated hardcoded IDs at the four listed sites; `strict: true` where already supported by the contract; bounded/deterministic retries limited to clearly transient errors; consistent error/usage reporting; correct `provider-adapters.md` if the stub/wired divergence is reconfirmed at execution time
- Out of scope: new provider, new framework, tool use, routing changes, batch/files/caching
- Dependencies: none
- Rollback: revert the model-ID indirection and retry logic independently per commit; no schema/data migration involved, so rollback is a plain revert
- Acceptance criteria: no hardcoded Anthropic model ID remains outside the single source of truth; retries never fire on auth/validation/non-transient 4xx (covered by tests); `provider-adapters.md` no longer implies the Anthropic API provider is a stub; `pnpm run ci` passes
- Validations: `pnpm run ci` (typecheck, tests, json-check, `audit:strict`, `audit:profiles`)
- Indicative AI policy: Code, Claude Code, Sonnet, Medium
- Decisions actually taken:
  - Single source of truth: `ANTHROPIC_HAIKU_4_5_MODEL` / `ANTHROPIC_SONNET_5_MODEL` constants added to the existing `src/text-only-provider/pricing.ts` (no new module, no generic model registry). `AnthropicPricingModel` is now derived from these constants. `src/agents/registry.ts`, `src/intelligence/roadmap-proposal-routing.ts`, and `src/cli.ts:311` (the fourth site) now import these constants instead of repeating the literal strings; `pricing.ts` itself uses them internally. `preferredCapabilityTier` and `src/policy/resolver.ts` were not touched.
  - `strict: true` was added to `output_config.format` in `anthropic-api-provider.ts` unconditionally whenever an `outputSchema` is provided; the contract shape (`{ type: "json_schema", schema, strict }`) is additive and does not change any existing field.
  - Retries: a small local primitive inside `anthropic-api-provider.ts` (no shared/generic retry framework). Bounded to `ANTHROPIC_MAX_ATTEMPTS = 3` total attempts. Retried only on HTTP `429` and the already-classified transient 5xx set `{500, 502, 503, 504, 529}`. Never retried: `400/401/402/403/404/413`, refusals, output truncation, invalid responses, local timeouts/transport failures. Backoff honors a well-formed `Retry-After` header (capped at 30s), otherwise deterministic exponential backoff (250ms base, doubling, capped at 2s). The delay primitive is injectable (`AnthropicApiProviderOptions.sleep`) for deterministic tests; production defaults to a real `setTimeout`-based sleep. **Timeout budget decision:** the pre-existing `input.timeoutMs` remains the total wall-clock budget for the whole call, not a per-attempt budget — retries never make a call take longer overall than a single non-retried attempt already could. A shared `deadlineAt` bounds every attempt's `AbortController` to whatever time remains, and a retry is only taken if its backoff delay still fits inside that remaining budget; otherwise the last observed failure is returned immediately instead of waiting past the caller's budget.
  - Observability: `TextOnlyProviderSuccess`/`TextOnlyProviderFailure` gained an optional `attempts` field (additive, only present once at least one HTTP attempt was made) so a retried/failed call remains visible instead of silently disappearing. No cost/usage telemetry platform was built (left to R2).
  - `provider-adapters.md` corrected: the stub/wired divergence was reconfirmed by direct code inspection and the document now states explicitly that it only describes `src/providers/` and does not describe `anthropic-api-provider.ts` / `claude-code-cli-executor.ts`.

### R2 — Usage & Cost Telemetry

- Status: `DONE`
- Prerequisites: R1 merged (single source of truth for model IDs/pricing simplifies cost calculation)
- Entry criteria: R1 done
- Scope: capture, when available, per call: model actually used, input/output tokens, cache write/create tokens, cache read tokens, cost, duration, request ID, error classification, batch info (stored for later, not consumed yet)
- Out of scope: any new routing/cost-decision consumer, any observability platform
- Dependencies: R1
- Rollback: telemetry capture is additive to existing structured output; revertible without affecting call behavior
- Acceptance criteria: every Anthropic API call in the text-only provider produces a telemetry record with the fields above (fields explicitly marked unknown/unavailable when the API does not return them); no telemetry write blocks or alters the provider call path; `pnpm run ci` passes
- Validations: `pnpm run ci`
- Indicative AI policy: Code, Claude Code, Sonnet, Medium
- Decisions actually taken:
  - No new telemetry system was built. The existing `TextOnlyProviderSuccess`/`TextOnlyProviderFailure` contract (`src/text-only-provider/types.ts`) was extended additively — the same extension point R1 already used for `attempts`:
    - `TextOnlyProviderUsage` gained optional `cacheCreationInputTokens` / `cacheReadInputTokens`, present only when the Anthropic response explicitly returns them (never defaulted to `0`).
    - `TextOnlyProviderSuccess` gained optional `respondedModel` (the response body's own `model` field, when present and non-empty — may differ from the requested `model`), `requestId` (from the `request-id` response header of the last attempt), and `costUsd` (`number | null`).
    - `TextOnlyProviderFailure.requestId` is now also populated from the `request-id` response header (previously only from the JSON error envelope's `request_id` field when present); the header takes priority since it is always present, unlike the JSON body.
  - Only the **last attempt's** request ID is kept on both success and failure — sufficient to diagnose the outcome actually returned to the caller; no accumulated per-attempt list, matching the "smallest solution" instruction.
  - `durationMs` already covered every attempt and backoff since R1 (a single `startedAt`/`now()` pair spans the whole retry loop); R2 added a deterministic test proving this (a retried call's duration is strictly greater than a single-attempt call's, using a shared injectable, incrementing fake clock — no real `sleep`/timers in tests).
  - Cost: `costUsdForUsage` in `anthropic-api-provider.ts` reuses `resolveAnthropicPricing`/`calculateCostUsd` from `pricing.ts` strictly (no tariff duplication). It returns `null` — never a fabricated estimate — when the model is absent from the pricing table, or when cache tokens are present (the pricing table has no cache read/write rates yet, so blending them into the input/output rate would be an invented number). `costUsd` is present only when `usage` is present.
  - Batch info: not captured. No caller of the text-only provider uses or plans to use the Batch API (see roadmap `LATER — Batch API`, still ungated); adding an always-absent field would be dead surface, so it was intentionally left out rather than added as a permanently-`undefined` placeholder.
  - Point-of-integration priority 2 (governance/roadmap callers): `src/intelligence/roadmap-proposal.ts` and `src/intelligence/gate-reassessment.ts` previously discarded **all** telemetry on a provider-level failure (`reason: "provider_error"`), silently violating the R1 decision that "a retried/failed call must not silently disappear from usage/cost telemetry." Both reports gained an additive `providerFailure?: { code, durationMs, attempts?, requestId?, httpStatus? }` field, populated only for `reason: "provider_error"`, kept structurally distinct from the pre-existing validation-failure telemetry fields (`provider`/`model`/`effort`/`durationMs`/`usage`, which remain reserved for `reason: "invalid_*_response"` as already documented). `diagnosticMessage` is never projected. This was judged in-scope as explicit priority-2 integration work called out by this roadmap, not scope creep.
  - GUI/allowlist consumers (`src/composition/execution-decision-proposal.ts`, `src/gui/desktop/execution-decision-controller.ts`, `src/gui/desktop/execution-decision-cli-proposer.ts`) were deliberately **not** touched: they already use a strict field allowlist (`only(result, [...])`) as a security/minimality boundary, and surfacing new fields there without a driving GUI need would be exactly the "GUI just to display" case this roadmap excludes from R2.
  - No persistence was added anywhere. Every field above is scoped to a single provider call's return value; nothing is written to disk, a database, or an event bus.

### R3 — Prompt Caching (gated)

- Status: `BLOCKED_ON_EVIDENCE` (not `PLANNED` — the gate below must be satisfied first)
- Prerequisites: R2 merged and run long enough to produce real telemetry
- Entry gate (explicit — must all hold before this lot may move to `PLANNED`): R2 telemetry shows a stable/repeated context across calls (e.g. `AGENTS.md`, stable architecture excerpts, stable contracts) AND a measurable expected token/cost benefit from caching that context, both evidenced by captured R2 data, not by assumption
- Scope, if the gate is met: orchestrate the native `cache_control` primitive on the identified stable context segments only
- Out of scope: any proprietary/custom caching layer; caching of volatile or per-call content
- Dependencies: R2
- Rollback: `cache_control` usage is removable per call site without contract change
- Acceptance criteria (once gated in): cached segments are exactly the ones justified by R2 evidence; cost/telemetry from R2 shows the expected reduction after activation; `pnpm run ci` passes
- Validations: `pnpm run ci`
- Indicative AI policy: Code, Claude Code, Sonnet, Medium
- Post-R2 evaluation: still `BLOCKED_ON_EVIDENCE`. R2 makes the necessary fields observable on a _single call's_ return value (`respondedModel`, tokens, cache tokens, cost, duration, request ID), but this roadmap explicitly rejected adding any new persistence in R2 (see R2 decisions above and the "hors périmètre strict" boundary). Without persisted, cross-call telemetry there is no way to observe repetition across calls — a stable/repeated context and a measurable token/cost benefit are properties of _sequences_ of calls, not of one call's data. The entry gate ("R2 telemetry shows a stable/repeated context across calls... AND a measurable expected token/cost benefit... both evidenced by captured R2 data") therefore cannot be met by R2 alone in the near-total majority of cases, and is not met here. R3 remains `BLOCKED_ON_EVIDENCE`, not `PLANNED`; moving it forward would require either manually collecting and reviewing telemetry across a real sequence of governance/roadmap calls over time, or a future, separately-decided persistence lot — neither of which this roadmap authorizes by itself.

### R4 — Governed Project Memory (Anthropic-relevant scope)

- Status: `DONE`
- Prerequisites: audit of existing Loop Engine memory mechanisms (already done above — the local RAG layer is the existing mechanism)
- Entry criteria: R1/R2 not required as a hard blocker, but should generally follow so that any captured Anthropic telemetry/context has a stable shape before being referenced from governed memory
- Scope: consolidate/integrate Anthropic-provider-relevant governance context (e.g. decisions, gate reassessments) into the existing governed memory model (RAG layer / docs-as-source-of-truth), preserving scope, provenance, auditability, permissions, isolation, deletion, and explicit retention where relevant; ensure any future Anthropic-hosted memory primitive is never treated as authoritative
- Out of scope: new memory engine, vector database, proprietary RAG store
- Dependencies: none blocking; informed by R1/R2 if available
- Rollback: purely additive to existing docs/index sources; removable without loss (per the existing memory-layer reconstruction rule — no fact may live only in the index)
- Acceptance criteria: no new persistent memory engine introduced; Anthropic-relevant governance context remains traceable to a file/section per the existing memory-layer traceability rule; `pnpm run ci` passes
- Validations: `pnpm run ci`; manual review confirming no Anthropic primitive is treated as source of truth
- Indicative AI policy: start with audit/review; Opus Medium only if a genuine memory-architecture decision is required, otherwise Sonnet Medium for implementation
- Outcome (local consolidation, decision A — no new memory engine/RAG/vector database/embedding was created): closed 9 gaps found in the existing local RAG layer instead of building anything new.
  - **Isolation** — `generateRagIndex()` now fails closed (explicit error, non-zero exit, no partial write) unless the current working directory is the Loop Engine repository root (`projects.yaml` present), so the index can never be built inside an inspected project. Covered by a dedicated test invoking `rag-index` from a temporary directory outside the repository and asserting no `.loop-engine/` is created there.
  - **Provenance / freshness** — `RagSearchReport` now exposes `generatedAt` (additive, `schemaVersion` unchanged at `1`), so a search response's staleness relative to the last index build is observable without an extra disk read per query.
  - **Staleness / lifecycle** — a missing, unreadable, unparsable, or schema-mismatched index degrades soft to the existing `missing_index` error (no new error code, no exception), matching the fail-soft style already used by `src/core/git.ts`.
  - **Auditability** — one new `rag`-category audit rule (`DOCS-025`) keeps `RAG_SOURCE_PATHS` (`src/core/reports.ts`) exactly aligned with the allowlists documented in `docs/architecture/local-rag-index.md` and `docs/architecture/memory-layer.md`; it runs as part of `pnpm run audit:strict`/`pnpm run ci`.
  - `AGENTS.md` remains deliberately excluded from the RAG allowlist (documented decision, no code change): canonical doctrine must be read in full, not retrieved through a fuzzy keyword search that could return an out-of-context excerpt on a binding rule.
  - Docs (`memory-layer.md`, `memory-layer-checklist.md`, `local-rag-index.md`) were brought to present tense, list `docs/releases/`, document `sectionTitle`/`headingLevel`/`generatedAt`, and gained explicit "Portée" (mono-repo scope) and "Fraîcheur" (freshness/lifecycle) sections.
  - Supporting fix, not itself one of the 9 gaps: the `rag` audit category (already declared in `src/audit/types.ts`/`src/audit/registry.ts` but never used by any rule) required updating three pre-existing validators that hardcoded the prior 4-category list (`AUDIT_RULE_CATEGORY_VALIDITY_RULE`, `JSON_CHECK_ENUM_VALUE_CONSTANTS_RULE`, and `AUDIT_CATEGORIES` in `src/commands/json-check.ts`) to accept `"rag"` — a direct, minimal consequence of DOCS-025 being the first `rag`-category rule, not scope creep.

### LATER — Batch API

- Status: `LATER` (no target lot number until gated)
- Gate: recurring volume of non-interactive tasks suited to batching, a demonstrably significant cost saving, and a real need for deferred execution — none currently demonstrated
- Scope if gated in: to be defined at gate time
- Indicative AI policy: to be decided when the gate becomes true

### LATER — Files / Large Context API

- Status: `LATER` (no target lot number until gated)
- Gate: a real need not covered by current context mechanisms (`src/context/`, minimal context builder) combined with sufficient API maturity — neither currently demonstrated
- Scope if gated in: to be defined at gate time
- Indicative AI policy: to be decided when the gate becomes true

## Roadmap governance

- This document governs Anthropic-provider-specific execution only; it does not supersede or duplicate `docs/architecture/**`, `docs/roadmap/roadmap-v16.md`, or `docs/roadmap/loop-engine.md`.
- Status changes require evidence linked to merged pull requests and passing validations (`pnpm run ci`), consistent with the convention in `docs/roadmap/roadmap-v16.md`.
- No lot in this document may be started as part of the session that authored this roadmap; the document itself introduces no application-code change.
