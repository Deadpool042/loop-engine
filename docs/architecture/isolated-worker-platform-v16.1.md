# Isolated Worker Platform — V16.1

Status: IMPLEMENTED

## Objective

V16.1 introduces the first operational slice of the isolated durable worker platform: exclusive project locking and deterministic workspace lifecycle management.

The provider-backed `execute` composition now consumes this slice directly:
it resolves the source repository outside the generic workspace manager,
acquires the local project lock, creates a detached Git worktree, runs the
provider and configured validation against that same worktree, then releases
the worktree and lock. The source repository remains unchanged by `execute`.

## Public contracts

The execution module exposes two ports:

- `ProjectLockManager`, responsible for exclusive acquisition and release by project;
- `WorkspaceManager`, responsible for isolated allocation and deterministic cleanup by execution attempt.

Both ports remain independent from filesystem, Git, process, clock, and persistence implementations.

## Orchestration order

`IsolatedWorkerPlatform` applies the following sequence:

1. acquire the project lock;
2. reject with `project_locked` when another attempt owns the project;
3. allocate an isolated workspace;
4. execute the injected worker function;
5. release the workspace in a `finally` block;
6. release the project lock in a `finally` block.

This order guarantees that no workspace is allocated for a rejected attempt and that cleanup occurs after successful or failed execution.

## Local adapters

### Local project lock manager

`createLocalProjectLockManager` prepares a private candidate directory under an injected lock root, writes its bounded `owner.json` completely, then atomically renames that complete directory to the canonical project path. A project identifier is encoded as a filesystem-safe segment. A canonical lock created by this adapter is therefore never visible without its owner metadata, while an interrupted unpublished candidate remains outside the canonical path and is cleaned when the current acquisition can do so.

The adapter is local to one host. An existing lock is recovered only when its metadata is valid, names the requested project and current hostname, and its PID is demonstrated absent locally (`ESRCH`). A live PID, PID inspection ambiguity (including permission denial), a different host, missing/corrupt/unsupported metadata, or any inconsistent value remains `project_locked`; age never authorizes recovery. A dead generation is atomically moved to a deterministic, non-empty quarantine path derived from its `lockId`; that quarantine remains as a generation barrier, so another recoverer that observed the old generation cannot rename or remove a replacement generation. Retries are bounded, and the next complete candidate is published atomically only while the canonical path is absent. Release is idempotent and removes a lock only if its current unique owner identity matches the handle, so an old handle cannot remove a replacement lock.

The adapter cannot clean up descendants left behind by a crashed provider. GUI-driven multi-project parallelism is not introduced by this local per-project exclusion.

### Local workspace manager

`createLocalWorkspaceManager` creates one directory per `(projectId, attemptId)` under an injected workspace root and removes it recursively during release.

### Git worktree workspace manager

`createGitWorktreeWorkspaceManager` materializes a detached Git worktree per `(projectId, attemptId)` under an injected workspace root. The adapter resolves the source repository through an injected `projectId -> repositoryPath` function, so Git and project-location concerns remain outside the generic `WorkspaceManager` contract.

Allocation uses `git worktree add --detach` from an explicit repository and defaults to `HEAD` unless a `baseRef` is injected. Release uses `git worktree remove --force` and performs defensive filesystem cleanup. The adapter does not create, commit, or push a branch.

Before a provider is invoked, the composition layer honors the project's
`workspace.dependencies` policy. `none` and `on_demand` do not trigger any
implicit dependency action. For `production`, a pnpm project with a pinned
`packageManager` and committed `pnpm-lock.yaml` is rehydrated inside the
disposable worktree with `pnpm install --offline --frozen-lockfile --ignore-scripts`.
`COREPACK_ENABLE_NETWORK=0` prevents Corepack from fetching a missing package
manager. The source checkout's `node_modules` is never shared writable with the
isolated worktree, lifecycle scripts are not run implicitly, and an unavailable
local store fails closed before the provider with
`workspace_dependency_preparation_failed`.

The existing controlled `commit` mode deliberately remains outside this first
composition step: it still commits its validated source-worktree delta. No
automatic cherry-pick, merge, copy or promotion is performed from an isolated
`execute` worktree.

An explicit `execute --export-patch <path>` may export the final validated
worktree delta with Git's native binary patch format before cleanup. New files
are made visible only through intent-to-add entries in the disposable worktree;
the source repository index is never touched. Export writes atomically to a
non-existing explicit destination whose parent already exists, then still
performs normal workspace and lock cleanup. Applying the patch remains a
separate human Git action.

## Guaranteed invariants

- conflicting attempts on the same project cannot execute concurrently;
- unrelated projects may acquire locks concurrently;
- workspaces do not share paths across distinct attempts;
- workspace release happens before project-lock release;
- execution failure does not bypass cleanup;
- filesystem concerns remain confined to adapters.

## Deferred work

- lease heartbeat and renewal: V16.2;
- active cancellation and process termination: V16.3;
- idempotent resume and duplicate suppression: V16.5.
