import type { RoadmapCandidate } from "../intelligence/roadmap.js";

export const AUTO_MICRO_LOT_MAX_PATHS = 2 as const;
export const AUTO_MICRO_LOT_MAX_DELIVERABLES = 1 as const;

export type AutoMicroLotChild = Readonly<{
  id: string;
  index: number;
  status: "selected" | "pending";
  objective: string;
  deliverables: readonly string[];
  outOfScope: readonly string[];
  allowedPaths: readonly string[];
}>;

export type AutoMicroLotDecomposition = Readonly<{
  schemaVersion: 1;
  strategy: "execution_decision_brief_v1";
  parentCandidate: Readonly<{
    id: string;
    path: string;
    line: number;
    text: string;
  }>;
  sourceDocument: string;
  selectedChildId: string;
  children: readonly AutoMicroLotChild[];
}>;

export type AutoMicroLotInput = Readonly<{
  candidate: RoadmapCandidate;
  sourceDocument?: string;
  allowedPaths?: readonly string[];
  brief?: Readonly<{
    objective: string;
    deliverables: readonly string[];
    outOfScope: readonly string[];
    forbiddenContentTerms?: readonly string[];
  }>;
}>;

export type AutoMicroLotResult = Readonly<{
  candidate: RoadmapCandidate;
  allowedPaths?: readonly string[];
  brief?: AutoMicroLotInput["brief"];
  decomposition?: AutoMicroLotDecomposition;
}>;

function isPlanningStateDeliverable(
  value: string,
  sourceDocument: string,
): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes(sourceDocument.toLowerCase()) ||
    /\b(roadmap|planning source|planning-source|candidate state)\b/.test(
      normalized,
    ) ||
    /\bmark\b.*\b(complete|done)\b/.test(normalized)
  );
}

function referencedPaths(
  deliverables: readonly string[],
  workPaths: readonly string[],
): string[] {
  const haystack = deliverables.join("\n").toLowerCase();
  return workPaths.filter((path) =>
    haystack.includes(path.toLowerCase()),
  );
}

function chunk<T>(
  values: readonly T[],
  size: number,
): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Narrows one manifestly oversized, governed AUTO candidate before provider
 * execution. It only uses the already authorized brief and writable scope;
 * no model, filesystem lookup or second orchestrator is involved.
 */
export function decomposeOversizedAutoCandidate(
  input: AutoMicroLotInput,
): AutoMicroLotResult {
  const parentId = input.candidate.id;
  const sourceDocument = input.sourceDocument;
  const allowedPaths = input.allowedPaths;
  const brief = input.brief;
  if (
    parentId === undefined ||
    sourceDocument === undefined ||
    allowedPaths === undefined ||
    brief === undefined ||
    !allowedPaths.includes(sourceDocument)
  ) {
    return input;
  }

  const workPaths = allowedPaths.filter((path) => path !== sourceDocument);
  const planningDeliverables = brief.deliverables.filter((deliverable) =>
    isPlanningStateDeliverable(deliverable, sourceDocument),
  );
  const workDeliverables = brief.deliverables.filter(
    (deliverable) => !isPlanningStateDeliverable(deliverable, sourceDocument),
  );
  const manifestlyOversized =
    workDeliverables.length > 2 ||
    workPaths.length > 3 ||
    (workPaths.some((path) => path.endsWith("/**")) &&
      workDeliverables.length > 1);
  if (
    !manifestlyOversized ||
    workDeliverables.length === 0 ||
    workPaths.length === 0
  ) {
    return input;
  }

  const deliverableChunks = chunk(
    workDeliverables,
    AUTO_MICRO_LOT_MAX_DELIVERABLES,
  );
  const pathChunks = chunk(workPaths, AUTO_MICRO_LOT_MAX_PATHS);
  const childCount = Math.max(deliverableChunks.length, pathChunks.length);
  const children: AutoMicroLotChild[] = [];
  const referencedByPlanning = referencedPaths(
    planningDeliverables,
    workPaths,
  );
  const claimedPaths = new Set<string>();

  for (let index = 0; index < childCount; index += 1) {
    const childDeliverables = deliverableChunks[index] ?? [];
    const affinityPaths = referencedPaths(childDeliverables, workPaths);
    if (index === 0) {
      for (const path of referencedByPlanning) affinityPaths.push(path);
    }

    const childPaths = [...new Set(affinityPaths)];
    for (const path of childPaths) claimedPaths.add(path);

    const fallbackChunk =
      pathChunks[index] ?? pathChunks[pathChunks.length - 1] ?? [];
    for (const path of fallbackChunk) {
      if (childPaths.length >= AUTO_MICRO_LOT_MAX_PATHS) break;
      if (claimedPaths.has(path)) continue;
      childPaths.push(path);
      claimedPaths.add(path);
    }

    if (childPaths.length === 0 && fallbackChunk.length > 0) {
      childPaths.push(fallbackChunk[fallbackChunk.length - 1]!);
    }

    const effectiveDeliverables =
      childDeliverables.length > 0
        ? childDeliverables
        : [
            `Complete the bounded parent objective within ${childPaths.join(", ")}.`,
          ];
    const id = `${parentId}.M${index + 1}`;
    children.push(
      Object.freeze({
        id,
        index: index + 1,
        status: index === 0 ? ("selected" as const) : ("pending" as const),
        objective: `${brief.objective} (${index + 1}/${childCount})`,
        deliverables: Object.freeze([...effectiveDeliverables]),
        outOfScope: Object.freeze([...brief.outOfScope]),
        allowedPaths: Object.freeze(
          [...new Set([...childPaths, sourceDocument])].sort(),
        ),
      }),
    );
  }

  const selected = children[0]!;
  const selectedCandidate = Object.freeze({
    ...input.candidate,
    id: selected.id,
    text: `- [ ] ${selected.id} — ${selected.deliverables[0]}`,
  });
  const decomposition = Object.freeze({
    schemaVersion: 1 as const,
    strategy: "execution_decision_brief_v1" as const,
    parentCandidate: Object.freeze({
      id: parentId,
      path: input.candidate.path,
      line: input.candidate.line,
      text: input.candidate.text,
    }),
    sourceDocument,
    selectedChildId: selected.id,
    children: Object.freeze(children),
  });

  return Object.freeze({
    candidate: selectedCandidate,
    allowedPaths: selected.allowedPaths,
    brief: Object.freeze({
      objective: selected.objective,
      deliverables: Object.freeze([
        ...selected.deliverables,
        ...planningDeliverables,
      ]),
      outOfScope: Object.freeze([...brief.outOfScope]),
      ...(brief.forbiddenContentTerms === undefined
        ? {}
        : {
            forbiddenContentTerms: Object.freeze([
              ...brief.forbiddenContentTerms,
            ]),
          }),
    }),
    decomposition,
  });
}

/** Public-safe, deterministic provider guidance that persists every pending
 * child in the canonical planning source for the next Cockpit continuation. */
export function buildAutoMicroLotPlanningInstructions(
  decomposition: AutoMicroLotDecomposition,
): readonly string[] {
  return Object.freeze([
    `AUTO micro-lot: ${decomposition.selectedChildId} from parent ${decomposition.parentCandidate.id}.`,
    `Canonical planning source: ${decomposition.sourceDocument}`,
    "Replace the parent monolithic entry with these ordered child entries:",
    ...decomposition.children.map(
      (child) =>
        `- [${child.status === "selected" ? "x" : " "}] ${child.id} — ${child.deliverables.join("; ")}`,
    ),
    "In the same planning source, persist this detail block for every child so a later Cockpit run can renew its governed decision without reconstructing the parent:",
    ...decomposition.children.flatMap((child) => [
      `### ${child.id} — ${child.objective}`,
      "#### Objectif",
      child.objective,
      "#### Périmètre d’écriture",
      ...child.allowedPaths.map((path) => `- \`${path}\``),
      "#### Livrables",
      ...child.deliverables.map((deliverable) => `- ${deliverable}`),
      "#### Hors périmètre",
      ...child.outOfScope.map((item) => `- ${item}`),
    ]),
    "Mark only the selected child complete and leave every pending child open. Do not keep an open parent entry.",
  ]);
}
