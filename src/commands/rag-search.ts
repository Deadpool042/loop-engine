import { existsSync, readFileSync } from "node:fs";

const INDEX_PATH = ".loop-engine/rag-index.json";

type RagDocument = Readonly<{
  id: string;
  path: string;
  title: string;
  sectionTitle?: string;
  headingLevel?: number;
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


function buildSnippet(content: string, query: string): string {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const matchIndex = normalizedContent.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return "";
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(content.length, matchIndex + query.length + 80);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < content.length ? " ..." : "";

  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

export function runRagSearch(
  query: string | undefined,
  options?: { json?: boolean; limit?: number },
): void {
  if (!query || query.trim().length === 0) {
    if (options?.json) {
      console.log(JSON.stringify({ schemaVersion: 1, query: query ?? "", results: [], error: "missing_query" }));
    } else {
      console.error("Usage: pnpm exec tsx src/cli.ts rag-search <query>");
    }
    process.exitCode = 1;
    return;
  }

  if (!existsSync(INDEX_PATH)) {
    if (options?.json) {
      console.log(JSON.stringify({ schemaVersion: 1, query, results: [], error: "missing_index" }));
    } else {
      console.error(`Missing ${INDEX_PATH}. Run pnpm run rag-index first.`);
    }
    process.exitCode = 1;
    return;
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as RagIndex;
  const normalizedQuery = query.trim();

  const limit = options?.limit && options.limit > 0 ? options.limit : 5;

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
    .slice(0, limit);

  if (options?.json) {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        query: normalizedQuery,
        results: results.map((result) => ({
          path: result.document.path,
          title: result.document.title,
          sectionTitle: result.document.sectionTitle ?? null,
          headingLevel: result.document.headingLevel ?? null,
          score: result.score,
          snippet: buildSnippet(result.document.content, normalizedQuery),
        })),
      }),
    );
    return;
  }

  if (results.length === 0) {
    console.log(`No result for "${normalizedQuery}".`);
    return;
  }

  console.log(`Results for "${normalizedQuery}":`);

  for (const result of results) {
    const sectionLabel = result.document.sectionTitle
      ? ` — ${result.document.sectionTitle}`
      : "";

    console.log(
      `- ${result.document.path} — ${result.document.title}${sectionLabel} — score ${result.score}`,
    );
    const snippet = buildSnippet(result.document.content, normalizedQuery);
    if (snippet) {
      console.log(`  ${snippet}`);
    }
  }
}
