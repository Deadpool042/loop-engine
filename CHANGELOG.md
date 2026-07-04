# Changelog

## 2026-07-04 — V1.3.2 JSON check

### Ajouté

- Commande `json-check`.
- Vérification des sorties JSON publiques :
  - `summary --json`
  - `context <project> --json`
  - `next <project> --json`
  - `prompt <project> --json`
  - `review <project> --json`

### Confirmé

- Les sorties JSON publiques restent parsables.
- Chaque sortie JSON publique expose `schemaVersion: 1`.

---

## 2026-07-04 — V1.3.1 JSON roadmap compact

### Ajouté

- `snapshot.roadmap.stats`.
- Statistiques roadmap : `total`, `todo`, `inProgress`, `done`, `unknown`, `safe`, `warning`, `blocked`.

### Corrigé

- Les sorties JSON publiques sont compactes.
- Les sorties JSON publiques n'exposent plus toute la liste `roadmap.candidates` par défaut.
- Les sorties JSON peuvent être redirigées vers fichier et parsées par Node.

### Confirmé

- Les JSON publics exposent `roadmap.available`, `roadmap.paths`, `roadmap.selectedCandidate` et `roadmap.stats`.
- La liste complète `roadmap.candidates` reste interne au `ProjectSnapshot`.
- Toute exposition publique de `roadmap.candidates` devra passer par une option explicite dédiée.

---

## 2026-07-04 — V1.3 Roadmap selected candidate

### Ajouté

- `snapshot.roadmap.selectedCandidate`.
- Centralisation de la sélection roadmap dans le `ProjectSnapshot`.
- `next` et `prompt` consomment le candidat sélectionné depuis le snapshot.
- Documentation de `selectedCandidate` dans le Roadmap Reader.

### Confirmé

- `ProjectSnapshot` reste la source de vérité pour les commandes.
- Les commandes ne doivent pas recalculer la sélection roadmap.
- Le comportement CLI reste inchangé.

---

## 2026-07-03 — V1.2 Roadmap Reader

### Ajouté

- Statut déterministe des candidats roadmap (`todo`, `in_progress`, `done`, `unknown`).
- Les candidats `done` sont ignorés lors de la sélection.
- Détection enrichie des statuts Markdown (`- [ ]`, `- [x]`, `⏳`, `En cours`).
- Tests couvrant les statuts roadmap.
- Documentation de l'architecture du Roadmap Reader.
- Documentation des règles de sélection et des mots-clés sensibles.

### Amélioré

- Réduction des faux positifs des mots-clés bloquants.
- `prod` n'est plus considéré comme un mot-clé bloquant.
- `mise en production` devient un signal bloquant explicite.

### Confirmé

- Sélection : `safe` → `warning` → `blocked`.
- Les candidats terminés ne sont jamais proposés comme prochaine action.
- Les règles restent déterministes, sans IA et explicables.

---

## 2026-07-03 — V1.1 JSON et contrats

Tag local : `v1.1-local-json`


Tag local : `v1.1-local-json`


### Ajouté

- Sortie JSON versionnée avec `schemaVersion: 1`.
- `summary --json`.
- `context <project> --json`.
- `next <project> --json`.
- `prompt <project> --json`.
- `review <project> --json`.
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
