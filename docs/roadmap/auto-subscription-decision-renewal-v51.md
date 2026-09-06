# V51 — Renouvellement autonome de la décision d'exécution

Date : 2026-09-06

## Contexte

V50.0 a livré le chemin `publish --auto-subscription` et OpenClaw Control a livré le CTA `Continuer`.

Le durcissement #257 a ensuite imposé une décision d'exécution locale, liée au SHA, avec :

- candidat exact ;
- `allowedPaths` explicites ;
- brief de mission ;
- refus des décisions absentes, périmées ou incohérentes.

Ce garde-fou est correct, mais il a révélé un raccordement manquant : une façade pouvait demander le candidat canonique exact sans disposer d'un mécanisme d'abonnement pour renouveler cette décision quand le SHA ou le candidat changeait.

## V51.0 — Renouvellement via abonnement

### Objectif

Rendre le contrat `execution_decision` renouvelable pendant une action explicite `Continuer`, sans API fournisseur payante et sans élargir les permissions de l'executor.

### Contrat

Le renouvellement est autorisé uniquement lorsqu'un projet possède explicitement `execution_decision` dans `projects.yaml`.

Une décision déjà valide est réutilisée sans appel IA.

Une décision manquante ou périmée peut être renouvelée lorsque :

- le candidat canonique est documenté par un détail de lot ;
- le SHA courant correspond au SHA déjà vérifié par le caller ;
- l'état existant n'est pas explicitement `BLOCKED` ou `NO_ACTIONABLE_WORK`.

La préparation utilise Claude Code avec l'abonnement local :

- modèle : `claude-haiku-4-5` ;
- effort : low ;
- mode `--restricted` ;
- `--tools ""` ;
- MCP refusés ;
- `--permission-mode plan` ;
- JSON Schema strict.

Claude ne peut que proposer le brief du brouillon. Le périmètre d’écriture AUTO ne dépend pas de sa sortie : il est lu mécaniquement depuis l’unique section `Périmètre d’écriture` du détail canonique, sous forme de chemins exacts en backticks, puis imposé à la décision. Loop Engine valide ensuite mécaniquement :

- identité projet/candidat/SHA ;
- chemin source de roadmap ;
- brief non vide ;
- présence du chemin source de roadmap dans le périmètre documenté ;
- scope exact ou terminal `/**` ;
- exclusion de `.git/**`, `.governance/**`, `.loop-engine/**` et du fichier de décision.

L'action humaine `Continuer` constitue l'autorisation explicite d'exécuter le candidat canonique sous ce contrat borné ; elle n'autorise toujours ni commit sur main, ni push, PR, merge ou déploiement.

### État

- [x] implémentation du renouvellement ;
- [x] opt-in explicite pour `loop-engine` et `openclaw-control` ;
- [x] tests adversariaux ciblés ;
- [ ] CI complète et merge.

## V51.1 — Burn-in réel du CTA Continuer

### Objectif

Prouver sur le projet `loop-engine` lui-même que le CTA OpenClaw :

1. relit la décision roadmap ;
2. relit le handoff et le SHA ;
3. renouvelle automatiquement la décision d'exécution via Claude Code abonnement si nécessaire ;
4. sélectionne l'executor/modèle via la policy AUTO existante ;
5. exécute dans un worktree isolé ;
6. valide le résultat ;
7. produit uniquement une candidate ref locale.

### Périmètre du burn-in

Le spécialiste ne doit produire qu'une preuve documentaire :

- créer `docs/audits/auto-continuation-burnin.md` avec le résultat borné du burn-in ;
- mettre à jour le statut V51.1 dans `docs/roadmap/loop-engine.md` seulement si le run lui-même fournit une preuve terminale exploitable.

### Périmètre d’écriture

- `docs/audits/auto-continuation-burnin.md`
- `docs/roadmap/loop-engine.md`

### Hors périmètre

- aucune modification de `src/**` ;
- aucune modification de `projects.yaml` ;
- aucun commit sur `main` par l'executor ;
- aucun push, PR, merge ou déploiement ;
- aucune API payante ;
- aucun appel Codex AUTO ;
- aucune notification n8n dans ce sous-lot : la notification reste la fermeture OC-9 distincte.

### Critères de fin

- `Continuer` ne retourne plus `mcp_tool_reported_error` pour absence/staleness de décision ;
- un fichier `.loop-engine/execution-decision.yaml` est renouvelé localement et reste ignoré par Git ;
- le Run History identifie le provider/runtime/modèle retenu ;
- le résultat terminal contient une `candidate_ref` et un commit SHA ;
- le dépôt source reste propre et `main` inchangé ;
- la preuve du burn-in est ensuite réconciliée humainement dans la roadmap.
