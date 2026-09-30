import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createHermesInferProvider,
  type HermesInferProcessRequest,
} from "../../src/text-only-provider/hermes-infer-provider.js";

const INPUT = {
  systemPrompt: "System contract.",
  contextJson: JSON.stringify({ objective: "Keep the roadmap bounded." }),
  model: "openai/gpt-5.6-sol",
  timeoutMs: 5_000,
  effort: "low" as const,
  outputSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: { status: { type: "string" } },
    },
  },
};

describe("createHermesInferProvider", () => {
  it("invokes Hermes in bounded one-shot mode with no toolsets and the explicit model", async () => {
    let observed: HermesInferProcessRequest | null = null;
    const provider = createHermesInferProvider({
      runProcess: async (request) => {
        observed = request;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ status: "ok" }),
          killedReason: null,
        };
      },
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.equal(result.provider, "hermes_agent");
    assert.equal(result.model, "openai/gpt-5.6-sol");
    assert.equal(result.output, JSON.stringify({ status: "ok" }));
    assert.equal(result.effort, "low");

    assert.ok(observed);
    assert.match(observed.executable, /\.local\/bin\/hermes$/);
    assert.deepEqual(observed.args.slice(0, 9), [
      "chat",
      "--oneshot",
      "--quiet",
      "--toolsets",
      "",
      "--provider",
      "openai-codex",
      "--model",
      "gpt-5.6-sol",
    ]);
    assert.equal(observed.args.includes("--reasoning"), true);
    assert.equal(
      observed.args[observed.args.indexOf("--reasoning") + 1],
      "low",
    );
    const prompt = observed.args[observed.args.indexOf("-q") + 1] ?? "";
    assert.match(prompt, /System contract\./);
    assert.match(prompt, /Keep the roadmap bounded/);
    assert.match(prompt, /Return exactly one JSON object matching this JSON Schema/);
  });

  it("unwraps one JSON markdown fence without accepting surrounding commentary", async () => {
    const provider = createHermesInferProvider({
      runProcess: async () => ({
        exitCode: 0,
        stdout: "```json\n{\"status\":\"ok\"}\n```\n",
        killedReason: null,
      }),
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.equal(result.output, JSON.stringify({ status: "ok" }));

    const rejected = createHermesInferProvider({
      runProcess: async () => ({
        exitCode: 0,
        stdout: "Here is the JSON:\n```json\n{\"status\":\"ok\"}\n```",
        killedReason: null,
      }),
    });
    const rejectedResult = await rejected.invoke(INPUT);
    assert.equal(rejectedResult.status, "completed");
    if (rejectedResult.status !== "completed") return;
    assert.match(rejectedResult.output, /^Here is the JSON:/);
  });

  it("rejects a model that is not an explicit provider/model reference before invoking Hermes", async () => {
    let calls = 0;
    const provider = createHermesInferProvider({
      runProcess: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    });

    const result = await provider.invoke({ ...INPUT, model: "gpt-5.6-sol" });

    assert.equal(calls, 0);
    assert.equal(result.status, "failed");
    if (result.status !== "failed") return;
    assert.equal(result.code, "invalid_model");
  });

  it("maps the process timeout to the text-only provider timeout contract", async () => {
    const provider = createHermesInferProvider({
      runProcess: async () => ({
        exitCode: 124,
        stdout: "",
        killedReason: "timeout",
      }),
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "failed");
    if (result.status !== "failed") return;
    assert.equal(result.code, "provider_timeout");
  });

  it("rejects a successful process result without usable text output", async () => {
    const provider = createHermesInferProvider({
      runProcess: async () => ({
        exitCode: 0,
        stdout: "   ",
        killedReason: null,
      }),
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "failed");
    if (result.status !== "failed") return;
    assert.equal(result.code, "provider_response_invalid");
  });
});
