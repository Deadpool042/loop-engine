import type { ContextDetail } from "./context-contract.js";

type Candidate = NonNullable<ContextDetail["roadmap"]["selectedCandidate"]>;

const statusLabels: Readonly<Record<string, string>> = Object.freeze({
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
  unknown: "État inconnu",
});

export function formatCandidateTitle(candidate: Candidate): string {
  const text = candidate.text.trim();
  if (!text.startsWith("|") || !text.endsWith("|")) return text;

  const cells = text
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());

  if (cells.length < 2) return text;
  if (candidate.id && cells[0] !== candidate.id) return text;

  return cells[1] || text;
}

export function formatCandidateState(candidate: Candidate): string {
  const admissibility =
    candidate.admissibility?.state === "admissible"
      ? "Admissible"
      : candidate.admissibility?.state === "not_admissible"
        ? "Non admissible"
        : candidate.kind === "safe"
          ? "Admissible"
          : candidate.kind === "warning"
            ? "À vérifier"
            : "Bloqué";

  const status = statusLabels[candidate.status] ?? candidate.status;
  return `${admissibility} · ${status}`;
}
