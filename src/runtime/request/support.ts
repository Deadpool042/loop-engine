export function freezeRuntimeRequestValue<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(freezeRuntimeRequestValue);
  } else if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freezeRuntimeRequestValue);
  }
  if (value && typeof value === "object") Object.freeze(value);
  return value;
}
