# Provider failover security boundary

Provider failover evidence is intentionally bounded. It records stable execution identity and failure codes only.

The following data must never be copied into failover evidence:

- prompts or generated responses;
- context package contents;
- provider stdout or stderr;
- thrown exception messages or stacks;
- credentials, tokens or environment variables;
- provider request or response payloads;
- validation diagnostic text beyond the stable `LoopRunFailure` contract.

A thrown executor exception is represented as `provider_executor_exception` with a fixed redacted detail. Recoverability remains false unless a reviewed classifier explicitly admits that code.
