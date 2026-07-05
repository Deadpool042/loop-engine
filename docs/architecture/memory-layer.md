# Memory Layer

## Objectif

Définir une future couche mémoire pour Loop Engine sans introduire d'automatisation ni d'agent autonome.

La mémoire doit aider à retrouver du contexte, pas décider à la place de l'utilisateur.

## Sources indexables

Sources autorisées :

- `README.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `docs/architecture/`
- `docs/audits/`
- `docs/roadmap/`
- `docs/integrations/`

Sources optionnelles :

- sorties JSON publiques de Loop Engine ;
- tags Git ;
- messages de commit.

## Données exclues

Ne pas indexer par défaut :

- secrets ;
- `.env*` ;
- fichiers de clés ;
- données personnelles ;
- dumps de base de données ;
- fichiers volumineux générés ;
- dossiers `node_modules/`;
- artefacts de build.

## Mode lecture seule

La couche mémoire V1 doit rester read-only.

Elle peut :

- lire des fichiers ;
- construire un index ;
- répondre à une recherche ;
- préparer un contexte humain.

Elle ne doit pas :

- modifier un fichier ;
- écrire dans un projet inspecté ;
- créer un commit ;
- appeler une IA automatiquement ;
- déclencher une action.

## Reconstruction

L'index doit être reconstructible.

Règles :

- l'index peut être supprimé sans perte critique ;
- les sources Git/docs restent la vérité ;
- aucun fait important ne doit exister uniquement dans l'index ;
- la reconstruction doit être documentée.

## Traçabilité

Toute réponse issue de la mémoire doit pouvoir citer :

- le fichier source ;
- idéalement la section ;
- si possible la ligne ou le fragment.

## Positionnement des outils

### RAG simple

Premier choix recommandé.

Usage :

- recherche docs ;
- récupération de contexte ;
- préparation de prompts.

### MemPalace

Option à évaluer après RAG simple.

Usage possible :

- mémoire locale longue durée ;
- décisions humaines ;
- historique de sessions.

### Graphiti

Option avancée.

Usage possible :

- relations entre projets ;
- lots ;
- tags ;
- décisions ;
- changements temporels.

À éviter tant que le besoin de graphe n'est pas prouvé.

## Garde-fous

- Pas d'IA automatique.
- Pas d'écriture automatique.
- Pas de mémoire opaque.
- Pas de décision autonome.
- Sources toujours traçables.
- Reconstruction possible.
