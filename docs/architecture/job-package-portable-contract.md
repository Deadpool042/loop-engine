# Job Package portable contract — JP0 (audit)

Statut : audit conclu, aucune abstraction de production introduite, `src/**` inchangé.

Note de révision : la première version de JP1 proposait un champ additif `projectName`, qui duplique `plan.project.name` (déjà présent) sans retirer `project.path` du plan — elle ne démontrait donc aucune propriété de portabilité réelle. Le contrat minimal cible et JP1 ont été corrigés en conséquence (voir sections correspondantes).

## Objectif

Déterminer quel contrat existant doit devenir le Job Package portable entre Loop Engine, un runtime interactif/agent, Development Workspace et un worker (`local` ou `vps-main`), en minimisant la duplication et sans introduire de nouvelle abstraction spéculative.

## État existant

Trois contrats peuvent être confondus avec un « Job Package » :

### A. `LoopExecutionPlan` (`src/loop/execution-plan.ts`)

- Producteur : `createLoopExecutionPlan(...)`, appelé uniquement par `runLoopExecute` (`src/loop/execute-runner.ts:316`).
- Consommateurs réels :
  - `src/loop/claude-code-cli-executor.ts` (`buildPrompt`, et `resolve(plan.project.path)` ligne 194 pour fixer le `cwd` du process CLI) ;
  - `src/loop/codex-cli-executor.ts` (même usage : prompt + `plan.project.path`) ;
  - `src/loop/content-policy.ts` (inspection post-exécution) ;
  - `src/loop/execution.ts` (type `LoopExecutorInput`) ;
  - `src/loop/provider-failover.ts` et `src/composition/provider-failover-assembly.ts` (bascule provider) ;
  - `src/loop/execution-plan-evidence.ts` / `execution-plan-evidence-fingerprint.ts` (empreinte d'audit, pas le contrat lui-même).
- Champs réellement consommés : `project.path` (cwd d'exécution), `project.name`, `provider`, `runtime`, `model`, `profileId`, `effort`, `contextPackage.files`, `allowedPaths`, `brief`, `candidate.text`.
- Champs non consommés en dehors du prompt texte : `budget`, `policy.rationale` (traçabilité seulement, jamais relus par un executor).
- Données host-specific : `project: ProjectConfig` complet, notamment `project.path` — un chemin relatif au `projects.yaml` local (ex. `../development-workspace`, `.`), résolu par `resolve()` contre le `cwd` du process qui exécute Loop Engine. Ce chemin n'a de sens que sur le host qui a produit le plan.
- Données de gouvernance : `policy` (id, mode, capabilities, permissions requises, rationale).
- Données runtime : `provider`, `runtime`, `model`, `effort`, `budget`.
- Données worker : aucune — le worker est actuellement toujours implicite (« le host qui exécute `runLoopExecute` »), jamais un champ explicite.
- Stabilité/sérialisation : type TypeScript interne, `schemaVersion: 1`, mais **jamais sérialisé/désérialisé** entre process ou host aujourd'hui — construit et consommé dans le même appel synchrone de `runLoopExecute`.

### B. Project Handoff JSON (`generateProjectHandoffReport`, `src/core/reports.ts:474`)

- Producteur : `generateProjectHandoffReport(project)`, dérivé de `generateProjectReport`.
- Consommateurs réels : `src/commands/handoff.ts` (`printProjectHandoffJson`, `printProjectHandoff`) via `application.generateProjectHandoffReport`, exposé par `pnpm loop handoff <project> --json` pour collage manuel dans un assistant.
- Champs consommés : `project` (name/path/type), `git`, `roadmap` (candidat sélectionné, phase gates, stats, résumé), `validation`, `health`, `instructions` (texte humain fixe).
- Champs non consommés programmatiquement : `instructions` n'est lu que par un humain ; aucun champ n'encode capabilities/permissions/runtime/worker.
- Données host-specific : `project.path` (même chemin relatif que ci-dessus), consommé uniquement pour affichage (`terminal.info`) — jamais pour un `cwd` d'exécution.
- Données de gouvernance : aucune (pas de policy, pas de capabilities).
- Données runtime/worker : absentes — ce contrat ne connaît ni provider, ni runtime, ni worker.
- Stabilité/sérialisation : `schemaVersion: 1`, JSON stable, conçu explicitement pour être collé dans un assistant humain (ChatGPT), donc déjà pensé comme sortie portable au sens texte, mais sans notion d'autorisation d'exécution ni de destination worker.

### C. `BoundaryHandoff` (`src/boundary/handoff.ts` + `src/boundary/types.ts`)

- Producteur : `createBoundaryHandoff(descriptor)`, bridge pur depuis un `DispatchDescriptorResult`.
- Consommateurs réels : uniquement son propre sous-arbre (`src/boundary/**`) et une règle d'audit (`src/audit/rules/audit.ts`). Aucun appelant hors de `src/boundary/**` et `src/dispatch/**`.
- Le type porte structurellement `ready: false`, `accepted: false`, `dispatchable: false`, `executable: false`, `executionStarted: false` — c'est un objet RFC (« rfc-execution-boundary-v12 ») délibérément inerte, conçu pour être *revu*, pas exécuté.
- Il ne contient aucun `project.path`, aucun runtime, aucun worker : uniquement des identifiants d'évidence (`descriptorId`, `authorityId`, `eligibilityId`, versions de policy/mapping/protocole).
- **Conclusion** : `BoundaryHandoff` n'est pas le même concept qu'un Job Package. C'est un artefact de gouvernance RFC non branché à l'exécution réelle, sans lien avec `LoopExecutionPlan` ou le Project Handoff. Il est exclu de la comparaison A/B/C.

## Problème de portabilité démontré

`LoopExecutionPlan.project` est un `ProjectConfig` complet (`src/core/config.ts:4-19`), dont le champ `path` vient de `projects.yaml` (ex. `path: ../development-workspace`, `path: .`). Ce chemin est :

1. relatif au répertoire de travail du process Loop Engine au moment du chargement (`loadConfig()` lit `projects.yaml` du cwd courant) ;
2. résolu en chemin absolu **au moment de l'exécution**, dans `claude-code-cli-executor.ts:194` (`const cwd = resolve(plan.project.path);`) et de façon identique dans `codex-cli-executor.ts`.

Sur Mac, ce chemin resolu pointe vers `/Users/laurent/Projects/development-workspace`. Sur `vps-main`, la même entrée `projects.yaml` residerait sous `/home/ubuntu/Projects/...`. Le plan actuel ne fait aucune distinction entre :

- l'identité logique du projet (`development-workspace`, stable sur tout host) ;
- l'emplacement physique du checkout (dépend du host, de l'utilisateur, du layout du disque).

Tant que `LoopExecutionPlan` est construit et consommé dans le même appel synchrone sur le même host, ce n'est pas un problème observable. Cela **devient** un problème dès qu'on veut sérialiser ce plan pour le transmettre à un autre process/host (runtime interactif, Development Workspace, worker distant) : le champ `project.path` tel quel n'est pas portable, et rien dans le contrat actuel ne distingue « ceci est l'identité du projet » de « ceci est où le trouver sur ce host ».

La résolution du chemin physique ne doit pas migrer dans Loop Engine (ce serait de la logique d'exploitation/routing host). Elle doit rester une responsabilité du worker/Development Workspace : Development Workspace connaît déjà, par host, sa racine de travail (cf. `AGENTS.md` transverse : `DW_FILESYSTEM_ROOT` par worker, `/home/ubuntu/Projects` sur VPS vs `/Users/laurent/Projects` en local). Loop Engine doit donc transporter une **identité logique de projet**, jamais un chemin absolu, et laisser le worker/Development Workspace faire la résolution locale.

## Comparaison des options

### A. Faire évoluer `LoopExecutionPlan` comme base du Job Package portable

- Bénéfices : contrat déjà construit à chaque cycle `execute`, déjà consommé par les deux executors CLI réels, déjà porteur de policy/capabilities/permissions/runtime/effort — c'est la seule structure qui connaît réellement runtime+provider+profil aujourd'hui.
- Coût : retirer `project: ProjectConfig` (avec son `path` physique) au profit d'une identité logique + laisser la résolution du chemin au consommateur (executor local aujourd'hui, worker demain). Nécessite de vérifier que rien d'autre ne dépend implicitement de `project.path` dans le plan (seuls les deux executors CLI et l'inspection content-policy y touchent, cf. inventaire ci-dessus).
- Duplication : nulle — un seul contrat continue de porter mission + runtime + policy.
- Compatibilité : le champ `project: ProjectConfig` peut rester temporairement présent dans `LoopExecutionPlan`. JP1 modifie d'abord la frontière d'invocation afin que les executors ne consomment plus `project.path` comme cwd ; cette évolution peut donc être réalisée sans retirer immédiatement le champ `project` ni casser les consommateurs qui utilisent encore d'autres données du plan.
- Risque architectural : faible — `LoopExecutionPlan` est déjà interne à `src/loop/`, jamais sérialisé aujourd'hui ; le faire évoluer ne touche pas un contrat public JSON.
- Impact runtime/worker : direct et positif — c'est exactement le contrat que les executors consomment déjà pour lancer un provider CLI.
- Réversibilité : élevée — champ additif, aucun consommateur cassé si on ajoute avant de retirer.

### B. Créer un nouveau type `JobPackage` distinct

- Bénéfices : nom propre, pas de bagage `LoopExecutionPlan`.
- Coût : un second type à maintenir en parallèle de `LoopExecutionPlan`, avec mapping bidirectionnel à écrire et tester ; aucun consommateur réel ne l'attend aujourd'hui.
- Duplication : élevée — dupliquerait `project`, `provider`, `runtime`, `model`, `effort`, `policy` déjà portés par `LoopExecutionPlan`.
- Compatibilité : neutre à court terme, mais crée deux sources de vérité.
- Risque architectural : viole la règle Loop Engine existante (« une nouvelle abstraction exige deux usages réels, deux implémentations réelles ou une frontière externe démontrée ») — il n'y a qu'un seul usage réel (execute-runner → executors CLI), pas deux.
- Impact runtime/worker : nul de plus que l'option A, au prix d'une couche de traduction supplémentaire.
- Réversibilité : moyenne — un type supplémentaire est plus coûteux à retirer qu'un champ additif.

### C. Réutiliser le Project Handoff JSON comme Job Package

- Bénéfices : déjà `schemaVersion: 1`, déjà pensé pour sortir du process (collage dans un assistant), déjà exposé en JSON stable via `pnpm loop handoff --json`.
- Coût : il manque tout ce qu'un Job Package doit porter côté exécution gouvernée — provider/runtime/model, capabilities/permissions requises, budget, allowedPaths/brief. Il faudrait ajouter tous ces champs à un contrat aujourd'hui purement informatif pour un humain.
- Duplication : le Project Handoff resterait nécessaire tel quel pour son usage actuel (contexte humain ChatGPT) ; le faire porter aussi l'exécution gouvernée mélangerait deux audiences (lecture humaine vs contrat d'exécution machine).
- Compatibilité : risque de casser l'usage actuel (`pnpm loop handoff`) si on modifie sa forme pour des besoins d'exécution.
- Risque architectural : mélange deux responsabilités distinctes (résumé humain vs contrat d'exécution portable) dans un seul type.
- Impact runtime/worker : quasi nul aujourd'hui — ce contrat n'est consommé par aucun executor.
- Réversibilité : faible une fois les deux usages mélangés dans le même schéma public.

## Décision retenue

**Option A** : faire évoluer `LoopExecutionPlan`/la frontière `LoopExecutor` comme base du Job Package portable, en séparant le plan gouverné du contexte physique local d'invocation, plutôt que de créer un nouveau type ou de réutiliser le Project Handoff.

Justification : `LoopExecutionPlan` est le seul contrat aujourd'hui réellement consommé par les deux executors CLI réels (`claude-code-cli-executor.ts`, `codex-cli-executor.ts`) et porte déjà runtime/provider/policy/capabilities. Il n'existe pas deux implémentations réelles ni un besoin externe démontré justifiant un nouveau type `JobPackage` (règle des deux usages réels non satisfaite). Le Project Handoff JSON reste un contrat distinct et doit le rester : il sert un humain via un assistant interactif, pas un executor gouverné.

## Contrat minimal cible (pour JP1, non implémenté dans ce lot)

Le Job Package portable minimal, projeté depuis `LoopExecutionPlan`, doit séparer explicitement :

- **identité logique du projet** : `project.name` (déjà présent, stable inter-host) ;
- **mission** : `candidate`, `brief`, `allowedPaths` (déjà présents) ;
- **contexte** : `contextPackage` (déjà présent, déjà borné/tronqué, déjà indépendant du host) ;
- **capabilities/permissions** : `policy.requiredCapabilities`, `policy.requiredPermissions` (déjà présents) ;
- **runtime/provider** : `provider`, `runtime`, `model`, `effort`, `budget`, `profileId` (déjà présents) ;
- **worker** : actuellement absent en tant que champ explicite — à ne pas fabriquer avant qu'un deuxième worker consomme réellement un plan (cf. hors périmètre) ;
- **emplacement physique du checkout** : ne doit **pas** être une donnée du contrat gouverné `LoopExecutionPlan`. `runLoopExecute` (`src/loop/execute-runner.ts:245-248`) connaît déjà ce chemin indépendamment du plan — y compris pour un worktree isolé via `options.executionProjectPath` — et le transporte aujourd'hui *dans* le plan via `executionProject` (`project: executionProject` à la construction, `execute-runner.ts:319`). Le contrat cible sépare cette connaissance déjà existante du plan gouverné : le chemin physique devient un **contexte local d'invocation** fourni séparément à la frontière `LoopExecutor`, jamais un champ que le plan doit porter pour être portable.

## Frontière worker availability (conceptuelle uniquement, JP0)

- Le Job Package peut exiger des **capabilities** (ex. `filesystem`, `git`, langage runtime attendu) — c'est une déclaration de besoin, pas une observation.
- La disponibilité effective d'un worker (`local` up, `vps-main` up, capacités réellement exposées à cet instant) doit rester une **observation externe**, produite par Development Workspace ou LP-INFRA, jamais calculée ou mise en cache dans Loop Engine.
- Loop Engine ne doit pas décider *lui-même* si un worker est disponible : il doit au plus consommer un état déjà observé (à l'image du contrat de santé transverse `C1`/`Projects/HEALTH.md`) pour admettre ou refuser un plan, sans health check, routeur ni failover propre à Loop Engine.
- Cette frontière reste non implémentée : aucun health check, routeur ou failover n'est ajouté par ce lot.

## Compatibilité

- Aucun contrat public JSON existant (`--json` de `summary`/`context`/`next`/`prompt`/`review`/`handoff`) n'est modifié par cet audit.
- `LoopExecutionPlan` reste interne à `src/loop/` et n'est aujourd'hui sérialisé nulle part. JP1 fait évoluer la frontière `LoopExecutor` de manière interne en séparant le cwd local du plan gouverné, sans modifier les contrats JSON publics existants.
- `BoundaryHandoff` reste hors périmètre — c'est un concept RFC distinct, non branché à l'exécution.

## Hors périmètre (ce lot JP0)

- Aucune modification de `src/**`.
- Aucun nouveau type `JobPackage`.
- Aucune sérialisation cross-host du plan.
- Aucun health check, routeur ou failover de worker.
- Aucune intégration OpenClaw.
- Aucune décision sur `src/automation/**` / `src/service/**` (code non consommé, hors sujet de cet audit — déjà noté comme distinct dans `docs/roadmap/loop-engine.md`).

## Prochain micro-lot implémentable (JP1)

Property observable ciblée : **les executors réels ne dépendent plus de `LoopExecutionPlan.project.path` pour choisir leur cwd ; le chemin d'exécution est fourni séparément comme contexte local d'invocation, tandis que le comportement local et les worktrees isolés restent inchangés.**

Constat réel à l'origine du mécanisme : `runLoopExecute` connaît déjà `executionProject.path` (y compris lorsqu'il s'agit d'un worktree isolé via `options.executionProjectPath`, `execute-runner.ts:245-248`) indépendamment de la construction du plan. Les deux executors réels (`claude-code-cli-executor.ts`, `codex-cli-executor.ts`) consomment aujourd'hui `plan.project.path` uniquement pour déterminer leur `cwd`.

Mécanisme cible, à documenter ici sans l'implémenter dans ce lot :

1. `LoopExecutionPlan` reste inchangé dans JP0 (aucune modification de `src/**` dans ce lot) ; conserver temporairement `project: ProjectConfig` dans le plan pour compatibilité est acceptable — JP1 élimine d'abord sa *consommation* comme emplacement physique par les executors, pas sa présence dans le plan.
2. `runLoopExecute` fournit séparément le chemin physique d'exécution qu'il connaît déjà (`executionProject.path`), en plus du plan gouverné.
3. La frontière `LoopExecutor` reçoit le plan gouverné **et** un contexte local minimal contenant le `cwd` — sans fusionner les deux notions dans un même champ de plan.
4. `claude-code-cli-executor.ts` et `codex-cli-executor.ts` consomment ce cwd local fourni séparément au lieu de lire `plan.project.path`.
5. Aucun resolver host, health check, routing ou worker selection n'est ajouté ; aucune nouvelle abstraction générique au-delà du minimum requis par cette frontière (pas de nouveau type `JobPackage`, pas de sérialisation cross-host).

Ce micro-lot ne retire rien du plan actuel, ne casse aucun executor existant (le `cwd` réellement utilisé reste identique — y compris pour les worktrees isolés), et démontre la première propriété de portabilité réelle : les executors n'ont plus besoin de lire un chemin physique porté par le plan gouverné pour s'exécuter.
