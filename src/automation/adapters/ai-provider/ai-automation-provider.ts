import type {
  AutomationProvider,
  AutomationProviderError,
  AutomationProviderMetadata,
  AutomationProviderRequest,
  AutomationProviderResult,
} from "../../provider/index.js";
import type {
  AIAutomationProviderCapabilities,
  AIAutomationProviderConfiguration,
  AIAutomationProviderMetadata,
  AIAutomationProviderTransport,
  AIAutomationProviderTransportRequest,
  AIAutomationProviderTransportResult,
} from "./types.js";

export type AIAutomationProvider = AutomationProvider &
  Readonly<{
    configuration: AIAutomationProviderConfiguration;
  }>;

const AI_PROVIDER_ID = "ai";

function copyCapabilities(
  capabilities: AIAutomationProviderCapabilities,
): AIAutomationProviderCapabilities {
  return Object.freeze([...capabilities]);
}

function copyMetadata(
  metadata: AIAutomationProviderMetadata,
): AIAutomationProviderMetadata {
  return Object.freeze({
    schemaVersion: 1,
    executionProfile: metadata.executionProfile,
    timeoutPolicyId: metadata.timeoutPolicyId,
    labels: Object.freeze([...metadata.labels]),
    attributes: Object.freeze({ ...metadata.attributes }),
  });
}

function providerMetadata(
  metadata: AIAutomationProviderMetadata,
): AutomationProviderMetadata {
  return Object.freeze({
    schemaVersion: 1,
    providerId: AI_PROVIDER_ID,
    labels: Object.freeze([...metadata.labels]),
    attributes: Object.freeze({
      ...metadata.attributes,
      executionProfile: metadata.executionProfile,
      ...(metadata.timeoutPolicyId === null
        ? {}
        : { timeoutPolicyId: metadata.timeoutPolicyId }),
    }),
  });
}

function transportRequestFor(
  request: AutomationProviderRequest,
  metadata: AIAutomationProviderMetadata,
): AIAutomationProviderTransportRequest {
  return Object.freeze({
    requestId: request.requestId,
    capability: request.automationRequest.capability,
    context: request.context,
    executionProfile: metadata.executionProfile,
    timeoutPolicyId: metadata.timeoutPolicyId,
    metadata: request.automationRequest.metadata,
  });
}

function rejectedResult(
  request: AutomationProviderRequest,
  metadata: AutomationProviderMetadata,
  code: AutomationProviderError["code"],
  message: string,
): AutomationProviderResult {
  return Object.freeze({
    status: "rejected",
    providerId: AI_PROVIDER_ID,
    error: Object.freeze({ code, message, metadata }),
    metadata: request.metadata,
  });
}

function resultFor(
  request: AutomationProviderRequest,
  metadata: AutomationProviderMetadata,
  result: AIAutomationProviderTransportResult,
): AutomationProviderResult {
  if (result.status === "accepted" || result.status === "completed") {
    return Object.freeze({
      status: result.status,
      providerId: AI_PROVIDER_ID,
      error: null,
      metadata: request.metadata,
    });
  }

  return Object.freeze({
    status: result.status,
    providerId: AI_PROVIDER_ID,
    error: Object.freeze({
      code: result.code ?? "provider_unavailable",
      message: result.message ?? "AI provider transport rejected the request.",
      metadata,
    }),
    metadata: request.metadata,
  });
}

export function createAIAutomationProvider(
  input: AIAutomationProviderConfiguration,
  transport: AIAutomationProviderTransport,
): AIAutomationProvider {
  const capabilities = copyCapabilities(input.capabilities);
  const aiMetadata = copyMetadata(input.metadata);
  const metadata = providerMetadata(aiMetadata);
  const configuration = Object.freeze({
    capabilities,
    metadata: aiMetadata,
  });

  return Object.freeze({
    id: AI_PROVIDER_ID,
    capabilities,
    metadata,
    configuration,
    provide(request: AutomationProviderRequest): AutomationProviderResult {
      if (!capabilities.includes(request.automationRequest.capability)) {
        return rejectedResult(
          request,
          metadata,
          "unsupported_capability",
          "AI provider does not support the requested capability.",
        );
      }

      try {
        return resultFor(
          request,
          metadata,
          transport.execute(transportRequestFor(request, aiMetadata)),
        );
      } catch {
        return rejectedResult(
          request,
          metadata,
          "provider_unavailable",
          "AI provider transport is unavailable.",
        );
      }
    },
  });
}
