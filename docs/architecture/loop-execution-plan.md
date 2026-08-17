# Loop Execution Plan

## Status

V14.16 — executor boundary implemented.

## Goal

A concrete provider executes one explicit, immutable decision rather than
re-deriving provider, model, effort, budget or policy data from unrelated
configuration.

`createLoopExecutionPlan(...)` converts the admitted candidate, policy and
context decision into a serializable `LoopExecutionPlan` after candidate
selection, policy resolution and minimal-context construction have completed.

## Contract

The plan records:

- the run, project and selected roadmap candidate;
- the bounded context package;
- for governed READY decisions, the immutable authorized writable file scope;
- the selected provider, runtime, profile, model and effort;
- the selected profile budget;
- the policy identity, mode, required capabilities and permissions;
- the deterministic rationale produced by task classification and policy
  resolution.

The factory is pure. It performs no filesystem, process, network, environment,
clock or random access. It rejects any decision whose policy is not both
`resolved` and `selected`.

## Execution boundary

The execute runner creates the plan before invoking the abstract executor port.
`LoopExecutor` accepts only `LoopExecutionPlan`; it no longer receives the raw
policy resolution and context fields as an unstructured request.

The Codex adapter consumes that prebuilt plan directly and fails closed unless
it targets provider `openai` and runtime `codex`. The model passed to the
executable comes from the plan, not from a second independent decision.

```text
candidate + policy + context
        -> createLoopExecutionPlan(...)
        -> immutable LoopExecutionPlan
        -> LoopExecutor port
        -> provider compatibility checks
        -> provider process
```

This removes policy/provider drift and closes the reconstruction gap: a provider
cannot silently recalculate, widen or replace the admitted execution identity.
Changing the authorized writable file scope changes the plan evidence fingerprint.
The runner's `ready` evidence records the selected profile and the
provider/runtime/model tuple without exposing executable paths or provider
output.

## Compatibility

V14.16 does not change public CLI arguments, execution-report schema, commit
behavior, validation limits or publication guarantees. Existing injected
executors retain the same port name, but their single argument is now the
immutable execution plan.
