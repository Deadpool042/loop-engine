import assert from "node:assert/strict";
import test from "node:test";

import { sourceIncludesToken } from "../../src/audit/source.js";

test("sourceIncludesToken ignores formatting whitespace and trailing commas", () => {
  const source = `const result = someFunction(
    firstArgument,
    secondArgument,
  );`;

  assert.equal(
    sourceIncludesToken(
      source,
      "const result = someFunction( firstArgument, secondArgument, );",
    ),
    true,
  );
});

test("sourceIncludesToken still rejects absent source tokens", () => {
  assert.equal(
    sourceIncludesToken("const status = true;", "const status = false;"),
    false,
  );
});
