# Agent Orchestration Layer

## Statut

Lot V7.3 — types, registry, selector et stratégie d'escalade, **entièrement locaux et déterministes**. Aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun mode `execute` implémenté dans ce lot.

## Objectif

Donner à Loop Engine un vocabulaire typé pour raisonner sur "quel agent d'exécution utiliser pour un micro-lot donné", sans jamais invoquer un agent réel. Ce lot prépare le terrain pour un futur `LoopExecutor` (mode `execute` du [LoopRunner](autonomous-loop-runner.md)) sans l'implémenter : sélectionner un profil reste une décision pure, testable sans réseau, sans process externe, sans effet de bord.

## Principes obligatoires

- **Local first** — toute décision de sélection se prend à partir de données locales (`AgentRegistry`), jamais d'un appel réseau.
- **Retrieval first** — avant d'escalader vers un agent plus coûteux, préférer réduire le contexte nécessaire (ex. `rag-search`) plutôt que d'augmenter l'effort. Ce lot documente le principe ; son application concrète appartient à un futur `LoopExecutor`, pas au code de ce lot.
- **Smallest capable agent first** — parmi les profils satisfaisant les capacités et permissions requises, le sélecteur retient toujours le profil dont l'effort est le plus faible.
- **Escalation only on failure** — l'escalade n'est jamais automatique ni implicite : `escalateAgentProfile` exige en entrée une raison d'échec explicite fournie par l'appelant. Sans échec signalé, il n'y a pas d'escalade.

Ces principes s'ajoutent à ceux de `CLAUDE.md` (aucun appel IA automatique par défaut, zéro consommation de tokens par défaut) ; ils ne les remplacent pas.

## Placement dans le layering

Le layering existant (`cli.ts` → `commands/` → `loop/` → `intelligence/` → `core/`, voir `CLAUDE.md`) reste inchangé. `src/agents/` est une **nouvelle couche indépendante**, à part :

```text
cli.ts
  └─ commands/
       └─ loop/          (LoopRunner — futur LoopExecutor)
            ├─ intelligence/
            └─ agents/    (ce lot : types, registry, selector, escalade)
                 └─ core/ (si besoin futur — aucune dépendance dans ce lot)
```

Règles de dépendance, strictes :

- `src/agents/` ne dépend **jamais** de `src/loop/`, `src/intelligence/`, `src/commands/` ni `src/cli.ts`.
- Dans ce lot, `src/agents/` ne dépend d'aucun autre module du repo : types et fonctions pures, sans I/O.
- Un futur `LoopExecutor` (dans `src/loop/`) **consommera** `src/agents/`, jamais l'inverse. Le sens de la flèche est fixé ici, avant toute implémentation d'exécuteur, pour éviter toute dépendance circulaire ultérieure.
- `src/agents/` n'est appelé par aucune commande CLI dans ce lot : aucune nouvelle entrée dans `src/cli.ts`, aucun nouveau `--mode`.

## Vocabulaire typé

### `AgentRuntime`

L'outil/CLI qui exécute effectivement un agent : `claude_code`, `codex`, `openclaw`, `chatgpt`, `copilot`, `gemini_cli`, `custom`. Un runtime n'est qu'une étiquette d'identité — le sélecteur ne lui accorde jamais de priorité intrinsèque (voir "sans hiérarchie fixe" ci-dessous).

### `AgentProvider`

Le fournisseur du modèle sous-jacent : `anthropic`, `openai`, `google`, `github`, `local`. Distinct du runtime : un même provider peut être servi par plusieurs runtimes (ex. un modèle Anthropic via `claude_code` ou via `openclaw`).

### Modèle (`model: string`)

Le modèle est une chaîne libre, **jamais figée** dans une union de type — les identifiants de modèle changent trop souvent pour être codés en dur (ex. `"claude-sonnet-5"`, `"gpt-5-codex"`). Le typage porte sur runtime/provider/capacités/permissions/effort/budget, jamais sur la liste des modèles possibles.

### `AgentCapability`

Capacités déclarées qu'un profil peut exercer : `code_edit`, `shell_exec`, `network_access`, `web_search`, `long_context`, `vision`, `multi_file_refactor`, `test_execution`. Liste volontairement petite et extensible — ajouter une capacité ne casse aucun contrat existant.

### `AgentPermission`

Ce qu'un profil est autorisé à faire, une fois qu'un futur `LoopExecutor` existera : `read_only`, `write_worktree`, `network_access`, `shell_exec`, `git_commit`, `git_push`. Dans ce lot, ce sont des déclarations pures — aucune permission n'est appliquée ni vérifiée à l'exécution, puisqu'aucune exécution n'a lieu.

### `AgentEffort`

Niveau d'effort/coût relatif d'un profil, ordonné du moins cher au plus cher : `low`, `medium`, `high`, `xhigh`, `max`. C'est l'axe sur lequel portent "smallest capable agent first" et l'escalade.

### `AgentBudget`

Limites optionnelles associées à un profil : `maxTokens`, `maxCostUsd`, `maxDurationMs`, `maxCalls`, `maxRepairs`. Chaque champ est `number | null` — `null` signifie "non borné". Un budget n'est jamais appliqué dans ce lot (pas d'exécution) ; il sert de critère de filtrage pour le sélecteur lorsqu'un appelant fournit un plafond (`budgetCeiling`).

Règle stricte du filtrage : si l'appelant fixe un plafond explicite sur une dimension et que le profil ne déclare aucune borne sur cette même dimension (`null`), le profil est rejeté sur cette dimension plutôt qu'accepté par défaut. L'économie de tokens étant un objectif fonctionnel central de ce lot, une borne inconnue ne doit jamais passer silencieusement un plafond explicite.

### `AgentProfile`

Combinaison concrète et sélectionnable : `id`, `runtime`, `provider`, `model`, `effort`, `capabilities`, `permissions`, `budget`. C'est l'unité que manipulent le registry, le sélecteur et la stratégie d'escalade.

## `AgentRegistry`

Collection locale et déclarative de profils, construite en mémoire (pas de lecture réseau, pas d'appel SDK). `createAgentRegistry` refuse les identifiants dupliqués. Les profils par défaut fournis (`DEFAULT_AGENT_PROFILES`) sont **explicitement illustratifs** : ils couvrent plusieurs runtimes/providers/niveaux d'effort pour permettre de tester le sélecteur et l'escalade, mais leurs capacités/permissions/budgets sont des exemples de configuration, pas des affirmations vérifiées sur ce que chaque outil tiers sait réellement faire. Toute intégration réelle doit remplacer ou compléter ces profils avec des données vérifiées.

Aucun profil par défaut n'a de priorité fixe sur un autre : le registry ne trie pas, ne classe pas — c'est au sélecteur de décider, uniquement à partir de capacités/permissions/budget/effort.

## `AgentSelector`

`selectAgentProfile(registry, request)` est une fonction pure et déterministe :

1. filtre les profils du registry qui couvrent toutes les capacités et permissions requises par `request`, et respectent le plafond d'effort et de budget éventuellement fournis ;
2. parmi les profils restants, retient celui dont l'`effort` est le plus faible (« smallest capable agent first ») ;
3. départage les ex æquo de façon déterministe (ordre d'`id` croissant) — jamais aléatoire ;
4. retourne aussi la liste des profils rejetés avec leur raison (**explicabilité**), qu'un profil ait été sélectionné ou non.

Aucune notion de hiérarchie entre runtimes ou providers n'intervient dans cet algorithme : deux profils de même effort couvrant les mêmes capacités sont interchangeables du point de vue du sélecteur.

## Stratégie d'escalade

`escalateAgentProfile(input)` ne s'invoque **jamais automatiquement** : elle exige un `previousProfileId` et une `failureReason` explicite (`budget_exceeded`, `capability_gap`, `runtime_error`, `validation_failed`), fournis par l'appelant après un échec réel ou simulé. Elle réapplique les mêmes critères de filtrage que `selectAgentProfile`, exclut le profil précédent et tout profil d'effort inférieur ou égal, puis retient — toujours selon "smallest capable agent first" — le profil du plus faible effort restant strictement supérieur à celui du profil précédent. Si aucun profil ne reste, le résultat est `exhausted` (pas d'escalade possible), jamais une erreur silencieuse.

## Position de n8n et des runtimes externes

Voir `autonomous-loop-runner.md` (sections "Architecture d'intégration" et "Interface Agent") pour le rôle de n8n comme déclencheur externe uniquement. Ce lot ne modifie pas cette frontière : `AgentRegistry` et `AgentSelector` restent des composants internes à Loop Engine, jamais exposés à n8n ni à un runtime externe. OpenClaw, Codex, Claude Code, ChatGPT, Copilot et tout runtime futur sont représentés uniquement comme des `AgentProfile` déclarés dans le registry — aucun n'a de statut privilégié dans le code.

## Portée du lot V7.3

Dans ce lot :

- `src/agents/types.ts` — `AgentRuntime`, `AgentProvider`, `AgentCapability`, `AgentPermission`, `AgentEffort` (+ ordre), `AgentBudget`, `AgentProfile` ;
- `src/agents/registry.ts` — `AgentRegistry`, `createAgentRegistry`, `findAgentProfile`, `DEFAULT_AGENT_PROFILES` (illustratifs), `defaultAgentRegistry` ;
- `src/agents/selector.ts` — `selectAgentProfile`, avec explicabilité des rejets ;
- `src/agents/escalation.ts` — `escalateAgentProfile`, déclenchée uniquement par un échec explicite.

Explicitement hors périmètre de ce lot :

- aucun appel réseau, aucun SDK fournisseur, aucune clé API ;
- aucun mode `execute` du LoopRunner, aucun `LoopExecutor` ;
- aucune commande CLI nouvelle, aucun routage dans `src/cli.ts` ;
- aucun commit, push ou tag automatique ;
- aucune application réelle des permissions ou budgets déclarés (ce sont des données, pas des contrôles d'exécution).

## Voir aussi

- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/final-objective.md`
- `CLAUDE.md`
