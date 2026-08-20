import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createProviderKeychainReader,
  PROVIDER_KEYCHAIN_SERVICE,
} from "../../src/gui/keychain-reader.js";

describe("GUI provider keychain reader", () => {
  it("reads the Anthropic API key using /usr/bin/security find-generic-password", async () => {
    const calls: Array<readonly unknown[]> = [];
    const reader = createProviderKeychainReader({
      account: () => "laurent",
      execute: async (args, timeoutMs) => {
        calls.push([args, timeoutMs]);
        return { stdout: "sk-test-key\n", exitCode: 0 };
      },
    });

    const result = await reader.read();
    assert.deepEqual(result, { ok: true, apiKey: "sk-test-key" });
    assert.deepEqual(calls, [
      [
        [
          "find-generic-password",
          "-s",
          PROVIDER_KEYCHAIN_SERVICE,
          "-a",
          "laurent",
          "-w",
        ],
        5_000,
      ],
    ]);
  });

  it("returns an unavailable result when the item is not present, without throwing", async () => {
    const reader = createProviderKeychainReader({
      account: () => "laurent",
      execute: async () => ({ stdout: "", exitCode: 44 }),
    });

    assert.deepEqual(await reader.read(), { ok: false, reason: "unavailable" });
  });

  it("returns a redacted read_failed result on unexpected process errors", async () => {
    const reader = createProviderKeychainReader({
      account: () => "laurent",
      execute: async () => {
        throw new Error("Keychain read timed out.");
      },
    });

    const result = await reader.read();
    assert.deepEqual(result, { ok: false, reason: "read_failed" });
    assert.equal(JSON.stringify(result).includes("sk-"), false);
  });

  it("rejects a secret exceeding the maximum size instead of surfacing it", async () => {
    const reader = createProviderKeychainReader({
      account: () => "laurent",
      execute: async () => ({ stdout: "x".repeat(5 * 1024), exitCode: 0 }),
    });

    assert.deepEqual(await reader.read(), { ok: false, reason: "invalid" });
  });

  it("rejects an empty secret", async () => {
    const reader = createProviderKeychainReader({
      account: () => "laurent",
      execute: async () => ({ stdout: "   \n", exitCode: 0 }),
    });

    assert.deepEqual(await reader.read(), { ok: false, reason: "invalid" });
  });
});
