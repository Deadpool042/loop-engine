# Human Handoff

## Objectif

Préparer un contexte exploitable par un humain et un assistant IA, sans automatisation.

Le handoff doit agréger des informations déjà disponibles :

- projet ;
- état Git ;
- candidat roadmap sélectionné ;
- priorité ;
- validations ;
- contexte prompt ;
- résultats RAG pertinents.

## Garde-fous

- Aucun appel IA automatique.
- Aucune modification automatique.
- Aucun commit automatique.
- Aucun push automatique.
- Lecture seule.
- Décision humaine obligatoire.

## Sources V1

Le handoff peut consommer :

- `ProjectSnapshot`
- `prompt <project> --json`
- `next <project> --json`
- `rag-search --json`

## Format cible

Une future commande pourra produire :

- une sortie humaine Markdown ;
- une sortie JSON compacte.

## Limites V2.3

V2.3 ne doit pas :

- appeler Claude, Codex, OpenClaw ou n8n ;
- modifier les fichiers ;
- créer de tâche ;
- choisir automatiquement un agent ;
- lancer un lot Code.

## Premier micro-lot Code recommandé

Créer une commande `handoff <project>` qui affiche :

- projet ;
- branche ;
- dirty/clean ;
- candidat sélectionné ;
- priority/status/kind ;
- validations ;
- résultats RAG autour du texte du candidat.

## Sortie JSON

La commande `handoff` expose une sortie JSON publique :

- `pnpm exec tsx src/cli.ts handoff <project> --json`

Le payload contient :

- `schemaVersion`
- `project`
- `git`
- `roadmap`
- `validation`
- `health`
- `instructions`

Cette sortie est incluse dans `json-check`.
