import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createGuiConfigStore,
  createRepoPathResolver,
  resolveLoopEngineRepositoryPath,
} from "../../src/gui/index.js";

describe("GUI configuration and repository resolution", () => {
  it("defaults missing or malformed GUI config to an unconfigured repository", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-gui-config-"));
    const path = join(root, "config", "gui.json");
    const store = createGuiConfigStore(path);

    assert.deepEqual(store.read(), { repositoryPath: null });
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(path, "not-json", "utf8");
    assert.deepEqual(store.read(), { repositoryPath: null });
  });

  it("persists only the GUI repository path outside project configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-gui-config-"));
    const path = join(root, "config", "gui.json");
    const store = createGuiConfigStore(path);

    store.write({ repositoryPath: "/tmp/loop-engine" });
    assert.deepEqual(store.read(), { repositoryPath: "/tmp/loop-engine" });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      repositoryPath: "/tmp/loop-engine",
    });
  });

  it("detects the nearest Loop Engine repository from a nested path", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-gui-repo-"));
    const nested = join(root, "a", "b");
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"loop-engine"}', "utf8");
    writeFileSync(join(root, "src", "cli.ts"), "", "utf8");

    assert.equal(createRepoPathResolver().detect(nested), root);
  });

  it("returns null when no Loop Engine repository can be detected", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-gui-repo-"));
    assert.equal(createRepoPathResolver().detect(root), null);
  });

  it("prefers a validated configured repository before detecting from the app path", () => {
    const resolver = {
      detect(path: string) {
        if (path === "/configured") return "/configured";
        if (path === "/app") return "/app";
        return null;
      },
    };

    assert.equal(
      resolveLoopEngineRepositoryPath({
        configuredRepositoryPath: "/configured",
        startPath: "/app",
        resolver,
      }),
      "/configured",
    );
  });

  it("falls back to the detected repository when the configured path is invalid", () => {
    assert.equal(
      resolveLoopEngineRepositoryPath({
        configuredRepositoryPath: "/not-a-loop-engine-repository",
        startPath: "/app",
        resolver: {
          detect(path) {
            return path === "/app" ? "/app" : null;
          },
        },
      }),
      "/app",
    );
  });
});
