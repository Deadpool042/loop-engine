export type ProjectHealth = "good" | "warning" | "error";

export type ProjectSnapshot = Readonly<{
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;

  workspace: Readonly<{
    mode: "permanent" | "source_only" | "on_demand" | "none";
    dependencies: "none" | "on_demand" | "production";
    materialized: boolean;
    expectedAbsent: boolean;
    repository: string | null;
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

  planning: Readonly<{
    mode: "roadmap" | "maintenance" | "deferred" | "external" | null;
    roadmapConfigured: boolean;
    configuredPaths: readonly string[];
    discoveredPaths: readonly string[];
    voluntaryNoWork: boolean;
    recommendation:
      | "roadmap_configured"
      | "connect_discovered_roadmap"
      | "no_roadmap_present"
      | "maintenance_no_work"
      | "deferred_no_work"
      | "external_planning_source"
      | "no_admissible_candidate";
  }>;

  objective: Readonly<{
    source: string | null;
    available: boolean;
    eligibleForRoadmapProposal: boolean;
    reason?:
      | "planning_mode_maintenance"
      | "planning_mode_deferred"
      | "planning_mode_external"
      | "planning_mode_not_roadmap"
      | "objective_source_not_configured"
      | "objective_source_outside_project_root"
      | "objective_source_missing"
      | "objective_source_not_file"
      | "objective_source_unreadable"
      | "objective_source_too_large";
    content?: string;
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
