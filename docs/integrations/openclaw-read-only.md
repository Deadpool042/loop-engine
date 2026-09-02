# OpenClaw Read-only Integration

## Objectif

Permettre à OpenClaw d'afficher le pilotage gouverné de Loop Engine sans devenir une seconde source de décision, sans déclencher d'action autonome et sans appeler de provider IA pour l'affichage.

Le Project Cockpit est une projection déterministe destinée à la supervision distante/mobile. Loop Engine reste la source de gouvernance.

## Contrat canonique actuel

Depuis le Project Cockpit V1 du 2026-09-02, le chemin de lecture portefeuille est :

```text
OpenClaw Control UI — Project Cockpit
  ↓
Gateway OpenClaw
  ↓
node VPS Main
  ↓
mcp.tools.call.v1 (server: developmentWorkspace)
  ↓
project_list / project_handoff
  ↓
Development Workspace vps-main
  ↓
pnpm loop summary --json / pnpm loop handoff <project> --json
  ↓
Loop Engine
```

Le node OpenClaw `VPS Main` publie un serveur MCP `developmentWorkspace` filtré. Pour le Cockpit, les capacités utiles sont `project_list` et `project_handoff`; `workspace_info` et `roadmap_decision` restent disponibles comme capacités de diagnostic/gouvernance bornées.

OpenClaw ne fournit jamais de `cwd`, package manager, script, provider, modèle ou credential. Ces paramètres restent fixés côté Development Workspace.

Le Cockpit V1 utilise :

- `roadmap.projects` pour transporter `project_list` ;
- `roadmap.cockpit` pour transporter `project_handoff` sans exiger qu'un candidat soit présent ;
- le sélecteur de projet et l'affichage restent entièrement déterministes.

`roadmap.read` et `roadmap.handoff` restent disponibles pour le flux spécialisé de décision/préparation d'un lot. `roadmap.propose` peut rester présent comme capacité secondaire explicite, mais il n'est ni affiché ni appelé par le Project Cockpit V1.

## Données affichées

Le Project Cockpit projette directement le handoff Loop Engine, notamment :

- identité et type du projet ;
- santé ;
- branche et propreté Git ;
- mode de planning ;
- résumé roadmap ;
- prochain candidat sélectionnable et priorité ;
- objectif canonique et sa source ;
- gates de phase ;
- validations déclarées.

L'absence de candidat, d'objectif ou de gate reste une donnée valide et doit être affichée explicitement ; le Cockpit ne fabrique jamais de remplacement.

## Garde-fous

- Aucun LLM ni provider IA pour l'affichage du Cockpit.
- Aucun appel API payant requis par le Cockpit.
- Aucun commit automatique.
- Aucun push automatique.
- Aucune modification automatique.
- Aucun déploiement automatique.
- OpenClaw ne recalcule jamais une priorité, une gate ou une décision métier.
- Les données viennent de Loop Engine via les outils MCP bornés de Development Workspace.
- Toute indisponibilité de transport, MCP, outil ou schéma doit produire un état explicite et échouer fermé.
- Les décisions et actions mutantes restent humaines ou passent par un workflow gouverné distinct.

## Topologie multi-host

Le Cockpit portefeuille lit actuellement le worker logique `vps-main` via le node OpenClaw `VPS Main`, afin de refléter les repos gouvernés présents sur le VPS et de rester disponible lorsque le Mac est absent.

Cette topologie ne transforme pas `vps-main` en source de vérité : Git et les documents canoniques des projets restent les sources de vérité. Le node OpenClaw est uniquement un transport de capacités Development Workspace.

La sélection du worker pour une mission d'exécution reste un problème distinct du Cockpit et suit la politique multi-host de Development Workspace / Loop Engine.

## Critère d'acceptation V1

Le test de référence est Creatyss. Après synchronisation des repos du VPS, le Project Cockpit doit afficher le candidat :

```text
Search storefront V2 [P1]
```

avec l'objectif canonique, l'état du projet et les gates issus du même `project_handoff`.

## Historique

Avant le Project Cockpit V1, l'intégration OpenClaw était centrée sur `roadmap_decision` via le node Mac et pouvait proposer explicitement un appel provider. Cette capacité reste secondaire, mais elle ne définit plus le chemin de lecture portefeuille.

Les commandes CLI Loop Engine restent disponibles pour les usages interactifs gouvernés ; OpenClaw ne les invoque pas directement et passe par Development Workspace.

## Checklist

Avant toute évolution du Cockpit, utiliser :

- `docs/integrations/openclaw-read-only-checklist.md`
