import type { ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";

export type LoopPlan =
  | Readonly<{
      outcome: "ready";
      candidate: RoadmapCandidate;
      plannedSteps: readonly string[];
    }>
  | Readonly<{
      outcome: "blocked";
      candidate: RoadmapCandidate | null;
      reason: string;
    }>;

const PLANNED_STEPS_AFTER_CANDIDATE = [
  "Prepare short project context (context)",
  "Prepare delegation prompt (prompt)",
  "Await agent execution (mode execute, not implemented in this lot)",
  "Run local validation and audit before commit (validate, audit)",
  "Commit only in mode commit",
  "Publish only in mode publish",
] as const;

export function planLoopCycle(project: ProjectConfig): LoopPlan {
  const snapshot = buildProjectSnapshot(project);
  const candidate = snapshot.roadmap.selectedCandidate;

  if (!candidate) {
    return {
      outcome: "blocked",
      candidate: null,
      reason: "No roadmap candidate available.",
    };
  }

  if (candidate.kind === "blocked") {
    return {
      outcome: "blocked",
      candidate,
      reason:
        "Only a blocked roadmap candidate is available; choose a smaller safe prerequisite first.",
    };
  }

  return {
    outcome: "ready",
    candidate,
    plannedSteps: [`Select roadmap candidate: ${candidate.text}`, ...PLANNED_STEPS_AFTER_CANDIDATE],
  };
}
