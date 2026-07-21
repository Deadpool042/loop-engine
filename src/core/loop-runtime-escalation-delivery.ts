import {
  serializeLoopRuntimeEscalationProjection,
} from "./loop-runtime-escalation-serialization.js";
import type { LoopRuntimeEscalationPublicProjection } from "./loop.js";

export type LoopRuntimeEscalationProjectionSender = Readonly<{
  send(payload: string): Promise<void>;
}>;

export async function deliverLoopRuntimeEscalationProjection(
  projection: LoopRuntimeEscalationPublicProjection,
  sender: LoopRuntimeEscalationProjectionSender,
): Promise<void> {
  const payload = serializeLoopRuntimeEscalationProjection(projection);
  await sender.send(payload);
}
