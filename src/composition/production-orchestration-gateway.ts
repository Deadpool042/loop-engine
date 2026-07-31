import type { LoopRunExecuteOptions } from "../loop/execute-runner.js";
import {
  createFileDurableExecutionStore,
  type FileDurableExecutionStoreOptions,
} from "../loop/file-durable-execution-store.js";
import {
  createDurableExecutionControlPlane,
  type DurableExecutionControlPlane,
} from "./durable-execution-control-plane.js";
import type { LoopApplicationAssembly } from "./application-assembly.js";
import {
  createOrchestrationGateway,
  type OrchestrationGateway,
} from "./orchestration-gateway.js";

export type ProductionOrchestrationGateway = Readonly<{
  gateway: OrchestrationGateway;
  controlPlane: DurableExecutionControlPlane;
  directory: string;
}>;

export function createProductionOrchestrationGateway(
  application: LoopApplicationAssembly,
  options: FileDurableExecutionStoreOptions,
): ProductionOrchestrationGateway {
  const repository = createFileDurableExecutionStore(options);
  const controlPlane = createDurableExecutionControlPlane(repository, {
    runLoopExecute: application.runLoopExecute,
  });
  const executionOptions: LoopRunExecuteOptions = Object.freeze({
    ...(application.loopExecutor === undefined
      ? {}
      : { executor: application.loopExecutor }),
    ...(application.loopAgentRegistry === undefined
      ? {}
      : { agentRegistry: application.loopAgentRegistry }),
  });
  const gateway = createOrchestrationGateway(repository, controlPlane, {
    resolveExecuteOptions: () => executionOptions,
  });

  return Object.freeze({
    gateway,
    controlPlane,
    directory: options.directory,
  });
}
