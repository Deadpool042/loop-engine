# Autonomous Loop Runner

## Statut

- Lot V7.1 — architecture initiale, historique.
- Lot V7.2 — `runLoopPlan(...)` et mode `plan` implémentés.
- Lots V7.4–V7.5 — prévision de politique et contexte borné intégrés au plan.
- Lot V14.4 — `runLoopExecute(...)`, validation et réparation bornée implémentés.
- le mode `commit` contrôlé est implémenté ; V33 publie uniquement une ref Git
  candidate isolée, jamais un patch dans le worktree source.
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
- **LoopPublisher** — frontière V33 spécialisée: après une exécution isolée
  validée, elle publie au plus une ref candidate interne; elle n'applique pas
  de patch et ne modifie pas une branche utilisateur.
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

Mode explicitement demandé, jamais déclenché après `execute`. V33 réutilise
l'exécution isolée et sa validation, exporte le patch validé dans un emplacement
temporaire puis produit un commit candidat parenté exactement par `baseSha`.
La publication finale est une création compare-and-create de
`refs/loop-engine/candidates/<project>/<runId>`. Aucun `refs/heads/*`, HEAD,
index ou fichier du worktree source ne change; aucun push, PR, merge, checkout
ou application de patch n'est effectué.

`publication` vaut alors `{ kind: "candidate_ref", ref, commitSha, baseSha }`;
sinon il reste `null`. Une collision de ref ou un HEAD devenu stale est un échec
terminal fail-closed. Governed Patch Application demeure une capacité distincte
et différée.

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
pnpm loop run <project> --mode publish --provider codex --provider-executable codex --json
```

La commande `execute` échoue avec `executor_unavailable` sans provider concret.
Le mode `commit` requiert `--commit-message`. `publish` requiert un provider
explicite comme `execute`; il n'accepte ni nom de ref ni destination contrôlés
par l'utilisateur.

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

## Décision d'exécution projet V1

Un projet peut activer une décision explicite via `execution_decision`, un
chemin projet relatif non vide dans `projects.yaml`. Sans cette clé, le projet
reste legacy et conserve la sélection heuristique historique.

Le document YAML V1 contient `version: 1`, le `project` attendu, une décision
parmi `READY`, `BLOCKED`, `REVALIDATION_REQUIRED` ou `NO_ACTIONABLE_WORK`, et
`source.gitHead` au format SHA complet. `source.document` est optionnel.
`READY` exige `decision.candidate.id`; les trois autres états bloquent toujours.
Les champs `reason` et `nextAction` sont seulement informatifs et n'accordent
jamais d'autorisation. Une décision absente, invalide, rattachée à un autre
projet ou stale bloque sans repli vers une suggestion roadmap.

Pour `execute` provider-backed, `execution_decision` est résolu contre le chemin
canonique du projet déclaré dans `projects.yaml`, y compris lorsque le provider
reçoit un worktree isolé. Le HEAD comparé reste celui du checkout/worktree
réellement exécuté avant l'appel provider. La décision READY lie donc le candidat
au SHA de ce worktree, sans devoir être présente dans le commit qu'elle autorise :
cette séparation project-scoped évite toute circularité entre son contenu et le
SHA autorisé. Une divergence bloque avant tout appel provider.

## Run History (évidence d'exécution inter-run)

Le Run History est une couche d'**observabilité**, distincte de toute mémoire
gouvernée : elle persiste des faits d'exécution déjà produits par le
LoopRunner, sans jamais dériver, inférer, ou décider quoi que ce soit à partir
d'eux. C'est le premier historique inter-run persistant de Loop Engine.

**Run History ≠ Project Memory.** Le Run History enregistre des faits bruts
(un `LoopRunResult` terminal, tel quel). La mémoire projet — la couche RAG
locale documentée dans `docs/architecture/memory-layer.md`
(`.loop-engine/rag-index.json`) — reconstruit un contexte dérivé et gouverné à
partir de la documentation du dépôt. Les deux mécanismes ne partagent ni
fichier, ni modèle, ni cycle de vie.

- **Écriture.** `recordLoopRunHistory` (`src/core/run-history.ts`) est appelé
  une seule fois par invocation `run`, juste après que `runLoopPlan`,
  `runLoopExecute` ou `runLoopCommit` a résolu un `LoopRunResult`
  (`src/commands/run.ts`). Seul un statut **terminal**
  (`completed`, `blocked`, `failed`, `cancelled`) est écrit ; un état
  intermédiaire (`idle`, `planning`, `ready`, `executing`, `validating`,
  `repairing`) ne produit jamais d'entrée. Un run produit au maximum une
  entrée d'historique. Les trois modes (`plan`, `execute`, `commit`) sont
  journalisés uniformément : un cycle `plan` bloqué ou échoué (candidat
  refusé, aucun candidat sûr, etc.) est déjà un fait d'exécution réel et utile
  à l'analyse ultérieure (répétition d'échecs, stagnation) ; en exclure un
  mode par défaut serait un jugement métier que ce lot n'introduit pas.
- **Contrat persisté.** Chaque ligne du journal est le `LoopRunResult`
  lui-même, sérialisé tel quel : il porte déjà `schemaVersion`, `project`
  (identité canonique du projet, la même clé `name` que `projects.yaml`) et
  `completedAt`. Aucune enveloppe supplémentaire n'a été introduite : elle
  aurait dupliqué un modèle déjà complet.
- **Emplacement.** `.loop-engine/runs/<project>.jsonl` — append-only, une
  ligne JSON par run terminal, dans le même répertoire local, reconstructible
  et ignoré par Git (`.loop-engine/`) que l'index RAG.
- **Isolation projet.** Le nom de fichier est dérivé du champ `project` du
  résultat (identique à la clé `name` de `projects.yaml`) et validé contre un
  identifiant strict avant toute résolution de chemin, ce qui empêche toute
  collision entre projets, toute lecture cross-project et tout path
  traversal.
- **Échec d'écriture.** Un échec d'écriture (identité de projet invalide,
  erreur système de fichiers) ne transforme jamais un run réussi en échec :
  le `LoopRunResult` gouverné n'est pas muté. Il n'est cependant jamais
  silencieux — `run` le signale explicitement (`terminal.warning(...)` en
  sortie humaine, `LOOP_RUN_HISTORY_WRITE_FAILED:` sur `stderr` en JSON, à
  l'image du canal `LOOP_EXECUTION_EVENT:` déjà utilisé par
  `--progress-events`).
- **Lecture.** `pnpm loop runs <project> [--json] [--limit N]`
  (`src/commands/runs.ts`, `generateRunHistoryReport` dans
  `src/core/reports.ts`) expose une vue bornée, en lecture seule, la plus
  récente d'abord — c'est-à-dire l'exact inverse de l'ordre d'ajout physique
  du journal, qui n'est jamais réordonné sur disque. La lecture scanne le
  journal en blocs de taille fixe et ne conserve jamais en mémoire plus que
  la fenêtre demandée (`limit`, défaut 20, plafond 100), quelle que soit la
  taille du fichier sur disque.
- **Corruption.** Un journal absent n'est pas une corruption : c'est
  simplement l'absence de run enregistré. Une ligne invalide (JSON
  imparsable, `schemaVersion` inconnu, entrée rattachée à un autre projet)
  est ignorée mais jamais masquée : elle est comptée dans `corruptedLines`,
  toujours exposé dans le rapport.
- **Rétention.** Aucun moteur de rétention n'est implémenté dans ce lot : le
  journal reste append-only sans limite physique. Seule la lecture est
  bornée. Une politique de rétention sera décidée ultérieurement, sur preuve
  d'un volume réel observé en usage.
- **Hors périmètre (explicitement).** Le Run History observe ; il ne
  gouverne rien. Aucun détecteur de stagnation, aucun circuit breaker, aucune
  politique de retry basée sur l'historique, aucun cap de dépense cumulée,
  aucune auto-escalade ou auto-downgrade ne sont introduits par ce
  mécanisme — ces capacités restent différées jusqu'à preuve fournie par
  l'historique réel une fois en usage.
