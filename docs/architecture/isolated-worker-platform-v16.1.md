# Isolated Worker Platform — V16.1

Status: IMPLEMENTED

## Objective

V16.1 introduces the first operational slice of the isolated durable worker platform: exclusive project locking and deterministic workspace lifecycle management.

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

`createLocalProjectLockManager` uses atomic directory creation under an injected lock root. A project identifier is encoded as a filesystem-safe segment. An existing directory means the project is already locked.

The adapter is single-host and process-independent for acquisition because the filesystem operation is atomic. Durable stale-lock recovery is intentionally deferred to V16.4.

### Local workspace manager

`createLocalWorkspaceManager` creates one directory per `(projectId, attemptId)` under an injected workspace root and removes it recursively during release.

Git worktree materialization is intentionally outside this slice. The workspace port is already suitable for a later Git-backed adapter without changing Core orchestration.

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
- stale lock and crash recovery: V16.4;
- idempotent resume and duplicate suppression: V16.5.
