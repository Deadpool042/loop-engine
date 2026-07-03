# Audit Loop Engine — V1 locale

## Statut

V1 locale stabilisée.

Date : 2026-07-03

---

## Périmètre audité

- CLI locale
- configuration multi-projets
- ProjectSnapshot
- lecture Git
- lecture docs
- lecture roadmap minimale
- sorties terminal
- sorties JSON
- tests unitaires
- auto-pilotage de Loop Engine

---

## Commandes disponibles

### Workspace

- `pnpm loop`
- `pnpm loop help`
- `pnpm loop summary`
- `pnpm loop summary --json`
- `pnpm loop status`
- `pnpm loop doctor`

### Projet

- `pnpm loop context <project>`
- `pnpm loop validate <project>`
- `pnpm loop review <project>`
- `pnpm loop next <project>`
- `pnpm loop next <project> --json`
- `pnpm loop prompt <project>`
- `pnpm loop prompt <project> --json`

---

## Points forts

- Architecture claire entre `cli`, `commands`, `core`, `intelligence` et `ui`.
- `cli.ts` reste un routeur minimal.
- `ProjectSnapshot` centralise l'état calculé d'un projet.
- Les commandes ne consomment aucun token.
- Les sorties JSON préparent OpenClaw, n8n et un futur dashboard.
- Loop Engine peut se piloter lui-même via `projects.yaml`.
- Tests unitaires présents sur la sélection et la classification roadmap.
- Validation locale standardisée via `pnpm run validate`.

---

## Limites connues

- La lecture roadmap reste volontairement naïve.
- La classification `safe`, `warning`, `blocked` repose sur des mots-clés.
- `next` ne comprend pas encore la structure réelle des roadmaps.
- Les sorties JSON ne sont pas encore versionnées par schéma.
- Les commandes JSON existent seulement pour `summary`, `next` et `prompt`.
- Pas encore d'intégration OpenClaw, n8n ou GitHub.
- Pas encore de mode `--copy`.
- Pas encore de dashboard web.
- Pas encore de tests sur les commandes CLI complètes.

---

## Risques

- Trop enrichir la roadmap sans modèle clair pourrait rendre la logique fragile.
- Ajouter trop vite des intégrations IA pourrait augmenter la surface de sécurité.
- Ajouter des automatisations avant les garde-fous pourrait casser la philosophie V1.
- Dupliquer la sélection roadmap dans de futures commandes serait une régression.

---

## Recommandations V1.1

Priorité 1 :

- Ajouter un schéma JSON versionné.
- Tester les sorties JSON critiques.
- Documenter les contrats JSON.

Priorité 2 :

- Ajouter `--json` à `context` et `review`.
- Ajouter `--copy` pour `prompt`.
- Améliorer la lecture roadmap avec des sections explicites.

Priorité 3 :

- Préparer une intégration OpenClaw en lecture seule.
- Préparer un workflow n8n consommant `summary --json`.
- Préparer un dashboard local minimal.

---

## Décision

Loop Engine V1 est suffisamment stable pour être utilisé quotidiennement comme orchestrateur local.

La prochaine phase doit rester centrée sur :

- stabilité ;
- contrats JSON ;
- lecture roadmap plus fiable ;
- intégrations en lecture seule.
