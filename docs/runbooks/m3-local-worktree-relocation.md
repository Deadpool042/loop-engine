# M3 — Relocation locale de Loop Engine (Mac)

Statut : **migration physique Mac exécutée et vérifiée le 31 octobre 2026 ; VPS non qualifié**.

## État vérifié après migration (31 octobre 2026)

- Ancien chemin `/Users/laurent/Projects/loop-engine` absent ; chemin canonique livré : `/Users/laurent/Projects/platform/loop-engine`.
- Branche locale `main` et `origin/main` : `e6a4dd1c9d2500f5c7c7a074e07904068a9d14f9`, sans avance locale ou distante au moment du contrôle.
- Le déplacement a conservé le même volume. Le répertoire déplacé inclut les fichiers ignorés et l’état local, dont `.loop-engine/`, `.webpack/`, `node_modules/`, `out/` et `loop-engine.zip`.
- Les deux worktrees enregistrés sont conservés et propres : `m3-b3-4-path-confinement` à `cace55815b9fc0d4bfed4ba244d24f12e443581f`, et `m3-b3-project-path-resolution` à `815b829b936c1c2a3790778eea4baa563ebb6c54`. Les références `.git` et `gitdir` pointent toutes vers le nouvel emplacement.
- Le checkout canonique n'a aucun changement suivi ; `git status` signale uniquement le conteneur non suivi `.worktrees/`, qui contient ces deux worktrees enregistrés. Deux stashes sont conservés : `ffcde2b7f7f67b77e1644ada0d99b839a0d44119` et `2ccf42d0afac36c36ef3d2104b28d27738466ba7`.
- Le registre portable `projects.yaml` garde `@projects/loop-engine` comme chemin principal et `@projects/platform/loop-engine` comme alias. Avec `LOOP_PROJECTS_ROOT=/Users/laurent/Projects`, le résumé résout les cinq identités et Loop Engine vers le nouveau chemin.
- Le wrapper DW exporte désormais `DW_LOOP_ENGINE_PATH=platform/loop-engine`. Après son rechargement unique, le worker mac-local répond en V31, schéma 3, 87 outils ; `project_list` retourne les cinq identités et `project_handoff(loop-engine)` pointe vers le nouveau checkout.
- Les trois préférences de dépôt des interfaces Loop Engine présentes dans Application Support ont été mises à jour. Les historiques et signets de session Codex/IDE n'ont pas été réécrits.
- `pnpm run typecheck` passe ; les tests ciblés `project-path-confinement` et `project-path-aliases` passent (22/22). `git fsck --no-reflogs --connectivity-only` n'a signalé aucune erreur de connectivité ; ses objets pendants ont été laissés intacts.
- Sauvegarde privée des configurations modifiées : `/Users/laurent/Projects/.private-backups/loop-engine-relocation-20261031T235500Z`. Elle contient les versions précédentes du wrapper et des trois préférences GUI ; son manifeste SHA-256 a été vérifié. Le checkout lui-même a été déplacé par renommage sur le même volume, réversible par déplacement inverse.
- Aucune configuration de Loop Engine VPS n'a été observée : l'outil DW ne déclare aucun profil distant pour ce préflight. La qualification VPS reste en attente et n'était pas une dépendance de la migration Mac.

## Préflight obligatoire (lecture seule)

1. Vérifier `git -C "$SRC" status --porcelain=v1` et `git -C "$SRC" worktree list --porcelain` ; inventorier les branches, les changements non suivis et les éventuels worktrees extérieurs.
2. Vérifier `git -C "$SRC" fsck --no-reflogs` et `git -C "$SRC" rev-parse HEAD` ; noter le SHA.
3. Vérifier que `$DST` n'existe pas, que `$SRC` et `$DST` sont sur le même volume et que l'espace disque est suffisant.
4. Rechercher les références absolues à `$SRC` dans LaunchAgents, scripts, tâches planifiées, configuration DW et projets consommateurs ; documenter celles à migrer. Ne pas modifier un service actif sans fenêtre de maintenance.
5. Confirmer que le runtime Loop Engine et les processus qui utilisent son cwd sont arrêtés. Préserver `.worktrees/` même s'il est non suivi.
6. Vérifier sur le VPS son `LOOP_PROJECTS_ROOT`, ses chemins réels et l'absence d'ambiguïté des alias. Le VPS n'est pas qualifié à ce jour.

## Exécution locale consignée

Le préflight a confirmé le HEAD attendu, `origin/main` identique, la destination libre, le même volume, deux worktrees propres, les stashes inventoriés et l'absence de fichiers du dépôt ouverts par un processus actif. Un processus Node inerte était positionné dans un répertoire de fixture temporaire d'un worktree ; il n'avait aucun descripteur de fichier du dépôt ouvert et n'a pas été arrêté.

Le tunnel DW actif a été déchargé temporairement avant le déplacement. Son wrapper a reçu la configuration relative documentée `DW_LOOP_ENGINE_PATH=platform/loop-engine`. Le checkout a ensuite été renommé vers `platform/loop-engine` sur le même volume, puis les deux worktrees ont été réparés avec `git worktree repair`. Les premières lignes de la commande signalaient les anciennes valeurs de pointeur ; l'inspection après réparation a confirmé les nouveaux chemins dans les deux directions.

Le LaunchAgent DW a été rechargé une fois. Aucun LaunchAgent propre à Loop Engine n'était présent ; aucune interface GUI Loop Engine n'était en cours d'exécution. Aucun service Loop Engine ni VPS n'a été redémarré ou modifié.

## Postflight et rollback

- Confirmer `git rev-parse HEAD` inchangé, `git worktree list --porcelain`, les trois `git status`, la résolution du registre avec `LOOP_PROJECTS_ROOT="$HOME/Projects"`, puis les tests ciblés.
- Mettre à jour uniquement les références externes effectivement identifiées ; redémarrer les services concernés et vérifier leurs healthchecks.
- En cas d'échec, arrêter les processus concernés, remettre `$DST` vers `$SRC` (si `$SRC` est toujours absent), puis exécuter `git -C "$SRC" worktree repair "$SRC/.worktrees/m3-b3-4-path-confinement" "$SRC/.worktrees/m3-b3-project-path-resolution"`. Refaire les contrôles Git et restaurer les références externes modifiées.
- Ne pas lancer `git worktree prune` ni supprimer les worktrees pour « réparer » le déplacement.

## État des limites

La migration locale est vérifiée par l'état Git, les deux relations de worktree, le résumé Loop Engine à racine explicite et les appels DW postérieurs au rechargement. Le typecheck et les tests ciblés sont locaux ; aucune suite complète `pnpm run ci` n'a été relancée.

La CI distante de `main` n'a pas été relancée par cette migration sans changement de code. La configuration Loop Engine VPS et les chemins VPS restent non qualifiés. Aucune migration physique VPS n'est autorisée par ce runbook.
