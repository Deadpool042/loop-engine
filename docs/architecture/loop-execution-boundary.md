# Loop Execution Boundary

## Statut

LoopRunner reste plan-only. Sa seule sortie publique est `runLoopPlan(...)`,
qui produit un `LoopRunResult` historique et ne déclenche aucun processus.

L’exécution locale policy-bound reste exposée uniquement par la façade Core :

- `prepareLoopPolicyBoundLocalProcessExecution(...)` pour le dry-run ;
- `executeLoopPolicyBoundLocalProcessWithReceipt(...)` pour l’exécution ;
- le runtime bridge reste interne à Core.

## Frontière de dépendance

```text
LoopRunner
  -> runLoopPlan
  -> LoopRunResult

Core
  -> prepareLoopPolicyBoundLocalProcessExecution
  -> executeLoopPolicyBoundLocalProcessWithReceipt
  -> runtime-execution-bridge
```

`src/loop/**` ne dépend pas de `src/runtime/**` ni des APIs local-process de
Core. Toute exécution locale policy-bound doit passer par Core.
