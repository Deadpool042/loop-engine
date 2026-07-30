# Provider failover evidence pipeline

## Purpose

V14.26 makes provider failover observable without exposing provider diagnostics. The application-level failover executor now returns the same `LoopExecutorResult` contract plus optional bounded `providerFailoverEvidence`.

Single-provider executors remain unchanged and do not need to manufacture evidence.

## Evidence boundary

The evidence contains only:

- schema version and global attempt limit;
- ordered provider ids actually attempted;
- selected provider, or `null`;
- attempt number;
- provider, runtime, profile and model identity;
- completed or failed status;
- stable failure code;
- recoverability decision.

It excludes prompts, context contents, generated output, stdout, stderr, stack traces, credentials and provider request payloads.

## Composition

`createLoopProviderFailoverAssembly(...)` uses `createEvidenceAwareProviderFailoverLoopExecutor(...)`. The composition root therefore preserves evidence automatically whenever more than one reviewed provider assembly is configured.

The original `createProviderFailoverLoopExecutor(...)` remains available as a compatibility facade for callers that intentionally need only the executor result.

## Integrity

`canonicalizeLoopProviderFailoverEvidence(...)` serializes every bounded field in a fixed order. `fingerprintLoopProviderFailoverEvidence(...)` computes a SHA-256 digest over that canonical representation, and `verifyLoopProviderFailoverEvidenceFingerprint(...)` rejects unsupported algorithms, malformed digests and any evidence drift.

The digest is an integrity identifier, not a signature. It provides no authenticity guarantee by itself.

## Guarantees

- failover evidence survives the application executor boundary;
- mono-provider behavior remains additive and compatible;
- evidence is immutable and bounded;
- provider exception text remains redacted;
- canonical fingerprints detect selected-provider, attempt-order, identity, status and failure-classification drift;
- no commit, publication or credential behavior is introduced.
