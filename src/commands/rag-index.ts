import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const SOURCE_PATHS = [
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "docs/architecture",
  "docs/audits",
  "docs/roadmap",
  "docs/integrations",
  "docs/releases",
] as const;

const OUTPUT_PATH = ".loop-engine/rag-index.json";

type RagDocument = Readonly<{
  id: string;
  path: string;
  title: string;
  sectionTitle: string;
  headingLevel: number;
  content: string;
  contentHash: string;
}>;

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function collectMarkdownFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stat = statSync(path);

  if (stat.isFile()) {
    return path.endsWith(".md") ? [path] : [];
  }

  return readdirSync(path)
    .flatMap((entry) => collectMarkdownFiles(join(path, entry)))
    .sort();
}

function titleFromContent(content: string, fallback: string): string {
  const firstHeading = content
    .split("\n")
    .find((line) => line.startsWith("# "));

  return firstHeading?.replace(/^#\s+/, "").trim() || fallback;
}

function splitMarkdownSections(content: string): readonly {
  sectionTitle: string;
  headingLevel: number;
  content: string;
}[] {
  const lines = content.split("\n");
  const sections: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  }[] = [];

  let currentSection: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  } | null = null;

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);

    if (heading) {
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        sectionTitle: heading[2]?.trim() || "Untitled section",
        headingLevel: heading[1]?.length || 1,
        content: [line],
      };
      continue;
    }

    if (!currentSection) {
      currentSection = {
        sectionTitle: "Document",
        headingLevel: 0,
        content: [],
      };
    }

    currentSection.content.push(line);
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections.map((section) => ({
    sectionTitle: section.sectionTitle,
    headingLevel: section.headingLevel,
    content: section.content.join("\n").trim(),
  }));
}

function buildDocuments(path: string): readonly RagDocument[] {
  const content = readFileSync(path, "utf8");
  const title = titleFromContent(content, path);

  return splitMarkdownSections(content)
    .filter((section) => section.content.length > 0)
    .map((section, index) => ({
      id: hashContent(`${path}:${index}:${section.sectionTitle}`).slice(0, 12),
      path,
      title,
      sectionTitle: section.sectionTitle,
      headingLevel: section.headingLevel,
      content: section.content,
      contentHash: hashContent(section.content),
    }));
}

export function runRagIndex(): void {
  const files = SOURCE_PATHS.flatMap((sourcePath) =>
    collectMarkdownFiles(sourcePath),
  );
  const documents = files.flatMap((file) => buildDocuments(file));

  mkdirSync(".loop-engine", { recursive: true });

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: SOURCE_PATHS,
      documents,
    }) + "\n",
  );

  console.log(`Indexed ${documents.length} document(s) into ${OUTPUT_PATH}`);
}
