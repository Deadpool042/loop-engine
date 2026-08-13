export type ProjectHealth = "good" | "warning" | "error";

export type ProjectSnapshot = Readonly<{
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;

  git: Readonly<{
    branch: string;
    clean: boolean;
    requiresGit: boolean;
    statusText: string;
    lastCommit: Readonly<{
      hash: string;
      message: string;
    }> | null;
  }>;

  docs: Readonly<{
    required: readonly string[];
    missing: readonly string[];
  }>;

  validation: Readonly<{
    commands: readonly string[];
    configured: boolean;
  }>;

  roadmap: Readonly<{
    available: boolean;
    paths: readonly string[];
    candidates: readonly Readonly<{
      id?: string;
      phaseId?: string;
      path: string;
      line: number;
      text: string;
      kind: "safe" | "warning" | "blocked";
      reason: string;
      status: "todo" | "in_progress" | "done" | "unknown";
      priority: "p1" | "p2" | "p3" | "default";
      admissibility?: Readonly<{
        state: "admissible" | "not_admissible";
        reason: "no_phase_gate" | "phase_open" | "phase_closed" | "phase_gate_invalid";
        blockedBy?: string;
      }>;
    }>[];
    phaseGates: readonly Readonly<{
      path: string;
      line: number;
      phaseId: string;
      state: "open" | "closed";
      blockedBy?: string;
    }>[];
    selectedCandidate: Readonly<{
      id?: string;
      phaseId?: string;
      path: string;
      line: number;
      text: string;
      kind: "safe" | "warning" | "blocked";
      reason: string;
      status: "todo" | "in_progress" | "done" | "unknown";
      priority: "p1" | "p2" | "p3" | "default";
      admissibility?: Readonly<{
        state: "admissible" | "not_admissible";
        reason:
          | "no_phase_gate"
          | "phase_open"
          | "phase_closed"
          | "phase_gate_invalid";
        blockedBy?: string;
      }>;
    }> | null;
    stats: Readonly<{
      total: number;
      todo: number;
      inProgress: number;
      done: number;
      unknown: number;
      safe: number;
      warning: number;
      blocked: number;
    }>;
    summary: Readonly<{
      active: number;
      done: number;
      selectable: number;
      hasBlocked: boolean;
    }>;
  }>;

  health: ProjectHealth;
}>;
