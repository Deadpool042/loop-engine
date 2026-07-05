import { existsSync, readFileSync } from "node:fs";

const INDEX_PATH = ".loop-engine/rag-index.json";

type RagDocument = Readonly<{
  id: string;
  path: string;
  title: string;
  content: string;
  contentHash: string;
}>;

type RagIndex = Readonly<{
  schemaVersion: number;
  documents: readonly RagDocument[];
}>;

function countOccurrences(content: string, query: string): number {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedQuery.length === 0) {
    return 0;
  }

  return normalizedContent.split(normalizedQuery).length - 1;
}

export function runRagSearch(query: string | undefined): void {
  if (!query || query.trim().length === 0) {
    console.error("Usage: pnpm exec tsx src/cli.ts rag-search <query>");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(INDEX_PATH)) {
    console.error(`Missing ${INDEX_PATH}. Run pnpm run rag-index first.`);
    process.exitCode = 1;
    return;
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as RagIndex;
  const normalizedQuery = query.trim();

  const results = index.documents
    .map((document) => ({
      document,
      score:
        countOccurrences(document.title, normalizedQuery) * 3 +
        countOccurrences(document.path, normalizedQuery) * 2 +
        countOccurrences(document.content, normalizedQuery),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.document.path.localeCompare(right.document.path);
    })
    .slice(0, 5);

  if (results.length === 0) {
    console.log(`No result for "${normalizedQuery}".`);
    return;
  }

  console.log(`Results for "${normalizedQuery}":`);

  for (const result of results) {
    console.log(`- ${result.document.path} — ${result.document.title} — score ${result.score}`);
  }
}
