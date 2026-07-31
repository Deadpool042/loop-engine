# Durable Execution Lease Heartbeat — V16.2

Status: IMPLEMENTED

## Objective

Keep an active durable execution lease alive while a worker is making progress, and fail closed as soon as ownership can no longer be proven.

## Contract

`renewDurableExecutionLease` performs one compare-and-swap renewal:

1. load the durable record;
2. require a running execution;
3. require the exact current lease owner;
4. compute a new expiry from an injected clock;
5. append a `lease_renewed` event;
6. save against the observed revision.

A failed compare-and-swap never reports success. The caller receives the latest observable record with a stable rejection code.

`runDurableExecutionHeartbeat` supervises repeated renewal through injected `sleep`, `now`, and `shouldContinue` dependencies. It contains no implicit persistence, provider, process, or filesystem dependency.

## Fail-closed outcomes

- `invalid_request`: malformed identity or timing configuration;
- `not_found`: no durable record exists;
- `not_running`: terminal executions cannot be renewed;
- `lease_lost`: another owner holds the lease;
- `record_conflict`: the record changed during renewal.

The heartbeat interval must be strictly shorter than the lease duration.

## Deterministic lifecycle

```text
Worker starts execution
  -> heartbeat waits
  -> reload record
  -> verify running + owner
  -> extend expiry with CAS
  -> append lease_renewed
  -> repeat while supervised
```

The loop stops when supervision ends. Any rejected renewal terminates the loop immediately; it does not retry blindly or overwrite a concurrent transition.

## Architectural boundaries

- durable state remains behind `DurableExecutionStore`;
- time and waiting are dependency-injected;
- no provider invocation is owned by the heartbeat;
- no filesystem or process API leaks into Core policy;
- event history remains append-only and revisioned.

## Acceptance evidence

Tests cover:

- successful owner renewal;
- expiry extension and revision increment;
- append-only `lease_renewed` evidence;
- rejection for another owner;
- rejection for terminal execution;
- deterministic repeated renewal;
- immediate stop on compare-and-swap conflict.

V16.3 will consume the same supervised execution boundary to propagate active cancellation into running provider work.
