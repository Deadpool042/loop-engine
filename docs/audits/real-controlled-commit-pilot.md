# Real Controlled Commit Pilot — Burn-in 5

- SHA testé (Loop Engine) : `d1eeb5f` (branche `test/real-provider-pilot-burn-in`)
- Version Claude Code : `2.1.222 (Claude Code)`
- Date : 2026-08-05

## Scénario

Dépôt Git temporaire dédié, hors du dépôt Loop Engine, déclaré via un
`projects.yaml` isolé. Chaîne exercée en conditions réelles :
`runLoopExecute` → validation réelle (`node validate.mjs`) → `runLoopCommit`
→ commit Git réel, via `pnpm loop run <project> --mode commit --provider
claude_code --provider-executable <claude> --commit-message "..." --json`.

Roadmap du dépôt cible : une seule candidate, sur une ligne unique,
demandant de créer exactement `pilot-result.txt` contenant `controlled
commit pilot`.

## Runs

| Run | Résultat | Cause |
| --- | --- | --- |
| 1 | `failed` (validation) | Le modèle a écrit les métadonnées du plan d'exécution dans le fichier au lieu du contenu attendu, car la ligne candidate captée par le roadmap reader ne portait pas le contenu réel (`controlled commit pilot` était sur une ligne séparée du fichier). |
| 2 | `failed` (validation) | Même cause, reproduite à l'identique (contenu du fichier identique au run 1). |
| 3 | `failed` (validation) | Même cause, reproduite à l'identique. |
| 4 | `completed` | Roadmap corrigée pour porter le contenu attendu sur la même ligne que la candidate. `modifiedFiles == ["pilot-result.txt"]`, validation `passed`, commit réel créé. |

## Résultat final (run 4)

- `status: completed`, `mode: commit`
- `validation.status: passed`
- `modifiedFiles: ["pilot-result.txt"]`
- `commit.sha: 8933142c64f882a9f079d1c98c53a5644d041b52`
- `commit.message: "test: real controlled commit pilot"`
- `publication: null`

Vérifications post-run sur le dépôt cible :

- `git status --porcelain=v1` : vide (worktree propre)
- `git show --pretty=format: --name-only HEAD` : `pilot-result.txt` uniquement
- `git log -1` : SHA et message ci-dessus
- contenu de `pilot-result.txt` : exactement `controlled commit pilot`

## Analyse de la cause des échecs (runs 1–3)

Le roadmap reader capture la candidate comme une seule ligne marquée
(`- [ ] ...`). Le prompt du provider (`buildPrompt` dans
`src/loop/claude-code-cli-executor.ts`) transmet `plan.candidate.text` tel
quel. Quand le contenu à écrire est placé sur une ligne distincte de la
ligne candidate, le provider ne le reçoit jamais comme instruction : c'est
un défaut de formatage de la roadmap de test, pas un bug du moteur. Le
comportement du moteur a été correct à chaque run : validation réelle,
échec fermé (`validation_failed`), aucun commit sur échec, budget de
réparation à 0 respecté (aucune tentative de réparation).

## Conclusion

La chaîne complète `runLoopExecute → validation réelle → runLoopCommit →
commit Git réel` a été démontrée en conditions réelles sur un projet
non-fixture, avec un commit borné explicite ne contenant que le fichier
validé. Le decision gate « intégrer `runLoopExecute`/`runLoopCommit` en
conditions réelles sur un projet non-fixture, avec commit borné explicite »
est levé.
