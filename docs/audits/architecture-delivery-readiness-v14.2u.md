# Architecture & Delivery Readiness Audit — V14.2u

## Executive Summary

Loop Engine is technically robust but not operationally complete.

At baseline `dff2810ae2310cf61c4305c40d599b208bf2809c`, the repository has:

- a deterministic local cockpit and audit engine;
- a typed Agent Registry, selector, policy forecast and bounded context builder;
- guarded Runtime implementations, policy admission, dry-run plans and execution receipts;
- a strict public-request pipeline through decode, authorization, assembly and preparation;
- an inbound transport-neutral handler with injected authentication, replay and access-policy boundaries;
- strong fail-closed behavior and extensive adversarial coverage.

However, these capabilities remain separated into islands. The public inbound path stops at a prepared declarative request. The existing Runtime execution bridge does not consume that request. The LoopRunner remains plan-only. Authentication, ACL, replay storage, inbound transport and provider execution remain injected contracts or inert stubs.

The current audit result of 549/549 and score 100 is valid for the registered rules, but it must not be interpreted as product readiness. The rule inventory primarily proves local invariants, module presence and forbidden dependencies. It does not currently detect the absence of the executable vertical slice, the stale self-roadmap, the obsolete normative RFC or the mismatch between the README and package scripts.

**Verdict: `ROADMAP_RESEQUENCING_REQUIRED`.**

The next delivery must be a coherent vertical slice, not another sequence of hardening micro-lots.

## Baseline and Validation Evidence

| Item | Observed value |
| --- | --- |
| Repository | `Deadpool042/loop-engine` |
| Baseline branch | `main` |
| Baseline commit | `dff2810ae2310cf61c4305c40d599b208bf2809c` |
| Latest validated workflow | GitHub Actions CI #616 |
| Typecheck | PASS |
| Tests | 1,381/1,381 PASS |
| Test suites | 211 |
| Strict audit | 549/549 PASS |
| Audit score | 100 |
| Audit warnings/failures | 0/0 |
| Audit recommendations | 0 |
| Audit profiles | PASS |

The V13.67 audit baseline reported 994 tests and 476 audit rules. Since then:

- tests increased by 387, approximately 38.9%;
- audit rules increased by 73, approximately 15.3%;
- the public CLI still rejects `run --mode execute|commit|publish`;
- the inbound path still stops before Runtime execution.

The growth is therefore mostly assurance growth, not equivalent product-capability growth.

## Product Objective Alignment

The source of truth in `docs/architecture/final-objective.md` defines a deterministic cockpit that should eventually orchestrate one bounded lot through planning, agent delegation, validation, repair and controlled publication.

The intended agent policy is also clear:

1. local first;
2. retrieval first;
3. smallest capable agent first;
4. escalation only on failure;
5. explicit permissions and budgets;
6. Loop Engine owns policy and validation;
7. external orchestrators only trigger cycles.

The repository implements much of the vocabulary and many of the boundaries, but not the operational cycle.

## Capability Matrix

| Capability | Status | Evidence and gap |
| --- | --- | --- |
| Local project cockpit | IMPLEMENTED | Summary, context, next, review, handoff, RAG and audit are available. |
| Audit engine and CI | IMPLEMENTED | 549 rules, strict mode, profiles and GitHub Actions are green. |
| Agent vocabulary and registry | PARTIAL | Typed profiles and registry exist, but default profiles are explicitly illustrative and unverified. |
| Agent selection | PARTIAL | Capability, permission, effort and budget filtering exist. Tie-breaking uses effort then profile ID; actual price, context size and historical success are not selection inputs. |
| Policy forecast | IMPLEMENTED | Restrictive policy resolution is integrated into plan mode without execution. |
| Minimal context package | IMPLEMENTED | Local, bounded, deterministic and path-confined. |
| LoopRunner plan mode | IMPLEMENTED | Planning and forecast work. |
| LoopRunner execute/validate/repair | MISSING | `runLoopPlan` hardcodes `mode: "plan"`; validation, modified files, commit and publication remain empty/null. |
| Guarded Runtime execution | IMPLEMENTED, OPT-IN | V10 Runtime, simulated adapter, policy-aware execution, local-process binding, plans and receipts exist under Core. |
| Public request decode/authorize/assemble/prepare | IMPLEMENTED | `prepareAuthorizedLoopRuntimeRequest` composes the chain and returns a prepared request. |
| Transport-neutral inbound handler | IMPLEMENTED TO PREPARATION | Envelope, authentication, replay, security and preparation are composed. Accepted output contains `prepared`, not an execution result. |
| Prepared request to Runtime adapter | MISSING | `LoopRuntimeConstructedRuntimeRequest` has no production consumer that reaches the existing Runtime bridge. |
| Stable inbound execution result | MISSING | No single transport-neutral success/failure schema spans inbound validation through Runtime receipt. |
| Concrete authentication and ACL | MISSING | Verifier, authorizer and policies are injected; no production identity or role implementation exists. |
| Concrete replay store | MISSING | Replay protection is an injected port. |
| Concrete inbound transport | MISSING | No HTTP/webhook/socket/queue adapter is active. |
| Real provider execution | MISSING | Claude Code, Codex and OpenClaw remain inert or non-executable by default. |
| Resume/journal/cancellation | DOCUMENTED_ONLY | Contracts and states exist, but no operational cycle persists or resumes execution. |
| Self-hosted roadmap | STALE | `docs/roadmap/loop-engine.md` contains only completed V7.3–V7.5 entries and no current candidate. |

## Architecture Findings

### A1 — The system has two unconnected execution stories

The inbound story reaches:

```text
unknown envelope
-> validation
-> authentication
-> replay/security
-> public request decode
-> authorization
-> engine assembly
-> prepared LoopRuntimeConstructedRuntimeRequest
-> STOP
```

The Runtime story independently supports:

```text
declarative request + registry + mapping + policy
-> Runtime admission
-> dry-run plan or Runtime execution
-> receipt/public projection
```

No production adapter joins these stories. This is now the highest-value missing capability.

### A2 — LoopRunner remains disconnected from the Runtime work

`src/loop/runner.ts` still hardcodes plan mode, creates an inert execution plan, discards its result and completes without validation or effects. The large body of Runtime, transport and receipt work is intentionally absent from `src/loop/**`.

That isolation was a useful safety boundary while contracts were immature. It is now also the main product bottleneck.

### A3 — The self-roadmap cannot steer the real repository

`docs/roadmap/loop-engine.md` contains only three completed V7 entries. It has no active candidate representing the V13/V14 architecture or the next delivery.

Consequences:

- `loop next loop-engine` cannot express the actual priority;
- plan mode cannot self-host against current work;
- contributors infer the next task from recent commits rather than a source of truth;
- micro-lot continuation becomes the default behavior.

### A4 — The normative RFC is obsolete

`docs/architecture/execution-architecture-rfc.md` freezes V13.0 and states that Bridge, Transport and Runtime do not exist. The repository now contains all three families, including guarded local-process execution and receipts.

An obsolete normative document is more dangerous than an absent document because audits can prove its presence while its model contradicts production code.

### A5 — The audit score has a product-readiness blind spot

The current strict audit passes 549 rules with zero recommendations while all of the following are true:

- no active self-roadmap candidate;
- LoopRunner execute mode is missing;
- prepared inbound requests have no Runtime consumer;
- the normative execution RFC is stale;
- README documents `pnpm run reports:fixtures`, while `package.json` exposes `generate:report-fixtures`;
- default agent profiles are illustrative;
- selector ranking omits price, context size and historical success.

The score is therefore a compliance score over the current rule registry, not a completeness score.

### A6 — Test growth is disproportionate to delivered behavior

The V14.2 authentication series added many narrow suites for descriptors, accessors, thenables, promises, inherited properties and proxies. These tests are valid individually, but several overlap and one duplicate nested-thenable suite already required consolidation in V14.2u.

The repository needs test-governance rules:

- one primary suite per observable capability;
- adversarial cases grouped by boundary, not by JavaScript mechanism;
- duplication review before opening a new test-only lot;
- no test-only lot unless it closes a demonstrated risk or failing invariant;
- capability delivery and its essential hardening should ship together.

### A7 — Public surface and navigation cost are high

The architecture exposes many fine-grained contracts, evaluators, factories and facades. This preserves explicit boundaries but makes the happy path difficult to discover.

Immediate breaking consolidation is not recommended. First create one real application service that consumes the existing contracts. Reduce or reorganize public surface only after usage proves which layers deserve permanence.

## Security Assessment

### Strengths

- default-deny behavior is consistent;
- ports and effectful dependencies are injected;
- Runtime local-process execution is guarded, shell-free and allow-listed;
- inbound authentication, replay and access decisions gate downstream preparation;
- failures are generally structured and redacted;
- time and identity bindings are explicit;
- the public inbound handler is transport-neutral;
- tests cover hostile object shapes and async failures extensively.

### Remaining operational risks

- injected authentication and authorization can be mistaken for production identity/ACL readiness;
- there is no concrete replay persistence;
- no end-to-end cancellation or durable journal exists;
- no one-shot application service currently proves that policy remains intact from inbound request through Runtime receipt;
- the stale RFC and roadmap can cause safe components to be composed in the wrong order.

A concrete network adapter or real provider should not be introduced before the vertical slice below is complete.

## Audit Engine Improvements

Add product-readiness rules only after the next vertical slice, avoiding another rule-only campaign. The minimum useful additions are:

1. **Self-roadmap freshness** — at least one active candidate when the final objective remains incomplete.
2. **Prepared-request consumption** — a prepared public Runtime request must have an intentional consumer or be explicitly documented as terminal.
3. **README/script parity** — every documented package script must exist.
4. **RFC freshness** — normative documents must not label implemented layers as future/non-existent.
5. **LoopRunner readiness** — distinguish plan-only compliance from execute-mode readiness.
6. **Agent-profile provenance** — default profiles used for forecasts must be marked illustrative in public output or replaced by verified configuration.
7. **Selection-policy alignment** — document and test the exact ordering factors; do not claim price/history optimization until implemented.
8. **Test duplication control** — detect identical or near-identical capability suites through a periodic architectural audit, not a fragile token rule.

## Recommended Resequencing

### V14.3 — Prepared Inbound Runtime Execution Vertical Slice

Deliver one Core application service that joins the existing inbound prepared-request path to the existing policy-aware Runtime execution path.

Observable output:

```text
inbound envelope
-> validate/authenticate/replay/authorize/assemble/prepare
-> adapt prepared request
-> Runtime admission
-> dry-run plan OR bounded execution
-> Runtime receipt
-> stable redacted transport-neutral result
```

This is the next real lot.

### V14.4 — LoopRunner Execute and Validation Cycle

After V14.3 proves the execution boundary independently:

- implement `run --mode execute` against an injected executor;
- record modified files;
- run configured validation and audit;
- implement a bounded repair loop;
- keep commit and publish disabled.

### V14.5 — Concrete Identity, ACL, Replay and One Inbound Adapter

Only after the application service and execution result are stable:

- implement one concrete authentication strategy;
- implement explicit role/tenant/operation ACL;
- implement replay persistence;
- add one inbound adapter, preferably the smallest transport required by the first consumer;
- retain the transport-neutral Core handler.

### V14.6 — One Real Agent/Provider Pilot and Controlled Commit Mode

Select one provider/runtime integration, not several:

- verified executable mapping and configuration;
- credentials supplied explicitly outside Core contracts;
- bounded invocation and redacted results;
- operational success/failure metrics;
- only then implement `run --mode commit` after successful validation.

`publish` remains a later, explicit capability.

## Next Delivery Batch — V14.3

### Goal

Create a single, tested application-service boundary from accepted inbound request to Runtime plan/receipt, reusing the existing prepared-request and policy-aware Runtime components.

### Required scope

- define an explicit adapter from `LoopRuntimeConstructedRuntimeRequest` to the existing canonical Runtime execution input;
- compose `handleInboundLoopRuntimeRequest` with Runtime admission and execution without reimplementing authentication, replay, authorization, assembly or preparation;
- support `dry_run` as a first-class no-effect path;
- support the simulated Runtime for deterministic execution proof;
- allow local-process only when an explicit injected binding and resolved policy authorize it;
- return one frozen, JSON-safe, redacted result with stable stages and correlation identifiers;
- preserve exactly-once invocation across verifier, replay port, authorizer, assembler and Runtime adapter;
- add one end-to-end suite covering the whole capability, with focused unit tests only where behavior cannot be observed through the facade;
- update the execution architecture document to describe the real current layers;
- update audit coverage for the new vertical boundary, not for every internal helper.

### Explicit exclusions

- no HTTP server or framework;
- no real Claude/Codex/OpenClaw execution;
- no secret loading or environment discovery;
- no default authentication, ACL or replay implementation;
- no LoopRunner execute mode yet;
- no repair, commit, push or tag;
- no broad refactor of historical Core exports;
- no new micro-lots for individual getters, proxies, promise behaviors or source-token checks.

### Acceptance criteria

1. Invalid envelope, failed authentication, replay rejection, security denial, authorization denial, assembly failure or preparation failure causes zero Runtime calls.
2. A valid dry-run returns a stable Runtime plan and starts no effectful adapter.
3. A valid simulated execution returns a stable receipt and public result.
4. Local-process execution is impossible without explicit policy admission and an injected local-process binding.
5. The prepared public request is adapted exactly once; no second decode, authorization, assembly or preparation occurs.
6. Internal commands, credentials, raw output and stack details do not appear in the public result.
7. Correlation identity is preserved from inbound request through plan/receipt.
8. Sync/async dependency failures fail closed with stable stage/reason codes.
9. One end-to-end test proves the successful path and all major stop stages.
10. `pnpm run validate`, `pnpm run ci`, strict audit and profile checks pass.

### Suggested branch and commit

- Branch: `feature/prepared-inbound-runtime-execution-v14.3`
- Commit: `feat(core): execute prepared inbound runtime requests`
- Effort: `high`

Do not subdivide V14.3 into adapter, facade, receipt and documentation micro-lots. They form one observable capability.

## Immediate Governance Decision

Effective after this audit:

- V14.2 is closed;
- no further authentication Promise/thenable hardening lot is planned without a concrete incident, failed invariant or new runtime implementation exposing a real risk;
- the self-roadmap becomes the source of truth for the next batch;
- every proposed lot must state its observable capability, terminal output and exclusions;
- test-only work requires a demonstrated gap and a duplication review;
- audit score 100 must be reported as “registered-rule compliance”, never “product complete”.

## Final Verdict

```text
TECHNICAL_INTEGRITY: HIGH
REGISTERED_RULE_COMPLIANCE: PASS
PRODUCT_READINESS: PARTIAL
OPERATIONAL_READINESS: NOT_READY
ROADMAP_STATUS: RESEQUENCING_REQUIRED
NEXT_BATCH: V14.3_PREPARED_INBOUND_RUNTIME_EXECUTION
```
