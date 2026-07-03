# Changelog

## 2026-07-03 — V1.1 JSON et contrats

### Ajouté

- Sortie JSON versionnée avec `schemaVersion: 1`.
- `summary --json`.
- `next <project> --json`.
- `prompt <project> --json`.
- Tests de contrats JSON.
- Documentation des contrats JSON.
- Documentation des tests JSON.

### Confirmé

- Les sorties JSON sont destinées aux scripts, OpenClaw, n8n et futurs dashboards.
- Toute sortie JSON publique doit rester versionnée.
- Toute évolution de contrat doit être documentée et testée.

---

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
