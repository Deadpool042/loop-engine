import type { AutomationContext, AutomationMetadata } from "../../types.js";
import type {
  AutomationForge,
  AutomationForgeCapability,
  AutomationForgeError,
  AutomationForgeMetadata,
  AutomationForgeRequest,
  AutomationForgeResult,
} from "../../forge/index.js";
import type {
  GitHubAutomationForgeCapabilities,
  GitHubAutomationForgeConfiguration,
  GitHubAutomationForgeMetadata,
} from "./types.js";

type GitHubAutomationForgeOperation =
  | "pull_request_review"
  | "workflow_validation"
  | "release_proposal"
  | "documentation_update"
  | "coordination_note";

type GitHubAutomationForgeTransportRequest = Readonly<{
  operation: GitHubAutomationForgeOperation;
  requestId: string;
  organization: string;
  repository: string;
  context: AutomationContext;
  metadata: AutomationMetadata;
}>;

type GitHubAutomationForgeTransportResult = Readonly<{
  status: "accepted" | "completed" | "rejected" | "failed";
  code?: AutomationForgeError["code"];
  message?: string;
}>;

type GitHubAutomationForgeTransport = Readonly<{
  dispatch(
    request: GitHubAutomationForgeTransportRequest,
  ): GitHubAutomationForgeTransportResult;
}>;

export type GitHubAutomationForge = AutomationForge &
  Readonly<{
    configuration: GitHubAutomationForgeConfiguration;
  }>;

const GITHUB_FORGE_ID = "github";

function copyCapabilities(
  capabilities: GitHubAutomationForgeCapabilities,
): GitHubAutomationForgeCapabilities {
  return Object.freeze([...capabilities]);
}

function copyMetadata(
  metadata: GitHubAutomationForgeMetadata,
): GitHubAutomationForgeMetadata {
  return Object.freeze({
    schemaVersion: 1,
    organization: metadata.organization,
    repository: metadata.repository,
    labels: Object.freeze([...metadata.labels]),
    attributes: Object.freeze({ ...metadata.attributes }),
  });
}

function forgeMetadata(
  metadata: GitHubAutomationForgeMetadata,
): AutomationForgeMetadata {
  return Object.freeze({
    schemaVersion: 1,
    forgeId: GITHUB_FORGE_ID,
    labels: Object.freeze([...metadata.labels]),
    attributes: Object.freeze({
      ...metadata.attributes,
      organization: metadata.organization,
      repository: metadata.repository,
    }),
  });
}

function operationFor(
  capability: AutomationForgeCapability,
): GitHubAutomationForgeOperation {
  switch (capability) {
    case "review":
      return "pull_request_review";
    case "validation":
      return "workflow_validation";
    case "release":
      return "release_proposal";
    case "documentation":
      return "documentation_update";
    case "coordination":
      return "coordination_note";
  }
}

function rejectedResult(
  request: AutomationForgeRequest,
  metadata: AutomationForgeMetadata,
  code: AutomationForgeError["code"],
  message: string,
): AutomationForgeResult {
  return Object.freeze({
    status: "rejected",
    forgeId: GITHUB_FORGE_ID,
    error: Object.freeze({ code, message, metadata }),
    metadata: request.metadata,
  });
}

function resultFor(
  request: AutomationForgeRequest,
  metadata: AutomationForgeMetadata,
  result: GitHubAutomationForgeTransportResult,
): AutomationForgeResult {
  if (result.status === "accepted" || result.status === "completed") {
    return Object.freeze({
      status: result.status,
      forgeId: GITHUB_FORGE_ID,
      error: null,
      metadata: request.metadata,
    });
  }

  return Object.freeze({
    status: result.status,
    forgeId: GITHUB_FORGE_ID,
    error: Object.freeze({
      code: result.code ?? "forge_unavailable",
      message: result.message ?? "GitHub forge transport rejected the request.",
      metadata,
    }),
    metadata: request.metadata,
  });
}

export function createGitHubAutomationForge(
  input: GitHubAutomationForgeConfiguration,
  transport: GitHubAutomationForgeTransport,
): GitHubAutomationForge {
  const capabilities = copyCapabilities(input.capabilities);
  const githubMetadata = copyMetadata(input.metadata);
  const metadata = forgeMetadata(githubMetadata);
  const configuration = Object.freeze({
    capabilities,
    metadata: githubMetadata,
  });

  return Object.freeze({
    id: GITHUB_FORGE_ID,
    capabilities,
    metadata,
    configuration,
    handle(request: AutomationForgeRequest): AutomationForgeResult {
      if (!capabilities.includes(request.automationRequest.capability)) {
        return rejectedResult(
          request,
          metadata,
          "unsupported_capability",
          "GitHub forge does not support the requested capability.",
        );
      }

      try {
        return resultFor(
          request,
          metadata,
          transport.dispatch(
            Object.freeze({
              operation: operationFor(request.automationRequest.capability),
              requestId: request.requestId,
              organization: githubMetadata.organization,
              repository: githubMetadata.repository,
              context: request.context,
              metadata: request.automationRequest.metadata,
            }),
          ),
        );
      } catch {
        return rejectedResult(
          request,
          metadata,
          "forge_unavailable",
          "GitHub forge transport is unavailable.",
        );
      }
    },
  });
}
