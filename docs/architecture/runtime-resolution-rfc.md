# Runtime Resolution RFC

## Purpose, scope, and terminology

RuntimeResolution is the immutable, versioned, serializable and deterministic contract that maps a valid RuntimeRequest to an eligible runtime descriptor reference. A **resolution** is only the declarative assessment of the supplied request and descriptor references; it never identifies, allocates, creates, or invokes an operational runtime.

```mermaid
flowchart TD
  Authority[Execution Authority] --> Approval[Operator Approval]
  Approval --> Verification[Authority Verification]
  Verification --> Lifecycle[Authority Lifecycle]
  Lifecycle --> Descriptor[Dispatch Descriptor]
  Descriptor --> Handoff[Boundary Handoff]
  Handoff --> Contract[Bridge Contract]
  Contract --> Request[Bridge Request]
  Request --> Bridge[Execution Bridge]
  Bridge --> RuntimeRequest[Runtime Request]
  RuntimeRequest --> RuntimeResolution[Runtime Resolution]
  RuntimeResolution --> Stop[Declarative stop]
```

## Architecture position and non-goals

RuntimeResolution follows RuntimeRequest and remains inside the declarative boundary. It is **not runtime implementation**, **not a runtime adapter**, **not execution**, **not a dispatcher**, **not transport**, and **not a provider**. It MUST NOT execute, instantiate, allocate, dispatch, invoke, connect, transmit, schedule, retry, or spawn. It provides no operational surface and causes no side effects.

`executionAllowed` remains false and `executionStarted` remains false for every result. An eligible resolution is not authorization, execution authority, dispatch approval, or permission to allocate a runtime.

## Deterministic selection and validation

The contract evaluates only explicit RuntimeRequest evidence and descriptor references. Validation requires an explicit resolution identifier, version, timestamp, and a constructible RuntimeRequest reference with denied execution flags. Descriptor references are normalized into stable lexical ordering. Diagnostics use stable safe codes and are sorted deterministically.

Resolution does not choose a concrete runtime implementation. It performs no lookup, registry discovery, scoring heuristic, implicit fallback, clock read, environment read, filesystem access, network access, process access, or mutable global-state access. All identifiers and time are explicit caller input.

## Future relationships, serialization, and extension

A future RuntimeAdapter and a future TransportRequest require separate RFCs and MUST NOT be inferred from RuntimeResolution. This module does not carry adapter payloads, runtime handles, transport payloads, provider material, commands, credentials, or execution instructions.

Every produced object is deeply frozen and JSON-serializable. The default-deny flags survive serialization. Future additive extensions MAY be introduced only when they remain immutable, explicit, deterministic, serializable, runtime-neutral, transport-neutral, provider-neutral, and non-operational.
