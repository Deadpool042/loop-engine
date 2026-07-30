# Configured Inbound Security and Adapter Pilot

## Status

Lot V14.5 — implemented.

This document is the current contract for the first concrete inbound security
vertical. The transport-neutral Core handler from V14.0 and the prepared
Runtime application service from V14.3 remain unchanged.

## Goal

V14.5 provides one explicit local/configured adapter path:

```text
configured inbound request
-> configured API-key verifier
-> derived principal
-> tenant/role/project/operation ACL
-> atomic persistent replay claim
-> existing transport-neutral inbound envelope
-> existing V14.3 preparation and Runtime service
-> stable redacted plan or receipt
```

The pilot proves concrete identity, ACL and replay persistence without adding a
network listener or a real provider.

## Public boundary

The Core export is:

```text
executeConfiguredInboundAdapterRequest(request, dependencies)
```

`ConfiguredInboundAdapterRequest` contains:

- `requestId`;
- explicit `evaluatedAt`;
- `credentialId` and opaque `credentialSecret`;
- a non-empty replay `nonce`;
- requested `project` and `operation`;
- the existing public Runtime request payload.

The request is an adapter DTO, not an HTTP, webhook, queue, socket or framework
object. A future transport may translate into this DTO, but no transport is
implemented by V14.5.

## Credential configuration

`ConfiguredApiKeyCredentialRecord` is explicit operator configuration. Each
record binds:

- one unique `credentialId`;
- a lowercase SHA-256 secret digest;
- issuer and subject identity;
- the derived `InboundPrincipal` including tenant and roles;
- issued-at, valid-from and expiry instants.

The subject must equal the configured principal id. Time windows must be
parseable and ordered. Duplicate credential ids or malformed records reject the
adapter request before any downstream dependency is called.

Raw API keys are never stored in configuration. `hashConfiguredApiKeySecret(...)`
exists only to derive the digest supplied by the operator.

## Authentication

The concrete method is `api-key-sha256`.

The verifier:

1. requires an exact `{ credentialId, secret }` opaque credential shape;
2. resolves only the explicit configured record;
3. hashes the supplied secret with SHA-256;
4. compares equal-length digests with `timingSafeEqual`;
5. emits verified evidence derived from the configured issuer, subject and
   validity window.

Unknown ids and incorrect secrets return a generic authentication rejection.
The verifier performs no environment lookup, file lookup, network request,
retry, fallback or credential discovery.

## ACL

`ConfiguredInboundAclRule` binds all of the following:

- exact tenant id, including explicit `null` tenancy;
- all required roles;
- an explicit project list;
- an explicit operation list (`dry-run` and/or `execute`).

Evaluation is deterministic and declaration-order stable. There is no wildcard,
implicit role inheritance or default allow. The decision fails closed with one
of:

- `principal_missing`;
- `acl_configuration_invalid`;
- `tenant_not_authorized`;
- `role_not_authorized`;
- `project_not_authorized`;
- `operation_not_authorized`.

An ACL denial produces an empty inbound `allowedOperations` policy. The existing
Core authentication/security sequence therefore authenticates the caller first,
then stops at operation admission before replay, authorization, assembly or
Runtime execution. The adapter maps this stop to the stable `acl` stage.

## Replay persistence

`createFileInboundReplayProtectionPort(...)` provides the concrete replay port.
It derives a SHA-256 claim key from request id, evidence id and nonce, then
creates `<digest>.json` with exclusive `wx` semantics.

Properties:

- claim creation is atomic across concurrent processes sharing the directory;
- an existing claim returns `replayed`;
- the claim survives process restart;
- directories and files request owner-only modes (`0700` and `0600`);
- persisted claims contain only schema version, digest and claim instant;
- raw credential, nonce, subject, tenant, project and payload are not persisted;
- filesystem failures return `unavailable` and are denied by the existing Core
  replay gate.

The V14.5 pilot intentionally does not implement claim expiry or garbage
collection. Operators must place the explicit replay directory on bounded,
managed storage until a later durable-journal lot defines retention.

## Adapter composition

The adapter validates its DTO and configuration, derives the configured
principal and ACL decision, creates the concrete verifier and replay port, then
constructs exactly one `InboundLoopRuntimeRequestEnvelope`.

It calls `executePreparedInboundRuntimeRequest(...)` exactly once. It does not
reimplement:

- envelope validation;
- authentication evidence binding;
- replay sequencing;
- public-request decoding;
- authorization;
- engine assembly;
- request preparation;
- Runtime admission;
- Runtime receipt projection.

## Runtime and provider boundary

`ConfiguredInboundAdapterDependencies.runtimeResolver` is mandatory. The
adapter never falls back to the default Runtime registry and never infers a
provider. Authorizer, assembler and execution-context resolver also remain
mandatory injected dependencies.

Consequently V14.5 adds no Claude, Codex, OpenClaw or other provider execution.
Tests use an explicit deterministic simulated Runtime adapter only.

## Redaction

Public adapter results reuse the V14.3 stable result contract, with additive
`adapter` and `acl` rejection stages for failures owned by V14.5. Results must
not contain:

- raw API keys;
- credential digests;
- configured commands or working directories;
- Runtime diagnostics or output;
- stack traces or filesystem error details.

## Explicit non-goals

V14.5 does not add:

- HTTP, webhook, socket or queue servers;
- environment or secret-manager discovery;
- remote identity providers;
- key rotation orchestration;
- replay claim expiry or cleanup;
- a provider SDK or executable mapping;
- LoopRunner provider wiring;
- commit, push, tag or publication;
- durable cancellation or execution journals.

## Acceptance invariants

1. Malformed adapter input or configuration causes zero downstream calls.
2. Incorrect credentials cause zero replay, authorization, assembly or Runtime
   calls.
3. Identity is derived from configured records, never from untrusted payload
   claims.
4. ACL requires exact tenant, every required role, project and operation.
5. ACL denial occurs before replay and does not consume the nonce.
6. The first valid replay claim is accepted and the same claim is rejected
   across a recreated port/process boundary.
7. Replay files contain only a digest and claim time.
8. The V14.3 application service is invoked exactly once.
9. Runtime resolution is explicit; no provider or Runtime fallback exists.
10. Public results remain JSON-safe and redacted.
11. The transport-neutral Core handler remains the sole inbound application
    boundary below the adapter.
12. CI, strict audit and all audit profiles pass.
