# Codex Provider Pilot and Controlled Commit Mode

## Status

Lot V14.6 — implemented.

## Goal

V14.6 adds one real provider pilot and one controlled commit boundary:

```text
explicit CLI provider configuration
-> Codex CLI `exec`
-> bounded worktree modification
-> existing execute / validate / repair cycle
-> exact validated file list
-> explicit Git commit
-> no push, tag or publication
```

## Provider boundary

The only concrete LoopRunner provider in this lot is Codex CLI. It is selected with
`--provider codex` and requires `--provider-executable`. The adapter invokes the
configured executable with structured arguments, `shell: false`, the project path
as `cwd`, a finite timeout and a finite combined output budget.

The prompt prohibits commit, push, tag, publication and work outside the current
worktree. Provider stdout and stderr are not exposed in `LoopRunResult`; failures
use stable redacted codes.

The provider process inherits the operator's already configured Codex login. Loop
Engine does not load API keys, inspect authentication files or discover a provider.

## Execute mode

`--mode execute` uses the Codex executor only when provider and executable are
explicitly supplied. Without them the existing `executor_unavailable` failure is
preserved. Successful execution flows through the V14.4 validation and bounded
repair cycle and still creates no commit.

## Controlled commit mode

`--mode commit` requires an explicit non-empty `--commit-message`. It first runs
the same execute and validation cycle. The committer is called only when:

1. execution completed;
2. validation passed;
3. at least one normalized modified file was reported.

The Git committer stages and commits only that exact relative file list. It uses
structured `git` arguments with `shell: false`, verifies the resulting 40-character
revision and returns only `{ sha, message }` in the public result.

Validation failure, provider failure, an unsafe path, staging failure or commit
failure leaves `commit: null` and fails closed. No push is attempted.

## CLI

```bash
pnpm loop run <project> --mode execute \
  --provider codex \
  --provider-executable codex \
  --provider-model <model> \
  --provider-timeout-ms 300000

pnpm loop run <project> --mode commit \
  --provider codex \
  --provider-executable codex \
  --commit-message "feat: implement selected roadmap candidate"
```

`publish` remains unavailable.

## Invariants

- one provider pilot only: Codex CLI;
- provider selection and executable are explicit;
- no shell interpolation;
- execution duration and output are bounded;
- provider diagnostics and output are redacted;
- commit follows successful validation only;
- only the exact validated file list is staged and committed;
- the commit revision is verified before it is reported;
- no push, tag, force operation or publication;
- default execution remains fail-closed without provider configuration.
