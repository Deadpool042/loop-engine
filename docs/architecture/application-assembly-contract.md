# Loop Application Assembly Contract

## Status

V16.2 — provider registry assembly and isolated provider execution wired.

## Goal

`src/composition/application-assembly.ts` is the single deterministic
application assembly layer for the CLI.

It exposes two public symbols:

- `LoopApplicationAssembly`, the immutable application contract consumed by
  commands;
- `createLoopApplicationAssembly(...)`, the only factory allowed to wire
  concrete application implementations.

## Dependency direction

The dependency direction is:

```text
cli.ts
  -> commands/
  -> LoopApplicationAssembly
  -> Core application services and abstract ports

cli.ts
  -> createLoopApplicationAssembly(...)
  -> LoopProviderRegistry
  -> LoopProviderRegistration
  -> LoopProviderAssembly
  -> concrete executor + provider-bound AgentRegistry
```

Commands receive an assembly instance. They do not import Core, LoopRunner,
execution, policy, context, provider, transport or runtime implementations
directly. Rendering remains in `src/ui`.

Core never imports `src/composition`. Core continues to define application
services and abstract ports without knowing which concrete provider the
composition root selects.

## Provider registry

`src/composition/provider-registry.ts` owns provider discovery and assembly.
Each `LoopProviderRegistration` contains a stable provider id and one factory
that returns a `LoopProviderAssembly`.

A provider assembly is indivisible:

- its abstract `LoopExecutor`;
- its provider-bound `AgentRegistry`;
- its provider id.

`createLoopApplicationAssembly(...)` resolves provider configuration through the
registry. It does not construct Codex or any future provider directly. Codex is
the first registration in `defaultLoopProviderRegistry`.

Registries reject duplicate provider ids. Resolution fails closed when no
registration exists or when a registration returns an assembly with a different
id. Adding a provider therefore requires one explicit registration rather than
new provider-specific branching in the application factory.

The legacy `codexProvider` option remains accepted as a compatibility alias. New
callers should use `provider: { id: "codex", ... }`.

## Provider and policy binding

The Codex registration constructs the bounded Codex CLI executor and derives a
provider-bound `AgentRegistry`. Its single configured profile has runtime
`codex`, provider `openai`, and the exact configured model.

This prevents policy/execution divergence: LoopRunner cannot report that a
Claude, Gemini, Copilot, or OpenClaw profile was selected while the concrete
executor being invoked is Codex. Future providers must assemble their executor
and matching registry together.

The concrete constructor is not exported by Core and is not reachable through a
command module. Invalid executable configuration keeps the existing fail-closed
CLI behavior. A configured executor without a bound registry is rejected before
execution.

No provider is constructed for ordinary commands or for LoopRunner plan mode.

## Isolated provider execution

When a concrete provider is configured, the assembly wires `execute` through
the existing local project lock, Git worktree workspace manager and isolated
worker platform. The configured project path is resolved at this composition
boundary; providers and validation then receive the same detached worktree
path. The source repository is not modified by `execute`, and the worktree and
lock are released on every outcome.

`commit` deliberately remains outside this wrapper: its existing bounded
commit path still acts on an explicit source worktree. This lot adds no
promotion, cherry-pick, merge or push from an isolated execution.

## Determinism and effects

Creating an assembly without provider configuration:

- reads no filesystem state;
- reads no environment state;
- starts no process;
- performs no network access;
- reads no clock;
- returns a frozen object containing stable function references and constants.

Provider configuration only constructs an inert executor closure and a frozen
local registry. It does not start the executable; execution remains governed by
the explicit `execute` and `commit` modes.

The factory adds no dependency or side effect to Core.

## Runtime compatibility

V14.14 preserves:

- CLI arguments, validation and error codes;
- command rendering and JSON schemas;
- plan, execute, commit and publish-mode behavior;
- provider executable validation;
- validation and repair limits;
- controlled commit and no-publication guarantees.

It tightens two invariants:

1. a configured concrete executor and the agent profile selected by policy must
   originate from the same provider assembly;
2. every provider must be resolved through a unique registry entry.
3. a configured provider cannot receive the configured source repository as
   its working directory during `execute`.

## Enforcement

`AUDIT-502` continues to verify the application assembly boundary. Composition
tests additionally verify provider registration uniqueness, immutable ordering,
Codex resolution, provider/profile identity and the absence of provider effects
from the default assembly.
