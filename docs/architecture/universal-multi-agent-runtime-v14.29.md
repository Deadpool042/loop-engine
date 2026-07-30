# Universal multi-agent runtime

## Scope

V14.29 turns the provider abstraction into an operational multi-agent runtime. The application can now assemble Codex and Claude Code from one declarative provider list, combine their policy profiles, select the smallest capable profile, execute through one runner boundary, and fail over only after a classified recoverable failure.

This is one product-level capability rather than a collection of provider-specific command paths.

## Declarative configuration

```ts
createLoopApplicationAssembly({
  providers: [
    {
      id: "codex",
      executable: "/usr/local/bin/codex",
      model: "gpt-5-codex",
    },
    {
      id: "claude_code",
      executable: "/usr/local/bin/claude",
      model: "claude-sonnet-5",
      maxTurns: 20,
    },
  ],
  maxProviderAttempts: 2,
});
```

The configured order is the reviewed failover order. Policy resolution may select either provider as the primary attempt. The application rotates the sequence so that the selected profile remains attempt one while preserving the relative order of the remaining providers.

## Provider contract

Each provider registration owns three things:

1. configuration validation;
2. construction of one concrete `LoopExecutor`;
3. construction of the matching immutable `AgentRegistry` profile.

The executor and profile are assembled together. A provider cannot execute a plan carrying another provider, runtime, profile or model identity.

## Claude Code adapter

The Claude Code adapter uses the documented non-interactive CLI surface:

- `--print`;
- `--output-format json`;
- `--model`;
- `--max-turns`;
- `--permission-mode acceptEdits`.

The adapter requires a clean worktree, disables nonessential Claude Code traffic, bounds duration, output bytes and turns, and inspects modified files through Git porcelain output. Provider stdout, stderr and exception details never cross the public result boundary.

The adapter cannot commit, push, tag or publish. Those remain separate Loop Engine lifecycle decisions.

## Security invariants

- executable basenames are validated before assembly;
- provider configuration modes are mutually exclusive;
- duplicate provider ids are rejected before effects;
- every attempt uses a provider-specific execution plan;
- the runner receives one executor facade;
- providers execute sequentially, never concurrently;
- fallback occurs only after a reviewed recoverable failure;
- global attempts and provider-specific resource use remain bounded;
- worktree cleanliness is checked before provider execution;
- process diagnostics and generated output are redacted;
- no provider adapter owns commit or publication behavior.

## Compatibility

The following modes remain valid:

- no provider configuration;
- historical `codexProvider` configuration;
- additive `claudeCodeProvider` compatibility configuration;
- one generic `provider` configuration;
- preassembled `providerAssemblies`;
- the new declarative `providers` list.

Only one mode may be supplied in a single application assembly request.

## Operational result

Loop Engine now has two concrete interchangeable execution workers behind the same architecture:

```text
Agent policy
  -> combined provider registry
  -> primary execution plan
  -> bounded provider failover executor
  -> Codex CLI or Claude Code CLI
  -> validation and repair cycle
  -> bounded evidence and trusted reporting
```

Adding another runtime requires a provider registration and concrete executor adapter. It does not require modifying Core, LoopRunner, failover orchestration, reporting or trust-boundary logic.

## Non-goals

This lot does not add provider races, speculative execution, implicit retries, remote publication, credential provisioning, session resumption, MCP server configuration or automatic installation of third-party CLIs.
