# Durable execution supervision

## Recommended trigger contract

For every reviewed roadmap cycle, the external supervisor should derive one stable key, for example:

```text
loop-engine:<project>:<roadmap-candidate-id>:<revision>
```

The key must remain unchanged across delivery retries. A new reviewed candidate or materially changed revision receives a new key.

## Assembly

```ts
import {
  createDurableExecutionControlPlane,
  createLoopApplicationAssembly,
} from "../src/composition/index.js";
import { createInMemoryDurableExecutionStore } from "../src/core/index.js";

const application = createLoopApplicationAssembly({
  providers: [
    { id: "codex", executable: "codex" },
    { id: "claude_code", executable: "claude", maxTurns: 20 },
  ],
  maxProviderAttempts: 2,
});

const store = createInMemoryDurableExecutionStore();
const control = createDurableExecutionControlPlane(store, {
  runLoopExecute: application.runLoopExecute,
});
```

Production deployments should implement `DurableExecutionStore` with transactional compare-and-swap semantics. The in-memory adapter does not survive process restart.

## Execute

```ts
const response = await control.execute(
  {
    idempotencyKey: "loop-engine:loop-engine:V15.0:1",
    project: "loop-engine",
    owner: "n8n-execution-1234",
    leaseDurationMs: 15 * 60_000,
  },
  {
    executor: application.loopExecutor,
    agentRegistry: application.loopAgentRegistry,
  },
);
```

Supervisor decisions:

- `executed`: persist the terminal record and fingerprint;
- `replayed`: return the stored terminal result without another provider call;
- `execution_in_progress`: reschedule after the current lease window;
- `record_conflict`: reload and retry with bounded backoff;
- `project_mismatch`: quarantine the trigger because the key is invalid.

## Cancel

```ts
await control.cancel(
  "loop-engine:loop-engine:V15.0:1",
  "operator:laurent",
);
```

Cancellation is persisted as intent. A provider process remains bounded by its adapter timeout; the supervisor must not assume cross-process hard termination.

## Recovery

A replacement worker uses the same idempotency key and a new owner id. It may acquire the record only after the previous lease expires. The resulting record retains both `lease_acquired` and `lease_recovered` events and increments `attempt`.

## Persistence requirements

A production adapter must guarantee:

- atomic compare-and-swap on `revision`;
- durable writes before reporting success;
- read-after-write consistency for one key;
- no automatic deletion of terminal records during the retry horizon;
- encryption and access control appropriate for execution reports;
- retention of the fingerprint alongside the record when exported.

The adapter must not merge conflicting records. A conflict is a control-plane event, not a last-write-wins storage detail.
