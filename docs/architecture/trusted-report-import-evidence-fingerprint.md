# Trusted report import evidence fingerprint

## Purpose

Trusted report import evidence is already bounded, schema-versioned and canonically serializable. This boundary adds a deterministic integrity identifier so storage, transport and orchestration layers can correlate an import decision and detect later evidence drift without retaining the imported execution report.

## Contract

`canonicalizeTrustedLoopExecutionReportImportEvidence(...)` delegates to the validated import-evidence serialization boundary.

`fingerprintTrustedLoopExecutionReportImportEvidence(...)` computes a SHA-256 digest over that canonical UTF-8 payload and returns a frozen fingerprint containing:

- `algorithm: "sha256"`;
- a lowercase 64-character hexadecimal `value`.

`verifyTrustedLoopExecutionReportImportEvidenceFingerprint(...)` rejects unsupported algorithms and malformed digest shapes before comparing the recomputed canonical digest.

## Covered evidence

The fingerprint covers the complete bounded import decision:

1. evidence schema version;
2. accepted or rejected status;
3. trusted run identifier;
4. verified execution-plan fingerprint;
5. stable rejection code;
6. diagnostic count.

Any change to one of those fields changes the fingerprint. The untrusted execution report, malformed payload content and diagnostic text remain excluded.

## Security properties

- invalid evidence fails closed before hashing;
- canonical serialization prevents incidental object-key ordering from changing the digest;
- accepted and rejected decisions cannot share a digest unless their complete canonical payload is identical;
- fingerprints are immutable values suitable for correlation, storage keys and drift detection;
- no provider, filesystem, network, process, environment, clock or random source is consulted.

This fingerprint is an integrity identifier, not producer authentication, a digital signature or proof of origin. A trust boundary that requires authenticity must bind this digest to an authenticated channel or a separate signing mechanism.
