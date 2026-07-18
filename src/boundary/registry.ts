import type { BoundaryHandoffRegistry } from "./types.js";
import {
  ClaudeBoundaryHandoffFixture,
  CodexBoundaryHandoffFixture,
  freezeBoundaryHandoffValue,
  OpenClawBoundaryHandoffFixture,
} from "./support.js";

export const BOUNDARY_HANDOFF_REGISTRY: BoundaryHandoffRegistry =
  freezeBoundaryHandoffValue([
    OpenClawBoundaryHandoffFixture,
    ClaudeBoundaryHandoffFixture,
    CodexBoundaryHandoffFixture,
  ]);

export function listBoundaryHandoffs(): BoundaryHandoffRegistry {
  return BOUNDARY_HANDOFF_REGISTRY;
}
