# LoopRunner Execute, Validation and Repair Cycle

## Status

Lot V14.4 — implemented.

This document is the current contract for the LoopRunner `execute` mode. The
historical `plan` contract remains unchanged. The later controlled `commit`
mode is explicit and bounded; `publish` remains unimplemented.

## Goal

V14.4 turns one selected roadmap candidate into one bounded application cycle:

```text
plan candidate
-> resolve execute policy
-> build bounded context
-> call the selected injected LoopExecutor
-> optionally escalate once inside the same provider/runtime on an admitted structured failure
-> collect reported modified files
-> enforce the governed writable file scope
-> run configured validations and audit commands
-> optionally call one injected LoopRepairer per failed validation
-> stop after the effective policy-capped repair budget
-> completed OR failed
```

The runner orchestrates ports. It does not implement an AI provider, edit files
itself, infer authority, commit, push, publish, or discover credentials.

## Public entrypoints

- `runLoopPlan(projectName, options?)` remains synchronous and effect-free.
- `runLoopExecute(projectName, options?)` implements the V14.4 cycle.
- `pnpm loop run <project> --mode execute [--max-repairs <n>]` routes to the
  execute cycle; the requested repair count can restrict, but never widen, the
  repair ceiling resolved by policy.

Without an explicitly configured provider, the CLI returns a stable failed
`LoopRunResult` with `failure.code = "executor_unavailable"`. With an explicit
Codex or Claude Code provider, composition acquires a project lock and runs the
provider and configured validations in one temporary detached Git worktree. The
source repository is never modified by `execute`.

## Ports

### LoopExecutor

Receives the run id, resolved project, selected roadmap candidate, admitted
`AgentPolicyResolution`, and bounded `MinimalContextPackage`.

It returns either:

- `completed`, with stable details and reported modified file paths; or
- `failed`, with a structured `LoopRunFailure` and any files already modified.

The runner calls this port once for the initially selected model. Since V48.5,
the policy may authorize **one additional top-level call** when a structured
model-related failure justifies a strictly higher profile inside the same
provider/runtime. The global default is therefore bounded to two model attempts
and a restrictive request can reduce the ceiling to one.

The selected Codex or Claude Code runtime may organize each top-level
invocation with runtime-native skills or sub-agents. This does not create a
Loop Engine task graph or bypass the top-level attempt budget.
Low-effort plans are instructed to work directly; higher-effort plans may
delegate only when independent work or an independent review materially
improves speed or safety. The prompt requires delegated work to respect the
same brief, writable scope, policy permissions and no-publication boundary.
V41 does not claim a new sub-agent-level sandbox or observer. The selected
runtime remains responsible for one final worktree delta, and the existing
post-executor scope guard and configured validation remain the mechanical
authority over that result.

Since V44, this choice is no longer duplicated inside each executor prompt.
`LoopExecutionPlan.delegation` carries the deterministic closed mode
(`direct_preferred` or `runtime_managed_allowed`) derived from the admitted
effort. Both CLI executors consume that same field, and the corresponding
`LoopExecutionPlanEvidence.delegation` is covered by the existing evidence
fingerprint. This improves contract observability without adding a sub-agent
scheduler, an internal delegation counter or any new execution authority.

### Governed completion gate (V45)

A project-owned execution decision in state `READY` is an explicit
authorization to produce a bounded worktree delta. V45 therefore rejects a
governed execute cycle with `no_effective_change` when the observed worktree
delta is empty after a successful executor return. This gate runs before
configured validation, so an unrelated green validation command cannot turn a
no-op into a completed governed lot.

The same invariant is rechecked after every successful repair. A repair that
removes the entire delta cannot be revalidated as a successful completion.

This rule applies only to cycles authorized by `execution_decision`. Legacy
non-governed projects keep their historical empty-delta behavior; migrating
that behavior globally would be a separate compatibility decision. The gate
does not claim semantic proof that every deliverable is satisfied: scope,
content policy and project validations remain the existing mechanical
authorities, while semantic review stays at the orchestrator/human layer.

### LoopValidator

Receives the project, candidate, current modified-file inventory, run id and
validation attempt number. The default adapter composes the existing
`runConfiguredValidations(...)` function and executes the project's configured
commands in declaration order. For the self-hosted project this includes the
repository validation and strict audit through its configured validation command.

### LoopRepairer

Receives the admitted execution context, current modified files, failed
validation result, current repair attempt and effective finite maximum. The
maximum passed to the port is the same policy-capped value enforced by the
runner's repair loop. It returns either a completed repair with additional
modified files or a structured failure.

No repairer is inferred. A failed validation with remaining budget but no
injected repairer fails closed with `repairer_unavailable`.

## State machine

Successful execution:

```text
idle -> planning -> ready -> executing -> validating -> completed
```

One successful repair:

```text
idle -> planning -> ready -> executing -> validating
     -> repairing -> validating -> completed
```

One admitted model escalation after executor failure:

```text
idle -> planning -> ready -> executing -> executing -> validating -> completed
```

One admitted model escalation after exhausted validation/repair:

```text
... -> validating -> executing -> validating -> completed
```

Budget exhaustion:

```text
... -> validating -> repairing -> validating -> failed
```

The existing `canTransition(...)` state machine validates every transition.
There are no direct state assignments that bypass it.

## Policy admission

Execute mode resolves policy with `mode: "execute"`. The executor is not called
unless:

- `AgentPolicyResolution.status === "resolved"`; and
- `selection.outcome === "selected"`.

A denial returns `agent_policy_rejected` with zero executor, validator and
repairer calls.

The resolved `selectionRequest.budgetCeiling` is also an execution ceiling where
the runner has a matching local control. In particular,
`selectionRequest.budgetCeiling.maxRepairs` bounds the repair cycle after
admission; the caller cannot widen it with `--max-repairs`.
`selectionRequest.budgetCeiling.maxCalls`, combined with
`AgentPolicy.allowEscalation`, bounds the top-level model attempts. The V48.5
default permits one initial call plus at most one intra-provider escalation.
The escalation trigger is restricted to `provider_max_turns` or an exhausted
`validation_failed` path; timeout, rate limit, provider/runtime unavailability
and generic runtime errors remain failover/stop concerns rather than reasons to
buy more model capability.

## Validation result

`LoopRunResult.validation` remains `null` in plan mode and before execute
validation starts. In execute mode it exposes:

- `status`: `passed` or `failed`;
- `attempts`: total validation attempts;
- `repairAttempts`: repair calls started, including calls that return a failure
  or throw;
- `commands`: configured project validation commands;
- `failedCommand`: final failed command, or `null`;
- `exitCode`: final validation exit code.

`schemaVersion` remains `1`; the field already existed and execute mode now
populates it with its documented value.

## Modified files

The runner merges file paths reported by the executor and repairer ports,
removes empty values and duplicates, and returns a stable sorted array. The
runner never derives a commit from this list.

For a project-owned `execution_decision` in `READY`, the candidate also carries
a non-empty `allowedPaths` list. V1 accepts only exact relative POSIX paths
(for example `README.md`) and terminal recursive prefixes (for example
`docs/platform/**`). The prompt informs the provider of this scope, but the
post-executor scope guard is the authority: a reported path outside it fails
with `scope_violation` before validation, repair, patch export, commit or
publication. The same guard runs again after every repair. Legacy projects
without `execution_decision` retain their existing advisory execution behavior.

### Rename and copy inventory limitation

The provider adapters preserve Git's NUL-delimited porcelain parsing. Their
current V1 `modifiedFiles` contract records the destination path for rename and
copy entries, then skips the source record. Added, modified and deleted paths
are covered by the scope guard. Extending scope authority to both rename/copy
endpoints would also require aligning the patch-export inventory contract, so
it remains explicit follow-up debt rather than widening this micro-lot.

## Repair budget

The caller's `maxRepairs` request must be a non-negative integer and defaults to
`0`. After policy admission, the runner derives the effective maximum as the
most restrictive value: when the resolved policy exposes a numeric
`selectionRequest.budgetCeiling.maxRepairs`, the effective value is
`min(requestedMaxRepairs, policyMaxRepairs)`; otherwise the caller's already
validated request remains the ceiling.

The same `effectiveMaxRepairs` is used for both the loop exhaustion check and
the `LoopRepairer.maxRepairs` input. A caller can therefore request fewer
repairs (including zero) but can never widen the policy ceiling. When
`repairAttempts >= effectiveMaxRepairs`, the cycle fails with
`validation_failed`. Infinite repair loops and policy/runtime budget divergence
are impossible by construction and are guarded by `AUDIT-495`.

## Failure handling

Thrown executor, validator and repairer errors are converted into stable public
failures. Raw exceptions and stack traces are not exposed. Major failure codes:

- `invalid_repair_budget`;
- `unknown_project`;
- `no_safe_candidate`;
- `agent_policy_rejected`;
- `executor_unavailable` / `executor_failed`;
- `validation_error` / `validation_failed`;
- `repairer_unavailable` / `repair_failed`.

## Git and publication boundary

For every `execute` outcome:

- `commit` is `null`;
- `publication` is `null`;
- no commit, push, tag or force operation exists in the execute runner;
- worktree and project lock cleanup run before returning the result;
- the separate `commit` mode remains controlled and explicit; only `publish`
  returns `mode_not_implemented`.

## Explicit non-goals

V14.4 does not add:

- a new provider adapter;
- automatic provider selection outside the existing policy result;
- concrete identity, ACL, replay persistence or inbound transport;
- worktree rollback;
- automatic promotion, push, tag or publication;
- resume persistence or durable cancellation;
- an unbounded repair loop;
- a Loop Engine sub-agent scheduler, nested execution-plan graph or separate
  persistence for runtime-internal delegation.

## Acceptance invariants

1. Policy rejection causes zero executor calls.
2. The top-level executor port is called once initially and at most once more when policy admits a structured intra-provider model escalation; runtime-internal delegation does not consume another top-level attempt.
3. Every model escalation stays on the same provider/runtime, preserves candidate/scope/permissions/validations and is observable through bounded evidence.
4. Validation runs only after a completed executor result.
5. Each repair is followed by validation, never by commit.
6. The finite repair budget is the most restrictive of caller request and resolved policy ceiling, and the same effective value reaches the repairer.
7. Modified files include executor and repairer reports without duplicates.
8. Exceptions fail closed without exposing raw stack traces.
9. `commit` and `publication` remain `null` for every result.
10. Plan mode behavior and JSON schema version remain unchanged.
11. CI, strict audit and all audit profiles pass.
