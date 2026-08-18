import { spawn } from "node:child_process";

function parsePorcelainFiles(output: string): readonly string[] {
  const entries = output.split("\0");
  const files = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path.length > 0) files.add(path);
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return Object.freeze([...files].sort());
}

/**
 * Reads the worktree's authoritative modified-file inventory. The command is
 * local, NUL-delimited and has no provider or network dependency.
 */
export function readModifiedWorktreeFiles(
  cwd: string,
): Promise<readonly string[] | null> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", ["status", "--porcelain=v1", "-z"], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let observedBytes = 0;
    let settled = false;
    const settle = (files: readonly string[] | null): void => {
      if (settled) return;
      settled = true;
      resolvePromise(files);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(null);
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      observedBytes += chunk.byteLength;
      if (observedBytes > 1_000_000) {
        child.kill("SIGTERM");
        clearTimeout(timer);
        settle(null);
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.once("error", () => {
      clearTimeout(timer);
      settle(null);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      settle(code === 0 ? parsePorcelainFiles(stdout) : null);
    });
  });
}
