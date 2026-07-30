# Execution Plan Evidence

## Status

V14.17 — implemented.

## Goal

Execution reports must expose enough information to prove which admitted provider,
runtime, profile, model, effort, budget and policy constraints governed a run,
without publishing the internal execution plan.

## Public projection

`projectLoopExecutionPlanEvidence(...)` emits one immutable schema-versioned
projection only when an agent policy is both resolved and selected for execute or
commit mode.

The projection includes:

- provider, runtime, profile, model and effort;
- the selected profile budget;
- policy identity and mode;
- required capabilities and permissions;
- deterministic policy rationale.

It deliberately excludes project paths, context-package contents, prompts,
provider executable configuration, process output, environment values and
provider diagnostics.

`generateExecutionReportWithEvidence(...)` preserves every historical execution
report field and adds `executionPlanEvidence`, using `null` when no execution was
admitted. The application assembly exposes this projection to CLI JSON output.

## Boundary

```text
LoopRunResult + admitted AgentPolicyResolution
  -> projectLoopExecutionPlanEvidence(...)
  -> bounded public evidence
  -> execution report JSON
```

The internal `LoopExecutionPlan` remains the sole executor input and is never
serialized wholesale.
