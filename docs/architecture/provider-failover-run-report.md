# Provider failover run reporting

## Purpose

V14.27 closes the observability gap between provider execution and the public Loop run report. V14.26 preserved bounded failover evidence on `LoopExecutorResult`; this lot carries that evidence through the application execute boundary and attaches a deterministic integrity fingerprint to the final run report.

## Execution facade

`runLoopExecuteWithProviderFailoverEvidence(...)` wraps the executor supplied through `LoopRunExecuteOptions`. It captures only `providerFailoverEvidence`, delegates the complete lifecycle to the existing `runLoopExecute(...)`, then returns an immutable enriched result.

The underlying runner remains responsible for planning, policy admission, context construction, execution, validation, repair and terminal state transitions. The facade does not duplicate or reorder those operations.

## Public result

`LoopRunResult` now has two additive optional fields:

- `providerFailoverEvidence`;
- `providerFailoverFingerprint`.

The application composition root exposes the evidence-preserving facade as its `runLoopExecute` implementation. Existing direct imports of the base runner remain compatible.

## Reporting

`generateExecutionReportWithEvidence(...)` now projects both evidence families:

1. execution-plan evidence derived from policy admission;
2. provider-failover evidence captured from the executor.

Each evidence object receives its own SHA-256 fingerprint. The failover fingerprint is recomputed from canonical bounded fields rather than trusted from caller input.

## Compatibility

Single-provider executors do not need to emit failover evidence. Their final report contains explicit `null` values for failover evidence and fingerprint. Historical run fields, validation behavior, repair behavior, commit behavior and publication behavior are unchanged.

## Security guarantees

The pipeline transports only the bounded evidence contract introduced in V14.24–V14.26. It does not add prompts, context contents, generated output, provider stdout or stderr, exception text, credentials, environment variables or provider payloads to `LoopRunResult`.

The fingerprint is an integrity identifier, not an authenticity signature.

## Invariants

- one underlying runner invocation per application execute call;
- one executor invocation boundary owned by the runner;
- failover evidence captured from the actual executor result only;
- deterministic fingerprint recomputed at the run/report boundary;
- no evidence manufactured for mono-provider execution;
- no widening of provider, token, cost, duration, call or repair budgets;
- no change to validation, repair, commit or publication sequencing.
