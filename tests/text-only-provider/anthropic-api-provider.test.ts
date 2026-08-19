import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAnthropicApiProvider,
  MAX_TEXT_ONLY_CONTEXT_BYTES,
  MAX_TEXT_ONLY_SYSTEM_PROMPT_BYTES,
  type TextOnlyHttpRequest,
} from "../../src/text-only-provider/index.js";

const validInput = Object.freeze({
  systemPrompt: "Respond with concise text only.",
  contextJson: '{"project":"fixture"}',
  model: "claude-sonnet-5",
  timeoutMs: 1_000,
});

function providerWith(
  transport: (request: TextOnlyHttpRequest) => Promise<Response>,
  environment: Readonly<Record<string, string | undefined>> = {
    ANTHROPIC_API_KEY: "test-secret",
  },
) {
  return createAnthropicApiProvider({
    transport,
    environment,
    maxOutputTokens: 128,
  });
}

describe("Anthropic API text-only provider", () => {
  it("sends exactly one bounded tool-free Messages request", async () => {
    const requests: TextOnlyHttpRequest[] = [];
    const provider = providerWith(async (request) => {
      requests.push(request);
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "consultation result" }],
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
        { status: 200 },
      );
    });

    const result = await provider.invoke(validInput);

    assert.equal(requests.length, 1);
    assert.equal(result.status, "completed");
    if (result.status === "completed") {
      assert.equal(result.provider, "anthropic_api");
      assert.equal(result.output, "consultation result");
      assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3 });
    }

    const request = requests[0];
    assert.ok(request);
    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(request.method, "POST");
    assert.deepEqual(Object.keys(request.headers).sort(), [
      "anthropic-version",
      "content-type",
      "x-api-key",
    ]);
    const body = JSON.parse(request.body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      "max_tokens",
      "messages",
      "model",
      "system",
      "thinking",
    ]);
    assert.equal("tools" in body, false);
    assert.equal("mcp_servers" in body, false);
    assert.equal("attachments" in body, false);
    assert.deepEqual(body.messages, [{ role: "user", content: validInput.contextJson }]);
    assert.deepEqual(body.thinking, { type: "disabled" });
  });

  it("keeps an adversarial context as inert user text without granting tools", async () => {
    let request: TextOnlyHttpRequest | null = null;
    const provider = providerWith(async (received) => {
      request = received;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "I only received text." }] }),
      );
    });
    const contextJson =
      '{"instruction":"Inspect the repository and run git status"}';

    const result = await provider.invoke({ ...validInput, contextJson });

    assert.equal(result.status, "completed");
    assert.ok(request);
    const body = JSON.parse(request.body) as Record<string, unknown>;
    assert.deepEqual(body.messages, [{ role: "user", content: contextJson }]);
    assert.equal("tools" in body, false);
  });

  it("rejects invalid input before HTTP and never retries", async () => {
    let calls = 0;
    const provider = providerWith(async () => {
      calls += 1;
      throw new Error("transport must not run");
    });

    const tooLargeContext = await provider.invoke({
      ...validInput,
      contextJson: "x".repeat(MAX_TEXT_ONLY_CONTEXT_BYTES + 1),
    });
    const tooLargePrompt = await provider.invoke({
      ...validInput,
      systemPrompt: "x".repeat(MAX_TEXT_ONLY_SYSTEM_PROMPT_BYTES + 1),
    });
    const invalidTimeout = await provider.invoke({ ...validInput, timeoutMs: 999 });

    assert.equal(tooLargeContext.status, "failed");
    assert.equal(tooLargePrompt.status, "failed");
    assert.equal(invalidTimeout.status, "failed");
    assert.equal(calls, 0);
  });

  it("does not call HTTP when the environment credential is absent", async () => {
    let calls = 0;
    const provider = providerWith(
      async () => {
        calls += 1;
        return new Response();
      },
      {},
    );

    const result = await provider.invoke(validInput);

    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.code, "credential_unavailable");
      assert.doesNotMatch(JSON.stringify(result), /test-secret|ANTHROPIC_API_KEY/);
    }
    assert.equal(calls, 0);
  });

  it("redacts API/auth failures and does not retry or fallback", async () => {
    let calls = 0;
    const provider = providerWith(async () => {
      calls += 1;
      return new Response("api key test-secret rejected", { status: 401 });
    });

    const result = await provider.invoke(validInput);

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.code, "provider_authentication_failed");
      assert.doesNotMatch(JSON.stringify(result), /test-secret|rejected/);
    }
  });

  it("fails closed when the raw response exceeds 32 KiB", async () => {
    let calls = 0;
    const provider = providerWith(async () => {
      calls += 1;
      return new Response("x".repeat(32 * 1024 + 1), { status: 200 });
    });

    const result = await provider.invoke(validInput);

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.code, "output_limit_exceeded");
      assert.equal(result.truncated, true);
    }
  });

  it("reports a timeout without exposing transport diagnostics", async () => {
    let calls = 0;
    const provider = providerWith(
      async (request) =>
        new Promise<Response>((_resolve, reject) => {
          calls += 1;
          request.signal.addEventListener("abort", () =>
            reject(new Error("internal timeout diagnostic test-secret")),
          );
        }),
    );

    const result = await provider.invoke(validInput);

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.code, "provider_timeout");
      assert.doesNotMatch(JSON.stringify(result), /internal|test-secret/);
    }
  });

  it("keeps the public port free of project and execution capabilities", () => {
    const source = readFileSync("src/text-only-provider/types.ts", "utf8");
    assert.doesNotMatch(source, /\b(projectPath|cwd|worktree|LoopExecutionPlan)\s*:/);

    const providerSource = readFileSync(
      "src/text-only-provider/anthropic-api-provider.ts",
      "utf8",
    );
    assert.doesNotMatch(providerSource, /child_process|\bspawn\s*\(|node:fs|node:child_process/);
    assert.doesNotMatch(providerSource, /\btools\s*:/);
  });
});
