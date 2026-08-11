import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import {
  closeWorkspaceSummaryServer,
  createWorkspaceSummaryServer,
  parseWorkspaceSummaryServerOptions,
  type SummaryBridgeApplication,
  type SummaryServerOptions,
} from "../../src/commands/serve-summary.js";

const servers: import("node:http").Server[] = [];

const summary = Object.freeze({ schemaVersion: 1, projects: [] });
let summaryCalls = 0;

const application = {
  loadConfig() {
    return Object.freeze({});
  },
  generateWorkspaceSummaryReport() {
    summaryCalls += 1;
    return summary;
  },
} as unknown as SummaryBridgeApplication;

async function listen(options: SummaryServerOptions): Promise<string> {
  const server = createWorkspaceSummaryServer(application, options);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  summaryCalls = 0;
  await Promise.all(
    servers.splice(0).map((server) => closeWorkspaceSummaryServer(server)),
  );
});

describe("workspace summary bridge configuration", () => {
  it("uses loopback defaults", () => {
    assert.deepEqual(parseWorkspaceSummaryServerOptions({}), {
      host: "127.0.0.1",
      port: 4174,
    });
  });

  it("rejects an empty host and non-strict ports", () => {
    assert.throws(
      () => parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_HOST: "  " }),
      /LOOP_SUMMARY_HOST/,
    );

    for (const port of ["", "0", "-1", "1.5", "4174x", "65536"]) {
      assert.throws(
        () => parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_PORT: port }),
        /LOOP_SUMMARY_PORT/,
      );
    }

    for (const port of ["1", "4174", "65535"]) {
      assert.equal(
        parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_PORT: port }).port,
        Number(port),
      );
    }
  });

  it("allows loopback without a token and requires a non-blank token elsewhere", () => {
    assert.equal(
      parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_HOST: "localhost" })
        .token,
      undefined,
    );
    assert.equal(
      parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_HOST: "::1" }).token,
      undefined,
    );
    assert.throws(
      () => parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_HOST: "0.0.0.0" }),
      /LOOP_SUMMARY_TOKEN/,
    );
    assert.throws(
      () =>
        parseWorkspaceSummaryServerOptions({
          LOOP_SUMMARY_HOST: "0.0.0.0",
          LOOP_SUMMARY_TOKEN: "  ",
        }),
      /LOOP_SUMMARY_TOKEN/,
    );
    assert.throws(
      () => parseWorkspaceSummaryServerOptions({ LOOP_SUMMARY_TOKEN: "  " }),
      /LOOP_SUMMARY_TOKEN/,
    );
    assert.deepEqual(
      parseWorkspaceSummaryServerOptions({
        LOOP_SUMMARY_HOST: "0.0.0.0",
        LOOP_SUMMARY_TOKEN: "bridge-token",
      }),
      { host: "0.0.0.0", port: 4174, token: "bridge-token" },
    );
  });
});

describe("workspace summary bridge HTTP boundary", () => {
  it("serves health and the existing summary contract on loopback", async () => {
    const baseUrl = await listen({ host: "127.0.0.1", port: 4174 });

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const response = await fetch(`${baseUrl}/summary`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), summary);
    assert.equal(summaryCalls, 1);
  });

  it("requires bearer authentication for every route when a token is configured", async () => {
    const baseUrl = await listen({
      host: "0.0.0.0",
      port: 4174,
      token: "bridge-token",
    });

    for (const path of ["/healthz", "/summary"]) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 401);
      assert.equal(
        (
          await fetch(`${baseUrl}${path}`, {
            headers: { authorization: "Bearer wrong-token" },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(`${baseUrl}${path}`, {
            headers: { authorization: "Bearer bridge-token" },
          })
        ).status,
        200,
      );
    }
  });

  it("keeps an allow-list with no write routes", async () => {
    const baseUrl = await listen({ host: "127.0.0.1", port: 4174 });

    for (const [method, path, status] of [
      ["GET", "/unknown", 404],
      ["GET", "/context", 404],
      ["GET", "/review", 404],
      ["GET", "/next", 404],
      ["GET", "/prompt", 404],
      ["GET", "/run", 404],
      ["GET", "/audit", 404],
      ["POST", "/summary", 405],
      ["PUT", "/summary", 405],
      ["PATCH", "/summary", 405],
      ["DELETE", "/summary", 405],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, status, `${method} ${path}`);
    }

    assert.equal(summaryCalls, 0);
  });

  it("redacts summary failures", async () => {
    const failingApplication = {
      loadConfig() {
        throw new Error("secret details must not leave the process");
      },
      generateWorkspaceSummaryReport() {
        return summary;
      },
    } as unknown as SummaryBridgeApplication;
    const server = createWorkspaceSummaryServer(failingApplication, {
      host: "127.0.0.1",
      port: 4174,
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/summary`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "summary_failed" });
  });

  it("closes a listening server directly", async () => {
    const server = createWorkspaceSummaryServer(application, {
      host: "127.0.0.1",
      port: 4174,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    await closeWorkspaceSummaryServer(server);
    assert.equal(server.listening, false);
  });
});
