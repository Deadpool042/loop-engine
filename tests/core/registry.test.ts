import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../../src/registry.js";

describe("static registry primitives", () => {
  it("preserves declaration order in an immutable copy", () => {
    const source = [{ id: "first" }, { id: "second" }];
    const entries = createStaticRegistryEntries(
      source,
      (entry) => entry.id,
      (id) => `Duplicate entry id: ${id}`,
    );

    source.push({ id: "third" });
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["first", "second"],
    );
    assert.ok(Object.isFrozen(entries));
  });

  it("rejects duplicate identifiers with the domain-supplied stable message", () => {
    assert.throws(
      () =>
        createStaticRegistryEntries(
          [{ id: "same" }, { id: "same" }],
          (entry) => entry.id,
          (id) => `Duplicate entry id: ${id}`,
        ),
      /Duplicate entry id: same/,
    );
  });

  it("finds declared entries without changing absent lookups", () => {
    const entries = createStaticRegistryEntries(
      [{ id: "first" }],
      (entry) => entry.id,
      (id) => `Duplicate entry id: ${id}`,
    );

    assert.equal(
      findStaticRegistryEntry(entries, "first", (entry) => entry.id)?.id,
      "first",
    );
    assert.equal(
      findStaticRegistryEntry(entries, "missing", (entry) => entry.id),
      null,
    );
  });
});
