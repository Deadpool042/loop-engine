import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../composition/index.js";

export type CompletionEventsReport = Readonly<{
  schemaVersion: 1;
  events: readonly unknown[];
  errors: readonly Readonly<{
    project: string;
    code: "overview_failed";
  }>[];
}>;

export function generateCompletionEventsReport(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
): CompletionEventsReport {
  const events: unknown[] = [];
  const errors: { project: string; code: "overview_failed" }[] = [];

  for (const project of config.projects) {
    try {
      const overview = application.generateRoadmapOverviewReport(project);
      const event = overview.roadmap.completionEvent;
      if (event) events.push(event);
    } catch {
      errors.push({ project: project.name, code: "overview_failed" });
    }
  }

  return {
    schemaVersion: 1,
    events,
    errors,
  };
}

export function printCompletionEventsJson(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
): void {
  console.log(JSON.stringify(generateCompletionEventsReport(application, config)));
}
