// Shared lazy-loading state machine for a project detail section backed by
// a refreshable async fetch (context, prompt, review, plan, next, validate,
// open folder). Mirrors the exact loading/success/error + single-flight
// contract that used to be duplicated once per section in app.ts. Does not
// itself dedupe against a cached value — like the original per-section
// loaders, that decision stays with the caller (renderLazyJsonSection),
// which only calls load() when no state is present yet, or explicitly on
// refresh.
import { toGuiExecutionError, type GuiExecutionError } from "../shared/gui-execution-error.js";

export type LazySectionState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "success"; value: T }>
  | Readonly<{ status: "error"; error: GuiExecutionError }>;

export interface SectionLoaderDeps<T> {
  fetch(projectName: string, refresh: boolean): Promise<T>;
  onSettled(projectName: string): void;
}

export interface SectionLoader<T> {
  readonly stateByProject: Map<string, LazySectionState<T>>;
  load(projectName: string, refresh: boolean): void;
}

export function createSectionLoader<T>(
  deps: SectionLoaderDeps<T>,
): SectionLoader<T> {
  const stateByProject = new Map<string, LazySectionState<T>>();
  const requestInFlight = new Set<string>();

  function load(projectName: string, refresh: boolean): void {
    if (requestInFlight.has(projectName)) {
      return;
    }

    requestInFlight.add(projectName);
    stateByProject.set(projectName, { status: "loading" });

    deps
      .fetch(projectName, refresh)
      .then((value) => {
        stateByProject.set(projectName, { status: "success", value });
      })
      .catch((error: unknown) => {
        stateByProject.set(projectName, {
          status: "error",
          error: toGuiExecutionError(error),
        });
      })
      .finally(() => {
        requestInFlight.delete(projectName);
        deps.onSettled(projectName);
      });
  }

  return { stateByProject, load };
}
