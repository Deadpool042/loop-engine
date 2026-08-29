# Impact local — direction d’orchestration hybride

Date : 2026-08-26

## Source de cadrage

La décision transversale canonique est maintenue dans `development-workspace/docs/decisions/2026-08-26-hybrid-orchestration-direction.md`.

Ce document ne la duplique pas : il précise uniquement ses conséquences pour Loop Engine.

## Rôle de Loop Engine

Loop Engine reste l’orchestrateur gouverné des missions.

Il répond principalement à :

> Quoi faire, est-ce autorisé, où cela peut-il être fait et quelle preuve valide le résultat ?

Il conserve la responsabilité de :

- sélectionner le travail admissible ;
- vérifier les préconditions et phase gates ;
- borner le scope et les permissions ;
- définir les validations attendues ;
- préparer un contrat de mission portable ;
- recommander le mode d’exécution, le runtime et le worker ;
- suivre la mission et qualifier le résultat.

Il ne doit pas réimplémenter Development Workspace, GitHub, OpenClaw ou les runtimes IA.

## Job Package

La cible introduit un **Job Package universel** comme évolution du contexte/handoff/prompt déjà produits par Loop Engine.

Le Job Package doit représenter la mission indépendamment :

- du runtime IA ;
- du worker ;
- de l’interface utilisateur.

Il couvre au minimum : projet/candidat, objectif, révision Git attendue, scope, capacités requises, permissions, validations et critères de réussite.

ChatGPT, Codex CLI, Claude CLI, Gemini CLI ou une API doivent pouvoir consommer le même contrat sans redéfinir le travail.

## Runtime et worker

Deux décisions deviennent explicitement indépendantes :

```text
qui raisonne ?
ChatGPT / CLI / API

+

où agit-on ?
local / vps-main / futur worker
```

Loop Engine ne doit pas coder son orchestration autour de noms de machines physiques. `local` est l’abstraction du worker principal ; `vps-main` est un worker potentiel supplémentaire et le host cible du Control Plane.

La sélection doit s’appuyer sur :

- capacités requises ;
- disponibilité ;
- politique du projet ;
- préférences ;
- charge et contraintes d’exploitation.

## Development Workspace

Development Workspace est traité comme un capability gateway externe.

Loop Engine peut consommer ses capacités via un contrat explicite, mais Development Workspace ne devient pas un runtime IA et Loop Engine ne copie pas ses primitives internes.

La cible est un contrat logique identique sur plusieurs hosts, notamment `local` et `vps-main`.

## Modes d’exécution

### Déterministe

Les opérations qui ne nécessitent aucun raisonnement IA restent hors modèle : état Git, SHA, locks, validations, tests, parsing, inventaire et autres contrôles déterministes.

### Interactif

Le mode quotidien privilégié devient `ChatGPT + Development Workspace`, avec un Job Package préparé par Loop Engine.

### Autonome

Codex CLI, Claude CLI, Gemini CLI et les API restent des runtimes interchangeables pour les missions suffisamment bornées ou nécessitant autonomie/parallélisation.

Aucun runtime n’est rendu obligatoire par cette direction.

## Worker state et capacité indisponible

La cible prévoit un état `WAITING_FOR_CAPABILITY` distinct d’un échec : la mission est valide mais aucun worker actuellement disponible ne possède une capacité requise.

Un workspace peut également être : absent, en provisioning, prêt ou actif. La présence d’un deployment ne rend jamais automatiquement son répertoire utilisable comme workspace de développement.

## GitHub

GitHub reste la source Git canonique et le point de convergence branches/commits/PR/Actions.

GitHub Actions est une orchestration CI ; le compute appartient aux runners. Le runner self-hosted `local` reste actuellement le worker CI lourd principal.

## Contraintes actuelles

- les repos de développement sont aujourd’hui principalement présents en `local` + GitHub ;
- Creatyss est également déployé en staging pro-like sur `vps-main`, mais ce deployment n’est pas un workspace de développement ;
- les autres repos ne doivent pas être clonés en permanence sur le VPS par défaut ;
- `vps-main` doit rester protégé contre les charges de développement susceptibles de dégrader le staging ou le Control Plane.

## OpenClaw

La cible OpenClaw décrite ici concerne une façade distante/mobile externe qui pilote Loop Engine.

Elle ne doit pas être confondue avec un éventuel provider/protocole OpenClaw interne ou historique dans le code de Loop Engine.

## Hors périmètre de cette note

Cette note n’autorise aucune modification runtime immédiate. Elle ne valide ni un deuxième VPS, ni un runner lourd sur VPS, ni le provisionnement permanent de tous les repos, ni la suppression d’un provider existant.

## Séquence d’évolution recommandée

1. conserver et qualifier le vertical actuel ;
2. formaliser le Job Package ;
3. introduire un modèle worker/capability/workspace sans dépendance au matériel ;
4. qualifier le contrat Development Workspace multi-host ;
5. faire un POC interactif Loop Engine → ChatGPT ;
6. intégrer OpenClaw ensuite comme façade distante.
