# Audit Engine — Duplication V1

## Objectif

Identifier les duplications réelles dans Loop Engine afin de prioriser les refactorings.

## Méthode

Analyse statique des fichiers TypeScript du dépôt.

## Constats mesurés

### Snapshot

`buildProjectSnapshot(project)` est utilisé dans 7 commandes.

Constat :

- le snapshot est bien le centre des commandes ;
- cette duplication est normale ;
- elle ne doit pas être supprimée artificiellement.

### JSON

`schemaVersion: 1` apparaît dans 9 commandes.

Le payload roadmap JSON est reconstruit dans 5 fichiers :

- `src/commands/context.ts`
- `src/commands/handoff.ts`
- `src/commands/next.ts`
- `src/commands/prompt.ts`
- `src/commands/summary.ts`

Forme répétée :

- `available`
- `paths`
- `selectedCandidate`
- `stats`
- `summary`

Conclusion :

La duplication JSON est le meilleur candidat de refactoring.

### Validation terminal

Le rendu des commandes de validation apparaît dans plusieurs commandes :

- `context`
- `handoff`
- `next`
- `prompt`
- `review`
- `status`

Conclusion :

Cette duplication existe, mais elle est moins critique que la duplication JSON.

Elle peut être traitée après la factorisation des payloads JSON.

## Refactoring recommandé

### Priorité 1

Créer un helper de payload JSON partagé.

Objectif :

- éviter de reconstruire `roadmap`, `project`, `git` et `validation` dans chaque commande ;
- stabiliser les contrats publics ;
- réduire le risque d'écart entre commandes JSON.

Nom possible :

- `buildProjectJsonPayload`
- `buildSnapshotJsonPayload`
- `buildPublicProjectPayload`

### Priorité 2

Créer un helper terminal ciblé pour la validation.

Nom possible :

- `printValidationCommands`

### À éviter

Ne pas créer de gros `project-renderers.ts`.

Les vues terminal ne sont pas assez identiques pour justifier une abstraction large.

## Règles candidates Audit Engine

### DUP-001

Les payloads JSON publics ne doivent pas reconstruire manuellement le bloc `roadmap`.

### DUP-002

Les commandes peuvent appeler `buildProjectSnapshot(project)` directement.

Cette duplication est acceptable.

### DUP-003

Les helpers de rendu terminal doivent rester ciblés.

Aucun renderer global ne doit masquer la logique des commandes.

## Conclusion

Le premier refactoring prioritaire n'est pas le rendu terminal.

Le meilleur ROI est la factorisation des payloads JSON publics.
