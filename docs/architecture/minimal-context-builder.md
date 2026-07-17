# Minimal Context Builder

## Statut

Lot V7.5 — constructeur de contexte local, déterministe et borné, intégré au `LoopRunner` **uniquement en mode `plan`**, pour un cycle `completed`. Aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun mode `execute` réel, aucun appel d'agent, aucun commit ou push automatique.

## Objectif

Transformer un `ProjectSnapshot` (voir `project-intelligence.md`) et un `ContextBudget` (`src/policy/types.ts`, dérivé par l'[Agent Policy Engine](agent-policy-engine.md)) en un paquet de contexte minimal, borné et explicable :

```text
ProjectSnapshot + ContextBudget
  -> collectContextSources   (sources déclarées, ordre stable)
  -> resolveContextPath      (confinement sous snapshot.project.path)
  -> buildMinimalContext     (déduplication, lecture, troncature, budgets)
  -> MinimalContextPackage   (fichiers inclus, omissions explicables)
```

Ce lot relie le budget de contexte prévisionnel calculé par `src/policy/` (section "Politique de contexte" de `agent-policy-engine.md`) à un paquet de contexte réellement construit — la première brique qui lit effectivement des fichiers pour préparer un contexte, sans jamais appeler d'agent.

## Placement dans le layering

```text
cli.ts
  └─ commands/
       └─ loop/          (LoopRunner — consomme context/ et policy/)
            ├─ intelligence/
            ├─ policy/    (V7.4 : budget de contexte, jamais de lecture de fichiers)
            └─ context/   (ce lot : lecture bornée, déduplication, troncature)
```

Règles de dépendance, strictes :

- `src/context/` dépend de `src/intelligence/snapshot.js` (type `ProjectSnapshot`, lecture seule) et de `src/policy/types.js` (type `ContextBudget`, lecture seule).
- `src/context/` ne dépend **jamais** de `src/commands/`, `src/loop/` ni `src/cli.ts`. Le `LoopRunner` consomme `src/context/`, jamais l'inverse.
- `src/policy/` et `src/agents/` ne dépendent **jamais** de `src/context/` — le budget de contexte reste calculé indépendamment de sa consommation.

## Contrats

### `MinimalContextPackage`

```ts
interface MinimalContextPackage {
  project: string;
  budget: ContextBudget;
  files: readonly ContextFile[];
  omitted: readonly ContextOmission[];
  totalCharacters: number;
  estimatedTokens: number;
  truncated: boolean;
}

interface ContextFile {
  path: string;
  kind: "required_doc" | "roadmap";
  content: string;
  originalCharacters: number;
  includedCharacters: number;
  estimatedTokens: number;
  truncated: boolean;
}

interface ContextOmission {
  path: string;
  reason: "duplicate" | "missing" | "outside_project" | "file_limit" | "character_limit" | "token_limit";
}
```

`ContextBudget` (`maxFiles`, `maxCharacters`, `maxEstimatedTokens`, `includeFullFiles`) est réutilisé tel quel depuis `src/policy/types.ts` — jamais redéclaré.

### Sources

`collectContextSources` (`src/context/sources.ts`) ne lit que deux champs du `ProjectSnapshot` :

- `snapshot.docs.required` — dans leur ordre déclaré ;
- `snapshot.roadmap.paths` — ensuite, dans leur ordre déclaré.

Aucune autre source n'est jamais consultée (pas de `rag-search`, pas de lecture arbitraire du dépôt).

### Confinement de chemin

`resolveContextPath` (`src/context/path.ts`) résout chaque source relativement à `snapshot.project.path` et calcule `insideProject`. `buildMinimalContext` rejette tout chemin absolu externe ou tout `../` qui sortirait du projet **avant** toute lecture disque, avec la raison `outside_project`.

### Estimation de tokens

`estimateTokens` (`src/context/context-cost-estimator.ts`) est une approximation locale, pure et déterministe : `Math.ceil(content.length / 4)`. Ce n'est **ni** un tokenizer précis ni un prix de modèle — volontairement conservatrice, documentée comme approximation, jamais présentée comme un compte exact.

### `buildMinimalContext(snapshot, budget)`

Pipeline, dans cet ordre fixe pour chaque source (garantit un résultat reproductible) :

1. résolution du chemin et confinement (`outside_project` sinon) ;
2. déduplication par chemin absolu normalisé (`duplicate` pour toute occurrence suivante, même si la chaîne déclarée diffère — `"./x.md"` et `"x.md"` désignent le même fichier) ;
3. existence et nature du fichier (`missing` si absent ou si ce n'est pas un fichier régulier) ;
4. plafond `maxFiles` (`file_limit` au-delà) ;
5. plafonds `maxCharacters` / `maxEstimatedTokens` restants (`character_limit` / `token_limit`) ;
6. inclusion, selon `includeFullFiles`.

`includeFullFiles: true` — jamais d'inclusion partielle : un fichier est inclus intégralement s'il tient dans le budget restant (caractères **et** tokens), sinon il est omis en entier (`character_limit` ou `token_limit`), jamais tronqué.

`includeFullFiles: false` — troncature déterministe à la frontière exacte des deux budgets restants : `allowedLength = min(originalCharacters, remainingCharacters, remainingTokens * 4)`. Cette borne ne dépasse jamais le budget, y compris pile à la limite (`Math.ceil(allowedLength / 4) <= remainingTokens` par construction).

`MinimalContextPackage.truncated` vaut `true` dès qu'au moins un fichier a été tronqué, ou qu'au moins une omission porte une raison liée au budget (`file_limit`, `character_limit`, `token_limit`) — jamais pour `duplicate`, `missing` ou `outside_project`, qui sont des problèmes de données, pas de budget.

Aucun dépassement de budget n'est jamais possible, à aucun moment : `files.length <= budget.maxFiles`, `totalCharacters <= budget.maxCharacters`, `estimatedTokens <= budget.maxEstimatedTokens`, en toute circonstance.

## Intégration au LoopRunner (mode `plan`)

Le comportement terminal du mode `plan` est inchangé : `idle -> planning -> ready -> completed` (candidat sûr) ou `idle -> planning -> blocked` (aucun candidat sûr). Voir [`autonomous-loop-runner.md`](autonomous-loop-runner.md).

`planLoopCycle` (`src/loop/planner.ts`) expose désormais le `ProjectSnapshot` qu'il calcule déjà sur la variante `"ready"` de `LoopPlan`, pour que `runLoopPlan` n'ait jamais à reconstruire un second snapshot (pas de duplication de la logique de `buildProjectSnapshot`).

Une fois le cycle `ready` et la résolution de politique calculée, `runLoopPlan` (`src/loop/runner.ts`) construit le paquet de contexte via `buildMinimalContext(cycle.snapshot, agentPolicy.requirements.contextBudget)` — le même budget que celui exposé par la [politique de contexte](agent-policy-engine.md#politique-de-contexte) — et l'expose sur un champ additif du `LoopRunResult` :

```ts
contextPackage: MinimalContextPackage | null;
```

`null` lorsque le cycle est `blocked` ou `failed` (pas de candidat prêt, exactement la même règle que `agentPolicy`), toujours renseigné lorsque le cycle atteint `completed`. Cet ajout est rétrocompatible : `schemaVersion` reste `1`, aucun champ existant n'est retiré ou modifié — voir `tests/commands/json-output.test.ts` et `tests/loop/runner.test.ts` pour la couverture.

`buildMinimalContext` est injectable dans `runLoopPlan` (comme `loadConfig`, `planLoopCycle`, `resolvePolicy`), ce qui garde les tests entièrement déterministes.

## Portée du lot V7.5

Dans ce lot :

- `src/context/types.ts` — `ContextSource`, `ContextFile`, `ContextOmission`, `ContextOmissionReason`, `MinimalContextPackage` ;
- `src/context/path.ts` — `resolveContextPath` (confinement) ;
- `src/context/sources.ts` — `collectContextSources` (ordre stable, sources limitées à `docs.required` et `roadmap.paths`) ;
- `src/context/context-cost-estimator.ts` — `estimateTokens` (approximation locale, `ceil(length / 4)`) ;
- `src/context/builder.ts` — `buildMinimalContext` (déduplication, troncature, plafonds stricts) ;
- intégration additive au `LoopRunner` (mode `plan` uniquement, cycle `completed`) — champ `contextPackage` sur `LoopRunResult`, `snapshot` additif sur la variante `"ready"` de `LoopPlan` ;
- `src/commands/run.ts` — section terminale "Context package (forecast)" et exposition JSON `contextPackage` ;
- `src/commands/json-check.ts` — validation de la structure `contextPackage` et de sa parité de nullité avec `agentPolicy`.

Explicitement hors périmètre :

- aucun tokenizer précis, aucun prix de modèle ;
- aucune commande CLI `context`/`prompt` élargie au-delà de ce qui est strictement nécessaire au contrat JSON de `run` ;
- aucun mode `execute` réel, aucun appel réseau, aucun appel d'agent ;
- aucune source de contexte au-delà de `docs.required` et `roadmap.paths` (pas de `rag-search`, pas de diff Git).

## Voir aussi

- `docs/architecture/agent-policy-engine.md`
- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/final-objective.md`
- `docs/architecture/project-intelligence.md`
- `CLAUDE.md`
