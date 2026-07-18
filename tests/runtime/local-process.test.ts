import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  LocalProcessRuntime,
  type LocalProcessExecutionPolicy,
  type RuntimeRequest,
} from "../../src/runtime/index.js";

function projectRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "loop-runtime-")));
}

function policy(
  root: string,
  overrides: Partial<LocalProcessExecutionPolicy> = {},
): LocalProcessExecutionPolicy {
  return {
    enabled: true,
    projectRoot: root,
    allowedExecutables: [process.execPath],
    allowedEnvironmentKeys: [],
    timeoutMs: 2_000,
    maxStdoutBytes: 1_024,
    maxStderrBytes: 1_024,
    ...overrides,
  };
}

function request(
  root: string,
  options: Readonly<{
    executionPolicy?: LocalProcessExecutionPolicy;
    args?: readonly string[];
    executable?: string;
    cwd?: string;
    environment?: Readonly<Record<string, string>>;
    requestedRuntime?: "local-process" | "codex";
    shellPermission?: boolean;
  }> = {},
): RuntimeRequest {
  const shellPermission = options.shellPermission ?? true;
  const permissions = shellPermission
    ? ["read_only", "shell_exec"]
    : ["read_only"];
  const profile = {
    id: "local.fixture",
    runtime: "custom" as const,
    provider: "local" as const,
    model: "fixture",
    effort: "low" as const,
    capabilities: ["shell_exec" as const],
    permissions,
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };

  return {
    task: {
      path: "docs/roadmap/runtime.md",
      line: 1,
      text: "- [ ] local process",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    mode: "execute",
    contextPackage: {
      project: "fixture",
      budget: {
        maxFiles: 1,
        maxCharacters: 100,
        maxEstimatedTokens: 25,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    resolvedAgentPolicy: {
      policyId: "local-policy",
      mode: "execute",
      status: "resolved",
      requirements: {
        category: "validation",
        mode: "execute",
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: permissions,
        minimumEffort: "low",
        maximumEffort: "low",
        contextBudget: {
          maxFiles: 1,
          maxCharacters: 100,
          maxEstimatedTokens: 25,
          includeFullFiles: false,
        },
        executionBudget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: 1,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: permissions,
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    provider: "local",
    effort: "low",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "local-process-fixture" },
    requestedRuntime: options.requestedRuntime ?? "local-process",
    localProcess: {
      command: {
        executable: options.executable ?? process.execPath,
        args: options.args ?? ["-e", "process.stdout.write('ok')"],
        cwd: options.cwd ?? root,
        ...(options.environment === undefined
          ? {}
          : { environment: options.environment }),
      },
      executionPolicy: options.executionPolicy ?? policy(root),
    },
  };
}

async function execute(input: RuntimeRequest) {
  return await LocalProcessRuntime.execute(input);
}

describe("LocalProcessRuntime", () => {
  it("executes an allow-listed process without a shell and records ordered events", async () => {
    const root = projectRoot();
    try {
      const result = await execute(
        request(root, {
          args: [
            "-e",
            "process.stdout.write(process.argv[1]); process.stderr.write('warn')",
            "with spaces && not-a-shell-operator",
          ],
        }),
      );

      assert.equal(result.status, "completed");
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "with spaces && not-a-shell-operator");
      assert.equal(result.stderr, "warn");
      assert.deepEqual(
        result.events?.map((event) => event.type),
        [
          "request_validated",
          "process_started",
          "stdout_received",
          "stderr_received",
          "process_completed",
        ],
      );
      assert.deepEqual(
        result.events?.map((event) => event.sequence),
        [1, 2, 3, 4, 5],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses every missing authorization before starting a process", async () => {
    const root = projectRoot();
    try {
      const outside = tmpdir();
      const missingRuntimeRequest = request(root);
      const { requestedRuntime: _requestedRuntime, ...missingRuntime } =
        missingRuntimeRequest;
      const cases: readonly [string, RuntimeRequest, string][] = [
        ["missing runtime", missingRuntime, "invalid_request"],
        [
          "other runtime",
          request(root, { requestedRuntime: "codex" }),
          "invalid_request",
        ],
        [
          "disabled",
          request(root, { executionPolicy: policy(root, { enabled: false }) }),
          "runtime_disabled",
        ],
        [
          "permission",
          request(root, { shellPermission: false }),
          "permission_denied",
        ],
        [
          "executable",
          request(root, {
            executionPolicy: policy(root, { allowedExecutables: [] }),
          }),
          "executable_not_allowed",
        ],
        [
          "outside cwd",
          request(root, { cwd: outside }),
          "working_directory_outside_project",
        ],
        [
          "traversal",
          request(root, { cwd: join(root, "..") }),
          "working_directory_outside_project",
        ],
        [
          "environment",
          request(root, { environment: { NOT_ALLOWED: "value" } }),
          "environment_key_not_allowed",
        ],
        [
          "timeout",
          request(root, { executionPolicy: policy(root, { timeoutMs: 0 }) }),
          "invalid_request",
        ],
        [
          "stdout limit",
          request(root, {
            executionPolicy: policy(root, { maxStdoutBytes: 0 }),
          }),
          "invalid_request",
        ],
        [
          "stderr limit",
          request(root, {
            executionPolicy: policy(root, { maxStderrBytes: 0 }),
          }),
          "invalid_request",
        ],
      ];

      for (const [, input, code] of cases) {
        const result = await execute(input);
        assert.equal(result.status, "denied");
        assert.equal(result.error?.code, code);
        assert.equal(result.error?.processStarted, false);
        assert.deepEqual(
          result.events?.map((event) => event.type),
          ["process_failed"],
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked working directory that escapes the project", async (context) => {
    const root = projectRoot();
    const linked = join(root, "outside-link");
    try {
      try {
        symlinkSync(tmpdir(), linked);
      } catch {
        context.skip("symbolic links are unavailable on this platform");
        return;
      }
      const result = await execute(request(root, { cwd: linked }));
      assert.equal(result.status, "denied");
      assert.equal(result.error?.code, "working_directory_outside_project");
      assert.equal(result.error?.processStarted, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports controlled process failures", async () => {
    const root = projectRoot();
    const missingExecutable = join(root, "missing-node");
    try {
      const spawnFailure = await execute(
        request(root, {
          executable: missingExecutable,
          executionPolicy: policy(root, {
            allowedExecutables: [missingExecutable],
          }),
          args: [],
        }),
      );
      assert.equal(spawnFailure.status, "spawn_failed");
      assert.equal(spawnFailure.error?.code, "spawn_failed");

      const nonZero = await execute(
        request(root, { args: ["-e", "process.exit(7)"] }),
      );
      assert.equal(nonZero.status, "non_zero_exit");
      assert.equal(nonZero.exitCode, 7);
      assert.equal(nonZero.error?.code, "non_zero_exit");

      const timedOut = await execute(
        request(root, {
          args: ["-e", "setInterval(() => {}, 1_000)"],
          executionPolicy: policy(root, { timeoutMs: 50 }),
        }),
      );
      assert.equal(timedOut.status, "timed_out");
      assert.equal(timedOut.error?.code, "timed_out");

      const stdoutLimited = await execute(
        request(root, {
          args: ["-e", "process.stdout.write('0123456789')"],
          executionPolicy: policy(root, { maxStdoutBytes: 4 }),
        }),
      );
      assert.equal(stdoutLimited.status, "stdout_limit_exceeded");
      assert.equal(stdoutLimited.stdout, "0123");

      const stderrLimited = await execute(
        request(root, {
          args: ["-e", "process.stderr.write('0123456789')"],
          executionPolicy: policy(root, { maxStderrBytes: 4 }),
        }),
      );
      assert.equal(stderrLimited.status, "stderr_limit_exceeded");
      assert.equal(stderrLimited.stderr, "0123");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes only explicitly allow-listed environment keys", async () => {
    const root = projectRoot();
    const secretKey = "LOOP_RUNTIME_PARENT_SECRET";
    const previous = process.env[secretKey];
    process.env[secretKey] = "parent-only";
    try {
      const absent = await execute(
        request(root, {
          args: [
            "-e",
            `process.stdout.write(process.env.${secretKey} ?? 'absent')`,
          ],
        }),
      );
      assert.equal(absent.stdout, "absent");

      const allowed = await execute(
        request(root, {
          args: ["-e", "process.stdout.write(process.env.VISIBLE ?? 'absent')"],
          environment: { VISIBLE: "explicit" },
          executionPolicy: policy(root, {
            allowedEnvironmentKeys: ["VISIBLE"],
          }),
        }),
      );
      assert.equal(allowed.status, "completed");
      assert.equal(allowed.stdout, "explicit");
    } finally {
      if (previous === undefined) delete process.env[secretKey];
      else process.env[secretKey] = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
