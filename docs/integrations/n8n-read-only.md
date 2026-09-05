# n8n — contrat de maintenance et intégration

## Positionnement

n8n est une **brique d'automatisation périphérique** de l'écosystème.

Il peut relier des systèmes, réagir à des événements, synchroniser des données et envoyer des notifications. Il ne constitue ni la source de vérité du portefeuille, ni le moteur de gouvernance, ni le runtime IA principal.

Répartition des responsabilités :

- **Loop Engine** décide à partir des objectifs, roadmaps, gates et états réels des projets ;
- **Development Workspace** expose les opérations bornées d'inspection et d'exécution ;
- **ChatGPT + Development Workspace** constitue le runtime interactif principal ;
- **OpenClaw** fournit une façade distante/mobile sans dupliquer la logique de décision ;
- **n8n** automatise uniquement des intégrations et traitements périphériques explicitement justifiés.

n8n ne doit pas devenir un second orchestrateur de Loop Engine.

## État vérifié au 5 septembre 2026

La configuration canonique `projects.yaml` déclare n8n ainsi :

- type : `automation` ;
- projet optionnel ;
- `requires_git: false` ;
- workspace : `mode: none` ;
- dépendances workspace : `none` ;
- planning : `maintenance` ;
- aucune validation configurée ;
- aucune roadmap configurée.

La projection Loop Engine confirme :

- `maintenance_no_work` ;
- aucun lot actif ;
- aucun candidat sélectionnable ;
- aucun workspace matérialisé attendu.

Le chemin logique `../n8n` n'est pas matérialisé dans le workspace VPS actuel. Aucun dépôt n8n ni export de workflow n'est donc auditable depuis ce workspace.

Le runtime n8n déployé, ses workflows actifs, ses credentials, sa stratégie de sauvegarde et sa supervision ne sont **pas vérifiables depuis les sources actuellement accessibles**. Ils ne doivent pas être supposés.

## Cas d'usage autorisés

n8n est pertinent lorsqu'un besoin concret requiert notamment :

- webhook vers traitement périphérique ;
- synchronisation entre applications ;
- notification ;
- import/export planifié ;
- automatisation marketing ou CRM ;
- enrichissement d'un système tiers à partir d'un événement métier ;
- consommation read-only d'une sortie JSON stable de Loop Engine.

Une indisponibilité de n8n ne doit pas empêcher le coeur métier de Creatyss, la gouvernance Loop Engine ou l'exécution via Development Workspace de fonctionner.

## Frontières

### n8n ne décide pas du prochain lot

La sélection d'un lot, les priorités, les gates et l'admissibilité restent dans Loop Engine.

n8n peut lire une projection déterministe et notifier. Il ne doit pas reproduire le parser de roadmap ni recalculer une décision.

### n8n n'exécute pas la boucle de développement

Le chemin :

`roadmap -> sélection -> agent -> validation -> Git -> PR`

reste gouverné par Loop Engine et Development Workspace.

n8n ne doit pas reconstruire cette boucle sous forme de workflow.

### n8n ne devient pas une dépendance coeur de Creatyss

Les règles métier, catalogue, prix, stock, commande, paiement, livraison et autres fonctions critiques restent dans l'application et ses services canoniques.

Une intégration périphérique peut utiliser :

`Creatyss -> événement/webhook -> n8n -> service externe`

à condition que l'échec de n8n soit borné, observable et n'altère pas la vérité métier.

## Consommation read-only de Loop Engine

Les sorties JSON publiques peuvent être consommées pour observer ou notifier :

- `pnpm loop summary --json`
- `pnpm loop next <project> --json`
- `pnpm loop context <project> --json`
- `pnpm loop review <project> --json`

`prompt --json` peut être utilisé uniquement pour préparer une action humaine.

Un workflow n8n ne doit pas lancer automatiquement une mutation Git, un déploiement, une correction de code ou un agent IA à partir de ces sorties.

## Interdits par défaut

Sans décision d'architecture explicite, n8n ne doit jamais :

- sélectionner ou réordonner les lots à la place de Loop Engine ;
- modifier une roadmap ;
- committer ou pousser du code ;
- merger une pull request ;
- déployer un projet ;
- modifier arbitrairement un dépôt ;
- appeler un provider IA payant ;
- publier automatiquement un contenu généré ;
- porter un secret métier dans un export versionné ;
- devenir un point de passage obligatoire pour le coeur d'un produit.

## Contrat de maintenance

Le projet n8n reste en `planning.mode: maintenance`.

Un nouveau chantier n8n n'est ouvert que lorsqu'un besoin d'automatisation réel est identifié et que les quatre conditions suivantes sont réunies :

1. le propriétaire du processus et la source de vérité sont identifiés ;
2. la valeur de l'automatisation dépasse son coût de maintenance ;
3. une panne ou un doublon de n8n ne corrompt pas le système source ;
4. l'automatisation n'empiète pas sur Loop Engine, Development Workspace ou le coeur métier.

Chaque workflow doit rester petit, réversible et supprimable indépendamment.

## Inventaire opérationnel requis avant une évolution réelle

Avant de créer ou modifier un workflow déployé, il faut disposer d'un inventaire vérifié couvrant :

- nom et finalité du workflow ;
- déclencheur et fréquence ;
- systèmes source et destination ;
- propriétaire de la donnée ;
- credentials utilisés, sans exposer leur valeur ;
- comportement en erreur et retry ;
- idempotence ;
- historique/logs utiles ;
- sauvegarde/export du workflow ;
- mode de restauration ;
- supervision/notification ;
- criticité et conséquence d'une indisponibilité.

Tant que cet inventaire du runtime réel n'est pas accessible, aucune migration, suppression ou réorganisation des workflows existants ne doit être décidée.

## Notification Loop Engine

Une automation read-only peut notifier, par exemple, lorsqu'une projection stable indique :

- un projet dirty ;
- un candidat bloqué ;
- un candidat prioritaire ;
- une validation absente ;
- une documentation requise absente.

Ces notifications restent informatives. Elles ne constituent pas une autorisation d'exécution.

## Décision actuelle

Aucune roadmap fonctionnelle n8n n'est ouverte.

Le bon état par défaut est **maintenance sans travail actif**. Les évolutions sont déclenchées par un besoin concret d'intégration, pas par une volonté d'étendre n8n en tant que plateforme.
