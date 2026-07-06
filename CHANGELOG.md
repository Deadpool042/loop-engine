# Changelog

## 2026-07-06 — V2.3 Human handoff

### Ajouté

- Architecture `Human Handoff`.
- Commande `handoff <project>`.
- Sortie humaine read-only pour préparer une session assistée.
- Garde-fous explicites contre l'automatisation.

### Confirmé

- Aucun appel IA automatique.
- Aucun commit ou push automatique.
- Le handoff reste informatif et supervisé par l'humain.

---

## 2026-07-06 — V2.2 RAG search path filter

### Ajouté

- Option `--path <prefix>` pour `rag-search`.
- Filtre par préfixe de chemin avant scoring.
- Champ JSON `pathPrefix`.
- Test de contrat pour `rag-search --path`.

### Confirmé

- Le filtre s'applique aux sorties humaines et JSON.
- La recherche reste locale, read-only et sans dépendance.

---

## 2026-07-06 — V2.1 RAG search limit

### Ajouté

- Option `--limit <n>` pour `rag-search`.
- Support de `--limit` en sortie humaine et JSON.
- Test de contrat pour `rag-search --limit`.

### Corrigé

- `rag-search` n'envoie plus `limit: undefined` avec `exactOptionalPropertyTypes`.

### Confirmé

- La limite par défaut reste `5`.
- La recherche reste read-only et sans dépendance.

---

## 2026-07-06 — V2.0 RAG search JSON

### Ajouté

- Sortie `rag-search --json`.
- Test de contrat JSON pour `rag-search`.
- Inclusion de `rag-search --json` dans `json-check`.

### Confirmé

- La recherche RAG reste read-only.
- Le JSON public reste compact et parsable.
- `pnpm run validate` couvre aussi la sortie JSON RAG.

---

## 2026-07-05 — V1.9 RAG section-level index

### Ajouté

- Index RAG par sections Markdown.
- Champs `sectionTitle` et `headingLevel`.
- Affichage des titres de section dans `rag-search`.
- Tests section-level pour `rag-index` et `rag-search`.

### Confirmé

- Aucun embedding.
- Aucun service externe.
- Aucune IA automatique.
- Index toujours local et reconstructible.

---

## 2026-07-05 — V1.9 RAG section-level design

### Ajouté

- Spécification `docs/architecture/local-rag-sections.md`.
- Cadrage d'un futur index RAG par sections Markdown.
- Audit post V1.8 RAG local.

### Confirmé

- Pas d'embeddings en V1.9.
- Pas de dépendance externe.
- Index toujours local, reconstructible et read-only.

---

## 2026-07-05 — V1.8.3 Local RAG search

### Ajouté

- Commande `rag-search`.
- Snippets dans les résultats `rag-search`.
- Test des snippets `rag-search`.
- Script `pnpm run rag-search -- <query>`.
- Recherche locale déterministe dans `.loop-engine/rag-index.json`.
- Scoring simple par occurrences.
- Test de la commande `rag-search`.

### Corrigé

- `rag-search` ignore le séparateur npm `--`.

### Confirmé

- Aucun embedding.
- Aucun service externe.
- Aucune IA automatique.
- Recherche read-only.

---

## 2026-07-05 — V1.8.2 Local RAG index

### Ajouté

- Commande `rag-index`.
- Script `pnpm run rag-index`.
- Génération de `.loop-engine/rag-index.json`.
- Index local reconstructible des sources documentaires autorisées.
- `.loop-engine/` ignoré par Git.

### Confirmé

- Aucun embedding obligatoire.
- Aucun service externe.
- Aucune IA automatique.
- Index supprimable et reconstructible.

---

## 2026-07-05 — V1.8 Memory layer audit

### Ajouté

- Audit Memory / RAG / Graph.
- Spécification `docs/architecture/memory-layer.md`.
- Checklist `docs/architecture/memory-layer-checklist.md`.
- Spécification `docs/architecture/local-rag-index.md`.
- Liens README vers la documentation mémoire.
- Cadrage d'une future couche mémoire read-only.

### Confirmé

- RAG simple prioritaire avant MemPalace ou Graphiti.
- Aucune mémoire opaque.
- Aucune écriture automatique.
- Sources traçables et index reconstructible.

---

## 2026-07-05 — V1.7 n8n read-only

### Ajouté

- Cadrage V1.7 des intégrations read-only.
- Index des intégrations dans `docs/integrations/README.md`.
- Documentation d'intégration OpenClaw read-only.
- Checklist OpenClaw read-only.
- Liens README vers la documentation OpenClaw.
- Documentation d'intégration n8n read-only.
- Checklist n8n read-only.
- Liens README vers la documentation n8n.
- Règles de notification n8n.
- Garde-fous d'automatisation.

### Confirmé

- n8n reste consommateur JSON.
- Aucune modification automatique n'est autorisée.
- Aucun commit, push, déploiement ou appel IA automatique.

---

## 2026-07-05 — V1.6 Roadmap priorities

### Ajouté

- Modèle de priorité roadmap.
- Parser `[P1]`, `[P2]`, `[P3]`.
- Champ `priority` sur les candidats roadmap.
- Sélection priorisée à `kind` égal.
- Affichage de la priorité dans `next` et `prompt`.

### Confirmé

- La priorité ne permet pas à un `warning` de passer devant un `safe`.
- La priorité ne permet pas à un `blocked` de passer devant un `warning`.
- Les roadmaps existantes restent compatibles via `default`.

---

## 2026-07-05 — V1.5 Next decision hint

### Ajouté

- Section `Decision hint` dans `next`.
- Message explicite selon le type du candidat sélectionné :
  - `safe`
  - `warning`
  - `blocked`

### Confirmé

- Le hint reste purement informatif.
- Aucune automatisation n'est déclenchée.
- Les contrats JSON ne changent pas.

---

## 2026-07-05 — V1.4.2 CLI readability

### Ajouté

- Affichage roadmap compact dans `summary`.
- Indicateur visuel des roadmaps bloquées dans `summary`.
- Section `Roadmap summary` dans `next`.
- Audit lisibilité CLI.

### Confirmé

- Les améliorations CLI humaines ne modifient pas les contrats JSON.
- Les commandes continuent à consommer `ProjectSnapshot`.
- `pnpm run validate` couvre typecheck, tests et JSON publics.

---

## 2026-07-04 — V1.4 Roadmap summary

### Ajouté

- Affichage roadmap compact dans `summary`.
- Indicateur visuel des roadmaps bloquées dans `summary`.
- `snapshot.roadmap.summary`.
- Synthèse roadmap :
  - `active`
  - `done`
  - `selectable`
  - `hasBlocked`
- Exposition de la synthèse dans les JSON publics compacts.

### Confirmé

- La synthèse est calculée dans `intelligence/`.
- Les commandes consomment le `ProjectSnapshot`.
- `json-check` valide les sorties JSON après évolution du contrat.

---

## 2026-07-04 — V1.3.2 JSON check

### Ajouté

- Commande `json-check`.
- `pnpm run validate` inclut maintenant `json-check`.
- `pnpm run validate` inclut maintenant `json-check`.
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
