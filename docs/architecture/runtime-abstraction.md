# Runtime Abstraction

## Statut

Lot V10.0 — interface Runtime locale, déterministe et **non exécutante**.
Les adaptateurs OpenClaw, Claude Code et Codex sont des stubs : aucun accès
réseau, SDK fournisseur, processus, shell, chargement de plugin ou exécution
de tâche n'est implémenté.

## Dépendances

```text
CLI -> Core -> Runtime -> agents / policy / context / intelligence (types)
```

Le CLI ne connaît pas `runtime/`. `src/core/runtime.ts` assemble une
`RuntimeRequest` depuis un `LoopRunResult` déjà calculé, résout l'adaptateur
statique et peut appeler son stub. `LoopRunResult`, les rapports d'exécution et
les sorties JSON restent inchangés : le résultat Runtime est interne à ce lot.

## Contrats

`RuntimeRequest` réutilise les modèles existants : `RoadmapCandidate`,
`AgentPolicyMode`, `MinimalContextPackage`, `AgentPolicyResolution`,
`AgentProvider` et `AgentEffort`. Il ne duplique aucun modèle d'agent, de
politique ou de contexte.

`RuntimeAdapter` expose seulement :

- `runtimeId` ;
- `capabilities` déclaratives ;
- `supports(request)` ;
- `execute(request)`.

`RuntimeResult` est additif par conception : runtime, statut, horodatages,
diagnostics, sortie et métadonnées. Les stubs retournent toujours
`not_implemented`, avec les horodatages fournis par la requête ; ils sont donc
déterministes.

## Registre et sélection

`RUNTIME_REGISTRY` est une liste statique dans l'ordre déclaré : OpenClaw,
Claude Code, Codex. Il n'existe ni découverte filesystem, ni injection de
dépendance, ni reflection, ni système de plugin.

`selectRuntime` est pur. Il retient d'abord le runtime explicitement demandé,
sinon celui du profil sélectionné par la politique ; il vérifie ensuite le
registre et les restrictions explicites provider/runtime. Il n'applique ni
score, ni heuristique, ni aléa.

## Limites V10.0

Le Runtime ne donne aucune autorisation supplémentaire. La politique demeure
la source de vérité pour la compatibilité d'agent, et le mode `plan` ne lance
aucune exécution réelle. Une intégration réelle devra être un lot ultérieur,
avec permissions, observation et contrats d'erreur explicitement revus.
