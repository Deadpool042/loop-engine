import { renderExecutionJson } from "./json-reporter.js";
import { renderExecutionMarkdown } from "./markdown-reporter.js";
import { renderExecutionText } from "./reporter.js";
import type { ExecutionResult } from "./types.js";

export type ExecutionReportFormat = "text" | "markdown" | "json";

export interface RenderExecutionReportOptions {
  readonly format: ExecutionReportFormat;
}

export function renderExecutionReport(
  result: ExecutionResult,
  options: RenderExecutionReportOptions,
): string {
  switch (options.format) {
    case "text":
      return renderExecutionText(result);

    case "markdown":
      return renderExecutionMarkdown(result);

    case "json":
      return renderExecutionJson(result);
  }
}
