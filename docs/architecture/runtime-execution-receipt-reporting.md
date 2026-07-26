# Runtime Execution Receipt Reporting

## V13.75

V13.75 ajoute une enveloppe de reporting Core opt-in pour `RuntimeExecutionReceipt` sans modifier le contrat historique `ExecutionResult` ni `src/execution/report.ts`.

Le flux est volontairement séparé :

```text
Runtime execution
  -> RuntimeExecutionReceipt
  -> createRuntimeExecutionReceiptReport
  -> RuntimeExecutionReceiptReport
  -> serializeRuntimeExecutionReceiptReport
```

`RuntimeExecutionReceiptReport` est versionné indépendamment avec `schemaVersion: 1`. Il référence le receipt public déjà construit après exécution et n'ajoute aucune donnée d'exécution, horloge, identifiant aléatoire, persistance ou effet externe.

Cette couche ne modifie pas :

- `ExecutionResult` ;
- `ExecutionReport` ;
- les renderers texte, Markdown et JSON historiques de `src/execution` ;
- `LoopRunResult` ;
- la création du receipt post-adapter ;
- les règles de redaction du runtime `local-process`.

Le serializer est déterministe pour une même enveloppe et un même receipt. Le receipt reste la source publique de vérité pour l'identité descriptor/runtime, la décision admise et l'outcome observé ; l'enveloppe de reporting ne réinterprète pas ces données.

Cette séparation maintient la frontière historique protégée par `AUDIT-410` : le reporting Runtime receipt est additif dans Core et n'injecte pas `RuntimeExecutionReceipt` dans `src/execution/report.ts`.
