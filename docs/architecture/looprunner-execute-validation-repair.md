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
-> call one injected LoopExecutor
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

The runner calls this port at most once per cycle.

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
- an unbounded repair loop.

## Acceptance invariants

1. Policy rejection causes zero executor calls.
2. The executor is called at most once.
3. Validation runs only after a completed executor result.
4. Each repair is followed by validation, never by commit.
5. The finite repair budget is the most restrictive of caller request and resolved policy ceiling, and the same effective value reaches the repairer.
6. Modified files include executor and repairer reports without duplicates.
7. Exceptions fail closed without exposing raw stack traces.
8. `commit` and `publication` remain `null` for every result.
9. Plan mode behavior and JSON schema version remain unchanged.
10. CI, strict audit and all audit profiles pass.
