import type { ContextDetail } from "./context-contract.js";

export type PlanningDisplay = Readonly<{
  heading: string;
  description: string;
  modeLabel?: string;
  roadmapDetail?: string;
  blockedGates: readonly string[];
  showRoadmapProposalAction: boolean;
  showGateReassessmentAction: boolean;
}>;

function formatPlanningMode(
  mode: "roadmap" | "maintenance" | "deferred" | "external" | null | undefined,
): string | undefined {
  switch (mode) {
    case "roadmap":
      return "Roadmap";
    case "maintenance":
      return "Maintenance";
    case "deferred":
      return "Différé";
    case "external":
      return "Externe";
    default:
      return undefined;
  }
}

export function formatGitStatus(statusText: string): "Propre" | "Non suivi uniquement" | "Modifié" {
  const lines = statusText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "Propre";
  return lines.every((line) => line.startsWith("?? "))
    ? "Non suivi uniquement"
    : "Modifié";
}

export function getPlanningDisplay(detail: ContextDetail): PlanningDisplay {
  const modeLabel = formatPlanningMode(detail.planning?.mode);
  const base = modeLabel === undefined ? {} : { modeLabel };

  if (detail.roadmap.selectedCandidate !== null) {
    return Object.freeze({
      ...base,
      heading: "Travail recommandé",
      description: "",
      blockedGates: Object.freeze([]),
      showRoadmapProposalAction: false,
      showGateReassessmentAction: false,
    });
  }

  if (detail.planning?.recommendation === "maintenance_no_work") {
    return Object.freeze({
      ...base,
      heading: "Projet en maintenance",
      description: "Aucun travail planifié actuellement.",
      roadmapDetail: "Aucune roadmap requise.",
      blockedGates: Object.freeze([]),
      showRoadmapProposalAction: false,
      showGateReassessmentAction: false,
    });
  }

  if (detail.planning?.recommendation === "deferred_no_work") {
    return Object.freeze({
      ...base,
      heading: "Roadmap différée",
      description: "Ce projet a explicitement différé son travail de roadmap.",
      roadmapDetail: "Aucune roadmap requise pour le moment.",
      blockedGates: Object.freeze([]),
      showRoadmapProposalAction: false,
      showGateReassessmentAction: false,
    });
  }

  if (detail.planning?.recommendation === "external_planning_source") {
    return Object.freeze({
      ...base,
      heading: "Planning externe",
      description:
        "Ce projet est piloté par une source de planning externe à Loop Engine.",
      roadmapDetail: "Aucun travail n’est recommandé depuis ce cockpit.",
      blockedGates: Object.freeze([]),
      showRoadmapProposalAction: false,
      showGateReassessmentAction: false,
    });
  }

  const blockedGates = detail.roadmap.phaseGates
    .filter((gate) => gate.state === "closed")
    .map((gate) =>
      gate.blockedBy
        ? `${gate.phaseId} · ${gate.blockedBy}`
        : gate.phaseId,
    );
  if ((detail.roadmap.stats?.todo ?? 0) > 0 && blockedGates.length > 0) {
    return Object.freeze({
      ...base,
      heading: "Aucun travail admissible",
      description: "Les prochaines phases sont actuellement bloquées.",
      blockedGates: Object.freeze(blockedGates),
      showRoadmapProposalAction: false,
      showGateReassessmentAction: true,
    });
  }

  if (
    detail.planning?.mode === "roadmap" &&
    detail.planning?.recommendation === "no_admissible_candidate" &&
    detail.roadmap.stats?.todo === 0
  ) {
    return Object.freeze({
      ...base,
      heading: "Roadmap terminée",
      description: "Aucun travail restant.",
      blockedGates: Object.freeze([]),
      showRoadmapProposalAction: true,
      showGateReassessmentAction: false,
    });
  }

  return Object.freeze({
    ...base,
    heading: "Aucun travail à lancer",
    description: "La roadmap est à jour et aucun candidat n’est admissible.",
    blockedGates: Object.freeze([]),
    showRoadmapProposalAction: false,
    showGateReassessmentAction: false,
  });
}
