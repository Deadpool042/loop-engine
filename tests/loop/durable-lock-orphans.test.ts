import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { createLocalProjectLockManager } from "../../src/execution/adapters/local-project-lock-manager.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import { syntheticRecord } from "./support/synthetic.js";

// Qualification des verrous orphelins du magasin durable. Données synthétiques,
// répertoires temporaires. Règle vérifiée : un verrou n'est repris que si son
// détenteur est PROUVÉ mort sur le MÊME hôte avec des métadonnées valides ;
// dans tous les autres cas la reprise reste interdite (refus borné).

const KEY = "cycle:orphan";
const CHILD = join(import.meta.dirname, "support", "durable-store-child.mts");
const spawned: ChildProcess[] = [];
const tempDirs: string[] = [];

after(() => {
  for (const proc of spawned) {
    if (proc.exitCode === null && proc.signalCode === null)
      proc.kill("SIGKILL");
  }
  for (const dir of tempDirs) {
    try {
      chmodSync(join(dir, ".locks"), 0o700);
    } catch {
      // absent ou déjà supprimé
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "le-orphan-"));
  tempDirs.push(dir);
  return dir;
}

const digest = (key: string): string =>
  createHash("sha256").update(key, "utf8").digest("hex");
const encode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");
const segment = (key: string): string => encode(digest(key));

function storeWith(
  dir: string,
  manager: ReturnType<typeof createLocalProjectLockManager>,
) {
  return createFileDurableExecutionStore({
    directory: dir,
    lockManager: manager,
    lockTimeoutMs: 150,
    lockRetryMs: 5,
  });
}

/** Crée un verrou « orphelin » comme le ferait un détenteur de métadonnées données. */
async function plantLock(
  dir: string,
  owner: { hostname: string; pid: number },
): Promise<{ lockPath: string; lockId: string }> {
  mkdirSync(join(dir, ".locks"), { recursive: true, mode: 0o700 });
  const planter = createLocalProjectLockManager({
    lockRoot: join(dir, ".locks"),
    hostname: owner.hostname,
    ownerProcessId: owner.pid,
  });
  const acquisition = await planter.acquire({
    projectId: digest(KEY),
    attemptId: "planted",
  });
  assert.equal(acquisition.acquired, true);
  const lockPath = join(dir, ".locks", segment(KEY));
  const { lockId } = JSON.parse(
    readFileSync(join(lockPath, "owner.json"), "utf8"),
  ) as { lockId: string };
  return { lockPath, lockId };
}

const quarantines = (dir: string): string[] =>
  readdirSync(join(dir, ".locks")).filter((name) =>
    name.includes(".recovered-"),
  );

async function saveOutcome(
  store: ReturnType<typeof storeWith>,
): Promise<"saved" | "conflict" | "refused"> {
  try {
    return (await store.save(syntheticRecord(KEY, "w"), null))
      ? "saved"
      : "conflict";
  } catch {
    return "refused";
  }
}

test("O1 — détenteur prouvé mort sur le même hôte : reprise sûre, une quarantaine, verrou libéré", async () => {
  const dir = tmp();
  const { lockPath, lockId } = await plantLock(dir, {
    hostname: "host-a",
    pid: 4242,
  });
  const store = storeWith(
    dir,
    createLocalProjectLockManager({
      lockRoot: join(dir, ".locks"),
      hostname: "host-a",
      inspectProcess: () => "dead",
    }),
  );
  assert.equal(await saveOutcome(store), "saved");
  assert.equal(
    existsSync(lockPath),
    false,
    "le verrou doit être libéré après l'écriture",
  );
  assert.deepEqual(quarantines(dir), [
    `${segment(KEY)}.recovered-${encode(lockId)}`,
  ]);
});

test("O2 — PID réutilisé par un processus vivant : reprise interdite, verrou intact", async () => {
  const dir = tmp();
  const { lockPath } = await plantLock(dir, { hostname: "host-a", pid: 4242 });
  const store = storeWith(
    dir,
    createLocalProjectLockManager({
      lockRoot: join(dir, ".locks"),
      hostname: "host-a",
      inspectProcess: () => "alive",
    }),
  );
  assert.equal(await saveOutcome(store), "refused");
  assert.equal(existsSync(join(lockPath, "owner.json")), true);
  assert.deepEqual(quarantines(dir), []);
});

test("O3 — inspection impossible (EPERM / inconnu) : reprise interdite", async () => {
  const dir = tmp();
  await plantLock(dir, { hostname: "host-a", pid: 4242 });
  const store = storeWith(
    dir,
    createLocalProjectLockManager({
      lockRoot: join(dir, ".locks"),
      hostname: "host-a",
      inspectProcess: () => "unknown",
    }),
  );
  assert.equal(await saveOutcome(store), "refused");
  assert.deepEqual(quarantines(dir), []);
});

test("O4 — hostname modifié ou verrou d'un autre hôte, même avec un PID mort : reprise interdite", async () => {
  for (const currentHost of ["host-b", "HOST-A", ""]) {
    const dir = tmp();
    await plantLock(dir, { hostname: "host-a", pid: 4242 });
    const store = storeWith(
      dir,
      createLocalProjectLockManager({
        lockRoot: join(dir, ".locks"),
        hostname: currentHost,
        inspectProcess: () => "dead",
      }),
    );
    assert.equal(
      await saveOutcome(store),
      "refused",
      `hostname courant: "${currentHost}"`,
    );
    assert.deepEqual(quarantines(dir), []);
  }
});

test("O5 — métadonnées malformées, absentes ou incohérentes : reprise interdite", async () => {
  const variants: Record<
    string,
    (ownerFile: string, lockPath: string) => void
  > = {
    "JSON invalide": (file) => writeFileSync(file, "{not json"),
    "fichier vide": (file) => writeFileSync(file, ""),
    "version inconnue": (file) =>
      writeFileSync(
        file,
        JSON.stringify({
          version: 99,
          projectId: digest(KEY),
          attemptId: "a",
          lockId: "l",
          pid: 1,
          hostname: "host-a",
          createdAt: "x",
        }),
      ),
    "pid non numérique": (file) =>
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          projectId: digest(KEY),
          attemptId: "a",
          lockId: "l",
          pid: "4242",
          hostname: "host-a",
          createdAt: "x",
        }),
      ),
    "projet différent": (file) =>
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          projectId: "autre",
          attemptId: "a",
          lockId: "l",
          pid: 4242,
          hostname: "host-a",
          createdAt: "x",
        }),
      ),
    "chaîne démesurée": (file) =>
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          projectId: digest(KEY),
          attemptId: "a",
          lockId: "x".repeat(5000),
          pid: 4242,
          hostname: "host-a",
          createdAt: "x",
        }),
      ),
    "propriétaire absent": (file) => rmSync(file, { force: true }),
  };
  for (const [name, corrupt] of Object.entries(variants)) {
    const dir = tmp();
    const { lockPath } = await plantLock(dir, {
      hostname: "host-a",
      pid: 4242,
    });
    corrupt(join(lockPath, "owner.json"), lockPath);
    const store = storeWith(
      dir,
      createLocalProjectLockManager({
        lockRoot: join(dir, ".locks"),
        hostname: "host-a",
        inspectProcess: () => "dead",
      }),
    );
    assert.equal(await saveOutcome(store), "refused", name);
    assert.deepEqual(quarantines(dir), [], name);
    assert.equal(
      existsSync(lockPath),
      true,
      `${name}: le verrou ne doit pas être supprimé`,
    );
  }
});

test("O6 — quarantaine déjà présente pour ce verrou : reprise interdite", async () => {
  const dir = tmp();
  const { lockId } = await plantLock(dir, { hostname: "host-a", pid: 4242 });
  mkdirSync(join(dir, ".locks", `${segment(KEY)}.recovered-${encode(lockId)}`));
  writeFileSync(
    join(dir, ".locks", `${segment(KEY)}.recovered-${encode(lockId)}`, "x"),
    "occupied",
  );
  const store = storeWith(
    dir,
    createLocalProjectLockManager({
      lockRoot: join(dir, ".locks"),
      hostname: "host-a",
      inspectProcess: () => "dead",
    }),
  );
  assert.equal(await saveOutcome(store), "refused");
});

test("O7 — permissions du répertoire de verrous incorrectes : jamais d'écriture ni de suppression silencieuse", async () => {
  for (const mode of [0o500, 0o000]) {
    const dir = tmp();
    const { lockPath } = await plantLock(dir, {
      hostname: "host-a",
      pid: 4242,
    });
    chmodSync(join(dir, ".locks"), mode);
    const store = storeWith(
      dir,
      createLocalProjectLockManager({
        lockRoot: join(dir, ".locks"),
        hostname: "host-a",
        inspectProcess: () => "dead",
      }),
    );
    const outcome = await saveOutcome(store);
    chmodSync(join(dir, ".locks"), 0o700);
    assert.equal(outcome, "refused", `mode ${mode.toString(8)}`);
    assert.equal(existsSync(join(lockPath, "owner.json")), true);
    assert.deepEqual(quarantines(dir), []);
  }
});

function childRun(args: readonly string[], env: Record<string, string>) {
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
      resolve(line === undefined ? { exit: code, signal } : JSON.parse(line));
    });
  });
  return { proc, result };
}

test("O8 — détenteur réel tué par SIGKILL : huit récupérateurs simultanés, une écriture, une quarantaine (3 tours)", async () => {
  for (let round = 0; round < 3; round += 1) {
    const dir = tmp();
    const marker = join(dir, "marker");
    const holder = childRun(
      ["stall-save", dir, KEY, "holder", marker, "60000"],
      {
        TEST_LOCK_TIMEOUT_MS: "100",
      },
    );
    const start = Date.now();
    while (!existsSync(marker)) {
      if (Date.now() - start > 15_000) throw new Error("marqueur absent");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    holder.proc.kill("SIGKILL");
    await holder.result;
    const racers = Array.from({ length: 8 }, (_, index) =>
      childRun(["save", dir, KEY, `racer-${round}-${index}`], {
        TEST_LOCK_TIMEOUT_MS: "3000",
      }),
    );
    const results = await Promise.all(racers.map((racer) => racer.result));
    const saved = results.filter((result) => result.saved === true);
    assert.equal(saved.length, 1, `tour ${round}: ${JSON.stringify(results)}`);
    assert.equal(quarantines(dir).length, 1, `tour ${round}: quarantaines`);
  }
});

test("C1 — ancien verrou <digest>.lock : ignoré par le nouveau code (pas d'exclusion mutuelle entre versions), non supprimé", async () => {
  const dir = tmp();
  const legacy = join(dir, `${digest(KEY)}.lock`);
  writeFileSync(legacy, `${process.pid}\n`);
  const store = createFileDurableExecutionStore({ directory: dir });
  assert.equal(await store.save(syntheticRecord(KEY, "w"), null), true);
  assert.equal(existsSync(legacy), true);
});

test("C2 — fichiers résiduels (*.tmp, .candidate-*, quarantaines) ne sont jamais lus comme enregistrements", async () => {
  const dir = tmp();
  const store = createFileDurableExecutionStore({ directory: dir });
  assert.equal(await store.save(syntheticRecord(KEY, "w"), null), true);
  writeFileSync(
    join(dir, `${digest(KEY)}.json.99.${"a".repeat(8)}.tmp`),
    "{truncated",
  );
  mkdirSync(join(dir, ".locks", ".candidate-deadbeef"), { recursive: true });
  mkdirSync(join(dir, ".locks", `${segment(KEY)}.recovered-x`), {
    recursive: true,
  });
  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal((await store.load(KEY))?.idempotencyKey, KEY);
  assert.equal(await store.verify(KEY), true);
});
