export function renderSection(title: string): string {
  return `\n${title}\n${"-".repeat(title.length)}`;
}

export function renderKeyValue(key: string, value: string): string {
  return `${key}: ${value}`;
}

export function renderList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
