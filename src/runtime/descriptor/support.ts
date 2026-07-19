export function freezeRuntimeDescriptorValue<T>(value: T): T {
  if (Array.isArray(value)) value.forEach(freezeRuntimeDescriptorValue);
  else if (value && typeof value === "object" && !Object.isFrozen(value)) Object.values(value as Record<string, unknown>).forEach(freezeRuntimeDescriptorValue);
  if (value && typeof value === "object") Object.freeze(value);
  return value;
}
