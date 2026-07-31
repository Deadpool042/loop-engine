import type { LoopRunExecuteOptions } from "../loop/execute-runner.js";
import type {
  DurableExecutionFingerprint,
} from "../loop/durable-execution-integrity.js";
import type {
  DurableExecutionRecord,
  DurableExecutionRequest,
} from "../loop/durable-execution.js";
import type {
  DurableExecutionRecordSummary,
  DurableExecutionRepository,
} from "../loop/file-durable-execution-store.js";
import type { DurableExecutionControlPlane } from "./durable-execution-control-plane.js";

export const ORCHESTRATION_GATEWAY_SCHEMA_VERSION = 1 as const;

export type OrchestrationGatewayRequest =
  | Readonly<{
      schemaVersion: typeof ORCHESTRATION_GATEWAY_SCHEMA_VERSION;
      operation: "execute";
      request: DurableExecutionRequest;
    }>
  | Readonly<{
      schemaVersion: typeof ORCHESTRATION_GATEWAY_SCHEMA_VERSION;
      operation: "status" | "verify";
      idempotencyKey: string;
    }>
  | Readonly<{
      schemaVersion: typeof ORCHESTRATION_GATEWAY_SCHEMA_VERSION;
      operation: "cancel";
      idempotencyKey: string;
      requestedBy: string;
    }>
  | Readonly<{
      schemaVersion: typeof ORCHESTRATION_GATEWAY_SCHEMA_VERSION;
      operation: "list";
      project?: string;
    }>;

export type OrchestrationGatewayResponse = Readonly<{
  schemaVersion: typeof ORCHESTRATION_GATEWAY_SCHEMA_VERSION;
  operation: OrchestrationGatewayRequest["operation"];
  status: "ok" | "rejected";
  code: string;
  record: DurableExecutionRecord | null;
  records: readonly DurableExecutionRecordSummary[] | null;
  fingerprint: DurableExecutionFingerprint | null;
  details: readonly string[];
}>;

export type OrchestrationGateway = Readonly<{
  handle(request: unknown): Promise<OrchestrationGatewayResponse>;
  handleSerialized(serialized: string): Promise<string>;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function response(
  operation: OrchestrationGatewayRequest["operation"],
  status: OrchestrationGatewayResponse["status"],
  code: string,
  values: Partial<
    Pick<
      OrchestrationGatewayResponse,
      "record" | "records" | "fingerprint" | "details"
    >
  > = {},
): OrchestrationGatewayResponse {
  return Object.freeze({
    schemaVersion: ORCHESTRATION_GATEWAY_SCHEMA_VERSION,
    operation,
    status,
    code,
    record: values.record ?? null,
    records: values.records ?? null,
    fingerprint: values.fingerprint ?? null,
    details: Object.freeze([...(values.details ?? [])]),
  });
}

function decodeRequest(value: unknown): OrchestrationGatewayRequest | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== ORCHESTRATION_GATEWAY_SCHEMA_VERSION ||
    !nonEmpty(value.operation)
  ) {
    return null;
  }
  if (value.operation === "execute") {
    if (!isRecord(value.request)) return null;
    const request = value.request;
    if (
      !nonEmpty(request.idempotencyKey) ||
      !nonEmpty(request.project) ||
      !nonEmpty(request.owner) ||
      !Number.isInteger(request.leaseDurationMs) ||
      Number(request.leaseDurationMs) <= 0
    ) {
      return null;
    }
    return Object.freeze({
      schemaVersion: ORCHESTRATION_GATEWAY_SCHEMA_VERSION,
      operation: "execute" as const,
      request: Object.freeze({
        idempotencyKey: request.idempotencyKey,
        project: request.project,
        owner: request.owner,
        leaseDurationMs: Number(request.leaseDurationMs),
      }),
    });
  }
  if (value.operation === "status" || value.operation === "verify") {
    if (!nonEmpty(value.idempotencyKey)) return null;
    return Object.freeze({
      schemaVersion: ORCHESTRATION_GATEWAY_SCHEMA_VERSION,
      operation: value.operation,
      idempotencyKey: value.idempotencyKey,
    });
  }
  if (value.operation === "cancel") {
    if (!nonEmpty(value.idempotencyKey) || !nonEmpty(value.requestedBy)) {
      return null;
    }
    return Object.freeze({
      schemaVersion: ORCHESTRATION_GATEWAY_SCHEMA_VERSION,
      operation: "cancel" as const,
      idempotencyKey: value.idempotencyKey,
      requestedBy: value.requestedBy,
    });
  }
  if (value.operation === "list") {
    if (value.project !== undefined && !nonEmpty(value.project)) return null;
    return Object.freeze({
      schemaVersion: ORCHESTRATION_GATEWAY_SCHEMA_VERSION,
      operation: "list" as const,
      ...(value.project === undefined ? {} : { project: value.project }),
    });
  }
  return null;
}

export function createOrchestrationGateway(
  repository: DurableExecutionRepository,
  controlPlane: DurableExecutionControlPlane,
  dependencies: Readonly<{
    resolveExecuteOptions?: (
      request: DurableExecutionRequest,
    ) => LoopRunExecuteOptions;
  }> = {},
): OrchestrationGateway {
  const resolveExecuteOptions = dependencies.resolveExecuteOptions ?? (() => ({}));

  return Object.freeze({
    async handle(input) {
      const request = decodeRequest(input);
      if (request === null) {
        return response("status", "rejected", "invalid_request", {
          details: ["Gateway request does not match schema version 1."],
        });
      }

      if (request.operation === "execute") {
        const result = await controlPlane.execute(
          request.request,
          resolveExecuteOptions(request.request),
        );
        if (result.outcome.status === "rejected") {
          return response("execute", "rejected", result.outcome.code, {
            record: result.outcome.record,
            details: result.outcome.details,
          });
        }
        return response("execute", "ok", result.outcome.status, {
          record: result.outcome.record,
          fingerprint: result.fingerprint,
        });
      }

      if (request.operation === "status") {
        const record = await repository.load(request.idempotencyKey);
        return record === null
          ? response("status", "rejected", "not_found")
          : response("status", "ok", record.status, { record });
      }

      if (request.operation === "list") {
        const records = await repository.list(request.project);
        return response("list", "ok", "listed", { records });
      }

      if (request.operation === "verify") {
        const valid = await repository.verify(request.idempotencyKey);
        return valid
          ? response("verify", "ok", "integrity_verified")
          : response("verify", "rejected", "integrity_failed");
      }

      if (request.operation === "cancel") {
        const cancellation = await controlPlane.cancel(
          request.idempotencyKey,
          request.requestedBy,
        );
        if (cancellation.status === "rejected") {
          return response("cancel", "rejected", cancellation.code, {
            details: cancellation.details,
          });
        }
        return response("cancel", "ok", cancellation.status, {
          record: cancellation.record,
        });
      }

      return response("status", "rejected", "invalid_request", {
        details: ["Gateway operation could not be resolved."],
      });
    },

    async handleSerialized(serialized) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(serialized) as unknown;
      } catch {
        return JSON.stringify(
          response("status", "rejected", "invalid_json", {
            details: ["Gateway request JSON could not be parsed."],
          }),
        );
      }
      return JSON.stringify(await this.handle(decoded));
    },
  });
}
