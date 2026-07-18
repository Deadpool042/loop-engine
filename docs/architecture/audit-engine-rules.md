# Audit Engine Rules

## Objectif

Définir les premières règles candidates du futur moteur d'audit Loop Engine.

Ces règles sont issues des audits V1.

## Architecture

### ARCH-001

Une commande publique ne doit pas accéder directement à Git, aux docs ou à la roadmap.

Elle doit consommer `ProjectSnapshot`.

### Runtime local gardé (V10.1)

Le backend interne `local-process` doit rester absent de la CLI et du
LoopRunner. Les règles `AUDIT-079` à `AUDIT-090` vérifient son enregistrement,
l'absence de shell et d'API `exec`, les doubles permissions explicites, le
confinement canonique, les limites de ressources, le contrat d'erreur, les
événements structurés et l'absence de réseau.

## Duplication

### DUP-001

Les payloads JSON publics ne doivent pas reconstruire manuellement le bloc `roadmap`.

### DUP-002

Les commandes peuvent appeler `buildProjectSnapshot(project)` directement.

Cette duplication est acceptable.

### DUP-003

Les helpers de rendu terminal doivent rester ciblés.

Aucun renderer global ne doit masquer la logique des commandes.

## JSON

### JSON-001

Toute sortie `--json` doit exposer `schemaVersion`.

### JSON-002

Toute sortie `--json` doit être parsable sans texte avant ou après.

### JSON-003

Les erreurs en mode `--json` doivent être sérialisées en JSON.

### JSON-004

Les commandes projet ne doivent pas reconstruire manuellement le bloc `roadmap`.

### JSON-005

`json-check` doit couvrir toute nouvelle commande publique `--json`.

### JSON-006

Les sorties JSON ne doivent pas contenir d'ANSI, emoji ou texte décoratif.

## Tests

### TEST-001

Toute commande publique doit avoir au moins un test direct ou une couverture explicite dans `json-check`.

### TEST-002

Toute commande avec sortie humaine importante doit avoir un test terminal minimal.

### TEST-003

Toute commande `--json` doit être couverte par `json-check`.

### TEST-004

Les tests de logique de sélection doivent rester dans `tests/intelligence`.

### TEST-005

Les tests CLI doivent rester des tests d'intégration simples via `execSync`.

## Documentation

### DOC-001

Tout dossier documentaire important doit posséder un `README.md`.

### DOC-002

Tout document d'audit doit être référencé depuis `docs/audits/README.md`.

### DOC-003

Un audit ancien ne doit pas être considéré comme doctrine active sans indication explicite.

### DOC-004

Les documents d'architecture ont priorité sur les audits historiques.

### DOC-005

Le changelog doit référencer toute évolution de contrat public.

## Priorisation

Les règles V1 ne doivent pas encore bloquer automatiquement les commits.

Elles servent d'abord à produire un rapport d'audit.

## Sorties futures

Le futur Audit Engine pourra exposer :

- sortie humaine ;
- sortie JSON ;
- profil Claude ;
- profil Codex ;
- profil ChatGPT.
