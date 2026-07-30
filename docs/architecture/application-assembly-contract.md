# Loop Application Assembly Contract

## Status

V14.12 — implemented.

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
  -> concrete provider construction
```

Commands receive an assembly instance. They do not import Core, LoopRunner,
execution, policy, context, provider, transport or runtime implementations
directly. Rendering remains in `src/ui`.

Core never imports `src/composition`. Core continues to define application
services and abstract ports without knowing which concrete provider the
composition root selects.

## Provider wiring

The optional `codexProvider` factory input is explicit configuration. When it is
present, `createLoopApplicationAssembly(...)` constructs the bounded Codex CLI
executor and exposes it only through the abstract `LoopExecutor` port on the
assembly contract.

The concrete constructor is not exported by Core and is not reachable through a
command module. Invalid executable configuration keeps the existing fail-closed
CLI behavior.

No provider is constructed for ordinary commands or for LoopRunner plan mode.

## Determinism and effects

Creating an assembly without provider configuration:

- reads no filesystem state;
- reads no environment state;
- starts no process;
- performs no network access;
- reads no clock;
- returns a frozen object containing stable function references and constants.

Provider configuration only constructs the existing inert executor closure. It
does not start the executable; execution remains governed by the existing
explicit `execute` and `commit` modes.

The factory adds no dependency or side effect to Core.

## Runtime compatibility

V14.12 changes dependency injection only. It preserves:

- CLI arguments, validation and error codes;
- command rendering and JSON schemas;
- plan, execute, commit and publish-mode behavior;
- provider executable validation;
- validation and repair limits;
- controlled commit and no-publication guarantees.

## Enforcement

`AUDIT-502` verifies that:

1. the public contract and factory exist;
2. the CLI creates the assembly;
3. commands do not bypass the assembly;
4. Core does not depend on composition;
5. concrete Codex provider construction occurs only in the assembly factory.
