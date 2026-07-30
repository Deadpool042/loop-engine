# Trusted report import evidence

## Purpose

The trusted execution-report boundary accepts or rejects untrusted report data. Consumers may need to record that decision without retaining or redistributing the received payload.

`createTrustedLoopExecutionReportImportEvidence(...)` projects the boundary result into a small, schema-versioned evidence object.

## Accepted imports

Accepted evidence contains only the trusted `runId` and, when present, the already-verified execution-plan fingerprint. It does not copy the report body, steps, context, policy rationale, failure messages or modified-file inventory.

## Rejected imports

Rejected evidence contains the stable rejection code and the number of diagnostic details. The original input and diagnostic text are deliberately excluded, preventing malformed or sensitive payload content from crossing the reporting boundary.

## Guarantees

- deterministic and side-effect free;
- schema version `1`;
- frozen top-level result;
- bounded field set;
- no clock, random identifier, filesystem or network dependency;
- no claim of authenticity or digital signature.
