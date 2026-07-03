# Changelog

## 2026-07-03 — V1 locale

### Ajouté

- Initialisation du projet Loop Engine.
- Configuration multi-projets via `projects.yaml`.
- Commandes CLI :
  - `summary`
  - `status`
  - `doctor`
  - `context`
  - `validate`
  - `review`
  - `next`
  - `prompt`
  - `help`
- UI terminal homogène.
- `ProjectSnapshot`.
- Lecture Git enrichie.
- Lecture roadmap minimale.
- Détection, classification et justification des candidats roadmap.
- Tests unitaires roadmap.
- Auto-pilotage local de Loop Engine.

### Principes confirmés

- Aucun appel IA automatique.
- Aucun token consommé par défaut.
- Aucune modification automatique des projets pilotés.
- Validation humaine conservée.
- Architecture séparée entre `cli`, `commands`, `core`, `intelligence` et `ui`.
