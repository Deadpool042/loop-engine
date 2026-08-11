import { createServer, type Server, type ServerResponse } from "node:http";

import type { LoopApplicationAssembly } from "../composition/index.js";

export type SummaryBridgeApplication = Pick<
  LoopApplicationAssembly,
  "loadConfig" | "generateWorkspaceSummaryReport"
>;

export type SummaryServerOptions = Readonly<{
  host: string;
  port: number;
  token?: string;
}>;

export type SummaryBridgeSignalSource = {
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
  exitCode?: number | string | null | undefined;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("LOOP_SUMMARY_PORT must be an integer between 1 and 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LOOP_SUMMARY_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function normalizeOptions(options: SummaryServerOptions): SummaryServerOptions {
  const host = options.host.trim();
  if (host.length === 0) {
    throw new Error("LOOP_SUMMARY_HOST must be a non-empty string.");
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error("LOOP_SUMMARY_PORT must be an integer between 1 and 65535.");
  }

  const token = options.token?.trim();
  if (options.token !== undefined && token?.length === 0) {
    throw new Error("LOOP_SUMMARY_TOKEN must not be blank when provided.");
  }
  if (!isLoopbackHost(host) && token === undefined) {
    throw new Error(
      "LOOP_SUMMARY_TOKEN is required when LOOP_SUMMARY_HOST is not loopback.",
    );
  }

  return Object.freeze({
    host,
    port: options.port,
    ...(token === undefined ? {} : { token }),
  });
}

export function parseWorkspaceSummaryServerOptions(
  environment: NodeJS.ProcessEnv = process.env,
): SummaryServerOptions {
  const host = (environment.LOOP_SUMMARY_HOST ?? DEFAULT_HOST).trim();
  const token = environment.LOOP_SUMMARY_TOKEN;
  return normalizeOptions({
    host,
    port: parsePort(environment.LOOP_SUMMARY_PORT),
    ...(token === undefined ? {} : { token }),
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function isAuthorized(authorization: string | undefined, token: string | undefined): boolean {
  return token === undefined || authorization === `Bearer ${token}`;
}

export function createWorkspaceSummaryServer(
  application: SummaryBridgeApplication,
  options: SummaryServerOptions,
): Server {
  const normalized = normalizeOptions(options);

  return createServer((request, response) => {
    if (request.method !== "GET") {
      writeJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/healthz" && path !== "/summary") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    if (!isAuthorized(request.headers.authorization, normalized.token)) {
      writeJson(response, 401, { error: "unauthorized" });
      return;
    }

    if (path === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    try {
      writeJson(
        response,
        200,
        application.generateWorkspaceSummaryReport(application.loadConfig()),
      );
    } catch {
      writeJson(response, 500, { error: "summary_failed" });
    }
  });
}

export function closeWorkspaceSummaryServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

export function installWorkspaceSummaryServerSignalHandlers(
  server: Server,
  source: SummaryBridgeSignalSource = process,
): () => void {
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    void closeWorkspaceSummaryServer(server).then(
      () => {
        source.exitCode = 0;
      },
      () => {
        source.exitCode = 1;
      },
    );
  };

  source.once("SIGINT", shutdown);
  source.once("SIGTERM", shutdown);
  return () => {
    source.off("SIGINT", shutdown);
    source.off("SIGTERM", shutdown);
  };
}

export function startWorkspaceSummaryServer(
  application: SummaryBridgeApplication,
  environment: NodeJS.ProcessEnv = process.env,
): Server {
  const options = parseWorkspaceSummaryServerOptions(environment);
  const server = createWorkspaceSummaryServer(application, options);
  installWorkspaceSummaryServerSignalHandlers(server);
  server.listen(options.port, options.host, () => {
    console.log(
      `Loop Engine summary bridge listening on http://${options.host}:${options.port}`,
    );
  });
  return server;
}
