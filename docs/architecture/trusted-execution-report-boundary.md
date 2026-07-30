# Trusted Execution Report Boundary

## Status

V14.20 — implemented.

## Goal

Execution reports received from storage, transport or adapter boundaries must remain
untrusted data until one deterministic Core entry point validates their structure and
execution-plan integrity.

## Boundary

`importTrustedLoopExecutionReport(...)` accepts `unknown` and delegates to
`verifyLoopExecutionReportIntegrity(...)`. A typed `LoopRunResult` is returned only
when the integrity gate accepts the report.

`parseTrustedLoopExecutionReport(...)` additionally handles serialized JSON. Parsing
errors are converted into the stable `invalid_json` rejection code; raw parser
exceptions and untrusted payload contents are not exposed.

```text
external bytes / unknown value
  -> parseTrustedLoopExecutionReport(...) or importTrustedLoopExecutionReport(...)
  -> verifyLoopExecutionReportIntegrity(...)
  -> accepted LoopRunResult | stable rejection
```

## Invariants

- evidence and fingerprint remain an atomic pair;
- malformed JSON fails closed without throwing across the boundary;
- integrity rejection codes are preserved for consumers;
- no unchecked cast is exposed to storage, transport or adapter callers;
- the boundary does not claim authenticity or signature verification.

Consumers importing reports should depend on this facade rather than invoking JSON
parsing and integrity verification as separate operations.
