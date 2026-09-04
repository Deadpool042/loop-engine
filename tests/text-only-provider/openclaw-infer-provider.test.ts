import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOpenClawInferProvider,
  type OpenClawInferProcessRequest,
} from "../../src/text-only-provider/openclaw-infer-provider.js";

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

describe("createOpenClawInferProvider", () => {
  it("invokes the bounded raw Gateway inference surface with the explicit model and no fallback flags", async () => {
    let observed: OpenClawInferProcessRequest | null = null;
    const provider = createOpenClawInferProvider({
      runProcess: async (request) => {
        observed = request;
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            provider: "openai",
            model: "gpt-5.6-sol",
            outputs: [{ text: JSON.stringify({ status: "ok" }) }],
          }),
          killedReason: null,
        };
      },
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.equal(result.provider, "openclaw_agent");
    assert.equal(result.model, "openai/gpt-5.6-sol");
    assert.equal(result.respondedModel, "openai/gpt-5.6-sol");
    assert.equal(result.output, JSON.stringify({ status: "ok" }));
    assert.equal(result.effort, "low");

    assert.ok(observed);
    assert.match(observed.executable, /\.openclaw\/bin\/openclaw$/);
    assert.deepEqual(observed.args.slice(0, 6), [
      "infer",
      "model",
      "run",
      "--gateway",
      "--model",
      "openai/gpt-5.6-sol",
    ]);
    assert.equal(observed.args.at(-1), "--json");
    assert.equal(observed.args.includes("--fallback"), false);
    assert.equal(observed.args.includes("--fallbacks"), false);
    assert.equal(observed.args.includes("--thinking"), true);
    assert.equal(observed.args[observed.args.indexOf("--thinking") + 1], "low");
    const prompt = observed.args[observed.args.indexOf("--prompt") + 1] ?? "";
    assert.match(prompt, /System contract\./);
    assert.match(prompt, /Keep the roadmap bounded/);
    assert.match(prompt, /Return exactly one JSON object matching this JSON Schema/);
  });

  it("rejects a model that is not an explicit provider/model reference before invoking OpenClaw", async () => {
    let calls = 0;
    const provider = createOpenClawInferProvider({
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
    const provider = createOpenClawInferProvider({
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

  it("rejects a successful process result whose OpenClaw envelope has no usable text output", async () => {
    const provider = createOpenClawInferProvider({
      runProcess: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          provider: "openai",
          model: "gpt-5.6-sol",
          outputs: [],
        }),
        killedReason: null,
      }),
    });

    const result = await provider.invoke(INPUT);

    assert.equal(result.status, "failed");
    if (result.status !== "failed") return;
    assert.equal(result.code, "provider_response_invalid");
  });
});
