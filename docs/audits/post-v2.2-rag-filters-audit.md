# Audit post V2.2 RAG filters

## État actuel

`rag-search` supporte désormais :

- recherche locale ;
- snippets ;
- index section-level ;
- sortie JSON ;
- `--limit`;
- `--path`.

## Forces

- Recherche plus exploitable en CLI.
- Sortie JSON exploitable par n8n, OpenClaw ou dashboard.
- Filtrage simple par zone documentaire.
- Toujours zéro IA, zéro service externe, zéro dépendance.

## Limites

- Pas encore de recherche multi-termes.
- Pas encore de résumé de contexte.
- Pas encore de format handoff assistant humain.
- Pas encore de citations par ligne.
- Pas encore de commande combinant roadmap + RAG.

## Options V2.3

### Option A — recherche multi-termes

Scorer plusieurs mots séparément.

### Option B — handoff humain

Créer une commande qui combine :

- `next`;
- `prompt`;
- résultats RAG.

### Option C — filtre par type de document

Filtrer architecture, audit, roadmap, intégration.

## Recommandation

Commencer par **Option B — handoff humain**.

Raison :

- valorise tout le travail déjà fait ;
- utile directement avec Claude/Codex ;
- ne nécessite pas d'IA automatique ;
- reste read-only ;
- prépare OpenClaw sans intégration réelle.
