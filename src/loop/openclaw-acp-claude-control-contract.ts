import { isAbsolute, resolve } from "node:path";

import type { AgentEffort } from "../agents/types.js";

export type OpenClawAcpGatewayCall = Readonly<{
  method: "sessions.create" | "chat.send" | "chat.history" | "sessions.delete";
  params: Readonly<Record<string, unknown>>;
}>;

export type OpenClawAcpClaudeControlPlan = Readonly<{
  operatorSessionKey: string;
  setup: readonly OpenClawAcpGatewayCall[];
  status: OpenClawAcpGatewayCall;
  cancel: OpenClawAcpGatewayCall;
  close: OpenClawAcpGatewayCall;
  history: OpenClawAcpGatewayCall;
  cleanup: OpenClawAcpGatewayCall;
}>;

export type OpenClawAcpClaudeControlPlanInput = Readonly<{
  operatorSessionKey: string;
  operatorAgentId?: string;
  cwd: string;
  model: string;
  thinking: AgentEffort;
  permissionProfile: string;
  timeoutSeconds: number;
  idempotencyPrefix: string;
}>;

const TOKEN = /^[A-Za-z0-9._:+/-]+$/u;
const SESSION = /^[A-Za-z0-9._:-]+$/u;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]+$/u;

function requireToken(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || !TOKEN.test(trimmed) || /[\r\n\0]/u.test(trimmed)) {
    throw new TypeError(`${label} contains unsupported characters.`);
  }
  return trimmed;
}

function requireSessionKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !SESSION.test(trimmed)) {
    throw new TypeError("ACP operator session key is invalid.");
  }
  return trimmed;
}

function requireIdempotency(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !IDEMPOTENCY.test(trimmed)) {
    throw new TypeError("ACP idempotency prefix is invalid.");
  }
  return trimmed;
}

function commandSend(
  sessionKey: string,
  agentId: string,
  message: string,
  idempotencyKey: string,
  timeoutMs: number,
): OpenClawAcpGatewayCall {
  return Object.freeze({
    method: "chat.send" as const,
    params: Object.freeze({
      sessionKey,
      agentId,
      message,
      deliver: false,
      timeoutMs,
      idempotencyKey,
    }),
  });
}

function quotedPath(path: string): string {
  if (!isAbsolute(path) || /[\r\n\0]/u.test(path)) {
    throw new TypeError("ACP cwd must be an absolute single-line path.");
  }
  return JSON.stringify(resolve(path));
}

export function buildOpenClawAcpClaudeControlPlan(
  input: OpenClawAcpClaudeControlPlanInput,
): OpenClawAcpClaudeControlPlan {
  const operatorSessionKey = requireSessionKey(input.operatorSessionKey);
  const operatorAgentId = requireToken(input.operatorAgentId ?? "main", "ACP operator agent id");
  const model = requireToken(input.model, "ACP Claude model");
  const permissionProfile = requireToken(
    input.permissionProfile,
    "ACP permission profile",
  );
  const idempotencyPrefix = requireIdempotency(input.idempotencyPrefix);
  if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds <= 0) {
    throw new TypeError("ACP timeoutSeconds must be a positive integer.");
  }
  const timeoutMs = Math.min(input.timeoutSeconds * 1000, 2_147_483_647);
  const cwd = quotedPath(input.cwd);

  const setup = Object.freeze([
    Object.freeze({
      method: "sessions.create" as const,
      params: Object.freeze({ key: operatorSessionKey, agentId: operatorAgentId }),
    }),
    commandSend(
      operatorSessionKey,
      operatorAgentId,
      `/acp spawn claude --mode persistent --bind here --cwd ${cwd}`,
      `${idempotencyPrefix}:spawn`,
      timeoutMs,
    ),
    commandSend(
      operatorSessionKey,
      operatorAgentId,
      `/acp model ${model}`,
      `${idempotencyPrefix}:model`,
      timeoutMs,
    ),
    commandSend(
      operatorSessionKey,
      operatorAgentId,
      `/acp set thinking ${input.thinking}`,
      `${idempotencyPrefix}:thinking`,
      timeoutMs,
    ),
    commandSend(
      operatorSessionKey,
      operatorAgentId,
      `/acp permissions ${permissionProfile}`,
      `${idempotencyPrefix}:permissions`,
      timeoutMs,
    ),
    commandSend(
      operatorSessionKey,
      operatorAgentId,
      `/acp timeout ${input.timeoutSeconds}`,
      `${idempotencyPrefix}:timeout`,
      timeoutMs,
    ),
  ]);

  return Object.freeze({
    operatorSessionKey,
    setup,
    status: commandSend(
      operatorSessionKey,
      operatorAgentId,
      "/acp status",
      `${idempotencyPrefix}:status`,
      timeoutMs,
    ),
    cancel: commandSend(
      operatorSessionKey,
      operatorAgentId,
      "/acp cancel",
      `${idempotencyPrefix}:cancel`,
      timeoutMs,
    ),
    close: commandSend(
      operatorSessionKey,
      operatorAgentId,
      "/acp close",
      `${idempotencyPrefix}:close`,
      timeoutMs,
    ),
    history: Object.freeze({
      method: "chat.history" as const,
      params: Object.freeze({ sessionKey: operatorSessionKey, limit: 50 }),
    }),
    cleanup: Object.freeze({
      method: "sessions.delete" as const,
      params: Object.freeze({ key: operatorSessionKey, agentId: operatorAgentId }),
    }),
  });
}

export function buildOpenClawAcpClaudeTurnCall(input: Readonly<{
  operatorSessionKey: string;
  operatorAgentId?: string;
  prompt: string;
  timeoutMs: number;
  idempotencyKey: string;
}>): OpenClawAcpGatewayCall {
  const sessionKey = requireSessionKey(input.operatorSessionKey);
  const agentId = requireToken(input.operatorAgentId ?? "main", "ACP operator agent id");
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new TypeError("ACP turn timeoutMs must be a positive integer.");
  }
  if (!input.prompt.trim()) throw new TypeError("ACP turn prompt must be non-empty.");
  return commandSend(
    sessionKey,
    agentId,
    input.prompt,
    idempotencyKey,
    input.timeoutMs,
  );
}
