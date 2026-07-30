# Provider failover orchestration

## Purpose

Loop Engine may execute one admitted micro-lot through more than one provider only when the preceding provider fails in a classified recoverable way. Failover is bounded, deterministic and local to one execution cycle.

This contract does not race providers, retry indefinitely or allow a fallback executor to reuse another provider's identity.

## Indivisible attempt

Each attempt is the pair:

```text
LoopExecutionPlan + LoopExecutor
```

The plan contains the provider, runtime, profile, model, effort, budget and admitted policy evidence. The executor associated with that plan is the only executor allowed to consume it.

A fallback provider therefore requires its own admitted plan. Reusing the primary plan with a different executor would make the execution evidence false and is prohibited.

## Ordered execution

`executeLoopProviderFailover(...)`:

1. validates a positive global attempt budget;
2. rejects an empty sequence or duplicate provider ids before effects;
3. executes attempts strictly in declared order;
4. stops immediately after the first completion;
5. continues only after a classified recoverable failure;
6. stops on terminal failures or when the attempt budget is exhausted;
7. aggregates modified file paths without duplicates;
8. emits bounded immutable evidence.

No attempt is run concurrently. A provider cannot appear twice in one sequence, preventing loops and repeated side effects through the same provider.

## Failure policy

The default recoverable failures are infrastructure availability failures:

- `executor_unavailable`
- `provider_unavailable`
- `provider_rate_limited`
- `provider_timeout`
- `runtime_unavailable`

Policy rejection, invalid plans, validation failures and other unknown codes are terminal by default. Callers may inject a reviewed classifier, but classification receives only the stable failure contract and attempt identity.

Thrown provider exceptions are converted into `provider_executor_exception`; exception text is never included in public evidence.

## Shared budget

`maxAttempts` is global to the sequence. It is not reset per provider. The orchestrator slices the ordered sequence to that limit and never invokes attempts beyond it.

Provider-specific token, cost, duration, call and repair budgets remain embedded in each admitted `LoopExecutionPlan`. A future aggregate resource ledger may further reduce those plans, but cannot widen them.

## Public evidence

`LoopProviderFailoverEvidence` contains only:

- schema version;
- configured maximum attempts;
- ordered attempted provider ids;
- selected provider, or `null`;
- bounded attempt number and execution identity;
- completion/failure state;
- stable failure code;
- recoverability decision.

It excludes prompts, context contents, provider stderr/stdout, exception messages, credentials and diagnostic payloads.

## Runner integration

`createProviderFailoverLoopExecutor(...)` returns the existing `LoopExecutor` port. The execute runner therefore retains a single effect boundary and calls the injected executor once. The facade verifies that attempt one preserves the exact primary plan admitted by the runner, then owns all bounded provider switching behind that port.

Default application behavior remains single-provider until composition supplies reviewed fallback plans and executors.

## Guarantees

- smallest/primary capable provider remains first;
- escalation occurs only after recoverable failure;
- no provider race;
- no repeated provider;
- no unbounded retry;
- no cross-provider plan reuse;
- no publication or commit behavior;
- no provider diagnostics in public evidence.
