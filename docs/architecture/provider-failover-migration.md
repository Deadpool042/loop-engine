# Provider failover adoption

Existing callers remain unchanged. They may continue injecting a single `LoopExecutor`.

To adopt failover, composition wraps that executor with `createProviderFailoverLoopExecutor(...)` and supplies separately admitted fallback plan/executor pairs. No LoopRunner API or CLI mode changes are required.
