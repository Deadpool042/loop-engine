# Execution Plan Evidence

## Status

V14.18 — implemented.

## Goal

Execution reports must expose enough information to prove which admitted provider,
runtime, profile, model, effort, budget and policy constraints governed a run,
without publishing the internal execution plan. Equivalent evidence must also be
comparable through one deterministic integrity fingerprint.

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
admitted. It also emits `executionPlanFingerprint` using SHA-256 over a canonical,
versioned representation of the bounded evidence.

## Fingerprint contract

`canonicalizeLoopExecutionPlanEvidence(...)` fixes property order and sorts
set-like capability and permission arrays. Rationale order remains significant
because it records the decision path. The resulting UTF-8 JSON is hashed with
SHA-256 and represented as a lowercase 64-character hexadecimal value.

`verifyLoopExecutionPlanEvidenceFingerprint(...)` recomputes the fingerprint and
fails closed for unsupported algorithms or any evidence drift. The fingerprint
is an integrity and correlation identifier, not a signature or proof of origin.

## Boundary

```text
LoopRunResult + admitted AgentPolicyResolution
  -> projectLoopExecutionPlanEvidence(...)
  -> bounded public evidence
  -> canonicalize + SHA-256
  -> evidence + fingerprint in execution report JSON
```

The internal `LoopExecutionPlan` remains the sole executor input and is never
serialized wholesale.
