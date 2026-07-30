# Multi-provider application failover

## Purpose

V14.25 integrates the bounded provider failover contract into the application composition root. The application may now receive an ordered set of reviewed `LoopProviderAssembly` values and expose one combined executor and one combined agent registry to LoopRunner.

This is the operational composition layer missing from V14.24. The runner still calls one `LoopExecutor`; provider switching remains encapsulated behind that port.

## Configuration modes

The application supports three mutually exclusive states:

1. no provider configuration: planning and read-only commands remain available;
2. one provider configuration: historical single-provider behavior is preserved;
3. `providerAssemblies`: an ordered set of already assembled providers with a bounded global attempt count.

A caller cannot combine `providerAssemblies` with `provider`, `codexProvider`, or another single-provider configuration.

## Combined policy registry

All provider-bound profiles are combined into one immutable `AgentRegistry`. Initial policy resolution therefore selects the smallest capable profile across the configured providers.

The selected profile determines the primary provider. The failover sequence is rotated so that the selected provider is attempt one while preserving the configured relative order of all remaining providers.

## Fallback admission

A fallback plan is never produced by changing only an executor reference. `createFallbackExecutionPlan(...)` reconstructs the execution identity from a profile belonging to the fallback provider.

The fallback profile must satisfy every capability and permission already admitted by the primary plan. Incompatible profiles are skipped and never invoked.

The fallback plan preserves:

- run id, project, candidate and minimal context;
- policy id, mode and required constraints;
- the primary plan's effect boundary.

It replaces only provider-specific execution identity:

- provider;
- runtime;
- profile id;
- model;
- effort.

## Budget non-widening

Every numeric fallback budget dimension is intersected with the primary plan budget. The effective value is the lower bounded value; `null` remains unbounded only when both sides are unbounded.

A fallback can therefore reduce token, cost, duration, call or repair budgets but cannot widen an already admitted limit.

`maxProviderAttempts` is also bounded to the number of configured provider assemblies.

## Public application contract

When providers are configured, `LoopApplicationAssembly` exposes:

- `loopExecutor`: one runner-compatible executor;
- `loopAgentRegistry`: the combined provider-bound registry;
- `loopProviderId`: the first configured provider for compatibility;
- `loopProviderIds`: the complete ordered provider chain;
- `loopProviderMaxAttempts`: the effective global attempt bound.

Single-provider callers receive the same executor and registry semantics as before, plus the additive ordered metadata.

## Security and determinism

- providers execute sequentially, never concurrently;
- duplicate assembly ids are rejected before execution;
- fallback capability and permission checks occur before provider effects;
- budgets never widen during fallback admission;
- no provider diagnostics, prompt content, credentials or context payloads are added to application metadata;
- commit and publication behavior remain unchanged;
- no concrete second provider adapter is introduced by this lot.

## Extension path

A future provider adapter registers and assembles its own executor and agent registry, then passes the resulting `LoopProviderAssembly` into the application composition root. Core and LoopRunner require no provider-specific changes.
