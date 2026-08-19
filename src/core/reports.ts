import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { Config, ProjectConfig } from "./config.js";
import { docExists } from "./docs.js";
import { isGitRepository } from "./git.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { generateRoadmapProposalFromContext } from "../intelligence/roadmap-proposal.js";
import type { TextOnlyProvider } from "../text-only-provider/index.js";
import {
  boundProposalContextString,
  buildRoadmapProposalContext,
  MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
  MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
  projectRoadmapProposalCandidate,
  projectRoadmapProposalStringCollection,
} from "../intelligence/proposal-context.js";
import {
  changedPathsFromGitDiff,
  createDocumentationImpactReport,
  mergeChangedPaths,
  untrackedPathsFromGitStatus,
} from "../documentation/index.js";

export function generateProjectReport(project: ProjectConfig) {
  return buildProjectSnapshot(project);
}

export function generateWorkspaceReports(config: Config) {
  return config.projects.map((project) => generateProjectReport(project));
}

export function generateWorkspaceSummaryReport(config: Config) {
  return {
    schemaVersion: 1 as const,
    projects: generateWorkspaceReports(config).map((snapshot) => ({
      ...snapshot,
      roadmap: {
        available: snapshot.roadmap.available,
        paths: snapshot.roadmap.paths,
        selectedCandidate: snapshot.roadmap.selectedCandidate,
        phaseGates: snapshot.roadmap.phaseGates,
        stats: snapshot.roadmap.stats,
      },
    })),
  };
}

export function generateRoadmapPlanningStatusReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: {
      name: snapshot.project.name,
    },
    planning: snapshot.planning,
  };
}

export function generateProjectObjectiveReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: {
      name: snapshot.project.name,
    },
    planning: {
      mode: snapshot.planning.mode,
    },
    objective: snapshot.objective,
  };
}

export function generateRoadmapProposalContextReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  const projectName = boundProposalContextString(snapshot.project.name);
  const projectType = boundProposalContextString(snapshot.project.type);
  const objectiveSource =
    snapshot.objective.source === null
      ? null
      : boundProposalContextString(snapshot.objective.source);
  const report = {
    schemaVersion: 1 as const,
    project: {
      name: projectName.value,
      nameTruncated: projectName.truncated,
      type: projectType.value,
      typeTruncated: projectType.truncated,
    },
    planning: {
      mode: snapshot.planning.mode,
    },
    objective: {
      ...snapshot.objective,
      source: objectiveSource?.value ?? null,
      ...(objectiveSource === null
        ? {}
        : { sourceTruncated: objectiveSource.truncated }),
    },
  };

  if (!snapshot.objective.eligibleForRoadmapProposal) {
    return Object.freeze({
      ...report,
      context: null,
    });
  }

  const proposalContext = buildRoadmapProposalContext(snapshot);
  const configuredPaths = projectRoadmapProposalStringCollection(
    snapshot.roadmap.paths,
    MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
  );
  const validationCommands = projectRoadmapProposalStringCollection(
    snapshot.validation.commands,
    MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
  );
  const gitBranch = boundProposalContextString(snapshot.git.branch);

  return Object.freeze({
    ...report,
    roadmap: {
      configuredPaths: configuredPaths.items,
      configuredPathsTotal: configuredPaths.total,
      configuredPathsTruncated: configuredPaths.truncated,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
      selectedCandidate:
        snapshot.roadmap.selectedCandidate === null
          ? null
          : projectRoadmapProposalCandidate(snapshot.roadmap.selectedCandidate),
      candidates: proposalContext.candidates,
      phaseGates: proposalContext.phaseGates,
    },
    projectState: {
      git: {
        branch: gitBranch.value,
        branchTruncated: gitBranch.truncated,
        clean: snapshot.git.clean,
        requiresGit: snapshot.git.requiresGit,
      },
      validation: {
        commands: validationCommands.items,
        commandsTotal: validationCommands.total,
        commandsTruncated: validationCommands.truncated,
        configured: snapshot.validation.configured,
      },
      health: snapshot.health,
    },
    context: "available" as const,
  });
}

export type RoadmapProposalContextReport = ReturnType<
  typeof generateRoadmapProposalContextReport
>;

export async function generateRoadmapProposalReport(
  project: ProjectConfig,
  input: Readonly<{
    provider: TextOnlyProvider;
    providerAvailable: boolean;
    model: string;
    timeoutMs: number;
  }>,
) {
  const context = generateRoadmapProposalContextReport(project);
  return generateRoadmapProposalFromContext(context, input);
}

export function generateProjectContextReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    planning: snapshot.planning,
    docs: snapshot.docs,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      phaseGates: snapshot.roadmap.phaseGates,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export function generateProjectHandoffReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      phaseGates: snapshot.roadmap.phaseGates,
      summary: snapshot.roadmap.summary,
      stats: snapshot.roadmap.stats,
    },
    validation: snapshot.validation,
    health: snapshot.health,
    instructions: [
      "Use this handoff as context for a human-supervised assistant session.",
      "Do not start implementation without explicit human confirmation.",
    ],
  };
}

export function generateNextProjectActionReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      phaseGates: snapshot.roadmap.phaseGates,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export function generateProjectPromptReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    docs: snapshot.docs,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    instructions: [
      "Lire les sources listées avant toute intervention significative.",
      "Respecter l'architecture et les conventions du projet.",
      "Travailler par micro-lots sûrs et réversibles.",
      "Ne pas modifier de fichiers hors périmètre sans justification explicite.",
      "Ne pas ajouter de dépendance inutile.",
      "Lancer les validations configurées avant review ou commit.",
    ],
  };
}

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    }).trim();
  } catch (error) {
    return error instanceof Error ? error.message : "Command failed.";
  }
}

export function generateReviewReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  const diffNameOnly = snapshot.git.requiresGit
    ? run("git diff --name-only", snapshot.project.path)
    : "";
  const gitStatus = snapshot.git.requiresGit
    ? run("git status --short", snapshot.project.path)
    : "";
  const changedPaths = mergeChangedPaths(
    changedPathsFromGitDiff(diffNameOnly),
    untrackedPathsFromGitStatus(gitStatus),
  );

  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    gitStatus,
    diffStat: snapshot.git.requiresGit
      ? run("git diff --stat", snapshot.project.path)
      : "",
    diff: snapshot.git.requiresGit
      ? run("git diff", snapshot.project.path)
      : "",
    documentationImpact: createDocumentationImpactReport(changedPaths),
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export type DoctorProjectReport = Readonly<{
  project: ProjectConfig;
  path: string;
  exists: boolean;
  isGitRepository: boolean;
  missingRequiredDocs: readonly string[];
}>;

export function generateDoctorReport(config: Config) {
  const projects: DoctorProjectReport[] = config.projects.map((project) => {
    const path = resolve(project.path);
    const exists = existsSync(path);
    return {
      project,
      path,
      exists,
      isGitRepository: isGitRepository(path),
      missingRequiredDocs: exists
        ? project.required_docs.filter((doc) => !docExists(path, doc))
        : project.required_docs,
    };
  });

  return {
    projects,
    hasError: projects.some(
      ({ project, exists, isGitRepository: git, missingRequiredDocs }) =>
        !exists ||
        (project.requires_git !== false && !git) ||
        (project.optional !== true && missingRequiredDocs.length > 0),
    ),
  };
}

/** Runs configured validation commands in declaration order without formatting output. */
export async function runConfiguredValidations(
  project: ProjectConfig,
  runCommand: (command: string, cwd: string) => Promise<number>,
): Promise<{ failedCommand: string | null; exitCode: number }> {
  const projectPath = resolve(project.path);
  for (const command of project.validation) {
    const exitCode = await runCommand(command, projectPath);
    if (exitCode !== 0) {
      return { failedCommand: command, exitCode };
    }
  }
  return { failedCommand: null, exitCode: 0 };
}

export function generateProjectValidationReport(project: ProjectConfig) {
  return {
    projectPath: resolve(project.path),
    configured: project.validation.length > 0,
  };
}

const RAG_SOURCE_PATHS = [
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "docs/architecture",
  "docs/audits",
  "docs/roadmap",
  "docs/integrations",
  "docs/releases",
] as const;
const RAG_INDEX_PATH = ".loop-engine/rag-index.json";

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
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".md") ? [path] : [];
  return readdirSync(path)
    .flatMap((entry) => collectMarkdownFiles(join(path, entry)))
    .sort();
}

function splitMarkdownSections(content: string) {
  const sections: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  }[] = [];
  let current: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  } | null = null;
  for (const line of content.split("\n")) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = {
        sectionTitle: heading[2]?.trim() || "Untitled section",
        headingLevel: heading[1]?.length || 1,
        content: [line],
      };
    } else {
      current ??= { sectionTitle: "Document", headingLevel: 0, content: [] };
      current.content.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((section) => ({
    sectionTitle: section.sectionTitle,
    headingLevel: section.headingLevel,
    content: section.content.join("\n").trim(),
  }));
}

function buildRagDocuments(path: string): readonly RagDocument[] {
  const content = readFileSync(path, "utf8");
  const title =
    content
      .split("\n")
      .find((line) => line.startsWith("# "))
      ?.replace(/^#\s+/, "")
      .trim() || path;
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

/** Builds the local deterministic RAG index and returns its public metadata. */
export function generateRagIndex() {
  const documents = RAG_SOURCE_PATHS.flatMap((sourcePath) =>
    collectMarkdownFiles(sourcePath),
  ).flatMap((file) => buildRagDocuments(file));
  const report = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    sources: RAG_SOURCE_PATHS,
    documents,
  };
  mkdirSync(".loop-engine", { recursive: true });
  const temporaryPath = `${RAG_INDEX_PATH}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(report) + "\n");
  renameSync(temporaryPath, RAG_INDEX_PATH);
  return report;
}

type RagIndex = Readonly<{
  schemaVersion: number;
  documents: readonly RagDocument[];
}>;
export type RagSearchOptions = Readonly<{
  limit?: number;
  pathPrefix?: string;
}>;
export type RagSearchReport = Readonly<{
  schemaVersion: 1;
  query: string;
  pathPrefix?: string | null;
  results: readonly Readonly<{
    path: string;
    title: string;
    sectionTitle: string | null;
    headingLevel: number | null;
    score: number;
    snippet: string;
  }>[];
  error?: "missing_query" | "missing_index";
}>;

function occurrences(content: string, query: string): number {
  const normalizedQuery = query.toLowerCase();
  return normalizedQuery.length === 0
    ? 0
    : content.toLowerCase().split(normalizedQuery).length - 1;
}

function ragSnippet(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return "";
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + query.length + 80);
  return `${start > 0 ? "... " : ""}${content.slice(start, end).replace(/\s+/g, " ").trim()}${end < content.length ? " ..." : ""}`;
}

/** Searches the local deterministic RAG index without formatting terminal output. */
export function generateRagSearchReport(
  query: string | undefined,
  options: RagSearchOptions = {},
): RagSearchReport {
  if (!query || query.trim().length === 0)
    return {
      schemaVersion: 1,
      query: query ?? "",
      results: [],
      error: "missing_query",
    };
  if (!existsSync(RAG_INDEX_PATH))
    return { schemaVersion: 1, query, results: [], error: "missing_index" };
  const normalizedQuery = query.trim();
  const index = JSON.parse(readFileSync(RAG_INDEX_PATH, "utf8")) as RagIndex;
  const documents = options.pathPrefix
    ? index.documents.filter((document) =>
        document.path.startsWith(options.pathPrefix ?? ""),
      )
    : index.documents;
  const limit = options.limit && options.limit > 0 ? options.limit : 5;
  return {
    schemaVersion: 1,
    query: normalizedQuery,
    pathPrefix: options.pathPrefix ?? null,
    results: documents
      .map((document) => ({
        document,
        score:
          occurrences(document.title, normalizedQuery) * 3 +
          occurrences(document.path, normalizedQuery) * 2 +
          occurrences(document.content, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) =>
        right.score !== left.score
          ? right.score - left.score
          : left.document.path.localeCompare(right.document.path),
      )
      .slice(0, limit)
      .map((result) => ({
        path: result.document.path,
        title: result.document.title,
        sectionTitle: result.document.sectionTitle ?? null,
        headingLevel: result.document.headingLevel ?? null,
        score: result.score,
        snippet: ragSnippet(result.document.content, normalizedQuery),
      })),
  };
}
