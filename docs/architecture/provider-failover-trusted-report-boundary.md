# Trusted provider failover report boundary

## Purpose

V14.28 extends the existing trusted execution-report import boundary to provider failover evidence. A report received from storage, transport or another adapter remains untrusted until both evidence families pass their integrity gates.

## Atomic evidence pair

`providerFailoverEvidence` and `providerFailoverFingerprint` are atomic:

- both absent or `null` is valid for mono-provider reports;
- both present is required for failover reports;
- a partial pair is rejected before the report crosses the Core boundary.

## Structural validation

The failover evidence gate validates schema version, positive global attempt bound, ordered provider ids, attempt identity, status, stable failure code and recoverability fields. Fingerprints must use the canonical SHA-256 algorithm and a lowercase 64-character digest.

## Semantic validation

Cryptographic consistency alone is insufficient. The boundary also enforces:

- attempt count does not exceed `maxAttempts`;
- attempt numbers are contiguous and one-based;
- `attemptedProviders` exactly mirrors attempt order;
- providers are unique;
- only a recoverable failed attempt may admit another provider;
- no attempt follows a completed attempt;
- a completed attempt has no failure code and is not recoverable;
- a failed attempt has a stable failure code;
- at most one provider completes;
- `selectedProvider` identifies that completion, otherwise it is `null`.

## Trusted import

`importTrustedLoopExecutionReport(...)` first applies the historical execution-plan report integrity gate, then applies provider failover integrity. `parseTrustedLoopExecutionReport(...)` routes decoded JSON through the same fail-closed sequence.

No external report is accepted merely because its JSON parses or its digest has the correct shape.

## Security guarantees

The trusted boundary does not add prompts, context contents, generated output, provider stdout or stderr, exception messages, credentials or provider payloads. It validates only the bounded redacted evidence contract.

The SHA-256 digest detects drift but is not an authenticity signature. Authenticity still depends on the storage or transport trust model.
