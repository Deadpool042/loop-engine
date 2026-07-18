# Audit Engine

## Objectif

Définir le futur moteur d'audit de Loop Engine.

L'Audit Engine doit transformer les règles documentées en règles exécutables.

Il doit rester :

- local ;
- déterministe ;
- read-only ;
- sans IA automatique ;
- sans service externe.

## Non-objectifs

V1 ne doit pas introduire :

- plugins ;
- dashboard ;
- serveur HTTP ;
- embeddings ;
- appels IA ;
- corrections automatiques ;
- modifications de projet audité.

## Modèle de règle

Une règle contient :

- `id`
- `category`
- `severity`
- `title`
- `description`
- `check`
- `recommendation`

Exemple :

- `JSON-001`
- `json`
- `warning`
- `Toute sortie JSON expose schemaVersion`

## Sévérités

Sévérités V1 :

- `info`
- `warning`
- `error`

## Catégories

Catégories V1 :

- `architecture`
- `duplication`
- `json`
- `tests`
- `docs`
- `rag`
- `handoff`

## Résultat de règle

Chaque règle produit :

- `ruleId`
- `category`
- `severity`
- `status`
- `message`
- `details`

Statuts V1 :

- `pass`
- `warning`
- `fail`
- `skipped`

## Rapport humain

Le rapport humain doit afficher :

- score global ;
- scores par catégorie ;
- erreurs ;
- warnings ;
- recommandations prioritaires.

## Rapport JSON

Le rapport JSON doit contenir :

- `schemaVersion`
- `project`
- `generatedAt`
- `summary`
- `scores`
- `findings`

## Scores

Le score V1 est indicatif.

Il ne doit pas bloquer automatiquement.

Principe :

- `error` pénalise fortement ;
- `warning` pénalise modérément ;
- `info` ne pénalise pas.

## Profils IA

Le moteur pourra produire des vues adaptées :

- Claude : architecture, arbitrages, risques ;
- Codex : fichiers, refactorings, validations ;
- ChatGPT : synthèse, stratégie, roadmap.

Les profils ne changent pas les règles.

Ils changent seulement la restitution.

## Garde-fous

L'Audit Engine ne doit jamais :

- modifier un fichier ;
- lancer un commit ;
- lancer un push ;
- appeler une IA ;
- exécuter une correction ;
- masquer une incertitude.

## Implémentation recommandée

V1 doit commencer par une règle simple et mesurable.

Premier candidat :

- `JSON-001` : vérifier `schemaVersion` dans les sorties JSON publiques.

## Validation

Toute évolution de l'Audit Engine doit passer :

- `pnpm run validate`
- `pnpm exec tsx src/cli.ts json-check`

## Commande V1

La commande disponible est :

- `pnpm exec tsx src/cli.ts audit`
- `pnpm exec tsx src/cli.ts audit --json`

V1 exécute les règles locales définies dans `src/audit/rules.ts`.

La première règle active est :

- `JSON-001`

La sortie JSON de `audit` est incluse dans `json-check`.

## Profils d'audit

Le moteur d'audit supporte des profils d'exécution via `--profile`.

Exemples :

```bash
pnpm loop audit --profile docs
pnpm loop audit --json --profile docs
pnpm loop audit --json --profile json
pnpm loop audit --json --profile architecture
```

Les profils disponibles sont :

- `quick`
- `strict`
- `release`
- `docs`
- `json`
- `architecture`

Chaque profil sélectionne un sous-ensemble de règles selon leurs catégories. Le rapport conserve le même contrat de sortie, y compris en JSON.

## Contrôle CI des profils

Le script `pnpm run audit:profiles` exécute `scripts/audit-profile-check.ts`.

Il vérifie explicitement que les profils `quick`, `strict`, `release`, `json`, `docs` et `architecture` ne retournent que les catégories attendues.

Ce contrôle complète `audit --json --strict` dans `pnpm run ci`.

## Erreurs de profils d'audit

Le parsing de `--profile` distingue deux erreurs publiques :

- profil inconnu : `Invalid audit profile` ;
- profil manquant : `Invalid audit profile: <missing>`.

Dans les deux cas, le CLI retourne un code de sortie non nul.

## Structure du contrôle des profils d'audit

Le script `scripts/audit-profile-check.ts` est organisé autour de deux tables de scénarios :

- `PROFILE_EXPECTATIONS` décrit les profils valides et les catégories attendues ;
- `FAILURE_EXPECTATIONS` décrit les cas d'erreur publics.

Les helpers internes séparent les responsabilités :

- `runAuditProfileCommand` exécute un profil valide ;
- `assertExpectedCategories` vérifie que les catégories retournées correspondent au profil ;
- `assertCommandFails` vérifie les scénarios d'erreur avec code de sortie non nul.

Cette structure permet d'ajouter un profil ou un cas d'erreur sans dupliquer la logique d'exécution.

## Registre de règles V8.0

`AUDIT_RULES` reste la source de vérité unique. Le registre typé en mémoire
normalise et valide les métadonnées de chaque règle, sans plugin, chargement
dynamique, fichier de configuration ni découverte à l'exécution.

Chaque règle expose `introducedIn`, `tags`, `stability` et `dependsOn`.
Les règles historiques utilisent `introducedIn: null` tant qu'une version
documentée ne permet pas de l'affirmer. Leur stabilité par défaut est
`stable`. Les dépendances sont déclaratives : elles sont validées, mais ne
modifient ni l'ordre ni l'exécution des checks.

Les tags sont fermés et typés : `contract`, `self-audit`, `documentation`,
`ci`, `json`, `architecture`, `cli`, `execution`, `policy`, `context`.

### Filtres et manifeste

Les profils existants restent inchangés. Des filtres répétables s'ajoutent :

```bash
pnpm loop audit --rule AUDIT-016
pnpm loop audit --tag self-audit
pnpm loop audit --stability stable
pnpm loop audit --profile strict --tag json
pnpm loop audit --manifest
```

Les valeurs répétées d'un même filtre sont réunies; les dimensions différentes
sont intersectées. Une sélection vide est une erreur explicite : elle ne
produit jamais un rapport vide à 100.

`audit --manifest` renvoie un contrat JSON distinct de `AuditReport`, avec
`schemaVersion: 1`, sans timestamp, dans l'ordre du registre. Il n'altère pas
le contrat `AuditReport` existant, qui reste en `schemaVersion: 1`.
