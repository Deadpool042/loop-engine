import type {
  BoundaryHandoff,
  BoundaryHandoffResolution,
  BoundaryHandoffSelection,
} from "./types.js";
import {
  createBoundaryHandoffError,
  diagnosticFromBoundaryHandoffError,
} from "./errors.js";
import { freezeBoundaryHandoffValue } from "./support.js";
import { BOUNDARY_HANDOFF_REGISTRY } from "./registry.js";

export function selectBoundaryHandoff(id: string): BoundaryHandoffSelection {
  const handoff = BOUNDARY_HANDOFF_REGISTRY.find((item) => item.id === id);
  return freezeBoundaryHandoffValue({
    id,
    supported: handoff !== undefined,
    reason: handoff ? "supported" : "handoff_not_supported",
    executionStarted: false,
  });
}

export function resolveBoundaryHandoff(id: string): BoundaryHandoffResolution {
  const selection = selectBoundaryHandoff(id);
  const handoff: BoundaryHandoff | null =
    BOUNDARY_HANDOFF_REGISTRY.find((item) => item.id === id) ?? null;
  const diagnostics =
    handoff === null
      ? [
          diagnosticFromBoundaryHandoffError(
            createBoundaryHandoffError(
              "handoff_not_supported",
              "BoundaryHandoff is not supported by the static registry.",
              { id },
            ),
          ),
        ]
      : [];
  return freezeBoundaryHandoffValue({
    selection,
    handoff,
    diagnostics: freezeBoundaryHandoffValue(diagnostics),
    executionStarted: false,
  });
}
