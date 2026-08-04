import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NodeProcessRunner } from "../main/node-process-runner.js";

describe("NodeProcessRunner", () => {
  it("executes a node script and captures stdout", async () => {
    const dir = join(tmpdir(), `loop-gui-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    const script = join(dir, "echo.js");

    await writeFile(
      script,
      'console.log(JSON.stringify({schemaVersion:1,projects:[]}));',
      "utf8",
    );

    const runner = new NodeProcessRunner();

    const result = await runner.run({
      executable: process.execPath,
      args: [script],
      cwd: dir,
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /schemaVersion/);
    assert.equal(result.stderr, "");
  });
});
