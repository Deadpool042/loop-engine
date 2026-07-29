# LoopRunner Execute, Validation and Repair Cycle

## Status

Lot V14.4 — implemented.

This document is the current contract for the LoopRunner `execute` mode. The
historical `plan` contract remains unchanged. `commit` and `publish` remain
explicitly unimplemented.

## Goal

V14.4 turns one selected roadmap candidate into one bounded application cycle:

```text
plan candidate
-> resolve execute policy
-> build bounded context
-> call one injected LoopExecutor
-> collect reported modified files
-> run configured validations and audit commands
-> optionally call one injected LoopRepairer per failed validation
-> stop after maxRepairs
-> completed OR failed
```

The runner orchestrates ports. It does not implement an AI provider, edit files
itself, infer authority, commit, push, publish, or discover credentials.

## Public entrypoints

- `runLoopPlan(projectName, options?)` remains synchronous and effect-free.
- `runLoopExecute(projectName, options?)` implements the V14.4 cycle.
- `pnpm loop run <project> --mode execute [--max-repairs <n>]` routes to the
  execute cycle.

The CLI intentionally uses `unavailableLoopExecutor` until a reviewed concrete
provider is supplied in V14.6. Therefore a direct CLI execute request currently
returns a stable failed `LoopRunResult` with `failure.code =
"executor_unavailable"`; it never pretends that work was executed.

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
validation result, current repair attempt and finite maximum. It returns either a
completed repair with additional modified files or a structured failure.

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

## Validation result

`LoopRunResult.validation` remains `null` in plan mode and before execute
validation starts. In execute mode it exposes:

- `status`: `passed` or `failed`;
- `attempts`: total validation attempts;
- `repairAttempts`: completed repair calls;
- `commands`: configured project validation commands;
- `failedCommand`: final failed command, or `null`;
- `exitCode`: final validation exit code.

`schemaVersion` remains `1`; the field already existed and execute mode now
populates it with its documented value.

## Modified files

The runner merges file paths reported by the executor and repairer ports,
removes empty values and duplicates, and returns a stable sorted array. The
runner never derives a commit from this list.

## Repair budget

`maxRepairs` must be a non-negative integer. The default is `0`. Each failed
validation may consume at most one repair attempt. When `repairAttempts >=
maxRepairs`, the cycle fails with `validation_failed`. Infinite repair loops are
impossible.

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

For every V14.4 outcome:

- `commit` is `null`;
- `publication` is `null`;
- no commit, push, tag or force operation exists in the execute runner;
- `commit` and `publish` CLI modes continue to return `mode_not_implemented`.

## Explicit non-goals

V14.4 does not add:

- a Claude, Codex, OpenClaw or other provider adapter;
- automatic provider selection outside the existing policy result;
- concrete identity, ACL, replay persistence or inbound transport;
- worktree rollback;
- commit, push, tag or publication;
- resume persistence or durable cancellation;
- an unbounded repair loop.

## Acceptance invariants

1. Policy rejection causes zero executor calls.
2. The executor is called at most once.
3. Validation runs only after a completed executor result.
4. Each repair is followed by validation, never by commit.
5. The finite repair budget is enforced exactly.
6. Modified files include executor and repairer reports without duplicates.
7. Exceptions fail closed without exposing raw stack traces.
8. `commit` and `publication` remain `null` for every result.
9. Plan mode behavior and JSON schema version remain unchanged.
10. CI, strict audit and all audit profiles pass.
