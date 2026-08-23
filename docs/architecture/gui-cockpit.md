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
et n'appelle aucun provider.

### Frontière de confiance

Le preload expose seulement les API explicites suivantes :

```ts
window.loopDesktop.summary();
window.loopDesktop.context(projectName);
window.loopDesktop.review(projectName);
window.loopDesktop.plan(projectName, candidateId);
window.loopDesktop.execute({ projectName, candidateId, provider, model });
window.loopDesktop.startExecution({
  projectName,
  candidateId,
  provider,
  model,
});
window.loopDesktop.executionSession(sessionId);
```

Elles correspondent uniquement aux canaux `loop:summary`, `loop:context` et
`loop:review`, `loop:plan`, `loop:execute`, `loop:execution-start` et
`loop:execution-session`. Il n'existe aucun IPC générique de la forme commande +
arguments, et `ipcRenderer` n'est pas exposé au renderer.

Le renderer ne peut jamais fournir le `cwd`. Le process principal résout le
repository Loop Engine de confiance, à partir de sa configuration locale ou de
l'emplacement de l'application, et le valide par la présence de `src/cli.ts`
et du package `loop-engine` avant de déléguer au `CliInvoker`.

La fenêtre conserve `contextIsolation: true`, `nodeIntegration: false` et
`sandbox: true`. Le cockpit ne propose aucune action de commit, push, merge,
validation ou exécution provider, sauf l'exécution isolée explicitement confirmée d'un candidat adressable. Le renderer ne transmet alors que projet, candidat et provider approuvé ; le main process impose l'exécutable, le timeout, le cwd de confiance et le dialogue natif de destination du patch. Aucun commit, push, merge ou application de patch n'est exposé.

### Intégration CLI

Le process principal invoque exclusivement :

| IPC            | Commande CLI                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `loop:summary` | `pnpm loop summary --json`                                                                               |
| `loop:context` | `pnpm loop context <project> --json`                                                                     |
| `loop:review`  | `pnpm loop review <project> --json`                                                                      |
| `loop:plan`    | `pnpm loop run <project> --candidate <id> --mode plan --json`                                            |
| `loop:execute` | `pnpm loop run <project> --candidate <id> --mode execute ... --export-patch <native destination> --json` |

Le `CliInvoker` des lectures reste limité au lancement, au délai d'expiration
et au parsing JSON. L'exécution longue dispose d'une frontière dédiée : le
main process lance le CLI avec un canal auxiliaire de transitions structurées.
Le JSON final reste sur stdout et conserve son contrat existant ; le renderer
ne reçoit jamais stdout/stderr brut, prompt, secrets, termes interdits ni
diagnostics internes redacted.

Après confirmation, `startExecution` ouvre une unique session observable. La
vue affiche le projet, candidat, provider, modèle, effort issu du plan,
statut, historique court et résultat final / export de patch existants. Les
seuls événements publics sont `session_started`, `preparing`,
`execution_started`, `validation_started`, `completed` et `failed`. Ils sont
émis par les transitions effectives du runner (pas par temporisation), conservés
dans une fenêtre bornée de 24 événements et consultés par identifiant de
session. Un second démarrage pendant une session non terminale est refusé
déterministiquement. La fermeture normale de la fenêtre reste bloquée jusqu'au
résultat terminal.

Il n'y a ni terminal/shell générique, ni pseudo-terminal, ni commande ou cwd
contrôlable par React, ni exécution parallèle, queue, commit, push, merge ou
application du patch. L'annulation n'est pas exposée : le runtime courant ne
démontre pas encore l'arrêt et le nettoyage bornés du provider et du worktree.

Les lectures conservent leur délai court. `loop:execute` utilise un invoker
distinct borné à 15 minutes : il couvre au plus 10 minutes de Claude Code,
les validations, le nettoyage et une marge, sans délai infini ni réglage
contrôlable par le renderer. Une fermeture normale de la fenêtre est bloquée
pendant cette invocation. Au timeout, le process CLI reçoit `SIGTERM`, puis
`SIGKILL` après une grâce bornée si nécessaire. Une seconde grâce bornée attend
la fermeture : à défaut, la session échoue publiquement sans prétendre que le
process est arrêté. Cette frontière ne prétend pas nettoyer ni contrôler les
descendants du provider.

## Cible et lots futurs

Les éléments suivants sont des pistes historiques ou des évolutions possibles,
pas des capacités du cockpit livré : `status`, `next`, `prompt`, `validate`,
les réglages exposés à l'utilisateur, l'exécution provider, les actions sur le
système de fichiers et toute commande d'écriture.

Toute évolution devra conserver les principes ci-dessus : contrat JSON public,
IPC explicite et minimal, résolution du repository côté main process, et
absence de logique métier dans React. Elle nécessite un lot dédié ; elle ne
peut pas être déduite de ce document.

## Historique

Un ancien prototype Electron autonome a existé sous `gui/`. Il n'était appelé
ni par les scripts racine ni par la CI et a été retiré lors de la consolidation
du cockpit racine. Le seul runtime GUI maintenu est désormais `src/gui/**`.
