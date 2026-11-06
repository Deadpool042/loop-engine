import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { syntheticRecord } from "./support/synthetic.js";

// Ordre des écritures du magasin durable. On observe les appels (fsync fichier,
// rename, fsync répertoire) par instrumentation : cela prouve l'ORDRE DES APPELS
// du programme, pas la survie à une coupure de courant ni le comportement réel
// du stockage.

const events: string[] = [];
let directorySyncFailure: string | null = null;
const dir = mkdtempSync(join(tmpdir(), "le-persist-"));
after(() => {
  fsp.rename = originalRename;
  handlePrototype.sync = originalSync;
  syncBuiltinESMExports();
  rmSync(dir, { recursive: true, force: true });
});

const originalRename = fsp.rename;
fsp.rename = (async (...args: Parameters<typeof fsp.rename>) => {
  events.push("rename");
  return originalRename(...args);
}) as typeof fsp.rename;

const probe = await fsp.open(join(dir, ".probe"), "w");
const handlePrototype = Object.getPrototypeOf(probe) as {
  sync: (this: fsp.FileHandle) => Promise<void>;
};
await probe.close();
const originalSync = handlePrototype.sync;
handlePrototype.sync = async function (this: fsp.FileHandle): Promise<void> {
  const isDirectory = (await this.stat()).isDirectory();
  events.push(isDirectory ? "sync:dir" : "sync:file");
  if (isDirectory && directorySyncFailure !== null) {
    throw Object.assign(new Error("simulated"), { code: directorySyncFailure });
  }
  return originalSync.call(this);
};
syncBuiltinESMExports();

const { createFileDurableExecutionStore } =
  await import("../../src/loop/file-durable-execution-store.js");

test("P2 — fsync du fichier, rename atomique, puis fsync du répertoire, avant le retour de save", async () => {
  events.length = 0;
  directorySyncFailure = null;
  const store = createFileDurableExecutionStore({ directory: join(dir, "a") });
  const saved = await store.save(syntheticRecord("cycle:p", "w"), null);
  events.push("save:returned");
  assert.equal(saved, true);
  // Le premier rename est la publication du verrou par le gestionnaire de verrous.
  assert.deepEqual(events.slice(events.indexOf("sync:file")), [
    "sync:file",
    "rename",
    "sync:dir",
    "save:returned",
  ]);
});

test("P3 — une plateforme sans fsync de répertoire (EINVAL, ENOTSUP, EISDIR, EPERM) n'échoue pas une écriture déjà publiée", async () => {
  for (const code of ["EINVAL", "ENOTSUP", "EISDIR", "EPERM"]) {
    events.length = 0;
    directorySyncFailure = code;
    const store = createFileDurableExecutionStore({
      directory: join(dir, `b-${code}`),
    });
    assert.equal(
      await store.save(syntheticRecord("cycle:p", "w"), null),
      true,
      code,
    );
    assert.equal(
      (await store.load("cycle:p"))?.idempotencyKey,
      "cycle:p",
      code,
    );
  }
  directorySyncFailure = null;
});

test("P4 — toute autre erreur de fsync du répertoire est remontée, et l'enregistrement est déjà publié (écrit mais non acquitté)", async () => {
  events.length = 0;
  directorySyncFailure = "EIO";
  const store = createFileDurableExecutionStore({ directory: join(dir, "c") });
  await assert.rejects(store.save(syntheticRecord("cycle:p", "w"), null));
  directorySyncFailure = null;
  assert.equal((await store.load("cycle:p"))?.idempotencyKey, "cycle:p");
});
