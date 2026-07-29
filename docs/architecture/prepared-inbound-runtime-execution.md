# Prepared Inbound Runtime Execution

## Status

Implemented in V14.3 as a Core application-service boundary. It is transport-neutral and opt-in. It does not add a public CLI execute mode, a network listener, a provider SDK, credentials, or a default authentication/authorization implementation.

## Purpose

`executePreparedInboundRuntimeRequest(...)` joins two previously independent capabilities:

```text
untrusted inbound envelope
-> envelope validation
-> injected authentication verification
-> replay and access-policy gates
-> public request decode and authorization
-> injected engine assembly
-> prepared LoopRuntimeConstructedRuntimeRequest
-> trusted execution-context resolution
-> existing Runtime policy admission
-> Runtime resolution
-> dry-run plan OR one bounded Runtime invocation
-> redacted plan/receipt
```

The function reuses `handleInboundLoopRuntimeRequest(...)`; it does not reimplement or bypass authentication, replay, authorization, assembly, or preparation.

## Trusted dependencies

The caller supplies all effectful or authority-bearing dependencies explicitly:

- authentication verifier;
- replay-protection port;
- public-request authorizer;
- engine assembler;
- execution-context resolver;
- optional Runtime resolver, otherwise the static Runtime registry is used.

The execution-context resolver supplies the already-resolved `RoadmapCandidate`, `MinimalContextPackage`, `AgentPolicyResolution`, provider, and optional local-process execution policy. None of those values is inferred from the untrusted payload.

## Dry-run boundary

Historical preparation APIs continue to return `unsupported_dry_run` unless the assembler explicitly declares `allowDryRunPreparation: true`. V14.3 uses that capability to construct a declarative prepared request while preserving the existing default behavior for older callers.

After preparation, Runtime admission and Runtime resolution still run. The selected adapter is not invoked. The result is a frozen, JSON-safe plan containing only stable identifiers, policy/profile references, effort, limits, and evaluation time.

## Execute boundary

Execute mode:

1. validates the trusted context against the prepared request;
2. calls `evaluateRuntimeExecutionAdmission(...)`;
3. resolves one Runtime adapter;
4. invokes it exactly once;
5. validates the returned Runtime result;
6. emits a frozen redacted receipt.

The receipt does not expose the prepared command, arguments, working directory, credentials, raw Runtime output, stack traces, or raw Runtime diagnostics.

## Local-process rule

A prepared request targeting `local-process` cannot execute unless the trusted context resolver supplies an explicit `LocalProcessExecutionPolicy` and the prepared binding includes a working directory. Runtime admission and the guarded local-process adapter remain independent defense-in-depth checks.

## Failure stages

The public result distinguishes:

- `inbound`;
- `authentication`;
- `security`;
- `preparation`;
- `execution_context`;
- `runtime_admission`;
- `runtime_resolution`;
- `runtime_execution`.

Every upstream rejection causes zero Runtime calls. Resolver and adapter exceptions fail closed with stable reasons.

## Non-goals

V14.3 does not implement:

- HTTP, webhook, socket, queue, or framework adapters;
- concrete identity, ACL, or replay persistence;
- real Claude Code, Codex, or OpenClaw execution;
- LoopRunner `execute` mode;
- repair, commit, push, tag, or publication;
- ambient environment or secret discovery;
- persistence, resume, or durable cancellation.

## Verification

The end-to-end Core suite covers dry-run, successful execution, upstream stop behavior, Runtime admission denial, local-process authority, context failure, adapter failure, redaction, freezing, and exactly-once invocation.
