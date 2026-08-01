import type { AutomationContext, AutomationMetadata } from "../../types.js";
import type {
  AutomationProviderCapability,
  AutomationProviderError,
} from "../../provider/index.js";

export type AIAutomationProviderCapabilities =
  readonly AutomationProviderCapability[];

export type AIAutomationProviderMetadata = Readonly<{
  schemaVersion: 1;
  executionProfile: string;
  timeoutPolicyId: string | null;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AIAutomationProviderConfiguration = Readonly<{
  capabilities: AIAutomationProviderCapabilities;
  metadata: AIAutomationProviderMetadata;
}>;

export type AIAutomationProviderTransportRequest = Readonly<{
  requestId: string;
  capability: AutomationProviderCapability;
  context: AutomationContext;
  executionProfile: string;
  timeoutPolicyId: string | null;
  metadata: AutomationMetadata;
}>;

export type AIAutomationProviderTransportResult = Readonly<{
  status: "accepted" | "completed" | "rejected" | "failed";
  code?: AutomationProviderError["code"];
  message?: string;
  attributes: Readonly<Record<string, string>>;
}>;

export interface AIAutomationProviderTransport {
  execute(
    request: AIAutomationProviderTransportRequest,
  ): AIAutomationProviderTransportResult;
}
