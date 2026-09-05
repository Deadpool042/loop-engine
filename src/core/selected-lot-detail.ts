import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const MAX_SELECTED_LOT_BYTES = 64 * 1024;
const MAX_SELECTED_LOT_SECTIONS = 24;
const MAX_SELECTED_LOT_SECTION_CHARS = 6000;
const MAX_CANDIDATE_DETAIL_FILES = 48;

type SelectedCandidateReference = Readonly<{
  id?: string;
  path: string;
  text: string;
}>;

export type SelectedLotDetailSectionKind =
  | "status"
  | "objective"
  | "context"
  | "scope"
  | "out_of_scope"
  | "acceptance"
  | "dependencies"
  | "evidence"
  | "next_check"
  | "future"
  | "other";

export type SelectedLotDetailSection = Readonly<{
  title: string;
  kind: SelectedLotDetailSectionKind;
  content: string;
  truncated: boolean;
}>;

export type SelectedLotDetail = Readonly<{
  path: string;
  title: string;
  sections: readonly SelectedLotDetailSection[];
  truncated: boolean;
}>;

function linkedMarkdownPath(text: string): string | null {
  const matches = text.matchAll(/\]\(([^)]+\.md)\)/g);
  for (const match of matches) {
    const target = match[1]?.trim();
    if (target) return target;
  }
  return null;
}

function isInsideProject(projectRoot: string, targetPath: string): boolean {
  return targetPath === projectRoot || targetPath.startsWith(`${projectRoot}${sep}`);
}

function readBoundedUtf8(path: string): Readonly<{ content: string; truncated: boolean }> {
  const size = statSync(path).size;
  const bytesToRead = Math.min(size, MAX_SELECTED_LOT_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = openSync(path, "r");
  let offset = 0;
  try {
    while (offset < bytesToRead) {
      const bytesRead = readSync(fd, buffer, offset, bytesToRead - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
  } finally {
    closeSync(fd);
  }
  return Object.freeze({
    content: buffer.toString("utf8", 0, offset),
    truncated: size > MAX_SELECTED_LOT_BYTES,
  });
}

function boundedSectionContent(content: string): Readonly<{ value: string; truncated: boolean }> {
  if (content.length <= MAX_SELECTED_LOT_SECTION_CHARS) {
    return Object.freeze({ value: content, truncated: false });
  }
  return Object.freeze({
    value: content.slice(0, MAX_SELECTED_LOT_SECTION_CHARS).trimEnd(),
    truncated: true,
  });
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function classifySectionKind(title: string): SelectedLotDetailSectionKind {
  const normalized = normalizeTitle(title);
  if (/\b(etat|statut)\b/.test(normalized)) return "status";
  if (/\bobjectif\b/.test(normalized)) return "objective";
  if (/\b(contexte|justification|raison|valeur)\b/.test(normalized)) return "context";
  if (/\bhors perimetre\b/.test(normalized)) return "out_of_scope";
  if (/\bperimetre\b/.test(normalized)) return "scope";
  if (/\b(critere|acceptation|cloture|fin)\b/.test(normalized)) return "acceptance";
  if (/\b(dependance|gate|blocage|condition)\b/.test(normalized)) return "dependencies";
  if (/\b(preuve|evidence|validation)\b/.test(normalized)) return "evidence";
  if (/\b(reste|prochain|prochaine|test|verification)\b/.test(normalized)) return "next_check";
  if (/\b(ameliorations?|evolutions?|futurs?|futures?)\b/.test(normalized)) return "future";
  return "other";
}

function pushSection(
  sections: SelectedLotDetailSection[],
  title: string,
  rawContent: string,
): boolean {
  if (sections.length >= MAX_SELECTED_LOT_SECTIONS) return false;
  const bounded = boundedSectionContent(rawContent.trim());
  sections.push(
    Object.freeze({
      title,
      kind: classifySectionKind(title),
      content: bounded.value,
      truncated: bounded.truncated,
    }),
  );
  return true;
}

function parseSelectedLotMarkdown(content: string) {
  const lines = content.split("\n");
  const title =
    lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() ??
    "Lot sélectionné";
  const sections: SelectedLotDetailSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let sectionsTruncated = false;

  const flush = () => {
    if (currentTitle === null) return;
    if (!pushSection(sections, currentTitle, currentLines.join("\n"))) {
      sectionsTruncated = true;
    }
  };

  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      currentTitle = heading[1]?.trim() ?? "Section";
      currentLines = [];
      continue;
    }
    if (currentTitle !== null) currentLines.push(line);
  }
  flush();

  return Object.freeze({
    title,
    sections: Object.freeze(sections),
    sectionsTruncated,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCandidateHeadingMarkdown(
  content: string,
  candidateId: string,
): Readonly<{
  title: string;
  sections: readonly SelectedLotDetailSection[];
  sectionsTruncated: boolean;
}> | null {
  const lines = content.split("\n");
  const idPattern = new RegExp(
    `^${escapeRegExp(candidateId)}(?:\\s|[—–:-]|$)`,
    "i",
  );

  let startIndex = -1;
  let rootLevel = 0;
  let title = candidateId;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (!match) continue;
    const headingTitle = match[2]?.trim() ?? "";
    if (!idPattern.test(headingTitle)) continue;
    startIndex = index;
    rootLevel = match[1]?.length ?? 1;
    title = headingTitle;
    break;
  }

  if (startIndex < 0) return null;

  const sections: SelectedLotDetailSection[] = [];
  let currentTitle = "Résumé";
  let currentLines: string[] = [];
  let sectionsTruncated = false;

  const flush = () => {
    const raw = currentLines.join("\n").trim();
    if (raw.length === 0) return;
    if (!pushSection(sections, currentTitle, raw)) sectionsTruncated = true;
  };

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      if (level <= rootLevel) break;
      if (level === rootLevel + 1) {
        flush();
        currentTitle = heading[2]?.trim() ?? "Section";
        currentLines = [];
        continue;
      }
    }
    currentLines.push(line);
  }
  flush();

  return Object.freeze({
    title,
    sections: Object.freeze(sections),
    sectionsTruncated,
  });
}

function safeRealProjectRoot(projectPath: string): string | null {
  const projectRoot = resolve(projectPath);
  if (!existsSync(projectRoot)) return null;
  return realpathSync(projectRoot);
}

function resolveExplicitLinkedDetail(
  projectRoot: string,
  realProjectRoot: string,
  candidate: SelectedCandidateReference,
): SelectedLotDetail | null {
  const linkedPath = linkedMarkdownPath(candidate.text);
  if (linkedPath === null) return null;

  const candidateSource = resolve(projectRoot, candidate.path);
  if (!isInsideProject(projectRoot, candidateSource)) return null;

  const targetPath = resolve(dirname(candidateSource), linkedPath);
  if (!isInsideProject(projectRoot, targetPath) || !existsSync(targetPath)) return null;
  const realTargetPath = realpathSync(targetPath);
  if (!isInsideProject(realProjectRoot, realTargetPath)) return null;
  const stat = statSync(realTargetPath);
  if (!stat.isFile()) return null;

  const bounded = readBoundedUtf8(realTargetPath);
  const parsed = parseSelectedLotMarkdown(bounded.content);
  return Object.freeze({
    path: relative(projectRoot, targetPath).split(sep).join("/"),
    title: parsed.title,
    sections: parsed.sections,
    truncated:
      bounded.truncated ||
      parsed.sectionsTruncated ||
      parsed.sections.some((section) => section.truncated),
  });
}

function resolveHeadingDetail(
  projectRoot: string,
  realProjectRoot: string,
  candidate: SelectedCandidateReference,
): SelectedLotDetail | null {
  if (!candidate.id) return null;

  const candidateSource = resolve(projectRoot, candidate.path);
  if (!isInsideProject(projectRoot, candidateSource) || !existsSync(candidateSource)) {
    return null;
  }

  const sourceDirectory = dirname(candidateSource);
  if (!isInsideProject(projectRoot, sourceDirectory) || !existsSync(sourceDirectory)) {
    return null;
  }

  const entries = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_CANDIDATE_DETAIL_FILES);

  for (const entry of entries) {
    const targetPath = resolve(sourceDirectory, entry.name);
    if (!isInsideProject(projectRoot, targetPath)) continue;
    const realTargetPath = realpathSync(targetPath);
    if (!isInsideProject(realProjectRoot, realTargetPath)) continue;

    const bounded = readBoundedUtf8(realTargetPath);
    const extracted = extractCandidateHeadingMarkdown(
      bounded.content,
      candidate.id,
    );
    if (!extracted) continue;

    return Object.freeze({
      path: relative(projectRoot, targetPath).split(sep).join("/"),
      title: extracted.title,
      sections: extracted.sections,
      truncated:
        bounded.truncated ||
        extracted.sectionsTruncated ||
        extracted.sections.some((section) => section.truncated),
    });
  }

  return null;
}

/**
 * Resolves a bounded Markdown detail for one canonical roadmap candidate.
 * Resolution order is deterministic:
 * 1. explicit Markdown link carried by the candidate;
 * 2. a same-directory Markdown document containing a heading for candidate.id.
 *
 * The caller never supplies a path. All resolved files must remain inside the
 * configured project root and are read through strict byte/section limits.
 */
export function resolveRoadmapCandidateDetail(
  projectPath: string,
  candidate: SelectedCandidateReference | null,
): SelectedLotDetail | null {
  if (candidate === null) return null;
  const projectRoot = resolve(projectPath);
  const realProjectRoot = safeRealProjectRoot(projectPath);
  if (realProjectRoot === null) return null;

  return (
    resolveExplicitLinkedDetail(projectRoot, realProjectRoot, candidate) ??
    resolveHeadingDetail(projectRoot, realProjectRoot, candidate)
  );
}

/**
 * Backward-compatible selected-candidate projection used by roadmap overview.
 */
export function resolveSelectedLotDetail(
  projectPath: string,
  candidate: SelectedCandidateReference | null,
): SelectedLotDetail | null {
  return resolveRoadmapCandidateDetail(projectPath, candidate);
}
