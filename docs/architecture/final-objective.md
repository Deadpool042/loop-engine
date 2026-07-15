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

Le comportement par défaut reste non destructif : pas d'appel IA automatique, pas de commit automatique, pas de push automatique, pas de modification des projets observés. Ces garanties ne s'effacent jamais devant un mode explicitement sélectionné : pas de commit automatique et pas de push automatique restent la règle tant qu'un mode `commit` ou `publish` n'a pas été explicitement demandé par l'humain.

Claude doit donc améliorer le moteur, préserver les garde-fous, respecter les contrats JSON et travailler par petits lots vérifiables.

## Source de vérité produit

Ce document constitue la source de vérité de l’objectif final de Loop Engine.
