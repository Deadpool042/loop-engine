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

Loop Engine ne doit jamais devenir un agent autonome : pas d’appel IA automatique, pas de commit automatique, pas de push automatique, pas de modification des projets observés.

Claude doit donc améliorer le moteur, préserver les garde-fous, respecter les contrats JSON et travailler par petits lots vérifiables.

## Source de vérité produit

Ce document constitue la source de vérité de l’objectif final de Loop Engine.
