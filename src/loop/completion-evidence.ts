import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { RoadmapCandidate } from "../intelligence/roadmap.js";

export type CompletionEvidenceInspection =
  | Readonly<{ status: "none" }>
  | Readonly<{
      status: "satisfied";
      kind: "checklist";
      detailPath: string;
      evidencePath: string;
      unresolvedCount: 0;
    }>
  | Readonly<{
      status: "required";
      kind: "checklist";
      detailPath: string | null;
      evidencePath: string | null;
      unresolvedCount: number | null;
      reason:
        | "detail_outside_project"
        | "detail_missing"
        | "marker_malformed"
        | "evidence_outside_project"
        | "evidence_missing"
        | "unresolved_checklist";
    }>;

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function linkedMarkdownDetail(candidate: RoadmapCandidate): string | null {
  const matches = [...candidate.text.matchAll(/\]\(([^)]+\.md)\)/g)];
  for (const match of matches) {
    const target = match[1]?.trim();
    if (!target || /^https?:\/\//i.test(target) || target.startsWith("#")) continue;
    return target;
  }
  return null;
}

function markerAttributes(detail: string): Readonly<Record<string, string>> | null {
  const marker = detail.match(
    /<!--\s*loop-engine:completion-evidence\s+([^>]+?)\s*-->/,
  );
  if (!marker?.[1]) return null;

  const attrs: Record<string, string> = {};
  for (const match of marker[1].matchAll(/([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key && value) attrs[key] = value;
  }
  return Object.freeze(attrs);
}

function unresolvedChecklistCount(content: string): number {
  return content
    .split("\n")
    .filter(
      (line) =>
        /^\s*-\s*\[\s\]\s+/.test(line) ||
        line.includes("☐") ||
        /\bÀ renseigner\b/i.test(line),
    ).length;
}

export function inspectCompletionEvidenceGate(
  projectPath: string,
  candidate: RoadmapCandidate,
): CompletionEvidenceInspection {
  const root = resolve(projectPath);
  const linked = linkedMarkdownDetail(candidate);
  if (linked === null) return Object.freeze({ status: "none" as const });

  const detailAbsolute = resolve(root, dirname(candidate.path), linked);
  if (!isInside(root, detailAbsolute)) {
    return Object.freeze({
      status: "required" as const,
      kind: "checklist" as const,
      detailPath: null,
      evidencePath: null,
      unresolvedCount: null,
      reason: "detail_outside_project" as const,
    });
  }

  const detailPath = relative(root, detailAbsolute).replaceAll("\\", "/");
  if (!existsSync(detailAbsolute)) return Object.freeze({ status: "none" as const });

  const detail = readFileSync(detailAbsolute, "utf8");
  if (!detail.includes("loop-engine:completion-evidence")) {
    return Object.freeze({ status: "none" as const });
  }

  const attrs = markerAttributes(detail);
  if (attrs?.kind !== "checklist" || typeof attrs.path !== "string") {
    return Object.freeze({
      status: "required" as const,
      kind: "checklist" as const,
      detailPath,
      evidencePath: null,
      unresolvedCount: null,
      reason: "marker_malformed" as const,
    });
  }

  const evidenceAbsolute = resolve(dirname(detailAbsolute), attrs.path);
  if (!isInside(root, evidenceAbsolute)) {
    return Object.freeze({
      status: "required" as const,
      kind: "checklist" as const,
      detailPath,
      evidencePath: null,
      unresolvedCount: null,
      reason: "evidence_outside_project" as const,
    });
  }

  const evidencePath = relative(root, evidenceAbsolute).replaceAll("\\", "/");
  if (!existsSync(evidenceAbsolute)) {
    return Object.freeze({
      status: "required" as const,
      kind: "checklist" as const,
      detailPath,
      evidencePath,
      unresolvedCount: null,
      reason: "evidence_missing" as const,
    });
  }

  const unresolvedCount = unresolvedChecklistCount(
    readFileSync(evidenceAbsolute, "utf8"),
  );
  if (unresolvedCount > 0) {
    return Object.freeze({
      status: "required" as const,
      kind: "checklist" as const,
      detailPath,
      evidencePath,
      unresolvedCount,
      reason: "unresolved_checklist" as const,
    });
  }

  return Object.freeze({
    status: "satisfied" as const,
    kind: "checklist" as const,
    detailPath,
    evidencePath,
    unresolvedCount: 0 as const,
  });
}
