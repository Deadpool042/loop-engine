# Vision de Loop Platform

## Statut

Proposé pour V18.0.

## Finalité

Loop Platform constitue la fondation architecturale utilisée pour construire,
gouverner, valider et faire évoluer Loop Engine au moyen de contrats explicites,
de politiques déterministes et d’intégrations externes remplaçables.

La plateforme sépare les capacités d’exécution, la gouvernance architecturale,
la validation continue et l’automatisation du développement en plateformes
distinctes.

## Vision

Loop Engine fournit des capacités d’exécution déterministes.

Loop Platform fournit les structures, les règles et les automatismes nécessaires
pour faire évoluer ces capacités sans affaiblir les frontières architecturales
ni transférer l’autorité à des outils externes ou à des fournisseurs
d’intelligence artificielle.

Les systèmes externes peuvent assister l’exécution et l’analyse, mais le dépôt
reste la source de vérité et le code déterministe reste l’autorité finale.

## Époques du projet

### Ère I — Engine Foundation

Les versions V1 à V17 ont établi la fondation déterministe du moteur :

- contrats d’exécution et frontières runtime ;
- contrôles de sécurité et d’autorisation ;
- règles et profils d’audit ;
- intégration continue ;
- gouvernance du dépôt ;
- capacités de service persistantes.

### Ère II — Platform Foundation

Les versions V18 à V20 établissent des plateformes d’ingénierie réutilisables :

- Automation Platform ;
- contrats de politique partagés ;
- contrats partagés de métriques et d’observabilité ;
- décisions architecturales explicites ;
- règles explicites de dépendance entre plateformes.

### Ère III — Autonomous Engineering

Les versions V21 et suivantes pourront introduire des agents d’automatisation
spécialisés réutilisant la Platform Foundation tout en restant contraints par
des politiques déterministes, des audits et des API publiques.

## Modèle de plateformes

Loop Platform est composée de quatre plateformes principales.

### Runtime Platform

La Runtime Platform possède les capacités exécutables du produit, notamment :

- traitement des requêtes ;
- exécution ;
- sécurité ;
- évaluation des capacités ;
- composition des services ;
- contrats d’état et de persistance runtime.

### Audit Platform

L’Audit Platform possède la gouvernance déterministe, notamment :

- règles d’architecture ;
- règles de documentation ;
- invariants runtime ;
- invariants du dépôt ;
- règles d’architecture de l’automatisation.

### CI Platform

La CI Platform possède l’orchestration de la validation, notamment :

- vérification TypeScript ;
- tests ;
- validation des contrats JSON ;
- audits stricts ;
- profils d’audit ;
- CI gate obligatoire.

La CI Platform orchestre les commandes du dépôt. Elle ne possède aucune logique
métier de produit ou d’automatisation.

### Automation Platform

L’Automation Platform possède les automatismes de développement réutilisables,
notamment :

- agents d’automatisation ;
- routage des fournisseurs ;
- évaluation des politiques ;
- maîtrise des coûts ;
- métriques ;
- adaptateurs de forge ;
- publication des reviews ;
- orchestration du merge.

Le premier cas d’usage prévu est la review de pull request, mais la plateforme
n’est définie ni autour de GitHub ni autour d’un fournisseur d’intelligence
artificielle particulier.

## Autorité architecturale

L’ordre d’autorité est le suivant :

1. contrats et implémentation du dépôt ;
2. politiques déterministes ;
3. audits et validation CI ;
4. décisions d’automatisation dérivées de ces politiques ;
5. analyses produites par des fournisseurs externes.

La sortie d’une intelligence artificielle constitue une preuve, un signal ou un
avis. Elle ne constitue jamais l’unique autorité pour fusionner, publier,
accorder un accès ou modifier le comportement runtime.

## Frontières entre plateformes

Chaque plateforme expose une API publique.

Une plateforme ne peut dépendre que des contrats publics d’une autre plateforme.
Les imports directs depuis les modules internes d’une autre plateforme sont
interdits.

Les dépendances externes doivent être isolées derrière des ports et implémentées
par des adaptateurs remplaçables.

## Règle d’évolution

Un contrat de plateforme doit rester pertinent si un fournisseur, une forge, un
moteur de workflow ou un prestataire externe est remplacé.

L’ajout d’un fournisseur, d’un adaptateur, d’une politique ou d’un agent ne doit
pas imposer la réécriture du cœur de la plateforme.

## Objectif de V18

V18 établit l’architecture documentée de la Platform Foundation avant toute
implémentation de production.

Le premier lot V18 est exclusivement documentaire et définit :

- le vocabulaire de la plateforme ;
- les principes fondateurs ;
- les responsabilités des plateformes ;
- les règles de dépendance ;
- les décisions architecturales ;
- la RFC de l’Automation Platform.
