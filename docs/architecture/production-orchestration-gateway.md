# Production orchestration gateway

## Purpose

V15.1 turns the durable execution control plane into a deployable supervisor boundary. V15.0 defined idempotency, leases, recovery, cancellation and replay semantics; V15.1 adds restart-safe filesystem persistence and a stable JSON protocol that n8n, queues, HTTP adapters and cron workers can call without importing Loop Engine internals.

The gateway is transport-neutral. An HTTP server, message consumer or command wrapper only needs to deserialize one request, call `handle(...)`, and return the response unchanged.

## Architecture

```text
n8n / queue / cron / HTTP adapter
  -> orchestration gateway schema v1
  -> durable execution control plane
  -> atomic filesystem repository
  -> Loop application assembly
  -> policy selection
  -> Codex or Claude Code
  -> validation / repair
  -> terminal durable record
```

The gateway does not contain planning, provider, validation, repair, commit or publication logic. It delegates execution to the existing application runner and exposes only supervision operations.

## Production assembly

```ts
import {
  createLoopApplicationAssembly,
  createProductionOrchestrationGateway,
} from "../../src/composition/index.js";

const application = createLoopApplicationAssembly({
  providers: [
    { id: "codex", executable: "codex" },
    { id: "claude_code", executable: "claude", maxTurns: 20 },
  ],
  maxProviderAttempts: 2,
});

const production = createProductionOrchestrationGateway(application, {
  directory: "/var/lib/loop-engine/executions",
});
```

The configured directory must live on durable storage. Every record is stored as one mode-0600 JSON envelope named by the SHA-256 digest of its idempotency key. The key itself remains inside the integrity-protected record and is never used as a filesystem path.

## Gateway protocol

Every request has `schemaVersion: 1` and one operation.

### Execute

```json
{
  "schemaVersion": 1,
  "operation": "execute",
  "request": {
    "idempotencyKey": "loop-engine:project:candidate:revision",
    "project": "loop-engine",
    "owner": "n8n-execution-1234",
    "leaseDurationMs": 900000
  }
}
```

Response codes include:

- `executed`: this worker acquired the lease and completed the cycle;
- `replayed`: a terminal record already existed and no provider was called;
- `execution_in_progress`: another unexpired owner holds the lease;
- `record_conflict`: compare-and-swap rejected a concurrent update;
- `project_mismatch`: the idempotency key is already bound to another project.

### Status

```json
{
  "schemaVersion": 1,
  "operation": "status",
  "idempotencyKey": "loop-engine:project:candidate:revision"
}
```

The response includes the complete integrity-checked durable record.

### List

```json
{
  "schemaVersion": 1,
  "operation": "list",
  "project": "loop-engine"
}
```

Listing returns bounded summaries ordered by most recent update. It does not duplicate the full execution report for every record.

### Cancel

```json
{
  "schemaVersion": 1,
  "operation": "cancel",
  "idempotencyKey": "loop-engine:project:candidate:revision",
  "requestedBy": "operator:laurent"
}
```

Cancellation remains cooperative. The durable intent is recorded immediately; provider process termination remains bounded by the provider adapter timeout.

### Verify

```json
{
  "schemaVersion": 1,
  "operation": "verify",
  "idempotencyKey": "loop-engine:project:candidate:revision"
}
```

`integrity_verified` means the envelope structure and SHA-256 fingerprint match. `integrity_failed` means the record is absent, malformed or altered and must not be executed or trusted.

## Filesystem repository

`createFileDurableExecutionStore(...)` provides:

- atomic directory creation;
- one exclusive lock file per idempotency key digest;
- stale lock recovery after a bounded timeout;
- compare-and-swap on monotonic record revision;
- write-to-temporary plus atomic rename;
- mode-0600 record files;
- integrity verification on every read;
- restart-safe listing and replay.

The adapter never performs last-write-wins updates. A stale revision returns `false`, which the control plane exposes as `record_conflict`.

## Restart behavior

The terminal record is the source of truth, not process memory. After process or machine restart:

1. the gateway reconstructs the repository from the same directory;
2. a repeated execute request loads and verifies the envelope;
3. terminal results return as `replayed`;
4. the AI provider is not called again;
5. active leases remain authoritative until expiration;
6. expired leases follow the V15.0 recovery path.

## Security invariants

- idempotency keys cannot escape the configured directory;
- record files are not named with user-controlled text;
- all reads verify structure and fingerprint before returning a record;
- corrupted records fail closed;
- parser and filesystem diagnostics are not returned in gateway responses;
- provider output, stderr, stack traces, credentials and environment values remain excluded;
- lock acquisition and storage retries are bounded;
- gateway operations cannot commit, push, tag or publish;
- a replay consumes no additional provider calls or tokens.

## n8n workflow

A production workflow should:

1. derive one stable idempotency key from project, reviewed candidate and revision;
2. call `execute` with the n8n execution id as owner;
3. return immediately on `executed` or `replayed`;
4. reschedule after the lease horizon on `execution_in_progress`;
5. reload and retry with bounded jitter on `record_conflict`;
6. quarantine `project_mismatch` and `integrity_failed`;
7. use `status` and `list` for operator dashboards;
8. send `cancel` when an operator stops the workflow.

The workflow must not generate a new key merely because delivery timed out. Doing so would intentionally create a new execution.

## Deployment requirements

- one durable directory shared by workers that may process the same key;
- filesystem semantics that support exclusive create and atomic rename;
- restricted OS ownership and permissions;
- backup and retention covering the supervisor retry horizon;
- monitoring for lock timeouts, record conflicts and integrity failures;
- no manual editing of record envelopes.

For distributed filesystems that cannot guarantee these primitives, implement `DurableExecutionRepository` against a transactional database or object store with conditional writes while preserving the same gateway contract.
