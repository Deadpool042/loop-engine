# Provider failover review checklist

- [ ] Every fallback has its own admitted `LoopExecutionPlan`.
- [ ] Attempt one preserves the runner-admitted primary plan.
- [ ] Provider ids are unique and ordered.
- [ ] The attempt budget is positive and globally bounded.
- [ ] Only reviewed failure codes are recoverable.
- [ ] Provider diagnostics remain redacted.
- [ ] No provider is invoked concurrently.
- [ ] No commit or publication behavior is introduced.
