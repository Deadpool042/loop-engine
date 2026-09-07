import { resolve } from "node:path";

const STATE_DIRECTORY_NAME = "loop-engine";
const LEGACY_STATE_DIRECTORY = ".loop-engine";

/**
 * Resolves process runtime state outside the Git checkout whenever a user
 * state home is available. This keeps execution evidence stable across
 * branch switches, merges, worktree cleanup and repository replacement.
 */
export function resolveLoopEngineStateDirectory(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const xdgStateHome = environment.XDG_STATE_HOME?.trim();
  if (xdgStateHome) {
    return resolve(xdgStateHome, STATE_DIRECTORY_NAME);
  }

  const home = environment.HOME?.trim();
  if (home) {
    return resolve(home, ".local", "state", STATE_DIRECTORY_NAME);
  }

  // Compatibility fallback for constrained environments without HOME.
  return resolve(LEGACY_STATE_DIRECTORY);
}

export function resolveLoopEngineStatePath(
  ...segments: readonly string[]
): string {
  return resolve(resolveLoopEngineStateDirectory(), ...segments);
}

/**
 * Legacy repository-local location used before durable runtime state moved
 * outside Git. Read paths may consult it during migration; new writes must
 * not target it.
 */
export function resolveLegacyLoopEngineStatePath(
  ...segments: readonly string[]
): string {
  return resolve(LEGACY_STATE_DIRECTORY, ...segments);
}
