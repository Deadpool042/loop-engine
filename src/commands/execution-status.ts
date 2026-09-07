import type { LoopApplicationAssembly } from "../composition/index.js";

export async function printExecutionStatusJson(
  application: LoopApplicationAssembly,
  project: string,
): Promise<void> {
  console.log(
    JSON.stringify(await application.generateExecutionStatusReport(project)),
  );
}
