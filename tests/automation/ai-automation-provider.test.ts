import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAIAutomationProvider,
  type AIAutomationProviderConfiguration,
  type AIAutomationProviderTransport,
  type AIAutomationProviderTransportRequest,
} from "../../src/automation/adapters/ai-provider/index.js";
import type {
  AutomationProvider,
  AutomationProviderRequest,
} from "../../src/automation/provider/index.js";

const automationMetadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-07-31T00:00:00.000Z",
  labels: Object.freeze(["automation"]),
  attributes: Object.freeze({ source: "test" }),
});

const providerRequest = (
  capability: "review" | "release",
): AutomationProviderRequest =>
  Object.freeze({
    requestId: "provider-" + capability,
    automationRequest: Object.freeze({
      requestId: "automation-" + capability,
      capability,
      context: Object.freeze({
        scopeId: "scope-1",
        subjectId: "subject-1",
        metadata: automationMetadata,
      }),
      metadata: automationMetadata,
    }),
    context: Object.freeze({
      scopeId: "scope-1",
      subjectId: "subject-1",
      metadata: automationMetadata,
    }),
    metadata: Object.freeze({
      schemaVersion: 1,
      providerId: "ai",
      labels: Object.freeze(["automation"]),
      attributes: Object.freeze({ source: "test" }),
    }),
  });

const configuration = (): AIAutomationProviderConfiguration =>
  Object.freeze({
    capabilities: Object.freeze(["review"] as const),
    metadata: Object.freeze({
      schemaVersion: 1,
      executionProfile: "default",
      timeoutPolicyId: "bounded",
      labels: Object.freeze(["ai"]),
      attributes: Object.freeze({ source: "test" }),
    }),
  });

const acceptingTransport = (): AIAutomationProviderTransport =>
  Object.freeze({
    execute: () =>
      Object.freeze({
        status: "accepted" as const,
        attributes: Object.freeze({ outcome: "accepted" }),
      }),
  });

test("createAIAutomationProvider returns an AutomationProvider with frozen snapshots", () => {
  const provider: AutomationProvider = createAIAutomationProvider(
    configuration(),
    acceptingTransport(),
  );

  assert.equal(provider.id, "ai");
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.isFrozen(provider.capabilities), true);
  assert.equal(Object.isFrozen(provider.metadata), true);
  assert.equal(Object.isFrozen(provider.metadata.labels), true);
  assert.equal(Object.isFrozen(provider.metadata.attributes), true);
  assert.equal(Object.isFrozen(provider.configuration.metadata.labels), true);
  assert.equal(
    Object.isFrozen(provider.configuration.metadata.attributes),
    true,
  );
  assert.deepEqual(provider.capabilities, ["review"]);
});

test("AIAutomationProvider copies caller-owned configuration without mutation", () => {
  const input = {
    capabilities: ["review"] as "review"[],
    metadata: {
      schemaVersion: 1 as const,
      executionProfile: "default",
      timeoutPolicyId: "bounded" as string | null,
      labels: ["ai"],
      attributes: { source: "caller" },
    },
  };
  const provider = createAIAutomationProvider(input, acceptingTransport());

  input.capabilities.push("release" as never);
  input.metadata.labels.push("changed");
  input.metadata.attributes.source = "changed";

  assert.deepEqual(provider.configuration.capabilities, ["review"]);
  assert.deepEqual(provider.configuration.metadata.labels, ["ai"]);
  assert.deepEqual(provider.configuration.metadata.attributes, {
    source: "caller",
  });
  assert.equal(Object.isFrozen(provider.configuration), true);
  assert.equal(Object.isFrozen(provider.configuration.metadata), true);
});

test("AIAutomationProvider translates supported requests through the public transport port", () => {
  const observed: AIAutomationProviderTransportRequest[] = [];
  const transport: AIAutomationProviderTransport = Object.freeze({
    execute: (request) => {
      observed.push(request);
      return Object.freeze({
        status: "completed" as const,
        attributes: Object.freeze({ outcome: "completed" }),
      });
    },
  });
  const provider = createAIAutomationProvider(configuration(), transport);
  const request = providerRequest("review");

  assert.deepEqual(provider.provide(request), {
    status: "completed",
    providerId: "ai",
    error: null,
    metadata: request.metadata,
  });
  assert.deepEqual(observed, [
    {
      requestId: "provider-review",
      capability: "review",
      context: request.context,
      executionProfile: "default",
      timeoutPolicyId: "bounded",
      metadata: request.automationRequest.metadata,
    },
  ]);
  assert.equal(Object.isFrozen(observed[0]), true);
});

test("AIAutomationProvider translates transport errors deterministically", () => {
  const provider = createAIAutomationProvider(
    configuration(),
    Object.freeze({
      execute: () =>
        Object.freeze({
          status: "failed" as const,
          code: "result_invalid" as const,
          message: "Transport result is invalid.",
          attributes: Object.freeze({ outcome: "invalid" }),
        }),
    }),
  );

  const result = provider.provide(providerRequest("review"));

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "result_invalid");
  assert.equal(result.error?.message, "Transport result is invalid.");
});

test("AIAutomationProvider rejects transport exceptions with a stable error", () => {
  const provider = createAIAutomationProvider(
    configuration(),
    Object.freeze({
      execute: () => {
        throw new Error("unavailable");
      },
    }),
  );

  const result = provider.provide(providerRequest("review"));

  assert.equal(result.status, "rejected");
  assert.equal(result.error?.code, "provider_unavailable");
  assert.equal(result.error?.message, "AI provider transport is unavailable.");
});

test("AIAutomationProvider rejects unsupported capabilities without transport execution", () => {
  const provider = createAIAutomationProvider(
    configuration(),
    Object.freeze({
      execute: () => {
        throw new Error("transport should not be called");
      },
    }),
  );

  const result = provider.provide(providerRequest("release"));

  assert.equal(result.status, "rejected");
  assert.equal(result.error?.code, "unsupported_capability");
});

test("AIAutomationProvider translates equivalent inputs deterministically", () => {
  const observed: AIAutomationProviderTransportRequest[] = [];
  const provider = createAIAutomationProvider(
    configuration(),
    Object.freeze({
      execute: (request) => {
        observed.push(request);
        return Object.freeze({
          status: "accepted" as const,
          attributes: Object.freeze({ outcome: "accepted" }),
        });
      },
    }),
  );
  const first = providerRequest("review");
  const second = providerRequest("review");

  provider.provide(first);
  provider.provide(second);

  assert.deepEqual(observed[0], observed[1]);
  assert.equal(first.automationRequest.metadata.attributes.source, "test");
});
