import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { OrchestrationServiceLifecycle } from "./orchestration-service-lifecycle.js";
import type {
  OrchestrationServiceTransport,
  OrchestrationServiceTransportRequest,
} from "./orchestration-service-transport.js";

export type NodeHttpServiceAddress = Readonly<{
  host: string;
  port: number;
}>;

export type NodeHttpServiceAdapterOptions = Readonly<{
  host?: string;
  port?: number;
  maxBodyBytes?: number;
}>;

export type NodeHttpServiceAdapter = Readonly<{
  start(): Promise<NodeHttpServiceAddress>;
  stop(): Promise<void>;
  address(): NodeHttpServiceAddress | null;
}>;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

function writeJson(
  response: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>>,
  body: Readonly<Record<string, unknown>>,
): void {
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return null;
  const serialized = Buffer.concat(chunks).toString("utf8");
  if (serialized.trim().length === 0) return null;
  return JSON.parse(serialized) as unknown;
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

export function createNodeHttpServiceAdapter(
  lifecycle: OrchestrationServiceLifecycle,
  transport: OrchestrationServiceTransport,
  options: NodeHttpServiceAdapterOptions = {},
): NodeHttpServiceAdapter {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (host.trim().length === 0) throw new Error("HTTP service host must be non-empty.");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("HTTP service port must be an integer between 0 and 65535.");
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error("HTTP service body limit must be a positive safe integer.");
  }

  let server: Server | null = null;
  let currentAddress: NodeHttpServiceAddress | null = null;
  let stopping: Promise<void> | null = null;

  const adapter: NodeHttpServiceAdapter = Object.freeze({
    async start(): Promise<NodeHttpServiceAddress> {
      if (currentAddress !== null) return currentAddress;
      if (server !== null) throw new Error("HTTP service is already starting.");

      server = createServer(async (request, response) => {
        try {
          const method = request.method;
          if (method !== "GET" && method !== "POST") {
            writeJson(response, 405, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { error: "method_not_allowed" });
            return;
          }

          let body: unknown = null;
          if (method === "POST") {
            try {
              body = await readBody(request, maxBodyBytes);
            } catch (error) {
              const code = error instanceof Error && error.message === "payload_too_large"
                ? "payload_too_large"
                : "invalid_json";
              writeJson(response, code === "payload_too_large" ? 413 : 400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { error: code });
              return;
            }
          }

          const transportRequest: OrchestrationServiceTransportRequest = Object.freeze({
            method,
            path: new URL(request.url ?? "/", `http://${host}`).pathname,
            body,
          });
          const result = await transport.handle(transportRequest);
          writeJson(response, result.status, result.headers, result.body);
        } catch {
          writeJson(response, 500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { error: "service_transport_failed" });
        }
      });

      const listeningServer = server;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          listeningServer.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          listeningServer.off("error", onError);
          resolve();
        };
        listeningServer.once("error", onError);
        listeningServer.once("listening", onListening);
        listeningServer.listen(port, host);
      });

      const bound = listeningServer.address();
      if (bound === null || typeof bound === "string") {
        await closeServer(listeningServer);
        server = null;
        throw new Error("HTTP service did not expose a TCP address.");
      }

      currentAddress = Object.freeze({ host, port: bound.port });
      return currentAddress;
    },

    async stop(): Promise<void> {
      if (stopping !== null) return stopping;
      if (server === null) {
        lifecycle.stop();
        return;
      }

      lifecycle.beginDrain();
      const activeServer = server;
      stopping = closeServer(activeServer).finally(() => {
        lifecycle.stop();
        server = null;
        currentAddress = null;
        stopping = null;
      });
      return stopping;
    },

    address(): NodeHttpServiceAddress | null {
      return currentAddress;
    },
  });

  return adapter;
}
