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

## Routage IA cible

Dans la cible d'architecture, **aucun runtime IA n'est primaire par statut**. Loop Engine reste l'autorité de gouvernance : il sélectionne le travail admissible, impose les gates, construit le contexte borné, valide le résultat et produit l'evidence. Lorsqu'un lot requiert une exécution IA, le runtime/provider/modèle/effort doit être choisi par la politique à partir des capacités, permissions, disponibilité, budget et signaux de quota réellement connus — jamais parce que ChatGPT, Claude ou Codex serait codé en dur comme chemin principal.

**ChatGPT + Development Workspace** reste une surface d'orchestration interactive possible et utile, mais n'est plus une cible d'architecture privilégiée. Claude Code, Codex, OpenClaw natif et tout autre runtime explicitement qualifié sont des candidats soumis aux mêmes contrats d'admission et de validation. L'indisponibilité d'un runtime particulier ne doit pas bloquer l'écosystème si un autre candidat compatible et gouverné existe ; aucune bascule silencieuse n'est autorisée.

Les opérations qui ne nécessitent aucun raisonnement génératif restent entièrement déterministes : lecture des roadmaps, sélection des candidats, gates, état Git, historique des runs, diagnostics, validations et projections de cockpit.

Aucune API IA payante ne constitue un fallback implicite. Une API externe payante reste une exception explicitement autorisée pour une action précise. L'objectif est de maximiser le travail réalisé via les abonnements interactifs et les outils déterministes, sans transformer les quotas/crédits API en dépendance d'infrastructure.

L'autonomie cible est forte **à l'intérieur d'un micro-lot** : préparation, implémentation, validations, réparation bornée, review et livraison peuvent être orchestrées jusqu'à un gate explicite. Les décisions structurantes ou irréversibles (brief initial, roadmap initiale, architecture majeure, secret/facturation, production, destruction de données) restent soumises à une validation humaine explicite.

Les assistants et runtimes qui améliorent Loop Engine doivent préserver ces garde-fous, respecter les contrats JSON et travailler par petits lots vérifiables.

## Source de vérité produit

Ce document constitue la source de vérité de l’objectif final de Loop Engine.
