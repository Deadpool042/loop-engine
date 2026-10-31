# M3 — Relocation locale de Loop Engine (Mac)

Statut : **préflight documenté ; exécution physique non autorisée tant que les contrôles ne sont pas tous PASS**.

## État observé le 31 octobre 2026

- Source : `/Users/laurent/Projects/loop-engine` (présente).
- Destination : `/Users/laurent/Projects/platform/loop-engine` (absente).
- `main` synchronisée au commit `4d30fe8424ed8567cef17aa48da80356ee867d34`.
- Deux worktrees propres sous `.worktrees/m3-b3-4-path-confinement` et `.worktrees/m3-b3-project-path-resolution`.
- Chaque fichier `.worktrees/*/.git` pointe par chemin absolu vers `<source>/.git/worktrees/*` ; chaque `.git/worktrees/*/gitdir` pointe vers `<source>/.worktrees/*/.git`.
- `projects.yaml` accepte les chemins `@projects/loop-engine` et `@projects/platform/loop-engine`.
- Tests ciblés macOS 2/2 PASS, typecheck PASS. Suite complète et inventaire VPS non qualifiés.

## Préflight obligatoire (lecture seule)

1. Vérifier `git -C "$SRC" status --porcelain=v1` et `git -C "$SRC" worktree list --porcelain` ; inventorier les branches, les changements non suivis et les éventuels worktrees extérieurs.
2. Vérifier `git -C "$SRC" fsck --no-reflogs` et `git -C "$SRC" rev-parse HEAD` ; noter le SHA.
3. Vérifier que `$DST` n'existe pas, que `$SRC` et `$DST` sont sur le même volume et que l'espace disque est suffisant.
4. Rechercher les références absolues à `$SRC` dans LaunchAgents, scripts, tâches planifiées, configuration DW et projets consommateurs ; documenter celles à migrer. Ne pas modifier un service actif sans fenêtre de maintenance.
5. Confirmer que le runtime Loop Engine et les processus qui utilisent son cwd sont arrêtés. Préserver `.worktrees/` même s'il est non suivi.
6. Vérifier sur le VPS son `LOOP_PROJECTS_ROOT`, ses chemins réels et l'absence d'ambiguïté des alias. Le VPS n'est pas qualifié à ce jour.

## Opération Mac (à exécuter uniquement après préflight PASS)

Depuis une session terminal locale, sans processus utilisant le répertoire :

```bash
set -euo pipefail
SRC="$HOME/Projects/loop-engine"
DST="$HOME/Projects/platform/loop-engine"
test -d "$SRC/.git"
test ! -e "$DST"
test -d "$(dirname "$DST")"
test -z "$(git -C "$SRC" status --porcelain=v1 --untracked-files=no)"
git -C "$SRC" worktree list --porcelain
# Vérifier manuellement la liste complète des worktrees avant l'étape suivante.
mv -- "$SRC" "$DST"
git -C "$DST" worktree repair \
  "$DST/.worktrees/m3-b3-4-path-confinement" \
  "$DST/.worktrees/m3-b3-project-path-resolution"
git -C "$DST" worktree list --porcelain
git -C "$DST" status --short
git -C "$DST/.worktrees/m3-b3-4-path-confinement" status --short
git -C "$DST/.worktrees/m3-b3-project-path-resolution" status --short
```

**Attention :** le bloc ci-dessus n'est pas un script autonome approuvé : il n'inventorie pas les processus ni les dépendances externes, et les chemins des deux worktrees doivent être revalidés immédiatement avant exécution. `git worktree repair` est la commande Git prévue pour réparer les références des worktrees après déplacement ; vérifier sa sortie et les deux directions de liens.

## Postflight et rollback

- Confirmer `git rev-parse HEAD` inchangé, `git worktree list --porcelain`, les trois `git status`, la résolution du registre avec `LOOP_PROJECTS_ROOT="$HOME/Projects"`, puis les tests ciblés.
- Mettre à jour uniquement les références externes effectivement identifiées ; redémarrer les services concernés et vérifier leurs healthchecks.
- En cas d'échec, arrêter les processus concernés, remettre `$DST` vers `$SRC` (si `$SRC` est toujours absent), puis exécuter `git -C "$SRC" worktree repair "$SRC/.worktrees/m3-b3-4-path-confinement" "$SRC/.worktrees/m3-b3-project-path-resolution"`. Refaire les contrôles Git et restaurer les références externes modifiées.
- Ne pas lancer `git worktree prune` ni supprimer les worktrees pour « réparer » le déplacement.

## Limites de preuve

Cette procédure ne constitue **pas** une preuve de migration. Le connecteur DW actuellement disponible n'autorise pas le déplacement de répertoires ni l'exécution libre de `git worktree repair`. Aucune opération de déplacement n'a été réalisée.
