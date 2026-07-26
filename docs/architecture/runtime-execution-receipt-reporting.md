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

## V13.77 — Intégration Core

V13.77 relie l'enveloppe de reporting au chemin Core policy-aware existant sans modifier le bridge d'exécution lui-même. La nouvelle façade `executePolicyAwareDeclarativeRuntimeWithReceiptReport` appelle exactement la surface établie `executePolicyAwareDeclarativeRuntimeWithReceipt`, puis projette son résultat avec `attachRuntimeExecutionReceiptReport`.

```text
Policy-aware Runtime input
  -> executePolicyAwareDeclarativeRuntimeWithReceipt
  -> result with receipt or no receipt
  -> attachRuntimeExecutionReceiptReport
     -> executed: RuntimeExecutionReceiptReport
     -> resolution/receipt failure: report = null
```

`attachRuntimeExecutionReceiptReport` est une projection pure : elle ne sélectionne aucun runtime, n'appelle aucun adapter et ne reconstruit aucun receipt. Le report n'existe que lorsque l'exécution a produit un receipt valide. Les échecs pré-exécution et les échecs de construction du receipt restent représentés par leur résultat Core existant avec `report: null`.

Cette intégration demeure opt-in. Elle n'ajoute aucun mode CLI, aucun transport entrant, aucun renderer sous `src/execution`, aucune persistance et aucun appel fournisseur. `AUDIT-410` reste donc applicable sans modification : le reporting historique demeure séparé du reporting Runtime receipt.

## V13.78 — Sérialisation du résultat intégré

V13.78 ajoute une projection publique versionnée du résultat V13.77. `projectRuntimeExecutionReceiptReportingResult` réduit le résultat Core interne à quatre champs : `schemaVersion`, `outcome`, `report` et `diagnosticCodes`.

La frontière exclut explicitement `RuntimeResult`, la résolution policy-aware, les adapters et les registres. Les diagnostics ne traversent cette projection que sous forme de codes stables ; leurs messages et détails internes ne sont pas sérialisés.

```text
V13.77 integrated result
  -> projectRuntimeExecutionReceiptReportingResult
     -> schemaVersion
     -> outcome
     -> report | null
     -> diagnosticCodes[]
  -> serializeRuntimeExecutionReceiptReportingResult
```

La sérialisation est déterministe pour un même résultat intégré et ne crée aucune nouvelle donnée temporelle ou aléatoire. Elle reste Core-only et opt-in : aucun changement n'est apporté au CLI, à `src/execution`, aux transports ou aux providers.
