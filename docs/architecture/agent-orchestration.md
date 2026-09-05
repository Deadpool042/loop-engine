# Agent Orchestration Layer

## Statut

Lot V7.3 — types, registry, selector et stratégie d'escalade, **entièrement locaux et déterministes**. Aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun mode `execute` implémenté dans ce lot.

Lot V7.4 — cette couche est désormais consommée par un moteur de politique (`src/policy/`) qui relie un micro-lot planifié à une sélection d'agent prévisionnelle, intégrée au `LoopRunner` en mode `plan` uniquement. Voir `docs/architecture/agent-policy-engine.md`. Le sens de dépendance posé ici (`src/agents/` ne dépend jamais de `src/loop/`, `src/commands/`, `src/cli.ts` — ni, depuis V7.4, de `src/policy/`) reste inchangé.

## Objectif

Donner à Loop Engine un vocabulaire typé pour raisonner sur "quel agent d'exécution utiliser pour un micro-lot donné", sans jamais invoquer un agent réel. Ce lot prépare le terrain pour un futur `LoopExecutor` (mode `execute` du [LoopRunner](autonomous-loop-runner.md)) sans l'implémenter : sélectionner un profil reste une décision pure, testable sans réseau, sans process externe, sans effet de bord.

## Principes obligatoires

- **Local first** — toute décision de sélection se prend à partir de données locales (`AgentRegistry`), jamais d'un appel réseau.
- **Retrieval first** — avant d'escalader vers un agent plus coûteux, préférer réduire le contexte nécessaire (ex. `rag-search`) plutôt que d'augmenter l'effort. Ce lot documente le principe ; son application concrète appartient à un futur `LoopExecutor`, pas au code de ce lot.
- **Smallest capable agent first** — parmi les profils satisfaisant les capacités, permissions, contraintes provider/runtime et plafonds requis, le sélecteur retient toujours le profil dont l'effort est le plus faible.
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

Le modèle est une chaîne libre, **jamais figée** dans une union de type — les identifiants de modèle changent trop souvent pour être codés en dur (ex. `"claude-sonnet-5"`, `"gpt-5.6-terra"`). Le typage porte sur runtime/provider/capacités/permissions/effort/budget, jamais sur la liste des modèles possibles.

### `AgentCapability`

Capacités déclarées qu'un profil peut exercer : `code_edit`, `shell_exec`, `network_access`, `web_search`, `long_context`, `vision`, `multi_file_refactor`, `test_execution`. Liste volontairement petite et extensible — ajouter une capacité ne casse aucun contrat existant.

### `AgentPermission`

Ce qu'un profil est autorisé à faire, une fois qu'un futur `LoopExecutor` existera : `read_only`, `write_worktree`, `network_access`, `shell_exec`, `git_commit`, `git_push`. Dans ce lot, ce sont des déclarations pures — aucune permission n'est appliquée ni vérifiée à l'exécution, puisqu'aucune exécution n'a lieu.

### `AgentEffort`

Niveau d'effort d'invocation/préférence, ordonné : `low`, `medium`, `high`, `xhigh`, `max`. Il reste distinct du niveau économique du modèle : un modèle économique peut être invoqué avec un effort supérieur si le runtime le permet, et un modèle frontier ne doit pas être sélectionné seulement parce que son profil porte un effort élevé.

### `AgentEconomicTier`

Métadonnée de portefeuille révisable, indépendante du nom commercial du modèle et de `AgentEffort` : `economy`, `standard`, `advanced`, `frontier`. L'ordre est défini par `AGENT_ECONOMIC_TIERS` / `agentEconomicTierRank`. V48.2 introduit ce vocabulaire uniquement ; V48.3 décidera comment l'utiliser après les hard gates de capacités, permissions, policy et disponibilité.

### `AgentAvailabilityState`

État explicite `available | unavailable`. Une indisponibilité déclarée est un hard gate du sélecteur et du failover ; elle n'est jamais masquée par un alias ou un remplacement silencieux. L'absence historique du champ reste compatible avec `available`.

### `AgentBudget`

Limites optionnelles associées à un profil : `maxTokens`, `maxCostUsd`, `maxDurationMs`, `maxCalls`, `maxRepairs`. Chaque champ est `number | null` — `null` signifie "non borné". Un budget n'est jamais appliqué dans ce lot (pas d'exécution) ; il sert de critère de filtrage pour le sélecteur lorsqu'un appelant fournit un plafond (`budgetCeiling`).

Règle stricte du filtrage : si l'appelant fixe un plafond explicite sur une dimension et que le profil ne déclare aucune borne sur cette même dimension (`null`), le profil est rejeté sur cette dimension plutôt qu'accepté par défaut. L'économie de tokens étant un objectif fonctionnel central de ce lot, une borne inconnue ne doit jamais passer silencieusement un plafond explicite.

### `AgentProfile`

Combinaison concrète et sélectionnable : `id`, `runtime`, `provider`, `model`, `effort`, `capabilities`, `permissions`, `budget`, avec les métadonnées optionnelles `economicTier` et `availability`. Le modèle reste une chaîne libre ; les capacités enrichies sont déclarées par configuration vérifiée et ne sont jamais déduites du nom commercial du modèle. C'est l'unité que manipulent le registry, le sélecteur et la stratégie d'escalade.

## `AgentRegistry`

Collection locale et déclarative de profils, construite en mémoire (pas de lecture réseau, pas d'appel SDK). `createAgentRegistry` refuse les identifiants dupliqués. Les profils par défaut fournis (`DEFAULT_AGENT_PROFILES`) sont **explicitement illustratifs** : ils couvrent plusieurs runtimes/providers/niveaux d'effort pour permettre de tester le sélecteur et l'escalade, mais leurs capacités/permissions/budgets sont des exemples de configuration, pas des affirmations vérifiées sur ce que chaque outil tiers sait réellement faire. Toute intégration réelle doit remplacer ou compléter ces profils avec des données vérifiées.

Depuis V48.2, les providers réellement configurés pour `execute` respectent cette séparation sans dépendre des noms commerciaux. `src/composition/provider-registry.ts` accepte soit le mode historique à modèle unique `configured.<provider>`, soit un portefeuille explicite `profiles` donnant plusieurs profils `configured.<provider>.<id>` pour un même executable. Chaque profil déclare son modèle libre, son `economicTier`, son `availability`, son effort de classement et ses capacités vérifiées. Le Core n'ajoute plus de capacité sur la base d'un `if` lié à `Luna`, `Sonnet` ou tout autre nom de modèle. Les permissions restent celles garanties par l'intégration Loop Engine et aucun plafond token/coût non contrôlé par l'exécuteur n'est fabriqué. Le mode historique reste volontairement conservateur ; les capacités enrichies passent par la configuration de portefeuille.

L'`effort` d'un `AgentProfile` reste l'axe de classement du sélecteur ; l'effort réellement demandé à une invocation est `AgentPolicyResolution.requirements.minimumEffort` et est projeté tel quel dans `LoopExecutionPlan.effort`. Les deux valeurs peuvent légitimement différer et doivent rester distinguées dans les surfaces d'observabilité.

### Délégation interne gérée par le runtime (V41)

La sélection Loop Engine reste bornée à **un executor principal** par cycle. Codex et Claude Code peuvent cependant utiliser leurs propres skills ou sous-agents à l'intérieur de cette invocation lorsque le runtime sélectionné fournit déjà cette capacité. Loop Engine ne construit donc aucun second graphe de tâches, ne persiste aucun arbre de sous-agents et ne tente pas de reproduire leur scheduler interne.

La consigne d'exécution dépend uniquement de l'effort déjà résolu :

- `low` : privilégier l'exécution directe et éviter le coût de coordination d'un sous-agent, sauf nécessité d'utiliser une capacité runtime déjà disponible ;
- `medium`, `high`, `xhigh` et `max` : la délégation interne est permise lorsqu'un flux réellement indépendant ou une revue indépendante améliore matériellement vitesse ou sûreté ; elle doit rester minimale et peu profonde.

Cette liberté d'organisation **ne crée aucune autorité supplémentaire**. La consigne transmise au runtime exige que tout skill ou sous-agent respecte le même objectif, les mêmes livrables, le même hors-périmètre, `allowedPaths`, les permissions de policy et la frontière sans publication. Elle interdit également de basculer vers un autre provider/runtime ou d'introduire une API payante ou un credential supplémentaire au nom de cette délégation.

V41 n'ajoute toutefois **aucun sandbox ni observateur spécifique aux sous-agents** et ne prétend donc pas mesurer leur arbre interne. Le contrôle mécanique reste celui déjà qualifié : le runtime principal doit rendre un unique delta final dans le worktree, puis le scope guard vérifie les fichiers modifiés avant validation, commit ou publication.

La validation ne lui est jamais déléguée comme autorité : les contrôles post-executor de scope, les validations configurées, les audits et l'evidence Loop Engine restent les seules preuves gouvernées de réussite. La délégation interne est donc une optimisation d'exécution, pas une nouvelle couche de gouvernance.

### Contrat de délégation explicite (V44)

V44 retire la dernière duplication de décision introduite par V41. La règle n'est
plus redéduite séparément par les prompts Claude Code et Codex : elle est
matérialisée une seule fois dans `LoopExecutionPlan.delegation` à partir de
l'effort déjà admis par la policy.

Le contrat fermé expose seulement deux modes :

- `direct_preferred` pour un effort `low` ;
- `runtime_managed_allowed` pour `medium`, `high`, `xhigh` et `max`.

Cette donnée est également projetée dans `LoopExecutionPlanEvidence` et couverte
par son fingerprint SHA-256. Une modification observable du mode ou de sa raison
invalide donc l'intégrité de l'evidence comme n'importe quelle dérive de modèle,
scope ou policy.

Ce contrat ne prétend toujours pas observer ni limiter mécaniquement la profondeur
ou le nombre de sous-agents internes. Les executors consomment le mode comme
consigne commune ; le runtime principal reste responsable d'un seul delta final,
et les scope guards puis validations Loop Engine restent l'autorité mécanique.

Aucun profil par défaut n'a de priorité fixe sur un autre : le registry ne trie pas et ne classe pas. Le sélecteur applique d'abord les contraintes hard, puis seulement une préférence économique explicite lorsqu'elle existe.

## `AgentSelector`

`selectAgentProfile(registry, request)` est une fonction pure et déterministe :

1. filtre les profils qui couvrent toutes les capacités et permissions requises, respectent les allow-lists provider/runtime, sont disponibles et satisfont les plafonds d'effort et de budget ;
2. parmi les profils admissibles, classe d'abord le `economicTier` explicite selon l'ordre central `economy < standard < advanced < frontier` ;
3. un profil sans `economicTier` reste admissible pour compatibilité, mais il est classé après tout tier explicite : le sélecteur ne lui invente jamais un coût ;
4. à tier économique égal — ou lorsque tous les profils admissibles sont legacy sans tier — conserve le tie-break historique `effort` puis `id` croissant ;
5. retourne les hard rejections séparément des alternatives admissibles non retenues.

Le coût ne participe donc jamais à l'admission fonctionnelle : un profil `economy` qui manque une capacité, une permission, est indisponible ou dépasse un budget est rejeté avant tout classement. Inversement, un profil plus économique admissible peut être retenu même si son `effort` de profil est supérieur, car l'effort d'invocation reste une décision distincte résolue par la policy.

La projection `notSelected` reste compacte et explicable avec les raisons `higher_economic_tier_than_selected`, `economic_tier_unranked`, `higher_effort_than_selected` ou `deterministic_tiebreak`, sans dupliquer le registry.

Les allow-lists provider/runtime sont des contraintes hard issues de la policy, jamais une préférence implicite. Hors de ces contraintes, aucune hiérarchie codée en dur entre runtimes, providers ou noms commerciaux de modèles n'intervient.

L'ordre de déclaration du registry n'est pas une entrée de décision : les rejets et les alternatives non retenues sont ordonnés par `profileId`. Un même registry sémantique, même sérialisé dans un ordre différent, produit donc la même décision observable.

## Stratégie d'escalade

`escalateAgentProfile(input)` ne s'invoque **jamais automatiquement** : elle exige en entrée un `previousProfileId` et une `failureReason` explicite (`budget_exceeded`, `capability_gap`, `runtime_error`, `validation_failed`), fournis par l'appelant après un échec réel ou simulé. Elle réapplique les mêmes critères de filtrage que `selectAgentProfile`, exclut le profil précédent et tout profil d'effort inférieur ou égal, puis retient — toujours selon "smallest capable agent first" — le profil du plus faible effort restant strictement supérieur à celui du profil précédent. Si aucun profil ne reste, le résultat est `exhausted` (pas d'escalade possible), jamais une erreur silencieuse.

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

- `docs/architecture/agent-policy-engine.md`
- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/final-objective.md`
- `CLAUDE.md`
