# V14.24 provider failover architecture audit

## Scope

This audit records the invariants enforced by `src/loop/provider-failover.ts` and its focused tests.

## Enforced invariants

- each attempt binds one immutable `LoopExecutionPlan` to one `LoopExecutor`;
- the primary plan admitted by LoopRunner remains attempt one in the executor facade;
- duplicate provider ids are rejected before any provider effect;
- attempts execute sequentially and stop at the first success;
- only classified recoverable failures admit a fallback;
- the global positive attempt budget bounds the whole sequence;
- provider exceptions are converted to a stable redacted failure;
- public evidence is immutable and excludes prompts, context and provider diagnostics;
- the existing LoopExecutor port remains the runner integration boundary;
- default composition remains single-provider unless reviewed fallback attempts are supplied.

## Focused coverage

- recoverable primary failure followed by fallback success;
- terminal failure without fallback invocation;
- global attempt-budget exhaustion;
- duplicate-provider rejection before effects;
- provider exception redaction and reviewed classification;
- primary-plan preservation;
- immutable public evidence;
- Core export contract.

## Non-goals

This lot does not add a second concrete provider adapter, race providers, publish changes, widen execution permissions or infer fallback plans after policy admission. Concrete fallback plans must be assembled explicitly from matching provider registries and policies.
