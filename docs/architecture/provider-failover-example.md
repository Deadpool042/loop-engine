# Provider failover composition example

A composition root may wrap the existing runner executor port with an ordered provider sequence:

```ts
const executor = createProviderFailoverLoopExecutor(
  (primaryPlan) => [
    { plan: primaryPlan, executor: primaryExecutor },
    { plan: admittedFallbackPlan, executor: fallbackExecutor },
  ],
  { maxAttempts: 2 },
);
```

`admittedFallbackPlan` must be produced from the fallback provider's own registry and policy resolution. It cannot be created by mutating `primaryPlan`, and the fallback executor cannot consume the primary provider's plan.

The returned executor is injected through the existing `LoopRunExecuteOptions.executor` or application assembly dependency. LoopRunner still performs one call across its executor boundary; the bounded failover sequence remains encapsulated behind that port.
