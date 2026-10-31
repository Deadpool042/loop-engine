import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  resolveConfinedProjectPath,
  resolveProjectPath,
  resolveProjectsRoot,
} from "../src/core/config.js";

test("root-relative project paths are independent of Loop checkout depth", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-root-path-"));
  try {
    mkdirSync(join(root, "platform", "loop-engine"), { recursive: true });
    mkdirSync(join(root, "platform", "development-workspace"));
    const projectsRoot = resolveProjectsRoot(root);
    const cwd = join(root, "platform", "loop-engine");
    assert.equal(
      resolveConfinedProjectPath("@projects/platform/development-workspace", projectsRoot, cwd).canonicalPath,
      join(root, "platform", "development-workspace"),
    );
    assert.equal(
      resolveProjectPath({ path: "@projects/platform/development-workspace" }, projectsRoot, cwd),
      "@projects/platform/development-workspace",
    );
    assert.throws(() => resolveConfinedProjectPath("@projects/../../escape", projectsRoot, cwd), /escapes/);
    symlinkSync(tmpdir(), join(root, "outside"));
    assert.throws(() => resolveConfinedProjectPath("@projects/outside", projectsRoot, cwd), /escapes/);
    assert.equal(
      resolveConfinedProjectPath("../development-workspace", projectsRoot, cwd).canonicalPath,
      join(root, "platform", "development-workspace"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
