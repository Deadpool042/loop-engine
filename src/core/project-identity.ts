/**
 * Canonical project identity (L7.1 / E6).
 *
 * Single definition of the registry project-name rule and of the registry-wide
 * identity validation. Pure and deterministic: no filesystem, no environment.
 *
 * The registry is a tombstone ledger: archived and retired entries keep their
 * name reserved, so uniqueness is checked over EVERY entry, whatever its flags.
 */

export const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const MAX_REPORTED_VALUE_LENGTH = 64;

export function isValidProjectName(value: unknown): value is string {
  return typeof value === "string" && PROJECT_NAME_PATTERN.test(value);
}

function describeValue(value: unknown): string {
  if (typeof value !== "string") return `<${typeof value}>`;
  const shown =
    [...value].length > MAX_REPORTED_VALUE_LENGTH
      ? `${[...value].slice(0, MAX_REPORTED_VALUE_LENGTH).join("")}…`
      : value;
  // Escape everything outside printable ASCII so the message cannot carry
  // bidirectional, zero-width or line-separator characters into logs.
  return JSON.stringify(shown).replace(
    /[^\x20-\x7e]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Fails closed when any registry entry has a non-conforming name or when a name
 * appears more than once (archived and retired entries included).
 */
export function assertValidProjectRegistry(projects: readonly unknown[]): void {
  const invalid: string[] = [];
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  projects.forEach((entry, index) => {
    const name =
      typeof entry === "object" && entry !== null
        ? (entry as { name?: unknown }).name
        : undefined;
    if (!isValidProjectName(name)) {
      invalid.push(`#${index} ${describeValue(name)}`);
      return;
    }
    if (seen.has(name)) duplicated.add(name);
    seen.add(name);
  });

  const problems: string[] = [];
  if (invalid.length > 0) {
    problems.push(`non-conforming project names: ${invalid.join(", ")}`);
  }
  if (duplicated.size > 0) {
    problems.push(
      `duplicated project names: ${[...duplicated]
        .sort()
        .map((name) => JSON.stringify(name))
        .join(", ")}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`Invalid project registry: ${problems.join("; ")}.`);
  }
}
