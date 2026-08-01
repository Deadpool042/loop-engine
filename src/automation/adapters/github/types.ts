import type { AutomationForgeCapability } from "../../forge/index.js";

export type GitHubAutomationForgeCapabilities =
  readonly AutomationForgeCapability[];

export type GitHubAutomationForgeMetadata = Readonly<{
  schemaVersion: 1;
  organization: string;
  repository: string;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type GitHubAutomationForgeConfiguration = Readonly<{
  capabilities: GitHubAutomationForgeCapabilities;
  metadata: GitHubAutomationForgeMetadata;
}>;
