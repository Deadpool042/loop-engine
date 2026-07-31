import type {
  OrchestrationServiceLifecycle,
  OrchestrationServiceSnapshot,
} from "./orchestration-service-lifecycle.js";

export const ORCHESTRATION_SERVICE_API_VERSION = "v1" as const;

export type OrchestrationServiceTransportRequest = Readonly<{
  method: "GET" | "POST";
  path: string;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}>;

export type OrchestrationServiceTransportResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
}>;

export type OrchestrationServiceExecutionHandler = Readonly<{
  execute(payload: unknown): Promise<Readonly<Record<string, unknown>>>;
}>;

export type OrchestrationServiceTransport = Readonly<{
  handle(
    request: OrchestrationServiceTransportRequest,
  ): Promise<OrchestrationServiceTransportResponse>;
}>;

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
): OrchestrationServiceTransportResponse {
  return Object.freeze({ status, headers: JSON_HEADERS, body: Object.freeze(body) });
}

function probeBody(
  kind: "health" | "readiness",
  snapshot: OrchestrationServiceSnapshot,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    apiVersion: ORCHESTRATION_SERVICE_API_VERSION,
    kind,
    state: snapshot.state,
    healthy: snapshot.healthy,
    ready: snapshot.ready,
    acceptingWork: snapshot.acceptingWork,
    activeRequests: snapshot.activeRequests,
    dependencies: snapshot.dependencies,
    failureCode: snapshot.failureCode,
  });
}

function admissionStatus(reason: string): number {
  if (reason === "draining" || reason === "not_ready") return 503;
  if (reason === "stopped") return 410;
  return 500;
}

export function createOrchestrationServiceTransport(
  lifecycle: OrchestrationServiceLifecycle,
  execution: OrchestrationServiceExecutionHandler,
): OrchestrationServiceTransport {
  return Object.freeze({
    async handle(
      request: OrchestrationServiceTransportRequest,
    ): Promise<OrchestrationServiceTransportResponse> {
      if (request.method === "GET" && request.path === "/healthz") {
        const snapshot = lifecycle.snapshot();
        return response(snapshot.healthy ? 200 : 503, probeBody("health", snapshot));
      }

      if (request.method === "GET" && request.path === "/readyz") {
        const snapshot = lifecycle.snapshot();
        return response(snapshot.ready ? 200 : 503, probeBody("readiness", snapshot));
      }

      if (request.method === "POST" && request.path === "/v1/executions") {
        const admission = lifecycle.admit();
        if (!admission.admitted) {
          return response(admissionStatus(admission.reason), {
            apiVersion: ORCHESTRATION_SERVICE_API_VERSION,
            error: admission.reason,
          });
        }

        try {
          const result = await execution.execute(request.body);
          return response(202, {
            apiVersion: ORCHESTRATION_SERVICE_API_VERSION,
            accepted: true,
            result,
          });
        } catch {
          return response(500, {
            apiVersion: ORCHESTRATION_SERVICE_API_VERSION,
            error: "execution_failed",
          });
        } finally {
          admission.release();
        }
      }

      return response(404, {
        apiVersion: ORCHESTRATION_SERVICE_API_VERSION,
        error: "route_not_found",
      });
    },
  });
}
