import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createFileOrchestrationServiceHmacKeyResolver,
  createFileOrchestrationServiceReplayStore,
  writeFileOrchestrationServiceHmacKeyStore,
} from "../../src/service/orchestration-service-persistent-auth-store.js";

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "loop-service-auth-store-"));
}

test("resolves HMAC secrets from a persistent key store", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const filePath = join(directory, "keys.json");
  writeFileOrchestrationServiceHmacKeyStore(filePath, {
    "primary-key": "primary-secret",
  });

  const resolver = createFileOrchestrationServiceHmacKeyResolver({ filePath });

  assert.equal(await resolver.resolve("primary-key"), "primary-secret");
  assert.equal(await resolver.resolve("unknown-key"), null);
});

test("reloads HMAC keys without recreating the resolver", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const filePath = join(directory, "keys.json");
  const resolver = createFileOrchestrationServiceHmacKeyResolver({ filePath });

  writeFileOrchestrationServiceHmacKeyStore(filePath, {
    rotating: "first-secret",
  });
  assert.equal(await resolver.resolve("rotating"), "first-secret");

  writeFileOrchestrationServiceHmacKeyStore(filePath, {
    rotating: "second-secret",
  });
  assert.equal(await resolver.resolve("rotating"), "second-secret");
});

test("fails closed for absent or corrupt HMAC key stores", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const filePath = join(directory, "keys.json");
  const resolver = createFileOrchestrationServiceHmacKeyResolver({ filePath });

  assert.equal(await resolver.resolve("primary-key"), null);

  writeFileSync(filePath, "{invalid-json", "utf8");
  assert.equal(await resolver.resolve("primary-key"), null);

  writeFileSync(
    filePath,
    JSON.stringify({ schemaVersion: 1, keys: { "primary-key": "" } }),
    "utf8",
  );
  assert.equal(await resolver.resolve("primary-key"), null);
});

test("persists replay claims across store instances", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  let now = 1_000;
  const first = createFileOrchestrationServiceReplayStore({
    directory,
    nowEpochSeconds: () => now,
  });
  const second = createFileOrchestrationServiceReplayStore({
    directory,
    nowEpochSeconds: () => now,
  });

  assert.equal(await first.consume("primary-key", "nonce-1", 1_300), true);
  assert.equal(await second.consume("primary-key", "nonce-1", 1_300), false);
});

test("allows a nonce to be claimed after its persisted claim expires", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  let now = 1_000;
  const store = createFileOrchestrationServiceReplayStore({
    directory,
    nowEpochSeconds: () => now,
  });

  assert.equal(await store.consume("primary-key", "nonce-1", 1_100), true);
  assert.equal(await store.consume("primary-key", "nonce-1", 1_200), false);

  now = 1_101;
  assert.equal(await store.consume("primary-key", "nonce-1", 1_300), true);
});

test("keeps corrupt replay claims fail-closed", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const store = createFileOrchestrationServiceReplayStore({
    directory,
    nowEpochSeconds: () => 1_000,
  });

  assert.equal(await store.consume("primary-key", "nonce-1", 1_300), true);

  const claims = await import("node:fs").then(({ readdirSync }) =>
    readdirSync(directory),
  );
  assert.equal(claims.length, 1);
  writeFileSync(join(directory, claims[0]!), "{invalid-json", "utf8");

  assert.equal(await store.consume("primary-key", "nonce-1", 1_300), false);
});

test("rejects invalid and already expired replay claims", async (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const store = createFileOrchestrationServiceReplayStore({
    directory,
    nowEpochSeconds: () => 1_000,
  });

  assert.equal(await store.consume("", "nonce", 1_300), false);
  assert.equal(await store.consume("key", "", 1_300), false);
  assert.equal(await store.consume("key", "nonce", 1_000), false);
  assert.equal(await store.consume("key", "nonce", Number.NaN), false);
});
