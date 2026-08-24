import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CONFIRM_ATTEMPTS = 20;
const CONFIRM_DELAY_MS = 25;

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function listProcessGroupMembers(
  processGroupId: number,
): Promise<readonly number[] | null> {
  if (
    process.platform === "win32" ||
    !Number.isSafeInteger(processGroupId) ||
    processGroupId <= 0
  ) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,pgid="], {
      encoding: "utf8",
    });
    const members: number[] = [];
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const pgid = Number(match[2]);
      if (pgid === processGroupId && Number.isSafeInteger(pid) && pid > 0) {
        members.push(pid);
      }
    }
    return Object.freeze(members.sort((left, right) => left - right));
  } catch {
    return null;
  }
}

export function signalProcessGroup(
  processGroupId: number,
  signal: NodeJS.Signals,
): boolean {
  if (
    process.platform === "win32" ||
    !Number.isSafeInteger(processGroupId) ||
    processGroupId <= 0
  ) {
    return false;
  }

  try {
    process.kill(-processGroupId, signal);
    return true;
  } catch (error) {
    return isMissingProcess(error);
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    return isMissingProcess(error);
  }
}

export async function terminateRemainingProcessGroupMembers(
  processGroupId: number,
  excludedPid: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    const members = await listProcessGroupMembers(processGroupId);
    if (members === null) return false;

    const remaining = members.filter((pid) => pid !== excludedPid);
    if (remaining.length === 0) return true;

    if (!remaining.every((pid) => signalProcess(pid, "SIGKILL"))) {
      return false;
    }
    await sleep(CONFIRM_DELAY_MS);
  }

  const members = await listProcessGroupMembers(processGroupId);
  return members !== null && members.every((pid) => pid === excludedPid);
}
