export type OrchestrationServiceConfiguration = Readonly<{
  host: string;
  port: number;
  maxBodyBytes: number;
}>;

export type OrchestrationServiceEnvironment = Readonly<Record<string, string | undefined>>;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function loadOrchestrationServiceConfiguration(
  environment: OrchestrationServiceEnvironment,
): OrchestrationServiceConfiguration {
  const host = environment.LOOP_SERVICE_HOST ?? DEFAULT_HOST;
  if (host.trim().length === 0) {
    throw new Error("LOOP_SERVICE_HOST must be non-empty.");
  }

  return Object.freeze({
    host: host.trim(),
    port: parseInteger(
      environment.LOOP_SERVICE_PORT,
      DEFAULT_PORT,
      "LOOP_SERVICE_PORT",
      0,
      65_535,
    ),
    maxBodyBytes: parseInteger(
      environment.LOOP_SERVICE_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      "LOOP_SERVICE_MAX_BODY_BYTES",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  });
}
