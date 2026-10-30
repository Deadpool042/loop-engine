import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadConfig,
  resolveConfinedProjectPath,
  resolveProjectPath,
  resolveProjectsRoot,
} from "../../src/core/config.js";

type Fixture = Readonly<{
  base: string;
  root: string;
  cwd: string;
  outside: string;
}>;

function withFixture(run: (fixture: Fixture) => void): void {
  const base = mkdtempSync(join(tmpdir(), "loop-path-confinement-"));
  const root = join(base, "Projects");
  const cwd = join(root, "platform", "loop-engine");
  mkdirSync(cwd, { recursive: true });
  try {
    run({ base, root, cwd, outside: join(base, "Projects-other") });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("projects root must be explicitly provided", () => {
  const previous = process.env.LOOP_PROJECTS_ROOT;
  delete process.env.LOOP_PROJECTS_ROOT;
  try {
    assert.throws(
      () => resolveProjectsRoot(),
      /LOOP_PROJECTS_ROOT is required/,
    );
    assert.throws(() => loadConfig(), /LOOP_PROJECTS_ROOT is required/);
  } finally {
    if (previous === undefined) delete process.env.LOOP_PROJECTS_ROOT;
    else process.env.LOOP_PROJECTS_ROOT = previous;
  }
});

test("projects root rejects empty, relative, absent, and non-directory values", () => {
  const temp = mkdtempSync(join(tmpdir(), "loop-projects-root-"));
  const file = join(temp, "not-a-directory");
  writeFileSync(file, "fixture");
  try {
    assert.throws(() => resolveProjectsRoot(""), /must not be empty/);
    assert.throws(
      () => resolveProjectsRoot("relative/Projects"),
      /absolute path/,
    );
    assert.throws(
      () => resolveProjectsRoot(join(temp, "missing")),
      /does not exist/,
    );
    assert.throws(() => resolveProjectsRoot(file), /must be a directory/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("projects root accepts and canonicalizes an existing directory", () => {
  const temp = mkdtempSync(join(tmpdir(), "loop-projects-root-"));
  const root = join(temp, "Projects");
  mkdirSync(root);
  try {
    const resolved = resolveProjectsRoot(root);
    assert.equal(resolved.canonicalPath, realpathSync(root));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("relative and absolute project paths are accepted only inside the root", () => {
  withFixture(({ root, cwd }) => {
    const internal = join(root, "apps", "clients", "creatyss");
    mkdirSync(internal, { recursive: true });
    const allowedRoot = resolveProjectsRoot(root);

    assert.equal(
      resolveConfinedProjectPath(
        "../../apps/clients/creatyss",
        allowedRoot,
        cwd,
      ).canonicalPath,
      realpathSync(internal),
    );
    assert.equal(
      resolveConfinedProjectPath(internal, allowedRoot, cwd).canonicalPath,
      realpathSync(internal),
    );
    assert.throws(
      () => resolveConfinedProjectPath("../../../outside", allowedRoot, cwd),
      /escapes LOOP_PROJECTS_ROOT/,
    );
    assert.throws(
      () =>
        resolveConfinedProjectPath(
          join(root, "..", "Projects-other", "repo"),
          allowedRoot,
          cwd,
        ),
      /escapes LOOP_PROJECTS_ROOT/,
    );
  });
});

test("normalized parent traversals are allowed only while they remain inside the root", () => {
  withFixture(({ root, cwd }) => {
    const internal = join(root, "platform", "repo");
    mkdirSync(internal);
    const allowedRoot = resolveProjectsRoot(root);

    assert.equal(
      resolveConfinedProjectPath("../repo/../repo", allowedRoot, cwd)
        .canonicalPath,
      realpathSync(internal),
    );
    assert.throws(
      () => resolveConfinedProjectPath("../../../../outside", allowedRoot, cwd),
      /escapes LOOP_PROJECTS_ROOT/,
    );
  });
});

test("a missing project remains declared when its last existing parent is confined", () => {
  withFixture(({ root, cwd }) => {
    const allowedRoot = resolveProjectsRoot(root);
    const missingPath = "../future-project";
    const resolved = resolveConfinedProjectPath(missingPath, allowedRoot, cwd);

    assert.equal(resolved.exists, false);
    assert.equal(
      resolved.canonicalPath,
      join(realpathSync(root), "platform", "future-project"),
    );
    assert.equal(
      resolveProjectPath({ path: missingPath }, allowedRoot, cwd),
      missingPath,
    );
  });
});

test("an internal symlink resolves to its canonical target", () => {
  withFixture(({ root, cwd }) => {
    const target = join(root, "sandbox", "fixture");
    const link = join(root, "platform", "fixture-link");
    mkdirSync(target, { recursive: true });
    symlinkSync(target, link, "dir");

    const resolved = resolveConfinedProjectPath(
      "../fixture-link",
      resolveProjectsRoot(root),
      cwd,
    );
    assert.equal(resolved.exists, true);
    assert.equal(resolved.canonicalPath, realpathSync(target));
  });
});

test("outbound, chained outbound, and broken symlinks fail explicitly", () => {
  withFixture(({ root, cwd, outside }) => {
    const outsideTarget = join(outside, "repo");
    mkdirSync(outsideTarget, { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    symlinkSync(outsideTarget, join(root, "platform", "outbound"), "dir");
    symlinkSync(
      join(root, "platform", "second"),
      join(root, "platform", "first"),
      "dir",
    );
    symlinkSync(outsideTarget, join(root, "platform", "second"), "dir");
    symlinkSync(
      join(root, "platform", "absent-target"),
      join(root, "platform", "broken"),
      "dir",
    );
    const allowedRoot = resolveProjectsRoot(root);

    assert.throws(
      () => resolveConfinedProjectPath("../outbound", allowedRoot, cwd),
      /escapes LOOP_PROJECTS_ROOT/,
    );
    assert.throws(
      () => resolveConfinedProjectPath("../first", allowedRoot, cwd),
      /escapes LOOP_PROJECTS_ROOT/,
    );
    assert.throws(
      () => resolveConfinedProjectPath("../broken", allowedRoot, cwd),
      /broken symlink/,
    );
  });
});

test("parent traversal after an outbound symlink is refused before normalization", () => {
  withFixture(({ root, cwd, outside }) => {
    const outsideTarget = join(outside, "nested");
    mkdirSync(outsideTarget, { recursive: true });
    mkdirSync(join(root, "platform", "safe"), { recursive: true });
    symlinkSync(outsideTarget, join(root, "platform", "escape"), "dir");

    assert.throws(
      () =>
        resolveConfinedProjectPath(
          "../escape/../safe",
          resolveProjectsRoot(root),
          cwd,
        ),
      /escapes LOOP_PROJECTS_ROOT through a symlink/,
    );
  });
});

test("symlinked parents are checked against their effective target", () => {
  withFixture(({ root, cwd, outside }) => {
    const internalTarget = join(root, "sandbox", "internal");
    const outsideTarget = join(outside, "external");
    mkdirSync(join(internalTarget, "repo"), { recursive: true });
    mkdirSync(join(outsideTarget, "repo"), { recursive: true });
    symlinkSync(
      internalTarget,
      join(root, "platform", "internal-parent"),
      "dir",
    );
    symlinkSync(
      outsideTarget,
      join(root, "platform", "external-parent"),
      "dir",
    );
    const allowedRoot = resolveProjectsRoot(root);

    assert.equal(
      resolveConfinedProjectPath("../internal-parent/repo", allowedRoot, cwd)
        .canonicalPath,
      realpathSync(join(internalTarget, "repo")),
    );
    assert.throws(
      () =>
        resolveConfinedProjectPath("../external-parent/repo", allowedRoot, cwd),
      /escapes LOOP_PROJECTS_ROOT/,
    );
  });
});

test("incorrect component casing is rejected unless an explicit alias matches exactly", () => {
  withFixture(({ root, cwd }) => {
    mkdirSync(join(root, "platform", "Creatyss"));
    const allowedRoot = resolveProjectsRoot(root);

    assert.throws(
      () => resolveProjectPath({ path: "../creatyss" }, allowedRoot, cwd),
      /incorrect case/,
    );

    mkdirSync(join(root, "apps", "clients", "creatyss"), { recursive: true });
    assert.equal(
      resolveProjectPath(
        {
          path: "../../apps/clients/CREATYSS",
          path_aliases: ["../../apps/clients/creatyss"],
        },
        allowedRoot,
        cwd,
      ),
      "../../apps/clients/creatyss",
    );
  });
});

test("multiple existing paths fail even when they canonicalize to the same checkout", () => {
  withFixture(({ root, cwd }) => {
    const target = join(root, "platform", "repo");
    mkdirSync(target, { recursive: true });
    symlinkSync(target, join(root, "platform", "repo-alias"), "dir");
    const allowedRoot = resolveProjectsRoot(root);

    assert.throws(
      () =>
        resolveProjectPath(
          { path: "../repo", path_aliases: ["../repo-alias"] },
          allowedRoot,
          cwd,
        ),
      /ambiguous/,
    );
  });
});

test("multiple distinct existing paths fail without inspecting Git identity", () => {
  withFixture(({ root, cwd }) => {
    mkdirSync(join(root, "platform", "repo-a"), { recursive: true });
    mkdirSync(join(root, "platform", "repo-b"), { recursive: true });

    assert.throws(
      () =>
        resolveProjectPath(
          { path: "../repo-a", path_aliases: ["../repo-b"] },
          resolveProjectsRoot(root),
          cwd,
        ),
      /ambiguous/,
    );
  });
});

test("an invalid candidate is rejected before a valid candidate can mask it", () => {
  withFixture(({ root, cwd }) => {
    mkdirSync(join(root, "platform", "valid"), { recursive: true });

    assert.throws(
      () =>
        resolveProjectPath(
          { path: "../valid", path_aliases: ["../../../outside"] },
          resolveProjectsRoot(root),
          cwd,
        ),
      /escapes LOOP_PROJECTS_ROOT/,
    );
  });
});
