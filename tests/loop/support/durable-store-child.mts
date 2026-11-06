// Processus enfant des tests de concurrence du magasin durable (données synthétiques).
import { appendFileSync, existsSync, writeFileSync } from "node:fs";

import { runDurableLoopExecution } from "../../../src/loop/durable-execution-controller.js";
import type { DurableExecutionRecord } from "../../../src/loop/durable-execution.js";
import { completedResult, syntheticRecord } from "./synthetic.js";
import { createFileDurableExecutionStore } from "../../../src/loop/file-durable-execution-store.js";

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const [mode, directory, key, owner, ...rest] = process.argv.slice(2);
const lockTimeoutMs = Number(process.env.TEST_LOCK_TIMEOUT_MS ?? "10000");
const store = createFileDurableExecutionStore({
  directory: directory!,
  lockTimeoutMs,
  lockRetryMs: 5,
});

function out(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (mode === "save") {
  try {
    out({ saved: await store.save(syntheticRecord(key!, owner!), null) });
  } catch (error) {
    out({ error: (error as Error).message });
  }
} else if (mode === "stall-save") {
  // Détenteur vivant bloqué à l'intérieur de la section critique du verrou.
  const [markerFile, stallMs] = rest;
  const base = syntheticRecord(key!, owner!);
  let stalled = false;
  const record = Object.defineProperty({ ...base }, "project", {
    enumerable: true,
    get() {
      if (!stalled) {
        stalled = true;
        writeFileSync(markerFile!, "in-critical-section");
        if (stallMs === "release") {
          // Bloqué jusqu'à la création du fichier <marqueur>.release (60 s au plus).
          for (
            let waited = 0;
            !existsSync(`${markerFile}.release`) && waited < 60_000;
            waited += 20
          ) {
            sleepSync(20);
          }
        } else {
          sleepSync(Number(stallMs));
        }
      }
      return "synthetic";
    },
  }) as DurableExecutionRecord;
  try {
    out({ saved: await store.save(record, null) });
  } catch (error) {
    out({ error: (error as Error).message });
  }
} else if (
  mode === "run" ||
  mode === "run-crash-on-ack" ||
  mode === "run-hang"
) {
  const [startLog, holdMs, leaseMs] = rest;
  try {
    const outcome = await runDurableLoopExecution(
      store,
      {
        idempotencyKey: key!,
        project: "synthetic",
        owner: owner!,
        leaseDurationMs: Number(leaseMs ?? "600000"),
      },
      async () => {
        appendFileSync(startLog!, `${owner}\n`);
        if (mode === "run-hang") {
          await new Promise(() => {});
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Number(holdMs ?? "0")),
        );
        return completedResult();
      },
      undefined,
      mode === "run-crash-on-ack"
        ? () => {
            process.kill(process.pid, "SIGKILL");
          }
        : undefined,
    );
    out({
      status: outcome.status,
      code: outcome.status === "rejected" ? outcome.code : null,
    });
  } catch (error) {
    out({ error: (error as Error).message });
  }
}
