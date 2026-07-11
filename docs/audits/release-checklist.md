# Release Checklist

Audit tag release checklist

## Objectif

Cette checklist formalise la vérification du worktree avant tout tag d'audit.

## Vérifications obligatoires

- Exécuter `git status --short --untracked-files=all`.
- Exécuter `git diff --stat`.
- Exécuter `git diff --staged --stat`.
- Vérifier que les fichiers créés attendus apparaissent bien dans le commit.
- Ne pas tagger tant que des fichiers non suivis attendus restent présents.
- Si un tag incomplet a déjà été publié, créer un tag correctif `.1` sans force-push.
- Ne pas supprimer les tags supersédés.
- Ne pas réécrire l'historique.

ne pas supprimer les tags supersédés
ne pas réécrire l'historique

## Règle pratique

Avant de publier un tag d'audit, le worktree doit être vérifié explicitement et le commit doit contenir tous les fichiers attendus.

## Voir aussi

- `docs/audits/stable-tags.md`
- `docs/audits/audit-engine-v5-final.md`
