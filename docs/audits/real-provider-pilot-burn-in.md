# Real Provider Pilot — Burn-in réel

- SHA testé : `329db86dc66039f7efcae8ec7ab2e3c3e22531d4`
- Version Claude Code : `2.1.222 (Claude Code)`
- Date : 2026-08-05

## Runs

| Run | Prompt | Résultat | modifiedFiles |
| --- | --- | --- | --- |
| 1 | Créer `run-one.txt` = "run one" | completed | `["run-one.txt"]` |
| 2 | Créer `run-two.txt` = "run two" | completed | `["run-two.txt"]` |
| 3 | Créer `run-three.txt` = "run three" | completed | `["run-three.txt"]` |

Chaque run a été exécuté avec le CLI `claude` réel (`--print --output-format json --permission-mode acceptEdits`) contre un dépôt Git temporaire dédié, hors du dépôt Loop Engine. Chaque run n'a produit que le fichier attendu ; les fichiers des runs précédents n'apparaissaient plus dans `git status --porcelain=v1` après leur commit intermédiaire.

## Conclusion

Les 3 exécutions réelles du provider Claude Code ont produit exactement le fichier attendu, sans effet de bord ni contamination inter-run. Le decision gate de burn-in réel est levé.
