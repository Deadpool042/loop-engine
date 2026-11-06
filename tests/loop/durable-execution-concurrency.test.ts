import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  requestDurableExecutionCancellation,
  runDurableLoopExecution,
} from "../../src/loop/durable-execution-controller.js";
import { superviseActiveExecutionCancellation } from "../../src/loop/durable-execution-active-cancellation.js";
import { recoverDurableExecution } from "../../src/loop/durable-execution-recovery.js";
import { renewDurableExecutionLease } from "../../src/loop/durable-execution-heartbeat.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import { syntheticRecord } from "./support/synthetic.js";
import { completedResult } from "./support/synthetic.js";

// Tests de reproduction et de non-régression de la propriété exclusive du bail.
// Répertoires temporaires et missions synthétiques uniquement : aucun fournisseur,
// aucun dépôt réel, aucune clé. Un SIGKILL n'est pas une coupure de courant.

const CHILD = join(import.meta.dirname, "support", "durable-store-child.mts");

type Child = Readonly<{
  proc: ChildProcess;
  result: Promise<Record<string, unknown>>;
}>;

const spawned: ChildProcess[] = [];
const tempDirs: string[] = [];

after(() => {
  for (const proc of spawned) {
    if (proc.exitCode === null && proc.signalCode === null)
      proc.kill("SIGKILL");
  }
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function child(
  args: readonly string[],
  env: Record<string, string> = {},
): Child {
  const proc = spawn(process.execPath, ["--import", "tsx", CHILD, ...args], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "ignore"],
  });
  spawned.push(proc);
  let output = "";
  proc.stdout!.on("data", (chunk) => {
    output += String(chunk);
  });
  const result = new Promise<Record<string, unknown>>((resolve) => {
    proc.on("close", (code, signal) => {
      const line = output.trim().split("\n").filter(Boolean).pop();
      resolve(
        line === undefined
          ? { exit: code, signal }
          : (JSON.parse(line) as Record<string, unknown>),
      );
    });
  });
  return { proc, result };
}

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "le-durable-"));
  tempDirs.push(dir);
  return dir;
}

// Attend que le bail soit réellement persisté (et non un délai arbitraire).
async function waitForLease(
  store: ReturnType<typeof createFileDurableExecutionStore>,
  key = "cycle:k",
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const record = await store.load(key);
    if (record?.status === "running") return;
    if (Date.now() - start > 15_000) throw new Error("bail non persisté");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitFor(condition: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const completed = completedResult;

const leaseRequest = (owner: string, leaseDurationMs = 600_000) => ({
  idempotencyKey: "cycle:k",
  project: "synthetic",
  owner,
  leaseDurationMs,
});

test("D1 — un bail actif n'est pas repris par un détenteur portant la même identité", async () => {
  const dir = tmp();
  const store = createFileDurableExecutionStore({ directory: dir });
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  const first = runDurableLoopExecution(
    store,
    leaseRequest("worker-a"),
    async () => {
      started += 1;
      await hold;
      return completed();
    },
  );
  await waitFor(() => started === 1);
  const second = await runDurableLoopExecution(
    store,
    leaseRequest("worker-a"),
    async () => {
      started += 1;
      return completed();
    },
  );
  release?.();
  await first;
  assert.equal(second.status, "rejected");
  assert.equal(
    second.status === "rejected" ? second.code : null,
    "execution_in_progress",
  );
  assert.equal(started, 1, "une seule exécution doit avoir démarré");
  rmSync(dir, { recursive: true, force: true });
});

test("T1 — six processus demandent le même bail simultanément : un seul exécute", async () => {
  const dir = tmp();
  const log = join(dir, "starts.log");
  const children = Array.from({ length: 6 }, (_, index) =>
    child(["run", dir, "cycle:k", `worker-${index}`, log, "400"]),
  );
  const results = await Promise.all(children.map((c) => c.result));
  const started = existsSync(log)
    ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
    : [];
  assert.equal(started.length, 1, `exécutions démarrées: ${started.join(",")}`);
  const executed = results.filter((r) => r.status === "executed");
  assert.equal(executed.length, 1);
  for (const r of results.filter((x) => x.status !== "executed")) {
    assert.ok(
      r.status === "rejected" || r.status === "replayed",
      JSON.stringify(r),
    );
  }
  rmSync(dir, { recursive: true, force: true });
});

test("D2 — un détenteur vivant bloqué dans la section critique n'est pas dépossédé du verrou", async () => {
  const dir = tmp();
  const marker = join(dir, "marker");
  const holder = child(
    ["stall-save", dir, "cycle:k", "holder-a", marker, "release"],
    {
      TEST_LOCK_TIMEOUT_MS: "200",
    },
  );
  await waitFor(() => existsSync(marker));
  // Le verrou est tenu depuis plus longtemps que lockTimeoutMs : l'ancien code le vole.
  await new Promise((resolve) => setTimeout(resolve, 350));
  const challenger = child(["save", dir, "cycle:k", "challenger-b"], {
    TEST_LOCK_TIMEOUT_MS: "200",
  });
  const challengerResult = await challenger.result;
  writeFileSync(`${marker}.release`, "release");
  const heldResult = await holder.result;
  const successes = [heldResult, challengerResult].filter(
    (r) => r.saved === true,
  );
  assert.equal(
    successes.length,
    1,
    `deux écritures acceptées pour la même révision: ${JSON.stringify([heldResult, challengerResult])}`,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("D3 — le verrou d'un détenteur mort (SIGKILL) est repris sans attendre la péremption", async () => {
  const dir = tmp();
  const marker = join(dir, "marker");
  const holder = child(
    ["stall-save", dir, "cycle:k", "holder-a", marker, "60000"],
    {
      TEST_LOCK_TIMEOUT_MS: "5000",
    },
  );
  await waitFor(() => existsSync(marker));
  holder.proc.kill("SIGKILL");
  await holder.result;
  const begin = Date.now();
  const store = createFileDurableExecutionStore({
    directory: dir,
    lockTimeoutMs: 5000,
    lockRetryMs: 5,
  });
  assert.equal(
    await store.save(syntheticRecord("cycle:k", "survivor"), null),
    true,
  );
  assert.ok(
    Date.now() - begin < 2500,
    `reprise trop lente: ${Date.now() - begin} ms`,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("D4 — huit processus se disputent un verrou orphelin : une seule écriture est acceptée", async () => {
  const dir = tmp();
  const marker = join(dir, "marker");
  const dead = child(
    ["stall-save", dir, "cycle:k", "dead-holder", marker, "60000"],
    {
      TEST_LOCK_TIMEOUT_MS: "3000",
    },
  );
  await waitFor(() => existsSync(marker));
  dead.proc.kill("SIGKILL");
  await dead.result;
  const racers = Array.from({ length: 8 }, (_, index) =>
    child(["save", dir, "cycle:k", `racer-${index}`], {
      TEST_LOCK_TIMEOUT_MS: "3000",
    }),
  );
  const results = await Promise.all(racers.map((r) => r.result));
  const winners = results.filter((r) => r.saved === true);
  assert.equal(winners.length, 1, JSON.stringify(results));
  rmSync(dir, { recursive: true, force: true });
});

test("T5 — après SIGKILL en cours d'exécution, la reprise est refusée tant que le bail est actif, puis unique après expiration", async () => {
  const dir = tmp();
  const log = join(dir, "starts.log");
  const runner = child([
    "run-hang",
    dir,
    "cycle:k",
    "worker-a",
    log,
    "0",
    "400",
  ]);
  await waitFor(() => existsSync(log));
  runner.proc.kill("SIGKILL");
  await runner.result;
  const store = createFileDurableExecutionStore({ directory: dir });
  const early = await recoverDurableExecution(store, {
    idempotencyKey: "cycle:k",
    owner: "worker-b",
    leaseDurationMs: 60_000,
  });
  assert.equal(early.status, "rejected");
  assert.equal(early.status === "rejected" ? early.code : null, "lease_active");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const [first, second] = await Promise.all([
    recoverDurableExecution(store, {
      idempotencyKey: "cycle:k",
      owner: "worker-b",
      leaseDurationMs: 60_000,
    }),
    recoverDurableExecution(store, {
      idempotencyKey: "cycle:k",
      owner: "worker-c",
      leaseDurationMs: 60_000,
    }),
  ]);
  const recovered = [first, second].filter((r) => r.status === "recovered");
  assert.equal(
    recovered.length,
    1,
    "une seule reprise concurrente doit réussir",
  );
  const repeat = await recoverDurableExecution(store, {
    idempotencyKey: "cycle:k",
    owner: "worker-d",
    leaseDurationMs: 60_000,
  });
  assert.equal(repeat.status, "rejected");
  assert.equal(
    repeat.status === "rejected" ? repeat.code : null,
    "lease_active",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("T6 — un renouvellement concurrent d'une reprise : exactement un des deux aboutit", async () => {
  for (let round = 0; round < 15; round += 1) {
    const dir = tmp();
    const store = createFileDurableExecutionStore({ directory: dir });
    const t0 = "2026-01-01T00:00:00.000Z";
    const expiredAt = "2026-01-01T00:00:10.000Z";
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runDurableLoopExecution(
      store,
      leaseRequest("worker-a", 1_000),
      async () => {
        await hold;
        return completed();
      },
      () => t0,
    );
    await waitForLease(store);
    const [renewal, recovery] = await Promise.all([
      renewDurableExecutionLease(
        store,
        {
          idempotencyKey: "cycle:k",
          owner: "worker-a",
          leaseDurationMs: 60_000,
        },
        () => expiredAt,
      ),
      recoverDurableExecution(
        store,
        {
          idempotencyKey: "cycle:k",
          owner: "worker-b",
          leaseDurationMs: 60_000,
        },
        () => expiredAt,
      ),
    ]);
    const winners =
      Number(renewal.status === "renewed") +
      Number(recovery.status === "recovered");
    assert.equal(
      winners,
      1,
      `round ${round}: ${JSON.stringify([renewal, recovery].map((r) => (r.status === "rejected" ? r.code : r.status)))}`,
    );
    release?.();
    await running;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T7 — un ancien détenteur ne peut ni terminer ni libérer le bail d'un nouveau détenteur", async () => {
  const dir = tmp();
  const store = createFileDurableExecutionStore({ directory: dir });
  const t0 = "2026-01-01T00:00:00.000Z";
  const later = "2026-01-01T01:00:00.000Z";
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const old = runDurableLoopExecution(
    store,
    leaseRequest("worker-old", 1_000),
    async () => {
      await hold;
      return completed();
    },
    () => t0,
  );
  await waitForLease(store);
  const recovered = await recoverDurableExecution(
    store,
    {
      idempotencyKey: "cycle:k",
      owner: "worker-new",
      leaseDurationMs: 600_000,
    },
    () => later,
  );
  assert.equal(recovered.status, "recovered");
  release?.();
  const oldOutcome = await old;
  assert.equal(oldOutcome.status, "rejected");
  const record = await store.load("cycle:k");
  assert.equal(record?.status, "running");
  assert.equal(record?.leaseOwner, "worker-new");
  rmSync(dir, { recursive: true, force: true });
});

test("T8 — un arrêt entre la persistance du bail et l'accusé laisse un bail actif, non reprenable", async () => {
  const dir = tmp();
  const log = join(dir, "starts.log");
  const crashing = child([
    "run-crash-on-ack",
    dir,
    "cycle:k",
    "worker-a",
    log,
    "0",
    "600000",
  ]);
  const crashed = await crashing.result;
  assert.equal(crashed.signal, "SIGKILL");
  assert.equal(
    existsSync(log),
    false,
    "l'exécuteur ne doit pas avoir démarré avant l'accusé",
  );
  const store = createFileDurableExecutionStore({ directory: dir });
  const record = await store.load("cycle:k");
  assert.equal(record?.status, "running");
  assert.equal(record?.leaseOwner, "worker-a");
  const retry = await runDurableLoopExecution(
    store,
    leaseRequest("worker-b"),
    async () => completed(),
  );
  assert.equal(retry.status, "rejected");
  assert.equal(
    retry.status === "rejected" ? retry.code : null,
    "execution_in_progress",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("T9 — magasin indisponible : échec fermé, aucune exécution, aucun enregistrement", async () => {
  const dir = tmp();
  chmodSync(dir, 0o500);
  const store = createFileDurableExecutionStore({
    directory: dir,
    lockTimeoutMs: 100,
    lockRetryMs: 5,
  });
  let started = 0;
  await assert.rejects(
    runDurableLoopExecution(store, leaseRequest("worker-a"), async () => {
      started += 1;
      return completed();
    }),
  );
  assert.equal(started, 0);
  chmodSync(dir, 0o700);
  assert.equal(await store.load("cycle:k"), null);
  rmSync(dir, { recursive: true, force: true });
});

test("T10 — un verrou occupé par un détenteur vivant entraîne un refus borné, jamais une écriture", async () => {
  const dir = tmp();
  const marker = join(dir, "marker");
  const holder = child(
    ["stall-save", dir, "cycle:k", "holder", marker, "release"],
    {
      TEST_LOCK_TIMEOUT_MS: "5000",
    },
  );
  await waitFor(() => existsSync(marker));
  const store = createFileDurableExecutionStore({
    directory: dir,
    lockTimeoutMs: 120,
    lockRetryMs: 5,
  });
  const begin = Date.now();
  await assert.rejects(
    runDurableLoopExecution(store, leaseRequest("worker-b"), async () =>
      completed(),
    ),
  );
  assert.ok(Date.now() - begin < 2500);
  writeFileSync(`${marker}.release`, "release");
  assert.equal((await holder.result).saved, true);
  rmSync(dir, { recursive: true, force: true });
});

test("P1 — le répertoire créé a le mode 0700 quel que soit l'umask, et les fichiers 0600", async () => {
  const previous = process.umask(0o000);
  try {
    const parent = tmp();
    const dir = join(parent, "new-state");
    const store = createFileDurableExecutionStore({ directory: dir });
    assert.equal(await store.save(syntheticRecord("cycle:k", "w"), null), true);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    const files = readdirSync(dir).filter((n) => n.endsWith(".json"));
    assert.equal(files.length, 1);
    assert.equal(statSync(join(dir, files[0]!)).mode & 0o777, 0o600);
    rmSync(parent, { recursive: true, force: true });
  } finally {
    process.umask(previous);
  }
});

test("T11 — un successeur portant la même étiquette de détenteur n'est pas confondu avec l'ancien (identité = détenteur + tentative)", async () => {
  const dir = tmp();
  const store = createFileDurableExecutionStore({ directory: dir });
  const t0 = "2026-01-01T00:00:00.000Z";
  const later = "2026-01-01T01:00:00.000Z";
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const old = runDurableLoopExecution(
    store,
    leaseRequest("worker-same", 1_000),
    async () => {
      await hold;
      return completed();
    },
    () => t0,
  );
  await waitForLease(store);
  const recovered = await recoverDurableExecution(
    store,
    {
      idempotencyKey: "cycle:k",
      owner: "worker-same",
      leaseDurationMs: 600_000,
    },
    () => later,
  );
  assert.equal(recovered.status, "recovered");
  const staleRenewal = await renewDurableExecutionLease(
    store,
    {
      idempotencyKey: "cycle:k",
      owner: "worker-same",
      attempt: 1,
      leaseDurationMs: 600_000,
    },
    () => later,
  );
  assert.equal(staleRenewal.status, "rejected");
  assert.equal(
    staleRenewal.status === "rejected" ? staleRenewal.code : null,
    "lease_lost",
  );
  release?.();
  const oldOutcome = await old;
  assert.equal(oldOutcome.status, "rejected");
  const record = await store.load("cycle:k");
  assert.equal(record?.status, "running");
  assert.equal(record?.attempt, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("T12 — un superviseur d'annulation d'une ancienne tentative ne peut pas annuler le bail de son successeur", async () => {
  const dir = tmp();
  const store = createFileDurableExecutionStore({ directory: dir });
  const t0 = "2026-01-01T00:00:00.000Z";
  const later = "2026-01-01T01:00:00.000Z";
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const old = runDurableLoopExecution(
    store,
    leaseRequest("worker-same", 1_000),
    async () => {
      await hold;
      return completed();
    },
    () => t0,
  );
  await waitForLease(store);
  await recoverDurableExecution(
    store,
    {
      idempotencyKey: "cycle:k",
      owner: "worker-same",
      leaseDurationMs: 600_000,
    },
    () => later,
  );
  await requestDurableExecutionCancellation(
    store,
    "cycle:k",
    "operator",
    () => later,
  );
  const supervised = await superviseActiveExecutionCancellation(
    store,
    {
      idempotencyKey: "cycle:k",
      owner: "worker-same",
      attempt: 1,
      pollIntervalMs: 5,
    },
    { cancel: async () => {}, completed: new Promise<void>(() => {}) },
    { now: () => later, sleep: async () => {} },
  );
  assert.equal(supervised.status, "rejected");
  assert.equal(
    supervised.status === "rejected" ? supervised.code : null,
    "lease_lost",
  );
  assert.equal((await store.load("cycle:k"))?.status, "running");
  release?.();
  await old;
});
