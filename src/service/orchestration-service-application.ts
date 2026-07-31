import {
  createNodeHttpServiceAdapter,
  type NodeHttpServiceAdapter,
  type NodeHttpServiceAddress,
} from "./node-http-service-adapter.js";
import {
  createOrchestrationServiceLifecycle,
  type OrchestrationServiceLifecycle,
} from "./orchestration-service-lifecycle.js";
import {
  createOrchestrationServiceTransport,
  type OrchestrationServiceExecutionHandler,
} from "./orchestration-service-transport.js";
import type { OrchestrationServiceConfiguration } from "./orchestration-service-configuration.js";

export type OrchestrationServiceDependencies = Readonly<{
  persistenceReady(): Promise<boolean>;
  workerReady(): Promise<boolean>;
  execution: OrchestrationServiceExecutionHandler;
}>;

export type OrchestrationServiceApplication = Readonly<{
  lifecycle: OrchestrationServiceLifecycle;
  start(): Promise<NodeHttpServiceAddress>;
  stop(): Promise<void>;
}>;

export function createOrchestrationServiceApplication(
  configuration: OrchestrationServiceConfiguration,
  dependencies: OrchestrationServiceDependencies,
): OrchestrationServiceApplication {
  const lifecycle = createOrchestrationServiceLifecycle();
  const transport = createOrchestrationServiceTransport(
    lifecycle,
    dependencies.execution,
  );
  const adapter: NodeHttpServiceAdapter = createNodeHttpServiceAdapter(
    lifecycle,
    transport,
    configuration,
  );

  let starting: Promise<NodeHttpServiceAddress> | null = null;

  return Object.freeze({
    lifecycle,
    async start(): Promise<NodeHttpServiceAddress> {
      if (starting !== null) return starting;
      starting = (async () => {
        const [persistence, worker] = await Promise.all([
          dependencies.persistenceReady(),
          dependencies.workerReady(),
        ]);
        lifecycle.updateDependencies({ persistence, worker });
        if (!persistence || !worker) {
          lifecycle.fail(!persistence ? "persistence_unavailable" : "worker_unavailable");
          throw new Error("Orchestration service dependencies are not ready.");
        }
        try {
          return await adapter.start();
        } catch (error) {
          lifecycle.fail("http_start_failed");
          throw error;
        }
      })();
      return starting;
    },
    async stop(): Promise<void> {
      await adapter.stop();
    },
  });
}

export type OrchestrationServiceSignalSource = Readonly<{
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
}>;

export function installOrchestrationServiceSignalHandlers(
  application: Pick<OrchestrationServiceApplication, "stop">,
  source: OrchestrationServiceSignalSource,
): () => void {
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    void application.stop();
  };
  source.once("SIGINT", shutdown);
  source.once("SIGTERM", shutdown);
  return () => {
    source.off("SIGINT", shutdown);
    source.off("SIGTERM", shutdown);
  };
}
