# Autonomous Loop Runner

## Statut

Lot V7.1 — architecture et contrats uniquement (historique).

Lot V7.2 — noyau du LoopRunner implémenté, **mode `plan` uniquement**. La commande `pnpm loop run <project>` est routée par la CLI et exécute `runLoopPlan`. Aucun agent n'est appelé, aucune modification du worktree, aucun commit et aucun push ne sont effectués. Les modes `execute`, `commit` et `publish` restent non implémentés et sont rejetés explicitement (voir section 11).

## Objectif

Le Loop Runner orchestre un cycle de développement autonome par petits lots : analyser le projet, sélectionner le prochain micro-lot, préparer le contexte, déléguer l'exécution à un agent, valider le résultat, corriger ou arrêter en cas d'échec, committer si le lot est validé, recommencer, et ne publier que lorsqu'un mode explicite l'autorise.

Ce document décrit uniquement le rôle du runner, ses contrats et ses garde-fous. Il ne décrit pas d'implémentation TypeScript.

## 1. Rôle du runner

Le runner orchestre **un seul micro-lot à la fois**.

Il ne réimplémente aucune logique métier déjà portée par les commandes existantes :

- `next` — sélection du candidat de roadmap ;
- `context` — préparation du contexte court ;
- `prompt` — préparation du prompt à déléguer ;
- `handoff` — contexte humain supervisé ;
- `audit` — validation exécutable et score ;
- `validate` — exécution des validations configurées ;
- `rag-search` — recherche dans l'index local.

Le runner **compose** ces capacités existantes ; il ne les duplique pas. Toute logique de sélection, de contexte ou de validation qui existe déjà dans `src/intelligence/` ou `src/commands/` doit être appelée, jamais réécrite dans le runner.

## 2. États du cycle

Modèle d'état typé, au minimum :

- `idle` — aucun cycle en cours ;
- `planning` — analyse du projet et sélection du candidat ;
- `ready` — candidat sélectionné, contexte préparé, en attente de lancement ;
- `executing` — l'agent modifie le worktree ;
- `validating` — exécution des validations locales et de l'audit ;
- `repairing` — tentative de correction après un échec de validation ;
- `completed` — cycle terminé avec succès ;
- `blocked` — cycle arrêté par un garde-fou (candidat bloqué, worktree sale, etc.) ;
- `failed` — cycle arrêté après épuisement du budget de réparation ou erreur non récupérable ;
- `cancelled` — cycle interrompu explicitement par l'utilisateur.

## 3. Résultat d'un cycle — `LoopRunResult`

Contrat conceptuel, destiné à guider une future implémentation TypeScript et un futur schéma JSON. Champs :

- `schemaVersion` — version du contrat, suit la même convention que les autres sorties JSON de Loop Engine ;
- `runId` — identifiant unique du cycle, utilisé pour `--resume` ;
- `project` — nom du projet ciblé, tel que déclaré dans `projects.yaml` ;
- `status` — un des états terminaux ou intermédiaires définis en section 2 ;
- `startedAt` — horodatage de début de cycle ;
- `completedAt` — horodatage de fin de cycle, nul tant que le cycle n'est pas terminé ;
- `candidate` — le candidat de roadmap sélectionné (issu de `next`) ;
- `steps` — journal ordonné des étapes traversées (état, horodatage, résumé) ;
- `validation` — résultat des validations locales et de l'audit exécutées pendant `validating` ;
- `modifiedFiles` — liste des fichiers modifiés par l'agent pendant `executing` ;
- `commit` — référence du commit créé si le mode `commit` ou `publish` a validé le lot, nul sinon ;
- `publication` — détails de push/tag si le mode `publish` a été utilisé, nul sinon ;
- `failure` — raison structurée de l'échec ou du blocage, nulle en cas de succès ;
- `agentPolicy` — champ additif (V7.4) : une résolution de politique d'agent **prévisionnelle** (`AgentPolicyResolution`, voir `docs/architecture/agent-policy-engine.md`) pour le candidat sélectionné, nulle si le cycle est `blocked` ou `failed`. Ajout rétrocompatible : `schemaVersion` reste `1`.

Ce contrat doit rester suffisamment précis pour qu'une implémentation ultérieure puisse le typer directement en TypeScript, sans reformulation.

## 4. Modes d'exécution

- **`plan`** — analyse seulement ; aucune modification du worktree. **Mode par défaut.**
- **`execute`** — autorise l'agent à modifier le worktree ; aucun commit.
- **`commit`** — autorise un commit après validation complète ; aucun push.
- **`publish`** — autorise push et éventuellement tag ; doit être explicitement demandé, jamais implicite.

Chaque mode inclut les garanties du mode précédent : `execute` inclut les garanties de `plan`, `commit` inclut celles de `execute`, `publish` inclut celles de `commit`.

## 5. Garde-fous

- un seul micro-lot par cycle ;
- worktree propre (`git status` clean) requis avant tout cycle en mode `commit` ou `publish` ;
- aucun `git reset --hard` ;
- aucun force-push ;
- aucune suppression de branche ou de tag sans autorisation explicite ;
- arrêt immédiat (état `failed`) si la validation échoue encore après le nombre maximal de réparations ;
- conservation d'un journal de cycle (`LoopJournal`), inspectable après coup ;
- chaque action doit être reproductible et inspectable à partir du journal ;
- les projets observés restent read-only, à l'exception du seul projet explicitement ciblé par le cycle ;
- le mode `publish` n'est jamais implicite : il doit être demandé explicitement via `--mode publish` ;
- possibilité d'annulation entre chaque étape (transition vers `cancelled`) ;
- budget maximal de tentatives de réparation, configurable via `--max-repairs` ;
- pas de boucle infinie : le budget de réparation est fini et son épuisement mène systématiquement à `failed`, jamais à une nouvelle tentative silencieuse.

## 6. Séparation des responsabilités

Composants conceptuels, chacun spécialisé et testable indépendamment :

- **`LoopPlanner`** — analyse le projet (via `ProjectSnapshot` et `next`) et sélectionne le candidat de micro-lot.
- **`LoopExecutor`** — délègue l'exécution du lot à un agent, dans le worktree du projet ciblé.
- **`LoopValidator`** — exécute les validations locales (`validate`, `audit`) et détermine si le lot est acceptable.
- **`LoopRepairer`** — prépare une tentative de correction lorsque la validation échoue, dans la limite du budget de réparation.
- **`LoopCommitter`** — crée un commit lorsque le lot est validé, en mode `commit` ou `publish`.
- **`LoopPublisher`** — pousse et tague, uniquement en mode `publish`.
- **`LoopJournal`** — enregistre chaque étape du cycle pour inspection et reproductibilité.
- **`LoopRunner`** — orchestre les composants ci-dessus selon la machine à états ; ne contient aucune logique métier propre.

Le runner orchestre. Les composants restent spécialisés et testables séparément, sans dépendance croisée non nécessaire.

## 7. Machine à états

Transitions autorisées :

- `idle -> planning`
- `planning -> ready | blocked | failed`
- `ready -> executing | completed | cancelled`
- `executing -> validating | failed | cancelled`
- `validating -> completed | repairing | failed`
- `repairing -> executing | validating | failed`
- `completed -> idle`

Règles complémentaires :

- toute transition non listée ci-dessus est interdite ;
- `cancelled` est accessible depuis `ready`, `executing` ou `repairing`, jamais depuis `completed` ;
- `ready -> completed` correspond à l'achèvement d'un cycle en mode `plan` : aucune phase d'exécution n'a lieu, le cycle se termine directement depuis `ready`. C'est une transition de première classe de la machine à états, jamais un contournement du runner ; `runLoopPlan` y passe par le même mécanisme `transition()` que tout autre changement d'état ;
- une publication (mode `publish`) ne peut avoir lieu qu'après une transition réussie vers `completed`, jamais depuis `validating` ou `repairing` directement ;
- `repairing -> executing | validating | failed` respecte toujours le budget `--max-repairs` : au-delà, seule la transition vers `failed` est autorisée.

## 8. CLI cible

Commande future, non implémentée dans ce lot :

```bash
pnpm loop run <project>
pnpm loop run <project> --mode plan
pnpm loop run <project> --mode execute
pnpm loop run <project> --mode commit
pnpm loop run <project> --mode publish
```

Options futures à documenter :

- `--json` — sortie JSON du `LoopRunResult`, suivant le même contrat que les autres commandes JSON de Loop Engine ;
- `--max-repairs <n>` — budget maximal de tentatives de réparation ;
- `--candidate <id>` — force un candidat de roadmap précis plutôt que la sélection automatique de `next` ;
- `--dry-run` — équivalent forcé du mode `plan`, quel que soit `--mode` fourni ;
- `--resume <runId>` — reprend un cycle interrompu à partir de son `runId` et de son journal.

Aucune de ces options ni la commande `run` elle-même n'est implémentée dans ce lot.

## 9. Compatibilité avec la philosophie existante

Loop Engine vise désormais l'orchestration autonome par petits lots, en plus de son rôle de cockpit d'inspection et de préparation de contexte.

Cette évolution ne retire aucune protection existante :

- le mode par défaut (`plan`) reste non destructif — aucune modification, aucun appel IA automatique implicite ;
- `commit` et `push` nécessitent des modes explicitement sélectionnés (`commit`, `publish`) ; ils ne sont jamais déclenchés par défaut ;
- la validation locale (`validate`, `audit`) précède toujours tout commit et toute publication ;
- l'humain définit les objectifs, les permissions et les limites (mode, budget de réparation, candidat ciblé) avant chaque cycle.

Voir `docs/architecture/final-objective.md`, `CLAUDE.md` et `README.md` pour la formulation à jour de la philosophie produit.

## 10. Portée du lot V7.1

Ce lot était un lot de conception et de contrats uniquement :

- aucun code d'exécution d'agent ;
- aucune commande `run` implémentée ;
- aucun commit automatique ;
- aucun push ;
- aucun tag ;
- aucune modification des projets observés.

## 11. Portée du lot V7.2 — noyau du LoopRunner, mode `plan`

Ce lot implémente le noyau exécutable du runner, strictement limité au mode `plan` :

- `src/loop/types.ts` — `LoopRunMode`, `LoopRunStatus`, `LoopRunStep`, `LoopRunFailure`, `LoopRunResult` ;
- `src/loop/state-machine.ts` — `canTransition(from, to)`, implémentant exactement la machine à états de la section 7, y compris `ready -> completed` (achèvement direct d'un cycle `plan`) ;
- `src/loop/planner.ts` — `planLoopCycle(project)`, un `LoopPlanner` pur qui compose `buildProjectSnapshot` (donc `next`/roadmap) sans dupliquer sa logique, et retourne soit un candidat prêt avec ses étapes prévues, soit un statut bloqué ;
- `src/loop/runner.ts` — `runLoopPlan(projectName, options?)`, qui orchestre `idle -> planning -> ready -> completed` (candidat sûr disponible) ou `idle -> planning -> blocked` (aucun candidat sûr disponible, y compris lorsque le seul candidat détecté est `blocked` au sens de la roadmap) ;
- `src/commands/run.ts` et le routage CLI `pnpm loop run <project> [--mode plan] [--json]`.

Règles strictes de ce lot :

- **seul le mode `plan` est exécutable** ; `execute`, `commit` et `publish` sont rejetés avec le message `Loop run mode not implemented: <mode>` et un code de sortie non nul (JSON : `{"schemaVersion":1,"ok":false,"error":{"code":"mode_not_implemented","message":"..."}}`) ;
- le mode par défaut de `pnpm loop run <project>` est `plan` ;
- en mode `plan`, `runLoopPlan` n'appelle aucun agent (Claude Code, OpenClaw ou futur agent), n'écrit aucun fichier, ne lance aucun commit et aucun push ;
- `modifiedFiles` est toujours vide, `commit` et `publication` toujours `null`, et `failure` reste `null` en cas de succès ;
- un candidat de roadmap dont le `kind` est `blocked` n'est jamais traité comme prêt à démarrer : le cycle passe alors à `blocked`, cohérent avec la politique déjà appliquée par `next` (voir `CLAUDE.md`) ;
- la sortie `--json` d'un run réussi ou bloqué reste toujours un `LoopRunResult` valide avec `schemaVersion: 1`, même quand `status` vaut `blocked` — seul le rejet d'un mode non implémenté produit un code de sortie non nul ;
- l'horloge, le générateur de `runId` et le planner sont injectables dans `runLoopPlan`, ce qui rend les tests entièrement déterministes ;
- `LoopExecutor`, `LoopValidator`, `LoopRepairer`, `LoopCommitter` et `LoopPublisher` restent non implémentés ; ils feront l'objet de lots ultérieurs, de même que les adaptateurs `ClaudeCodeAgent`, `OpenClawAgent` et l'intégration n8n.

## 12. Portée du lot V7.4 — Agent Policy Engine (prévision en mode `plan`)

Ce lot relie la couche `src/agents/` (V7.3) au `LoopRunner` via un moteur de politique local et déterministe (`src/policy/`, voir `docs/architecture/agent-policy-engine.md`), **sans implémenter le mode `execute`** et sans modifier le comportement terminal du mode `plan` (`idle -> planning -> ready -> completed` ou `idle -> planning -> blocked`, inchangé).

Une fois le cycle `ready`, `runLoopPlan` calcule une résolution de politique prévisionnelle pour le candidat sélectionné — quelles capacités, permissions, effort et budget le lot demanderait, et quel profil d'agent serait sélectionné si le cycle passait un jour à l'exécution réelle — sans jamais appeler cet agent. Le résultat est exposé sur le champ additif `agentPolicy` de `LoopRunResult` (voir section 3).

Règles strictes de ce lot :

- aucun agent n'est appelé, aucun réseau, aucun SDK fournisseur, aucun processus externe ;
- le mode `plan` ne fait jamais d'appel réel (`DEFAULT_MODE_BUDGETS.plan.maxCalls` vaut `0`) ; la sélection prévisionnelle utilise un budget de capacité distinct (simulant le mode `execute`) uniquement pour évaluer quel profil *serait* sélectionné, jamais pour en appeler un ;
- aucune permission d'écriture n'est jamais requise en mode `plan`, quelle que soit la catégorie du lot (`getAllowedPermissionsForMode("plan")` ne contient que `read_only`) ;
- `LoopExecutor`, `LoopValidator`, `LoopRepairer`, `LoopCommitter` et `LoopPublisher` restent non implémentés, inchangé depuis V7.2 ;
- aucun commit, push ou tag automatique.

## Architecture d'intégration

Loop Engine est le moteur d'orchestration autonome. Les agents IA (Claude Code, OpenClaw, futurs agents) ne sont que des exécutants. n8n orchestre les déclenchements externes, sans jamais porter de logique métier.

Trois couches, empilées dans cet ordre :

```text
External orchestration
- n8n
- cron
- webhooks
- API
- CI/CD

↓

Loop Engine
- machine à états
- planification
- validation
- réparation
- journalisation
- politique Git
- permissions
- gestion des reprises
- orchestration des commandes

↓

Execution agents
- Claude Code
- OpenClaw
- futurs agents compatibles
```

- **Loop Engine peut fonctionner seul.** L'orchestration externe (n8n, cron, webhooks, API, CI/CD) est optionnelle ; le runner reste utilisable directement en CLI sans aucune couche externe.
- **Claude Code et OpenClaw sont interchangeables.** Le runner ne dépend d'aucun agent d'exécution particulier.
- **n8n ne contient aucune logique d'audit.** Toute validation reste portée par `audit` et `validate` dans Loop Engine.
- **n8n ne décide jamais des commits.** La politique Git (modes `commit`/`publish`) reste entièrement portée par Loop Engine.
- **n8n ne décide jamais des validations.** Loop Engine seul détermine si un lot est acceptable.
- **n8n ne décide jamais des réparations.** Le budget et la logique de réparation restent internes au runner.
- **n8n déclenche uniquement des cycles.** Son rôle se limite à invoquer Loop Engine (cron, webhook, événement CI/CD), jamais à interpréter ou orienter le résultat.
- **Loop Engine expose des sorties JSON destinées à être consommées par n8n.** Ces sorties suivent le même contrat `schemaVersion` que le reste des commandes JSON de Loop Engine ; elles sont en lecture seule pour tout consommateur externe.

## Interface Agent

Le `LoopRunner` ne dépend jamais directement de Claude. Il dialogue avec une interface générique d'agent d'exécution, à laquelle tout agent compatible peut se conformer :

```text
Agent
 ├── ClaudeCodeAgent
 ├── OpenClawAgent
 ├── FutureAgent
```

Le `LoopRunner` ne connaît que cette interface — jamais une implémentation d'agent particulière. Remplacer ou ajouter un agent d'exécution ne modifie donc jamais la machine à états, la validation, ni la politique Git du runner.

Depuis le lot V7.3, cette interface conceptuelle est typée localement dans `src/agents/` (`AgentRuntime`, `AgentProfile`, `AgentRegistry`, `AgentSelector`, stratégie d'escalade) — sans aucun appel réseau ni mode `execute`. Voir `docs/architecture/agent-orchestration.md`.

## Voir aussi

- `docs/architecture/final-objective.md`
- `docs/architecture/commands.md`
- `docs/architecture/project-intelligence.md`
- `docs/architecture/roadmap-reader.md`
- `docs/architecture/audit-engine.md`
- `docs/architecture/agent-orchestration.md`
- `docs/architecture/agent-policy-engine.md`
