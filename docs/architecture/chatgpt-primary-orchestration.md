# ChatGPT-primary orchestration

## Decision

The normal interactive path is:

```text
ChatGPT
  -> Development Workspace
  -> Loop Engine
  -> governed project workspaces
```

ChatGPT is the primary interactive orchestrator. Loop Engine remains the deterministic governance layer: it reads project state, roadmaps and objectives, produces bounded context and handoffs, validates work and exposes stable reports.

## Default behavior

The standard Loop Engine application assembly does not select an internal text-only AI provider. Commands that can consult a model return a bounded provider-unavailable result unless a caller explicitly injects a provider.

`execution-decision propose` follows the same rule: it does not construct an Anthropic provider by itself. A provider factory must be supplied explicitly by a secondary runtime integration.

This preserves the existing zero-AI-call default and makes it effective for the newer roadmap and execution-decision consultation paths as well.

## Secondary runtimes

Codex, Claude Code, Anthropic API, OpenClaw and future providers remain supported as explicit secondary capabilities. They are never automatic fallbacks for the ChatGPT-primary path.

Provider failover remains a reusable explicit execution capability only when a caller configures multiple providers. The default application assembly contains no provider list, so no failover occurs in ordinary interactive use.

## Responsibilities

- ChatGPT: interactive reasoning, prioritization and orchestration with the user.
- Development Workspace: bounded filesystem, Git, command and remote-worker operations.
- Loop Engine: deterministic project governance, roadmap/context/handoff generation, validation and execution policy.
- GitHub: canonical source for versioned project code.
- OpenClaw and provider runtimes: optional secondary execution or cockpit capabilities, never the default decision-making path.

## Cost and safety invariant

Ordinary Loop Engine inspection, planning, handoff and workspace operations must not require an AI provider. Any provider-backed consultation or autonomous execution requires explicit provider configuration by the caller and remains subject to the existing execution, validation, commit and publication gates.
