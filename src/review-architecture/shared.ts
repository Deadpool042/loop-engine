export type ReviewArchitectureErrorShape<
  Code extends string,
  Details extends Readonly<Record<string, unknown>>,
> = Readonly<{
  code: Code;
  message: string;
  details: Details;
  executionStarted: false;
}>;

export type ReviewArchitectureDiagnosticShape<
  Code extends string,
  Details extends Readonly<Record<string, unknown>>,
> = Readonly<{
  code: Code;
  message: string;
  details: Details;
}>;

export type ReviewArchitectureValidationShape<
  Error extends ReviewArchitectureErrorShape<
    string,
    Readonly<Record<string, unknown>>
  >,
  Diagnostic extends ReviewArchitectureDiagnosticShape<
    string,
    Readonly<Record<string, unknown>>
  >,
> = Readonly<{
  valid: boolean;
  diagnostics: readonly Diagnostic[];
  error?: Error;
}>;

export function freezeReviewArchitectureValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeReviewArchitectureValue(child);
  }
  return Object.freeze(value);
}

export function readReviewArchitectureMetadataString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function reviewArchitectureMetadataVersionCompatible(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
  expected: string,
): boolean {
  const declared = readReviewArchitectureMetadataString(metadata, key);
  return declared === null || declared === expected;
}

export function reviewArchitectureMetadataVersionMismatch(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
  expected: string,
): boolean {
  return !reviewArchitectureMetadataVersionCompatible(metadata, key, expected);
}

export function countReviewArchitectureItems<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
): number {
  return items.filter(predicate).length;
}

export function createReviewArchitectureError<
  Code extends string,
  Details extends Readonly<Record<string, unknown>>,
>(
  code: Code,
  message: string,
  details: Details,
): ReviewArchitectureErrorShape<Code, Details> {
  return freezeReviewArchitectureValue({
    code,
    message,
    details,
    executionStarted: false,
  });
}

export function diagnosticFromReviewArchitectureError<
  Code extends string,
  Details extends Readonly<Record<string, unknown>>,
>(
  error: ReviewArchitectureErrorShape<Code, Details>,
): ReviewArchitectureDiagnosticShape<Code, Details> {
  return freezeReviewArchitectureValue({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createReviewArchitectureValidation<
  Error extends ReviewArchitectureErrorShape<
    string,
    Readonly<Record<string, unknown>>
  >,
  Diagnostic extends ReviewArchitectureDiagnosticShape<
    string,
    Readonly<Record<string, unknown>>
  >,
>(
  error: Error | undefined,
  diagnosticFromError: (error: Error) => Diagnostic,
): ReviewArchitectureValidationShape<Error, Diagnostic> {
  if (error === undefined) {
    return freezeReviewArchitectureValue({
      valid: true,
      diagnostics: freezeReviewArchitectureValue([]),
    });
  }
  const diagnostic = diagnosticFromError(error);
  return freezeReviewArchitectureValue({
    valid: false,
    diagnostics: freezeReviewArchitectureValue([diagnostic]),
    error,
  });
}
