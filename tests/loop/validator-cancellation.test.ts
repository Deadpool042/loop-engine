import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import { validateLoopExecution } from "../../src/loop/execution.js";

// Synthetic validation command: a shell-spawned node process starts a
// SIGTERM-ignoring grandchild and publishes its pid as readiness.
const CHILD_SOURCE = `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const grandchild = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
  { stdio: ["ignore", "inherit", "inherit"] },
);
writeFileSync(process.env.VALIDATION_PID_PATH, String(grandchild.pid));
setInterval(() => {}, 1000);
`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (existsSync(path)) {
      const value = Number(readFileSync(path, "utf8").trim());
      if (Number.isSafeInteger(value) && value > 0) return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The synthetic validation child never signalled readiness.");
}

function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "loop-validator-cancel-")),
  );
  const projectPath = join(root, "project");
  mkdirSync(projectPath);
  writeFileSync(join(projectPath, "child.cjs"), CHILD_SOURCE);
  const pidPath = join(root, "grandchild.pid");
  const project: ProjectConfig = {
    name: "validator-cancel",
    path: projectPath,
    type: "test",
    required_docs: [],
    validation: ["node child.cjs"],
    roadmap: [],
  };
  return { root, project, pidPath };
}

describe(
  "default validator — cancellation (L7)",
  { skip: process.platform === "win32" },
  () => {
    it("terminates the validation shell and its SIGTERM-ignoring descendant on abort", async () => {
      const { root, project, pidPath } = fixture();
      const previousRoot = process.env.LOOP_PROJECTS_ROOT;
      const previousPid = process.env.VALIDATION_PID_PATH;
      process.env.LOOP_PROJECTS_ROOT = root;
      process.env.VALIDATION_PID_PATH = pidPath;
      let descendant: number | null = null;
      try {
        const controller = new AbortController();
        const started = Date.now();
        const pending = validateLoopExecution({
          runId: "run-1",
          project,
          candidate: {} as never,
          modifiedFiles: [],
          attempt: 1,
          signal: controller.signal,
        });
        descendant = await waitForPid(pidPath);
        assert.equal(alive(descendant), true);

        controller.abort();
        const result = await pending;

        assert.equal(result.status, "failed");
        assert.equal(alive(descendant), false, "descendant must be dead");
        assert.ok(Date.now() - started < 20_000);
      } finally {
        if (descendant !== null) {
          try {
            process.kill(descendant, "SIGKILL");
          } catch {
            // already gone
          }
        }
        if (previousRoot === undefined) delete process.env.LOOP_PROJECTS_ROOT;
        else process.env.LOOP_PROJECTS_ROOT = previousRoot;
        if (previousPid === undefined) delete process.env.VALIDATION_PID_PATH;
        else process.env.VALIDATION_PID_PATH = previousPid;
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("an already-aborted signal spawns no validation command", async () => {
      const { root, project, pidPath } = fixture();
      const previousRoot = process.env.LOOP_PROJECTS_ROOT;
      const previousPid = process.env.VALIDATION_PID_PATH;
      process.env.LOOP_PROJECTS_ROOT = root;
      process.env.VALIDATION_PID_PATH = pidPath;
      try {
        const controller = new AbortController();
        controller.abort();
        const result = await validateLoopExecution({
          runId: "run-1",
          project,
          candidate: {} as never,
          modifiedFiles: [],
          attempt: 1,
          signal: controller.signal,
        });
        assert.equal(result.status, "failed");
        assert.equal(existsSync(pidPath), false, "no command may start");
      } finally {
        if (previousRoot === undefined) delete process.env.LOOP_PROJECTS_ROOT;
        else process.env.LOOP_PROJECTS_ROOT = previousRoot;
        if (previousPid === undefined) delete process.env.VALIDATION_PID_PATH;
        else process.env.VALIDATION_PID_PATH = previousPid;
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
