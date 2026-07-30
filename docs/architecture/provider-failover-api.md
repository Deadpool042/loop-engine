# Provider failover API

- `executeLoopProviderFailover(options)` returns executor result plus bounded evidence.
- `createProviderFailoverLoopExecutor(resolveAttempts, options)` adapts failover to the existing runner executor port.
- `LoopProviderFailoverAttempt` binds one admitted plan to one executor.
- `LoopProviderFailureClassifier` decides whether a stable failure permits the next attempt.
- `LoopProviderFailoverEvidence` records ordered, redacted attempt outcomes.
