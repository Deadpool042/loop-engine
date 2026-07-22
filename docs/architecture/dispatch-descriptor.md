# Dispatch Descriptor

`DispatchDescriptor` is the V12.1 transport-independent artifact immediately
before the execution boundary defined by
`docs/architecture/rfc-execution-boundary-v12.md`.

It is declarative. It is not executable, not dispatchable, and not a transport
payload.

## Purpose

The descriptor records what could be considered by a future execution-boundary
implementation after `HandoffEligibilityResult` and explicit
`ExecutionAuthority` evidence have been validated.

It does not perform the handoff. It does not select, call, or prepare a
transport. It does not create a `TransportAdapterRequest`.

```mermaid
flowchart TD
  Eligibility["HandoffEligibilityResult"] --> Authority["ExecutionAuthority"]
  Authority --> Descriptor["DispatchDescriptor"]
  Descriptor --> Stop["Execution boundary stop"]
  Stop -. no V12.1 edge .-> FutureRequest["Future TransportAdapterRequest"]
```

## Position in V12

V12.0 defined the execution boundary. V12.1 introduces only the final
transport-independent descriptor contract before that boundary. The descriptor
contains bounded evidence references and remains inert.

The current V12.1 chain is:

```mermaid
flowchart LR
  Reviewed["ReviewedTransportRequest"] --> Provenance["ApprovalProvenance"]
  Reviewed --> Eligibility["HandoffEligibilityResult"]
  Provenance --> Eligibility
  Eligibility --> Authority["ExecutionAuthority"]
  Authority --> Descriptor["DispatchDescriptor"]
  Descriptor --> Boundary["NO EXECUTION / NO DISPATCH"]
```

## Relationship with ExecutionAuthority

`ExecutionAuthority` is a declarative input to the descriptor builder. It
records authority evidence, but the V12.1 descriptor still does not authorize
execution by itself.

The builder validates:

- authority presence;
- granted authority state;
- authority approval state;
- absence of revocation;
- absence of expiry;
- reference consistency;
- version consistency.

## Relationship with HandoffEligibility

`HandoffEligibilityResult` remains an assessment. The descriptor builder
requires explicit eligible evidence for a structurally valid descriptor, but it
does not infer eligibility from object presence.

Eligibility and authority are distinct:

- eligibility assesses consistency;
- authority records a future bounded authority decision;
- descriptor records transport-independent boundary evidence.

## Relationship with future TransportAdapterRequest

`DispatchDescriptor` is not a `TransportAdapterRequest`. V12.1 intentionally
creates no adapter request and no edge toward a `TransportAdapter`.

A future milestone may define how a valid descriptor contributes to a
`TransportAdapterRequest`, but that is outside V12.1.

## Execution boundary

The descriptor stops before the execution boundary:

```mermaid
flowchart LR
  Descriptor["DispatchDescriptor"] --> Stop["Declarative stop"]
  Stop -. forbidden in V12.1 .-> Transport["TransportAdapter"]
  Stop -. forbidden in V12.1 .-> Runtime["Runtime"]
```

The descriptor always reports:

- `readyForBoundary: false`;
- `dispatchable: false`;
- `executable: false`;
- `executionStarted: false`.

## Transport independence

The descriptor carries no transport implementation details. It contains no:

- command;
- argument;
- binary path;
- environment variable;
- credential;
- filesystem path;
- network endpoint;
- process identifier;
- adapter payload;
- runtime payload;
- dispatch instruction;
- execution instruction.

## Security guarantees

V12.1 preserves:

- no dispatch;
- no execution;
- no Runtime interaction;
- no Transport interaction;
- no process APIs;
- no filesystem access;
- no network access;
- no `process.env` access;
- no `TransportAdapterRequest`;
- no runtime request.
