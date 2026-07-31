export const ORCHESTRATION_SERVICE_STATES = [
  "starting",
  "ready",
  "draining",
  "stopped",
  "failed",
] as const;

export type OrchestrationServiceState =
  (typeof ORCHESTRATION_SERVICE_STATES)[number];

export type OrchestrationServiceDependencyStatus = Readonly<{
  persistence: boolean;
  worker: boolean;
}>;

export type OrchestrationServiceSnapshot = Readonly<{
  state: OrchestrationServiceState;
  healthy: boolean;
  ready: boolean;
  acceptingWork: boolean;
  activeRequests: number;
  dependencies: OrchestrationServiceDependencyStatus;
  failureCode: string | null;
}>;

export type OrchestrationServiceAdmission =
  | Readonly<{ admitted: true; release(): void }>
  | Readonly<{
      admitted: false;
      reason: "not_ready" | "draining" | "stopped" | "failed";
    }>;

export interface OrchestrationServiceLifecycle {
  snapshot(): OrchestrationServiceSnapshot;
  updateDependencies(status: OrchestrationServiceDependencyStatus): void;
  admit(): OrchestrationServiceAdmission;
  beginDrain(): void;
  stop(): void;
  fail(code: string): void;
}

function freezeSnapshot(
  state: OrchestrationServiceState,
  activeRequests: number,
  dependencies: OrchestrationServiceDependencyStatus,
  failureCode: string | null,
): OrchestrationServiceSnapshot {
  const healthy = state !== "failed" && state !== "stopped";
  const ready =
    state === "ready" && dependencies.persistence && dependencies.worker;
  return Object.freeze({
    state,
    healthy,
    ready,
    acceptingWork: ready,
    activeRequests,
    dependencies: Object.freeze({ ...dependencies }),
    failureCode,
  });
}

export function createOrchestrationServiceLifecycle(): OrchestrationServiceLifecycle {
  let state: OrchestrationServiceState = "starting";
  let activeRequests = 0;
  let dependencies: OrchestrationServiceDependencyStatus = Object.freeze({
    persistence: false,
    worker: false,
  });
  let failureCode: string | null = null;

  const refreshState = () => {
    if (state !== "starting" && state !== "ready") return;
    state = dependencies.persistence && dependencies.worker ? "ready" : "starting";
  };

  return Object.freeze({
    snapshot() {
      return freezeSnapshot(state, activeRequests, dependencies, failureCode);
    },
    updateDependencies(status: OrchestrationServiceDependencyStatus) {
      if (state === "draining" || state === "stopped" || state === "failed") {
        return;
      }
      dependencies = Object.freeze({ ...status });
      refreshState();
    },
    admit() {
      if (state === "draining") {
        return Object.freeze({ admitted: false as const, reason: "draining" as const });
      }
      if (state === "stopped") {
        return Object.freeze({ admitted: false as const, reason: "stopped" as const });
      }
      if (state === "failed") {
        return Object.freeze({ admitted: false as const, reason: "failed" as const });
      }
      if (state !== "ready" || !dependencies.persistence || !dependencies.worker) {
        return Object.freeze({ admitted: false as const, reason: "not_ready" as const });
      }

      activeRequests += 1;
      let released = false;
      return Object.freeze({
        admitted: true as const,
        release() {
          if (released) return;
          released = true;
          activeRequests = Math.max(0, activeRequests - 1);
          if (state === "draining" && activeRequests === 0) state = "stopped";
        },
      });
    },
    beginDrain() {
      if (state === "stopped" || state === "failed") return;
      state = activeRequests === 0 ? "stopped" : "draining";
    },
    stop() {
      state = "stopped";
    },
    fail(code: string) {
      state = "failed";
      failureCode = code.trim().length > 0 ? code.trim() : "service_failed";
    },
  });
}
