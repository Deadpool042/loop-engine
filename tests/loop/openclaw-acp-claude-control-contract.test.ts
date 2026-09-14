import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOpenClawAcpClaudeControlPlan,
  buildOpenClawAcpClaudeTurnCall,
} from "../../src/loop/openclaw-acp-claude-control-contract.js";

describe("buildOpenClawAcpClaudeControlPlan", () => {
  it("uses only governed Gateway session/chat surfaces and never sessions_spawn", () => {
    const plan = buildOpenClawAcpClaudeControlPlan({
      operatorSessionKey: "agent:main:loop-acp-run-1",
      cwd: "/tmp/project with spaces",
      model: "anthropic/claude-sonnet-test",
      thinking: "medium",
      permissionProfile: "strict",
      timeoutSeconds: 120,
      idempotencyPrefix: "run-1",
    });

    const methods = [
      ...plan.setup.map((entry) => entry.method),
      plan.status.method,
      plan.cancel.method,
      plan.close.method,
      plan.history.method,
      plan.cleanup.method,
    ];
    assert.deepEqual(new Set(methods), new Set([
      "sessions.create",
      "chat.send",
      "chat.history",
      "sessions.delete",
    ]));
    assert.equal(JSON.stringify(plan).includes("sessions_spawn"), false);

    const messages = plan.setup
      .filter((entry) => entry.method === "chat.send")
      .map((entry) => String(entry.params.message));
    assert.deepEqual(messages, [
      '/acp spawn claude --mode persistent --bind here --cwd "/tmp/project with spaces"',
      "/acp model anthropic/claude-sonnet-test",
      "/acp set thinking medium",
      "/acp permissions strict",
      "/acp timeout 120",
    ]);
    assert.equal(plan.status.params.message, "/acp status");
    assert.equal(plan.cancel.params.message, "/acp cancel");
    assert.equal(plan.close.params.message, "/acp close");
  });

  it("adds deterministic idempotency keys and delivery-off semantics to commands", () => {
    const plan = buildOpenClawAcpClaudeControlPlan({
      operatorSessionKey: "agent:main:loop-acp-run-2",
      operatorAgentId: "main",
      cwd: "/tmp/project",
      model: "claude-sonnet-test",
      thinking: "high",
      permissionProfile: "strict",
      timeoutSeconds: 60,
      idempotencyPrefix: "run-2",
    });

    const sends = [...plan.setup, plan.status, plan.cancel, plan.close].filter(
      (entry) => entry.method === "chat.send",
    );
    const keys = sends.map((entry) => entry.params.idempotencyKey);
    assert.deepEqual(keys, [
      "run-2:spawn",
      "run-2:model",
      "run-2:thinking",
      "run-2:permissions",
      "run-2:timeout",
      "run-2:status",
      "run-2:cancel",
      "run-2:close",
    ]);
    for (const entry of sends) {
      assert.equal(entry.params.deliver, false);
      assert.equal(entry.params.timeoutMs, 60_000);
    }
  });

  it("fails closed on command-injection shaped dynamic values", () => {
    const base = {
      operatorSessionKey: "agent:main:loop-acp-run-3",
      cwd: "/tmp/project",
      model: "claude-sonnet-test",
      thinking: "medium" as const,
      permissionProfile: "strict",
      timeoutSeconds: 60,
      idempotencyPrefix: "run-3",
    };
    assert.throws(
      () => buildOpenClawAcpClaudeControlPlan({ ...base, model: "model\n/acp close" }),
      /unsupported characters/,
    );
    assert.throws(
      () => buildOpenClawAcpClaudeControlPlan({ ...base, permissionProfile: "strict;close" }),
      /unsupported characters/,
    );
    assert.throws(
      () => buildOpenClawAcpClaudeControlPlan({ ...base, cwd: "relative/path" }),
      /absolute/,
    );
  });
});

describe("buildOpenClawAcpClaudeTurnCall", () => {
  it("routes the governed prompt through chat.send on the bound operator session", () => {
    const call = buildOpenClawAcpClaudeTurnCall({
      operatorSessionKey: "agent:main:loop-acp-run-4",
      prompt: "Implement the admitted change only.",
      timeoutMs: 90_000,
      idempotencyKey: "run-4:turn",
    });
    assert.equal(call.method, "chat.send");
    assert.deepEqual(call.params, {
      sessionKey: "agent:main:loop-acp-run-4",
      agentId: "main",
      message: "Implement the admitted change only.",
      deliver: false,
      timeoutMs: 90_000,
      idempotencyKey: "run-4:turn",
    });
  });
});
