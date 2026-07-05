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
  const firstHeading = content.split("\n").find((line) => line.startsWith("# "));

  return firstHeading?.replace(/^#\s+/, "").trim() || fallback;
}

function buildDocument(path: string): RagDocument {
  const content = readFileSync(path, "utf8");

  return {
    id: hashContent(path).slice(0, 12),
    path,
    title: titleFromContent(content, path),
    content,
    contentHash: hashContent(content),
  };
}

export function runRagIndex(): void {
  const files = SOURCE_PATHS.flatMap((sourcePath) => collectMarkdownFiles(sourcePath));
  const documents = files.map((file) => buildDocument(file));

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
