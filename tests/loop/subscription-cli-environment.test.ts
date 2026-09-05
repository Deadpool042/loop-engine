import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSubscriptionCliEnvironment } from "../../src/loop/subscription-cli-environment.js";

describe("buildSubscriptionCliEnvironment", () => {
  it("keeps only the bounded system/auth-location allowlist", () => {
    const env = buildSubscriptionCliEnvironment({
      HOME: "/home/test",
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      CODEX_HOME: "/home/test/.codex",
      CLAUDE_CONFIG_DIR: "/home/test/.claude",
      OPENAI_API_KEY: "secret-openai",
      ANTHROPIC_API_KEY: "secret-anthropic",
      AWS_SECRET_ACCESS_KEY: "secret-aws",
      SSH_AUTH_SOCK: "/tmp/agent.sock",
      HTTPS_PROXY: "http://proxy.invalid",
      GITHUB_TOKEN: "secret-github",
    });

    assert.deepEqual(env, {
      HOME: "/home/test",
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      CODEX_HOME: "/home/test/.codex",
      CLAUDE_CONFIG_DIR: "/home/test/.claude",
    });
  });

  it("never exposes provider or infrastructure credentials by inheritance", () => {
    const env = buildSubscriptionCliEnvironment({
      OPENAI_API_KEY: "openai",
      ANTHROPIC_API_KEY: "anthropic",
      GOOGLE_API_KEY: "google",
      AZURE_OPENAI_API_KEY: "azure",
      GITHUB_TOKEN: "github",
      NPM_TOKEN: "npm",
      SSH_AUTH_SOCK: "/tmp/ssh.sock",
      DATABASE_URL: "postgres://secret",
    });

    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.GOOGLE_API_KEY, undefined);
    assert.equal(env.AZURE_OPENAI_API_KEY, undefined);
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.NPM_TOKEN, undefined);
    assert.equal(env.SSH_AUTH_SOCK, undefined);
    assert.equal(env.DATABASE_URL, undefined);
  });

  it("allows only explicit executor-owned extras", () => {
    const env = buildSubscriptionCliEnvironment(
      { HOME: "/home/test", OPENAI_API_KEY: "secret" },
      { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
    );

    assert.deepEqual(env, {
      HOME: "/home/test",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    });
  });

  it("preserves the fake-provider test seam without opening arbitrary environment inheritance", () => {
    const env = buildSubscriptionCliEnvironment({
      FAKE_CODEX_MODE: "success",
      FAKE_CLAUDE_CAPTURE_ARGS: "/tmp/capture.json",
      UNRELATED_TEST_SECRET: "nope",
    });

    assert.deepEqual(env, {
      FAKE_CODEX_MODE: "success",
      FAKE_CLAUDE_CAPTURE_ARGS: "/tmp/capture.json",
    });
  });
});
