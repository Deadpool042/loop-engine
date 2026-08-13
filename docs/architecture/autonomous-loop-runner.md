# Autonomous Loop Runner

## Statut

- Lot V7.1 — architecture initiale, historique.
- Lot V7.2 — `runLoopPlan(...)` et mode `plan` implémentés.
- Lots V7.4–V7.5 — prévision de politique et contexte borné intégrés au plan.
- Lot V14.4 — `runLoopExecute(...)`, validation et réparation bornée implémentés.
- le mode `commit` contrôlé est implémenté ; `publish` reste non implémenté.
- `--resume` reste futur.

Le contrat détaillé du cycle V14.4 est dans
`docs/architecture/looprunner-execute-validation-repair.md`. Le présent document
consolide la vision, les modes et les garde-fous du LoopRunner.

## Objectif

Le LoopRunner orchestre un seul lot de développement à la fois : sélectionner un
candidat, construire un contexte borné, résoudre la politique, déléguer à un port
d'exécution explicite, valider le résultat et éventuellement réparer dans une
limite finie.

Il compose les capacités existantes de Loop Engine et ne réimplémente pas la
lecture de roadmap, la construction de `ProjectSnapshot`, la politique, le
contexte ou la validation configurée.

## Composants

- **LoopPlanner** — sélection déterministe du candidat via `ProjectSnapshot`.
- **LoopExecutor** — port injecté autorisé à modifier le seul projet ciblé.
- **LoopValidator** — port injecté ; l'adapter par défaut compose les validations
  configurées et l'audit prévu par le projet.
- **LoopRepairer** — port injecté appelé après une validation échouée et seulement
  tant que le budget le permet.
- **LoopCommitter** — frontière Git contrôlée, appelée uniquement par le mode `commit` explicite après validation réussie.
- **LoopPublisher** — futur ; absent de V14.4.
- **LoopRunner** — orchestration et machine à états uniquement.

Les **Execution agents** Claude Code et Codex sont disponibles uniquement par
configuration explicite. Une **Interface Agent** ou une externalité ne peut être
utilisée qu'au travers d'un `LoopExecutor` revu et injecté.

## Modes

### `plan`

Mode par défaut et non destructif. `runLoopPlan(projectName, options?)` suit :

```text
idle -> planning -> ready -> completed
```

Il ne déclenche aucun agent, aucune modification, aucun commit et aucune
publication. `agentPolicy` est une prévision et `contextPackage` est borné.

### `execute`

Mode explicitement demandé. `runLoopExecute(projectName, options?)` suit le
cycle V14.4 :

```text
idle
-> planning
-> ready
-> executing
-> validating
-> completed | repairing | failed
```

Après une réparation réussie :

```text
repairing -> validating -> completed | repairing | failed
```

Le runner exige une résolution de politique `execute` sélectionnée avant l'appel
à `LoopExecutor`. L'exécuteur est appelé au plus une fois. Les validations ne
commencent qu'après un résultat d'exécution `completed`.

Sans provider explicitement configuré, la CLI utilise `unavailableLoopExecutor`
et retourne `failure.code = "executor_unavailable"`. Avec le provider Codex ou
Claude Code explicitement configuré, la composition acquiert d'abord un lock par
projet puis exécute provider et validation dans un Git worktree isolé et
temporaire. Le dépôt source ne reçoit aucune modification du mode `execute`.

`--export-patch <path>` est une option opt-in réservée à `execute` avec un
provider explicite. Après la validation finale réussie, la composition exporte
le diff Git binaire du worktree isolé vers ce chemin. L'artefact est refusé si
la destination existe ou si le delta Git ne correspond pas aux fichiers
modifiés validés. Le parent doit déjà exister : aucune destination implicite
n'est créée. Le résultat contient seulement `path`, `sha256` et `fileCount`,
jamais le contenu du patch. L'export ne crée ni commit, ni promotion, ni
application dans le dépôt source ; l'inspection et un éventuel `git apply`
restent des actions humaines externes.

### `commit`

Le mode `commit` exige un message explicite et crée uniquement un commit Git
borné après un cycle validé. Il conserve pour l'instant son chemin direct
historique : l'isolation temporaire est limitée au mode `execute` tant qu'aucune
promotion explicite depuis un worktree isolé n'a été conçue.

### `publish`

Futur. `publish` devra être explicitement demandé après validation et commit. Il
ne pourra jamais être implicite. V14.4 laisse toujours `publication: null`.

## États

`LoopRunStatus` contient :

- `idle` ;
- `planning` ;
- `ready` ;
- `executing` ;
- `validating` ;
- `repairing` ;
- `completed` ;
- `blocked` ;
- `failed` ;
- `cancelled`.

Toutes les transitions passent par `canTransition(...)`. Une transition absente
de la table est interdite. V14.4 n'implémente pas encore une commande publique
d'annulation ni la persistance de `cancelled`, mais conserve le vocabulaire du
contrat.

## LoopRunResult

Chaque cycle retourne un `LoopRunResult` avec `schemaVersion: 1` :

- `runId`, `project`, `mode`, `status`, `startedAt`, `completedAt` ;
- `candidate` ;
- `steps` ordonnés ;
- `validation` ;
- `modifiedFiles` ;
- `commit` et `publication` ;
- `failure` ;
- `agentPolicy` ;
- `contextPackage`.

En mode `execute`, `validation` expose le statut final, le nombre de validations,
le nombre de réparations, les commandes configurées, la dernière commande
échouée et son code de sortie. Les fichiers déclarés par l'exécuteur et le
réparateur sont normalisés, dédupliqués et triés.

Les exceptions brutes, stacks, commandes provider, credentials et sorties non
bornées ne doivent pas être exposés dans le résultat public.

## Réparation bornée

`--max-repairs <n>` accepte un entier positif ou nul. La valeur par défaut est
`0`.

Après chaque validation échouée :

1. le runner vérifie le budget restant ;
2. il exige un `LoopRepairer` injecté ;
3. il appelle une réparation ;
4. il relance la validation ;
5. il termine en `failed` lorsque le budget est épuisé.

Une boucle infinie est impossible : `repairAttempts >= maxRepairs` mène à
`validation_failed` et aucune nouvelle réparation silencieuse n'est autorisée.

## Garde-fous

- un seul candidat par cycle ;
- admission de politique avant tout exécuteur ;
- un seul appel d'exécuteur par cycle ;
- validation uniquement après exécution réussie ;
- revalidation après chaque réparation ;
- budget de réparation fini ;
- erreurs de ports redacted et fail-closed ;
- aucun accès provider ou credential ambiant depuis le runner ;
- aucun `git reset --hard` ;
- aucun force-push ;
- aucun commit, push ou tag en mode `execute` ;
- les worktrees isolés et locks sont libérés en succès comme en échec ;
- le mode `plan` reste le défaut.

## CLI actuelle

```bash
pnpm loop run <project>
pnpm loop run <project> --mode plan
pnpm loop run <project> --mode plan --json
pnpm loop run <project> --candidate H1-L4 --mode plan --json
pnpm loop run <project> --mode execute
pnpm loop run <project> --mode execute --max-repairs 1 --json
pnpm loop run <project> --mode execute --export-patch ./validated.patch --json
```

La commande `execute` échoue avec `executor_unavailable` sans provider concret.
Le mode `commit` requiert `--commit-message`. Seule la commande suivante reste
reconnue puis rejetée :

```bash
pnpm loop run <project> --mode publish
```

Options futures non implémentées :

- `--dry-run` comme alias forcé de plan ;
- `--resume <runId>` avec journal durable.

## External orchestration

L'**External orchestration** peut piloter la CLI et consommer le JSON, mais elle
ne contourne jamais les politiques ni les modes.

- **n8n** peut enchaîner des appels explicites et lire `LoopRunResult`.
- **OpenClaw** peut devenir un provider seulement via un adapter futur revu.
- **Claude Code** et **Codex** sont des `LoopExecutor` concrets uniquement
  lorsqu'ils sont explicitement configurés, avec permissions et budget admis.
- Une **Interface Agent** doit utiliser les contrats publics et ne peut créer
  d'autorité implicite.

Loop Engine reste la source de décision sur le candidat, la politique, le budget,
les validations et le statut final. Les Execution agents restent
interchangeables et subordonnés aux ports.

## Séparation avec V14.3

V14.3 compose une demande inbound préparée vers le Runtime gardé. V14.4 compose
le cycle projet du LoopRunner. Ces deux verticales partagent la discipline
fail-closed mais n'appellent pas directement leurs handlers respectifs :

- V14.3 traite une demande Runtime transport-neutral ;
- V14.4 traite un candidat de roadmap et des ports de travail sur projet.

Aucun des deux chemins ne crée un provider concret, une identité persistante ou
une permission de commit.

## Compatibilité et évolution

Le mode V7.2 `plan` garde son comportement et son JSON. L'ajout de la valeur
`validation` en mode `execute` est additif sous `schemaVersion: 1` ; le champ
existait déjà sous la forme `null` dans les résultats plan.

Les futures étapes restent :

- V14.5 — identité, ACL, replay persistants et un adapter inbound ;
- réparation provider, promotion explicite d'un worktree isolé et publication ;
- publication, reprise durable et annulation opérationnelle après revue dédiée.

Toute évolution doit préserver le défaut non destructif, la validation avant
commit et l'absence de publication implicite.

## Liaison explicite d'un candidat

`run <project> --candidate <id>` résout le candidat dans le snapshot courant,
avant le plan comme avant l'exécution. Un identifiant explicite ne tombe jamais
silencieusement sur le candidat `next` : identifiant inconnu, ambigu, terminé,
bloqué, non admissible ou indisponible pour une roadmap historique provoquent
un résultat fail-closed. L'exécution relit donc l'état courant et refuse le
même identifiant s'il est devenu inadmissible ; elle ne le remplace pas par un
autre candidat.

Une gate de phase explicite évaluée par le Roadmap Reader fait partie de cette
relecture. Une phase qui se ferme entre le plan et `execute` bloque l'exécution
avant toute résolution de provider ou création de changement ; l'identifiant
confirmé n'est jamais remplacé par un autre candidat.
