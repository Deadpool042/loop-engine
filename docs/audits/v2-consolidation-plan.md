# Plan de consolidation V2

## Objectif

Consolider Loop Engine avant toute nouvelle capacité V3.

Le but est de réduire la duplication, stabiliser les contrats publics et clarifier les responsabilités.

## Lots prioritaires

### A1 — Refactor CLI dispatcher

- extraire la résolution projet commune ;
- réduire la duplication dans `src/cli.ts` ;
- ne changer aucun comportement.

### A2 — Erreurs JSON normalisées

- définir un format d'erreur commun ;
- garantir que les commandes `--json` ne sortent jamais du texte brut en cas d'erreur.

### A3 — Nettoyage Commands

- factoriser les blocs de rendu répétés ;
- garder les commandes simples ;
- éviter tout framework.

### A4 — `next.ts` consomme `snapshot.roadmap.stats`

- supprimer le recalcul local des stats ;
- faire respecter `ProjectSnapshot` comme source de vérité.

### A5 — Tests sorties humaines

- ajouter des tests minimaux sur les sorties terminal ;
- couvrir les commandes principales.

### A6 — Handoff réel

- clarifier ou enrichir `handoff` ;
- viser une vraie agrégation read-only ;
- ne déclencher aucune IA ni action automatique.

## Hors périmètre

- framework CLI ;
- plugins ;
- embeddings ;
- dashboard ;
- n8n actif ;
- OpenClaw actif ;
- automatisation autonome.

## Validation

Chaque lot doit passer :

- `pnpm run validate`

Chaque lot doit être commité séparément.
