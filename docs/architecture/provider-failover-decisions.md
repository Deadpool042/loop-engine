# Provider failover decisions

## Sequential rather than concurrent

Concurrent provider execution could duplicate worktree effects and makes winner selection nondeterministic. V14.24 uses strict ordered attempts.

## Provider uniqueness

A provider id may occur once per sequence. This prevents loops and repeated side effects under a different model label from the same provider.

## Terminal by default

Unknown failures are terminal. Availability failures are the only default recoverable class. This is fail-closed and prevents policy, validation or integrity failures from being bypassed by changing providers.

## Existing runner port

Failover is exposed as a `LoopExecutor` facade rather than a second runner path. This preserves the single runner effect boundary and avoids duplicating planning, validation and repair logic.
