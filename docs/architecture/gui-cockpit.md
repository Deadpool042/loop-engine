# GUI Cockpit

## État livré

Le cockpit desktop livré est l'application Electron Forge définie à la racine
du dépôt. Ses points d'entrée sont `forge.config.cjs`,
`webpack.main.config.cjs`, `webpack.renderer.config.cjs` et `src/gui/**` ; les
scripts disponibles sont `pnpm run gui:start` et `pnpm run gui:package`.

Il est un consommateur local, strictement read-only, des contrats JSON du CLI.
Il ne constitue pas une couche du moteur. Voir
[ADR-0006](adr/0006-gui-cockpit-external-json-consumer.md) et
[JSON Consumers](../integrations/json-consumers.md).

### Interface

L'écran unique utilise un split-view desktop :

- la liste de projets à gauche ;
- le résumé du projet sélectionné à droite ;
- les sections indépendantes `Context`, `Plan explicite` et `Review` dans le détail.

L'utilisateur déclenche `summary()` avec le bouton Actualiser. Le premier
projet disponible est alors sélectionné ; un changement de sélection déclenche
les lectures de contexte et de review correspondantes. Les états loading,
empty et erreur sont locaux à la vue ou à la section concernée.

Les champs affichés proviennent des contrats CLI : nom, type, chemin, branche,
état Git, health, contexte et données structurées de review. Le summary projette
aussi, pour chaque projet, la disponibilité du travail déjà calculée par le
Core et le dernier résultat terminal du Run History ; la liste des projets les
rend visibles sans relire directement les journaux JSONL. React ne recalcule
ni le statut Git, ni l'admissibilité roadmap, ni l'impact documentaire, ni la
validation.

Quand le candidat recommandé par `Context` expose un identifiant stable, le
cockpit peut demander un plan explicite pour ce couple projet + candidat. Il
affiche alors le candidat, la politique prévisionnelle, les étapes et le
contexte borné retournés par le moteur. Cette action prépare uniquement un plan
et n'appelle aucun provider. Le contrat GUI conserve l'identité runtime,
provider et modèle ainsi que deux notions d'effort distinctes : l'effort
d'invocation issu de `requirements.minimumEffort`, qui est celui affiché et
utilisé par l'exécution, et l'effort du profil, conservé séparément comme donnée
de classement du sélecteur. Le renderer ne recalcule aucune de ces valeurs.

### Frontière de confiance

Le preload expose seulement les API explicites suivantes :

```ts
window.loopDesktop.summary();
window.loopDesktop.context(projectName);
window.loopDesktop.review(projectName);
window.loopDesktop.runs(projectName);
window.loopDesktop.plan(projectName, candidateId);
window.loopDesktop.execute({ projectName, candidateId, provider, model });
window.loopDesktop.startExecution({
  projectName,
  candidateId,
  provider,
  model,
});
window.loopDesktop.executionSession(sessionId);
window.loopDesktop.cancelExecution(sessionId);
```

Elles correspondent uniquement aux canaux `loop:summary`, `loop:context` et
`loop:review`, `loop:runs`, `loop:plan`, `loop:execute`, `loop:execution-start`,
`loop:execution-session` et `loop:execution-cancel`. Il n'existe aucun IPC
générique de la forme commande + arguments, et `ipcRenderer` n'est pas exposé
au renderer.

Le renderer ne peut jamais fournir le `cwd`. Le process principal résout le
repository Loop Engine de confiance, à partir de sa configuration locale ou de
l'emplacement de l'application, et le valide par la présence de `src/cli.ts`
et du package `loop-engine` avant de déléguer au `CliInvoker`.

La fenêtre conserve `contextIsolation: true`, `nodeIntegration: false` et
`sandbox: true`. Le cockpit ne propose aucune action de commit, push, merge,
validation ou exécution provider, sauf l'exécution isolée explicitement confirmée d'un candidat adressable. Le renderer ne transmet alors que projet, candidat et provider approuvé ; le main process impose l'exécutable, le timeout, le cwd de confiance et le dialogue natif de destination du patch. Aucun commit, push, merge ou application de patch n'est exposé.

### Intégration CLI

Le process principal invoque exclusivement :

| IPC            | Commande CLI                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `loop:summary` | `pnpm loop summary --json`                                                                          |
| `loop:context` | `pnpm loop context <project> --json`                                                                |
| `loop:review`  | `pnpm loop review <project> --json`                                                                 |
| `loop:runs`    | `pnpm loop runs <project> --json --limit 20`                                                        |
| `loop:plan`    | `pnpm loop run <project> --candidate <id> --mode plan --json`                                       |
| `loop:execute` | `loop run <project> --candidate <id> --mode execute ... --export-patch <native destination> --json` |

Le `CliInvoker` des lectures reste limité au lancement, au délai d'expiration
et au parsing JSON. L'exécution longue dispose d'une frontière dédiée : le
main process lance directement le runtime Node/tsx de Loop Engine, sans wrapper
`pnpm`, avec un canal auxiliaire de transitions structurées. Le JSON final reste
sur stdout et conserve son contrat existant ; le renderer ne reçoit jamais
stdout/stderr brut, prompt, secrets, termes interdits ni diagnostics internes
redacted.

Après confirmation, `startExecution` ouvre une unique session observable. La
vue affiche le projet, candidat, provider, modèle, effort d'invocation issu du
plan, statut, historique court et résultat final / export de patch existants.
L'effort de classement du profil reste disponible séparément dans le contrat de
plan et ne doit jamais être présenté comme l'effort réellement demandé au
provider. Les seuls événements publics sont `session_started`, `preparing`,
`execution_started`, `validation_started`, `completed`, `failed` et
`cancelled`. Ils sont émis par les transitions effectives du runner (pas par
temporisation), conservés dans une fenêtre bornée de 24 événements et consultés
par identifiant de session. Un second démarrage pendant une session non
terminale est refusé déterministiquement. La fermeture normale de la fenêtre
reste bloquée jusqu'au résultat terminal.

### Historique borné des runs (V28)

`loop:runs` est un consumer explicitement read-only de `loop runs <project>
--json --limit 20`. La limite est imposée par le handler du process principal,
jamais fournie par React. Le renderer ne reçoit que le nom du projet et ne lit
jamais `.loop-engine/runs/*.jsonl` ni le filesystem directement.

`run-history-contract.ts` valide fail-closed le rapport public (`schemaVersion`,
projet, limite, `entries` et `corruptedLines`) puis ne projette que les données
utiles au cockpit : identifiant du run, mode, statut terminal, dates et
identifiant de candidat. Les statuts `completed`, `blocked`, `failed` et
`cancelled` sont tous représentables ; `cancelled` reste un résultat historique
valide et ne force pas le contrat de revue V27, dont la responsabilité est la
session d'exécution structurée. Pour un `execute` compatible, la projection
réutilise `ExecutionResultDetail` de V27.

### Patch Review (V30)

V30 ajoute une revue du patch exporté pour la session d'exécution courante
uniquement. L'historique ne garantit pas la durée de vie d'un export externe :
il ne peut donc pas rouvrir un patch ancien. La source de vérité reste le
`patchExport` terminal produit par `exportValidatedGitPatch` : le worktree
isolé exécute `git diff --binary HEAD`, vérifie que les chemins correspondent
au delta validé, puis écrit atomiquement le fichier choisi par le dialogue
natif. Le SHA-256 et `fileCount` retournés appartiennent à cette preuve.

`window.loopDesktop.patchReview(sessionId)` est le seul IPC ajouté. React ne
transmet ni chemin, ni cwd, ni option filesystem. Le main process retrouve la
session, revalide son résultat V27, puis refuse tout fichier absent, symlink,
non régulier, supérieur à 2 MiB, non UTF-8, binaire, SHA-256 incohérent,
`fileCount` incohérent ou diff invalide. Il retourne seulement une projection
de unified diff (fichiers, statuts déterministes, hunks, lignes et compteurs),
jamais le chemin librement choisi ni une API de lecture générique. Un échec est
structuré (`no_patch`, `missing_patch`, `integrity_mismatch`, `too_large`,
`unsupported_binary`, `invalid_patch` ou `internal_read_failure`) et aucun
contenu brut n'est affiché en repli.

La vue affiche liste de fichiers, sélection, compteurs et lignes numérotées
dans un panneau à scroll indépendant. Cette capacité reste intégralement en
lecture seule : elle n'applique, n'édite, ne valide à nouveau et ne relance
jamais un patch ou un provider.

L'historique est de l'observabilité seulement : il n'influe ni sur la sélection,
ni sur la policy, ni sur les budgets. `corruptedLines > 0` avertit que certaines
entrées JSONL ont été ignorées par le Core, tout en affichant les entrées valides.
Une réponse IPC ou JSON invalide est affichée comme erreur locale ; le changement
de projet invalide toute réponse en vol. Un rafraîchissement unique suit le
résultat terminal d'une exécution de la session concernée, sans polling,
websocket, observer filesystem ni bus global.

### Revue structurée du résultat d'exécution (V27)

Le résultat terminal d'une session (`executionSession.result.json`, un
`LoopRunResult` — voir `src/loop/types.ts`) n'est jamais projeté brut dans le
renderer. `src/gui/desktop/execution-result-contract.ts` expose
`parseExecutionResultDetail(value: unknown)`, un parseur déterministe et
fail-closed qui accepte uniquement un statut terminal (`completed`, `blocked`
ou `failed`) cohérent avec la présence ou l'absence d'un échec structuré, et
projette seulement les champs affichés par le cockpit : `status`,
`modifiedFiles`, `validation` (statut, tentatives, réparations, commande
échouée et code de sortie), `patchExport` (chemin, nombre de fichiers,
SHA-256) et `failure` (code, message, détails déjà redacted par le moteur).
Toute forme non reconnue, y compris une combinaison statut/échec ambiguë,
retourne `null` plutôt qu'un résultat partiel.

`app.tsx` consomme exclusivement cette projection : la section « Exécution
isolée confirmée » affiche le statut, les fichiers modifiés, le résultat de
validation, l'état de l'export du patch et, en cas d'échec, le code et le
message d'erreur — sans jamais appeler `JSON.stringify` sur le résultat brut
ni exposer de stack trace, de stderr ou de diagnostic interne. Ce lot ne
change pas `LoopRunResult`, n'ajoute aucun contrat IPC et n'ajoute aucune
action d'application du patch, de commit, de push ou de merge : l'export de
patch reste la seule frontière de sortie.

Il n'y a ni terminal/shell générique, ni pseudo-terminal, ni commande ou cwd
contrôlable par React, ni exécution parallèle, queue, commit, push, merge ou
application du patch. L'annulation est exposée via `loop:execution-cancel` sans
nouveau contrat IPC. Sur les plateformes POSIX utilisées par le cockpit, le
runtime d'exécution est leader d'un groupe de processus dédié : l'annulation
envoie d'abord `SIGTERM` au groupe, conserve le runtime Loop Engine vivant le
temps que ses `finally` libèrent le worktree isolé et le lock projet, puis tue
par `SIGKILL` les descendants qui résistent et vérifie leur disparition. Le
résultat `cancelled` n'est publié qu'après fermeture du runtime et confirmation
de l'absence de descendants ; une impossibilité de confirmer la terminaison ou
le nettoyage échoue fermé. Le fallback hors POSIX reste borné au process direct
et ne revendique pas cette garantie de groupe.

Les lectures conservent leur délai court. `loop:execute` utilise un invoker
distinct borné à 15 minutes : il couvre au plus 10 minutes de Claude Code,
les validations, le nettoyage et une marge, sans délai infini ni réglage
contrôlable par le renderer. Une fermeture normale de la fenêtre est bloquée
pendant cette invocation. Le timeout et l'annulation partagent le même chemin
de terminaison borné : grâce `SIGTERM`, terminaison des descendants résistants,
puis grâce finale pour laisser le runtime terminer le nettoyage. Si le runtime
ne se ferme pas après ce nettoyage borné, il est lui-même terminé et la session
échoue publiquement plutôt que de prétendre une libération non démontrée.

## Cible et lots futurs

Les éléments suivants sont des pistes historiques ou des évolutions possibles,
pas des capacités du cockpit livré : `status`, `next`, `prompt`, `validate`,
les réglages exposés à l'utilisateur, les actions sur le système de fichiers
et toute commande d'écriture. L'exécution provider observable (session
isolée, export de patch, revue structurée du résultat) est livrée depuis V23
et affinée en V27 ; elle ne figure plus dans cette liste depuis la
réconciliation documentaire du présent lot.

Toute évolution devra conserver les principes ci-dessus : contrat JSON public,
IPC explicite et minimal, résolution du repository côté main process, et
absence de logique métier dans React. Elle nécessite un lot dédié ; elle ne
peut pas être déduite de ce document.

## Historique

Un ancien prototype Electron autonome a existé sous `gui/`. Il n'était appelé
ni par les scripts racine ni par la CI et a été retiré lors de la consolidation
du cockpit racine. Le seul runtime GUI maintenu est désormais `src/gui/**`.
