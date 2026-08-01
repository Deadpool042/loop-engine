# ADR-0004 — Policy Driven

## Statut

Accepté.

## Contexte

Loop Platform doit prendre des décisions qui évoluent dans le temps, comme le
choix d'un fournisseur, les contraintes de coût, les règles de publication ou
les conditions d'automatisation.

Implémenter directement ces décisions dans le cœur des plateformes réduirait
leur évolutivité et compliquerait leur maintenance.

## Décision

Les décisions variables sont définies sous forme de politiques.

Les plateformes consomment ces politiques sans intégrer de logique spécifique à
un fournisseur, une forge ou un environnement.

Les politiques peuvent évoluer indépendamment des implémentations qui les
utilisent.

## Conséquences

Les comportements deviennent configurables sans modifier le cœur des
plateformes.

Les règles métier restent distinctes des règles de gouvernance.

Les décisions peuvent être auditées, testées et faire évoluer le système sans
remettre en cause son architecture.
