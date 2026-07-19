export function freezeRuntimeResolutionValue<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(freezeRuntimeResolutionValue);
  } else if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freezeRuntimeResolutionValue);
  }
  if (value && typeof value === "object") Object.freeze(value);
  return value;
}
