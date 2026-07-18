export function sourceIncludesToken(source: string, token: string): boolean {
  const normalizeWhitespace = (value: string): string =>
    value.replace(/\s+/g, "").replace(/,(\)|\])/g, "$1");

  return normalizeWhitespace(source).includes(normalizeWhitespace(token));
}
