// Per-project cache and single-flight guard in front of LoopCliNextClient.
// A resolved report is cached forever (until the process restarts); a
// concurrent call for the same project reuses the in-flight promise
// instead of spawning a second CLI process. Failures are not cached so a
// retry always re-invokes the CLI.
import type { ProjectNextReport } from "../shared/project-next.js";
import type { LoopCliNextClient } from "./cli-next-client.js";

export class ProjectNextGateway {
  private readonly cache = new Map<string, ProjectNextReport>();
  private readonly inFlight = new Map<string, Promise<ProjectNextReport>>();

  constructor(
    private readonly client: LoopCliNextClient,
    private readonly repoPath: string,
  ) {}

  async load(projectName: string): Promise<ProjectNextReport> {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    const cached = this.cache.get(projectName);
    if (cached) {
      return cached;
    }

    const pending = this.inFlight.get(projectName);
    if (pending) {
      return pending;
    }

    const request = this.client
      .loadProjectNext(this.repoPath, projectName)
      .then((report) => {
        this.cache.set(projectName, report);
        this.inFlight.delete(projectName);
        return report;
      })
      .catch((error: unknown) => {
        this.inFlight.delete(projectName);
        throw error;
      });

    this.inFlight.set(projectName, request);
    return request;
  }
}
