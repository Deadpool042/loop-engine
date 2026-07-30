# Execution Report Integrity Gate

## Status

V14.19 — implemented.

## Goal

Execution-plan evidence is useful only when consumers reject malformed, partial or
inconsistent reports. `verifyLoopExecutionReportIntegrity(...)` is the Core
trust-boundary function for execution reports received as `unknown` data.

## Contract

The gate validates:

- execution-report schema version and run identity;
- atomic presence of `executionPlanEvidence` and `executionPlanFingerprint`;
- provider, runtime, effort, capability and permission enum membership;
- bounded budget value structure;
- evidence policy mode and schema version;
- SHA-256 algorithm and 64-character lowercase hexadecimal digest shape;
- cryptographic consistency between canonical evidence and its fingerprint.

Both evidence fields may be absent or `null` for reports where no execute or
commit policy was admitted. A partial pair always fails closed.

## Result

The function returns a discriminated result:

```text
accepted -> typed LoopRunResult
rejected -> stable failure code + redacted details
```

Stable rejection codes distinguish invalid report envelopes, pair mismatch,
invalid evidence, invalid fingerprints and evidence drift.

## Security boundary

```text
unknown report
  -> structural validation
  -> evidence/fingerprint pair validation
  -> canonical SHA-256 verification
  -> accepted typed report | rejected reason
```

The fingerprint is an integrity identifier, not a signature. The gate proves
that the bounded evidence has not drifted relative to its declared digest; it
does not prove who produced the report.
