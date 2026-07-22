import type { LoopRuntimeEscalationPublicProjection } from "./loop.js";

export function serializeLoopRuntimeEscalationProjection(
  projection: LoopRuntimeEscalationPublicProjection,
): string {
  const { schemaVersion, ...rest } = projection;

  return JSON.stringify({
    schemaVersion,
    ...rest,
  });
}
