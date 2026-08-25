import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import type { LoopRunExecuteOptions } from "../loop/execute-runner.js";
import {
  gitCandidatePublisher,
  type CandidatePublisher,
} from "../loop/git-candidate-publisher.js";
import type { LoopRunResult } from "../loop/types.js";

export type IsolatedProviderRunPublish = (
  projectName: string,
  options?: LoopRunExecuteOptions,
) => Promise<LoopRunResult>;

function publicationFailure(
  execution: LoopRunResult,
  code: string,
  message: string,
): LoopRunResult {
  return Object.freeze({
    ...execution,
    mode: "publish" as const,
    status: "failed" as const,
    patchExport: null,
    publication: null,
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze([
        "Candidate publication diagnostics are redacted.",
      ]),
    }),
  });
}

/**
 * Extends the existing isolated execute boundary: provider changes are first
 * validated and exported from its temporary worktree, then a private Git ref
 * is prepared against the unchanged source repository. No source apply occurs.
 */
export function createIsolatedProviderRunPublish(
  options: Readonly<{
    runExecute: (
      projectName: string,
      options?: LoopRunExecuteOptions,
    ) => Promise<LoopRunResult>;
    loadConfig?: typeof loadConfig;
    findProject?: typeof findProject;
    candidatePublisher?: CandidatePublisher;
  }>,
): IsolatedProviderRunPublish {
  return async (projectName, runOptions = {}) => {
    const directory = await mkdtemp(join(tmpdir(), "loop-engine-publish-"));
    const patchPath = join(directory, "validated.patch");
    try {
      const execution = await options.runExecute(projectName, {
        ...runOptions,
        exportPatchPath: patchPath,
      });
      if (
        execution.status !== "completed" ||
        execution.validation?.status !== "passed" ||
        !execution.patchExport
      ) {
        return Object.freeze({
          ...execution,
          mode: "publish" as const,
          patchExport: null,
          publication: null,
        });
      }
      const project = (options.findProject ?? findProject)(
        (options.loadConfig ?? loadConfig)(),
        projectName,
      );
      if (!project)
        return publicationFailure(
          execution,
          "unknown_project",
          "The project could not be resolved for candidate publication.",
        );
      const result = await (
        options.candidatePublisher ?? gitCandidatePublisher
      )({
        project,
        runId: execution.runId,
        baseSha: execution.patchExport.baseSha,
        patchPath,
        patchSha256: execution.patchExport.sha256,
        modifiedFiles: execution.modifiedFiles,
      });
      if (!result.published)
        return publicationFailure(execution, result.code, result.message);
      return Object.freeze({
        ...execution,
        mode: "publish" as const,
        patchExport: null,
        publication: result.publication,
      });
    } catch {
      return Object.freeze({
        schemaVersion: 1,
        runId: "publication-unavailable",
        project: projectName,
        mode: "publish",
        status: "failed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        candidate: null,
        steps: Object.freeze([]),
        validation: null,
        modifiedFiles: Object.freeze([]),
        commit: null,
        publication: null,
        failure: Object.freeze({
          code: "candidate_publication_failed",
          message: "Unable to prepare candidate publication.",
          details: Object.freeze([
            "Candidate publication diagnostics are redacted.",
          ]),
        }),
        agentPolicy: null,
        contextPackage: null,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
