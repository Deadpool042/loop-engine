# GitHub Actions CI contract

Loop Engine validates pull requests through independent GitHub Actions jobs and a single fail-closed aggregation job.

The required validation jobs are:

- `quality`
- `typecheck`
- `tests`
- `audit-strict`
- `audit-profiles`

The `ci-gate` job depends on every required validation job, reads each dependency result, and fails unless every result is `success`.

`src/audit/github-actions-ci-contract.ts` exposes a pure inspector for this composition. Audit rules should consume that inspector instead of requiring the historical monolithic `pnpm run ci` workflow step.

The package-level `ci` script remains available for local and manual serial validation. GitHub Actions decomposes the same validation responsibilities so jobs can execute in parallel and report compact diagnostics independently.
