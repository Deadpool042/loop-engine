# Audit post V1.7

## État actuel

Loop Engine dispose maintenant de :

- CLI humaine stable ;
- Roadmap Reader déterministe ;
- priorités roadmap ;
- `ProjectSnapshot` enrichi ;
- JSON publics compacts ;
- `json-check` intégré à `validate` ;
- documentation n8n read-only ;
- documentation OpenClaw read-only ;
- garde-fous d'intégration.

## Forces

- Architecture claire.
- Contrats JSON testés.
- Intégrations cadrées sans automatisation.
- Tags locaux par jalon.
- Validation complète via `pnpm run validate`.

## Risques

- Ajouter un dashboard trop tôt peut disperser l'effort.
- Ajouter un workflow n8n réel peut introduire de l'infra avant nécessité.
- Ajouter OpenClaw réel peut rapprocher trop vite du comportement agentique.
- Continuer à enrichir le parser roadmap peut augmenter la fragilité Markdown.

## Options V1.8

### Option A — Dashboard local read-only

Créer une première vue locale à partir des JSON.

### Option B — Workflow n8n exportable

Créer un workflow n8n minimal read-only.

### Option C — OpenClaw handoff

Préparer un format de handoff plus précis pour OpenClaw.

### Option D — Roadmap Reader sections

Lire des sections explicites dans les roadmaps.

## Recommandation

Commencer par **Option C — OpenClaw handoff**.

Raison :

- pas d'infra ;
- pas d'UI ;
- pas d'automatisation ;
- exploite directement les JSON et `prompt`;
- prépare les sessions humaines assistées.

## Premier micro-lot recommandé

Créer une commande ou sortie dédiée de handoff humain, sans action automatique.
