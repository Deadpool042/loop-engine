# Frontière de maintenance n8n

## Métadonnées

- Type : Contrat courant
- Statut : Actif
- Portée : rôle de n8n dans l'écosystème piloté par Loop Engine
- Prédécesseur : Aucun
- Successeur : Aucun
- Décision associée : direction d'orchestration hybride

## Objectif

Ce document définit la place de n8n dans l'écosystème sans en faire un second orchestrateur, un second moteur de roadmap ni un chantier permanent.

n8n est une capacité d'automatisation et d'intégration périphérique. Il est utilisé lorsqu'un workflow événementiel, une synchronisation ou une intégration externe apporte une valeur concrète supérieure à une implémentation directe plus simple.

Le mode de planification canonique reste `maintenance` tant qu'aucun besoin d'automatisation concret ne justifie un lot borné.

## État vérifié au 2026-09-05

La configuration canonique `projects.yaml` déclare :

- projet logique : `n8n` ;
- type : `automation` ;
- `workspace.mode: none` ;
- `workspace.dependencies: none` ;
- projet optionnel ;
- Git non requis ;
- aucune commande de validation ;
- `planning.mode: maintenance`.

La projection Loop Engine confirme :

- aucune roadmap n8n active ;
- aucun candidat de lot ;
- aucune phase gate ;
- recommandation `maintenance_no_work` ;
- workspace attendu absent et non matérialisé.

Au moment de cet audit, aucun profil distant Development Workspace n'est exposé pour inspecter un runtime n8n et aucun répertoire `/home/ubuntu/Projects/n8n` n'est matérialisé. Par conséquent, aucun inventaire de workflows runtime ne peut être affirmé depuis les sources disponibles.

## Responsabilité de n8n

n8n peut prendre en charge les automatisations périphériques suivantes lorsqu'elles sont justifiées :

- réception et émission de webhooks ;
- synchronisation entre services externes ;
- workflows CRM, marketing ou administratifs ;
- notifications et routage de messages ;
- imports et exports planifiés ;
- tâches périodiques d'intégration ;
- transformation de données non critique entre systèmes.

Le bon modèle est généralement :

```text
Produit ou système source
        |
        | événement / webhook / tâche planifiée
        v
       n8n
        |
        v
Service externe ou système périphérique
```

## Ce que n8n ne doit pas faire

n8n ne doit pas dupliquer les responsabilités de Loop Engine, Development Workspace ou des produits observés.

Il ne doit notamment pas devenir :

- le moteur de sélection des prochains lots ;
- la source de vérité des roadmaps ;
- le moteur de phase gates ;
- l'orchestrateur Git/branche/commit/PR principal ;
- le moteur de décision des agents IA ;
- le système de permissions d'exécution ;
- un remplacement de Development Workspace ;
- une dépendance indispensable au fonctionnement du coeur métier de Creatyss.

Le workflow gouverné de développement reste :

```text
Loop Engine
    -> décision / lot / contraintes
Development Workspace
    -> capacités d'exécution bornées
Runtime IA interactif ou spécialiste
    -> raisonnement / implémentation
GitHub
    -> convergence Git / PR / CI
```

n8n peut être appelé en périphérie de ce flux uniquement pour une intégration explicite ne déplaçant pas l'autorité de gouvernance.

## Règle pour Creatyss

Creatyss ne doit pas dépendre de n8n pour ses fonctions métier essentielles : catalogue, prix, stock, commande, paiement, recherche, sécurité ou administration critique.

Une intégration n8n est admissible lorsque :

1. l'événement métier est déjà produit de manière fiable par Creatyss ;
2. la panne de n8n n'empêche pas la fonction métier principale de fonctionner ;
3. le traitement est idempotent ou récupérable ;
4. les secrets restent hors du code et des exports versionnés ;
5. l'intégration apporte un gain mesurable de simplicité ou de maintenabilité.

Exemples admissibles : publication sociale, synchronisation CRM, notifications internes, exports marketing ou enrichissements périphériques.

## Checklist avant tout nouveau workflow n8n

Un lot n8n ne doit être ouvert que si les points suivants sont renseignés :

- besoin métier précis ;
- système source ;
- système cible ;
- déclencheur ;
- propriétaire de la donnée ;
- comportement en cas d'échec ;
- stratégie de retry et d'idempotence ;
- secrets nécessaires ;
- observabilité minimale ;
- stratégie d'export/sauvegarde ;
- restauration testable ;
- coût d'exploitation ;
- justification expliquant pourquoi n8n est plus simple qu'une intégration directe.

## Inventaire runtime à produire lorsqu'un n8n réel est remis en service

L'inventaire suivant est obligatoire avant de faire évoluer un runtime n8n existant :

1. version de n8n et mode d'installation ;
2. emplacement du runtime ;
3. base de données et persistance ;
4. liste des workflows actifs ;
5. déclencheurs de chaque workflow ;
6. systèmes externes utilisés ;
7. credentials référencés, sans exposer leurs valeurs ;
8. fréquence et destination des exports/sauvegardes ;
9. procédure de restauration ;
10. supervision, logs et alertes ;
11. ressources consommées ;
12. dépendances métier qui seraient affectées par son indisponibilité.

Cet inventaire doit être fondé sur le runtime ou ses exports réels. Une absence d'accès doit être déclarée comme telle plutôt que remplacée par une hypothèse.

## Politique de planification

Par défaut :

```text
planning.mode = maintenance
```

Un besoin concret peut ouvrir un micro-lot temporaire et borné. Une fois l'automatisation livrée, validée et documentée, n8n retourne en maintenance.

Il ne doit pas exister de roadmap n8n permanente uniquement pour « améliorer n8n » sans demande produit ou opérationnelle démontrée.

## Critère de décision

Avant d'introduire ou d'étendre un workflow n8n, appliquer l'ordre de préférence suivant :

1. ne rien automatiser si le gain est marginal ;
2. utiliser une capacité déterministe déjà existante ;
3. implémenter directement dans le système propriétaire si c'est plus simple et plus fiable ;
4. utiliser n8n si l'intégration périphérique devient plus lisible, réversible et économique ;
5. ne créer un nouveau service dédié que si n8n ne satisfait plus les contraintes techniques ou opérationnelles.

L'objectif est de réduire la complexité globale, pas de maximiser le nombre de workflows.
