import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  resolveConfinedProjectPath,
  resolveProjectPath,
  resolveProjectsRoot,
} from "../../src/core/config.js";

test("root-relative project paths are independent of Loop checkout depth", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-root-path-"));
  try {
    mkdirSync(join(root, "platform", "loop-engine"), { recursive: true });
    mkdirSync(join(root, "platform", "development-workspace"));
    const projectsRoot = resolveProjectsRoot(root);
    const cwd = join(root, "platform", "loop-engine");
    assert.equal(
      resolveConfinedProjectPath("@projects/platform/development-workspace", projectsRoot, cwd).canonicalPath,
      realpathSync(join(root, "platform", "development-workspace")),
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
      realpathSync(join(root, "platform", "development-workspace")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Mac and VPS layouts resolve root-relative paths without cwd dependence", () => {
  for (const layout of ["mac", "vps"]) {
    const root = mkdtempSync(join(tmpdir(), `loop-${layout}-`));
    try {
      mkdirSync(join(root, "platform", "loop-engine"), { recursive: true });
      mkdirSync(join(root, "platform", "development-workspace"));
      mkdirSync(join(root, layout === "mac" ? "creatyss" : "CREATYSS"));
      const projectsRoot = resolveProjectsRoot(root);
      const cwd = join(root, "platform", "loop-engine");
      assert.equal(
        resolveConfinedProjectPath("@projects/platform/development-workspace", projectsRoot, cwd).canonicalPath,
        realpathSync(join(root, "platform", "development-workspace")),
      );
      assert.equal(
        resolveProjectPath({
          path: "@projects/CREATYSS",
          path_aliases: ["@projects/creatyss"],
        }, projectsRoot, cwd),
        layout === "mac" ? "@projects/creatyss" : "@projects/CREATYSS",
      );
      assert.throws(
        () => resolveProjectPath({
          path: "@projects/platform/development-workspace",
          path_aliases: ["@projects/platform/development-workspace"],
        }, projectsRoot, cwd),
        /ambiguous/,
      );
      assert.throws(
        () => resolveConfinedProjectPath("@projects/PLATFORM/development-workspace", projectsRoot, cwd),
        /incorrect case/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
