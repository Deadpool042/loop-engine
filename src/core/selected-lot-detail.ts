import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const MAX_SELECTED_LOT_BYTES = 64 * 1024;
const MAX_SELECTED_LOT_SECTIONS = 24;
const MAX_SELECTED_LOT_SECTION_CHARS = 6000;

type SelectedCandidateReference = Readonly<{
  path: string;
  text: string;
}>;

export type SelectedLotDetailSection = Readonly<{
  title: string;
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
    if (sections.length >= MAX_SELECTED_LOT_SECTIONS) {
      sectionsTruncated = true;
      return;
    }
    const raw = currentLines.join("\n").trim();
    const bounded = boundedSectionContent(raw);
    sections.push(
      Object.freeze({
        title: currentTitle,
        content: bounded.value,
        truncated: bounded.truncated,
      }),
    );
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

/**
 * Resolves the Markdown document explicitly linked by the already-selected
 * roadmap candidate. The target is constrained to the project root and read
 * through fixed byte/section limits. No arbitrary caller path is accepted.
 */
export function resolveSelectedLotDetail(
  projectPath: string,
  candidate: SelectedCandidateReference | null,
): SelectedLotDetail | null {
  if (candidate === null) return null;
  const linkedPath = linkedMarkdownPath(candidate.text);
  if (linkedPath === null) return null;

  const projectRoot = resolve(projectPath);
  if (!existsSync(projectRoot)) return null;
  const realProjectRoot = realpathSync(projectRoot);
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
    truncated: bounded.truncated || parsed.sectionsTruncated || parsed.sections.some((section) => section.truncated),
  });
}
