// Generic per-project cache and single-flight guard for a lazy, refreshable
// GUI section (Context, Prompt). A resolved value is cached until the
// process restarts or `invalidate` is called explicitly (the "Actualiser"
// button); a concurrent call for the same project reuses the in-flight
// promise instead of spawning a second CLI process. Failures are not
// cached so a retry always re-invokes the loader.
export type ProjectSectionLoader<T> = (projectName: string) => Promise<T>;

export class ProjectSectionGateway<T> {
  private readonly cache = new Map<string, T>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly loader: ProjectSectionLoader<T>) {}

  async load(projectName: string): Promise<T> {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    const cached = this.cache.get(projectName);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.inFlight.get(projectName);
    if (pending) {
      return pending;
    }

    const request = this.loader(projectName)
      .then((value) => {
        this.cache.set(projectName, value);
        this.inFlight.delete(projectName);
        return value;
      })
      .catch((error: unknown) => {
        this.inFlight.delete(projectName);
        throw error;
      });

    this.inFlight.set(projectName, request);
    return request;
  }

  invalidate(projectName: string): void {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    this.cache.delete(projectName);
  }
}
