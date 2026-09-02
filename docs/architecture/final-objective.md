# Loop Engine — Objectif final

Loop Engine est un cockpit CLI local, déterministe et read-only.

Son objectif final est de transformer l’état réel des projets Git, leurs docs et leurs règles en :

- contexte court pour Claude/Codex/ChatGPT ;
- prochaine action sûre ;
- validations locales ;
- audit exécutable ;
- rapport humain ;
- rapport JSON stable ;
- recommandations priorisées.

Loop Engine vise désormais l'orchestration autonome par petits lots : analyser un projet, sélectionner le prochain micro-lot, préparer le contexte, déléguer l'exécution à un agent, valider le résultat, corriger ou arrêter en cas d'échec, committer si le lot est validé, recommencer, et ne publier que lorsqu'un mode explicite l'autorise. Voir `docs/architecture/autonomous-loop-runner.md`.

Le choix de l'agent qui exécuterait un micro-lot est lui-même déterministe et local : un moteur de politique (`src/policy/`) transforme un micro-lot planifié en capacités, permissions, effort et budget requis, puis en sélection d'agent explicable — prévisionnelle en mode `plan`, jamais un appel réel. Voir `docs/architecture/agent-policy-engine.md`.

Le contexte préparé pour ce micro-lot est lui aussi construit localement, de façon déterministe et bornée : un constructeur de contexte (`src/context/`) transforme un `ProjectSnapshot` et le budget de contexte prévisionnel en un paquet de fichiers borné, déduplicé, jamais en dépassement de budget. Voir `docs/architecture/minimal-context-builder.md`.

L'impact documentaire d'un changement est qualifié localement avant tout appel IA : `src/documentation/documentation-impact.ts` transforme une liste de chemins modifiés en `DocumentationImpactReport` déterministe. Le rapport indique les documents d'architecture concernés et si une revue sémantique est requise ; il ne modifie aucun fichier et ne déclenche aucun modèle. L'objectif est de réserver l'IA aux changements réellement sémantiques et de conserver une auto-documentation gouvernée, explicable et à coût nul par défaut.

Le comportement par défaut reste non destructif : pas d'appel IA automatique, pas de commit automatique, pas de push automatique et aucune modification arbitraire des projets observés. Une exception de gouvernance est autorisée uniquement lorsqu'un projet déclare explicitement `execution_decision` : après approbation humaine, Loop Engine peut publier ce seul artefact de décision dans le chemin configuré, avec confinement au projet, écriture transactionnelle, validation post-publication et récupération en cas d'échec de validation. Cette exception n'autorise aucune logique métier ni aucune écriture générale dans le projet observé. Un `execute` explicitement configuré s'effectue dans un Git worktree isolé et temporaire, jamais dans le dépôt source. Ces garanties ne s'effacent jamais devant un mode explicitement sélectionné : pas de commit automatique et pas de push automatique restent la règle tant qu'un mode `commit` ou `publish` n'a pas été explicitement demandé par l'humain.

## Runtime IA principal et spécialistes

Dans le mode interactif normal, **ChatGPT + Development Workspace** constitue le runtime IA principal. Loop Engine fournit la gouvernance, le contexte, les décisions déterministes et les validations ; il ne doit pas déclencher un second modèle simplement parce qu'un raisonnement est nécessaire alors que ChatGPT pilote déjà la mission.

Les opérations qui ne nécessitent aucun raisonnement génératif restent entièrement déterministes : lecture des roadmaps, sélection des candidats, gates, état Git, historique des runs, diagnostics, validations et projections de cockpit.

Claude Code, Codex et les autres runtimes restent des spécialistes secondaires **opt-in**. Ils ne font pas partie du chemin critique et ne sont appelés que lorsqu'un avantage concret est démontré pour un lot donné (par exemple exécution spécialisée, seconde lecture indépendante, tâche mécanique volumineuse ou expérimentation). Leur indisponibilité ne doit pas empêcher le fonctionnement normal de l'écosystème.

Aucune API IA payante ne constitue un fallback implicite. Une API externe payante reste une exception explicitement autorisée pour une action précise. L'objectif est de maximiser le travail réalisé via les abonnements interactifs et les outils déterministes, sans transformer les quotas/crédits API en dépendance d'infrastructure.

L'autonomie cible est forte **à l'intérieur d'un micro-lot** : préparation, implémentation, validations, réparation bornée, review et livraison peuvent être orchestrées jusqu'à un gate explicite. Les décisions structurantes ou irréversibles (brief initial, roadmap initiale, architecture majeure, secret/facturation, production, destruction de données) restent soumises à une validation humaine explicite.

Les assistants et runtimes qui améliorent Loop Engine doivent préserver ces garde-fous, respecter les contrats JSON et travailler par petits lots vérifiables.

## Source de vérité produit

Ce document constitue la source de vérité de l’objectif final de Loop Engine.
