# Loop Execution Plan

## Status

V14.15 — implemented.

## Goal

A concrete provider must execute one explicit, immutable decision rather than
re-deriving provider, model, effort, budget or policy data from unrelated
configuration.

`createLoopExecutionPlan(...)` converts the admitted `LoopExecutorInput` into a
serializable `LoopExecutionPlan` after candidate selection, policy resolution
and minimal-context construction have completed.

## Contract

The plan records:

- the run, project and selected roadmap candidate;
- the bounded context package;
- the selected provider, runtime, profile, model and effort;
- the selected profile budget;
- the policy identity, mode, required capabilities and permissions;
- the deterministic rationale produced by task classification and policy
  resolution.

The factory is pure. It performs no filesystem, process, network, environment,
clock or random access. It rejects any request whose policy is not both
`resolved` and `selected`.

## Execution boundary

The Codex adapter creates the plan before inspecting or modifying the worktree.
It then fails closed unless the plan targets provider `openai` and runtime
`codex`. The model passed to the executable comes from the plan, not from a
second independent decision.

```text
candidate + policy + context
        -> createLoopExecutionPlan(...)
        -> immutable LoopExecutionPlan
        -> provider compatibility checks
        -> provider process
```

This removes policy/provider drift: the provider invocation cannot silently use
a model or runtime different from the admitted agent profile.

## Compatibility

V14.15 does not change public CLI arguments, execution-report schema, commit
behavior, validation limits or publication guarantees. `LoopExecutor` remains
the injected port; the concrete adapter now consumes a deterministic plan
internally before performing effects.
