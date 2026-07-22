/**
 * Deterministic registry primitives shared by internal architectural modules.
 * They only preserve declaration order and immutable entries; policy,
 * selection, and domain-specific registry shapes stay in their own layers.
 */
export function createStaticRegistryEntries<T>(
  entries: readonly T[],
  identifier: (entry: T) => string,
  duplicateMessage: (id: string) => string,
): readonly T[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = identifier(entry);
    if (ids.has(id)) throw new Error(duplicateMessage(id));
    ids.add(id);
  }

  return Object.freeze([...entries]);
}

export function findStaticRegistryEntry<T>(
  entries: readonly T[],
  id: string,
  identifier: (entry: T) => string,
): T | null {
  return entries.find((entry) => identifier(entry) === id) ?? null;
}
