import type { LoopRunStatus } from "./types.js";

// ready -> completed is specific to mode "plan": no execution phase ever runs,
// so a plan cycle completes directly from "ready" instead of going through
// executing/validating. It is a first-class transition, not a runner bypass.
const TRANSITIONS: Readonly<Record<LoopRunStatus, readonly LoopRunStatus[]>> = {
  idle: ["planning"],
  planning: ["ready", "blocked", "failed"],
  ready: ["executing", "completed", "cancelled"],
  executing: ["validating", "failed", "cancelled"],
  validating: ["completed", "repairing", "failed"],
  repairing: ["executing", "validating", "failed"],
  completed: ["idle"],
  blocked: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: LoopRunStatus, to: LoopRunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
