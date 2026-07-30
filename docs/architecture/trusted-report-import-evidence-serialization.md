# Trusted report import evidence serialization

## Purpose

Trusted report import evidence is intentionally small and payload-free. This boundary makes that evidence safe to store or transport without relying on unchecked `JSON.parse` casts.

## Contract

`serializeTrustedLoopExecutionReportImportEvidence(...)` emits a compact JSON object in a fixed field order:

1. `schemaVersion`
2. `status`
3. `runId`
4. `executionPlanFingerprint`
5. `rejectionCode`
6. `detailCount`

`importTrustedLoopExecutionReportImportEvidence(...)` accepts `unknown` and validates the complete status-dependent contract. `parseTrustedLoopExecutionReportImportEvidence(...)` contains JSON parsing failures and routes decoded values through the same validator.

Accepted evidence requires a non-empty trusted run identifier, no rejection code, zero diagnostics and either no fingerprint or a canonical SHA-256 fingerprint. Rejected evidence requires null trusted identifiers and fingerprint, a non-empty stable rejection code and a non-negative safe diagnostic count.

## Security properties

- malformed JSON never escapes as an exception;
- inconsistent status-dependent fields fail closed;
- malformed or unsupported fingerprints fail closed;
- imported objects and nested fingerprints are frozen;
- serialization never includes an execution report, untrusted payload or diagnostic text;
- deterministic key ordering permits stable fixtures and downstream hashing.

This boundary validates deterministic integrity metadata. It does not authenticate a producer and is not a digital-signature mechanism.
