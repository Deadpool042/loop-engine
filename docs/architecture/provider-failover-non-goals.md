# Provider failover non-goals

V14.24 does not introduce provider races, speculative execution, automatic plan mutation, unbounded retries, publication, implicit commits, credential handling or a second concrete provider adapter.

It establishes the deterministic orchestration contract required before additional provider adapters can be safely assembled.
