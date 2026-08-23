# Memory Layer

## Objectif

Loop Engine expose une couche mémoire locale, sans automatisation ni agent autonome.

La mémoire aide à retrouver du contexte, elle ne décide pas à la place de l'utilisateur.

Elle est implémentée par le RAG local déterministe :

- `src/core/reports.ts` (`generateRagIndex`, `generateRagSearchReport`) ;
- `src/commands/rag-index.ts` ;
- `src/commands/rag-search.ts`.

## Portée

La mémoire est mono-dépôt : elle porte exclusivement sur le dépôt Loop Engine lui-même.

- L'index ne porte aucune identité de projet.
- Aucune donnée d'un projet inspecté (Creatyss, lp-infra, n8n, ...) n'entre dans l'index.
- Cet invariant est gardé par un guard d'ancrage racine (l'écriture de l'index échoue
  explicitement si le répertoire courant n'est pas la racine du dépôt Loop Engine, repérée
  par la présence de `projects.yaml`) et couvert par un test qui invoque `rag-index` depuis
  un répertoire hors dépôt et vérifie qu'aucun `.loop-engine/` n'y est créé.

## Sources indexables

Sources autorisées :

- `README.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `docs/architecture/`
- `docs/audits/`
- `docs/roadmap/`
- `docs/integrations/`
- `docs/releases/`

`AGENTS.md` est délibérément exclu de cette allowlist. La doctrine canonique doit être lue
directement, en entier, plutôt que retrouvée via une recherche floue par mots-clés qui
pourrait renvoyer un extrait hors contexte et induire en erreur sur une règle contraignante.

Sources optionnelles :

- sorties JSON publiques de Loop Engine ;
- tags Git ;
- messages de commit.

Ces sources doivent rester alignées avec `RAG_SOURCE_PATHS` (`src/core/reports.ts`) et avec
`docs/architecture/local-rag-index.md` (§ Sources). Une règle d'audit de catégorie `rag`
vérifie automatiquement cet alignement (voir `docs/architecture/memory-layer-checklist.md`).

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

La couche mémoire reste read-only.

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

## Fraîcheur

L'index (`.loop-engine/rag-index.json`) est reconstruit intégralement à chaque exécution de
`rag-index` — il n'existe pas de mise à jour incrémentale. La reconstruction est déclenchée :

- manuellement (`pnpm run rag-index`) ;
- automatiquement au début de `json-check`/`pnpm run validate`.

La sortie de `rag-search` expose `generatedAt` (horodatage de construction de l'index), ce
qui rend la fraîcheur observable sans lecture disque supplémentaire à chaque requête.

Limite résiduelle assumée : entre deux reconstructions, une réponse de recherche peut
refléter un état antérieur du dépôt. C'est acceptable, car le dépôt reste la source de
vérité — jamais l'index. Un index illisible, non parsable, ou dont le `schemaVersion` ne
correspond pas au format attendu dégrade proprement vers `error: "missing_index"`, sans
exception ni écriture partielle.

## Reconstruction

L'index doit être reconstructible.

Règles :

- l'index peut être supprimé sans perte critique ;
- les sources Git/docs restent la vérité ;
- aucun fait important ne doit exister uniquement dans l'index ;
- la reconstruction doit être documentée.

## Traçabilité

Toute réponse issue de la mémoire peut citer :

- le fichier source (`path`) ;
- la section (`sectionTitle`, `headingLevel`) ;
- un fragment (`snippet`).

## Positionnement des outils

### RAG simple

Choix retenu et implémenté (voir Objectif ci-dessus). Aucun moteur mémoire ou vector
database supplémentaire n'a été introduit.

Usage :

- recherche docs ;
- récupération de contexte ;
- préparation de prompts.

### MemPalace

Option non retenue pour Loop Engine lui-même à ce stade. Pas d'usage prévu tant qu'un
besoin de mémoire longue durée multi-session n'est pas démontré.

### Graphiti

Option avancée, non retenue. À éviter tant que le besoin de graphe n'est pas prouvé.

## Garde-fous

- Pas d'IA automatique.
- Pas d'écriture automatique.
- Pas de mémoire opaque.
- Pas de décision autonome.
- Sources toujours traçables.
- Reconstruction possible.
- Isolation mono-dépôt (voir Portée).

## Checklist

Avant toute évolution de la couche mémoire, utiliser :

- `docs/architecture/memory-layer-checklist.md`

## Index RAG local

La spécification de l'index RAG local est définie dans :

- `docs/architecture/local-rag-index.md`

Cet index reste read-only, reconstructible et non critique.
