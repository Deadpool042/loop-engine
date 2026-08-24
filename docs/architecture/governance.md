# Gouvernance de l'architecture

## Statut

Normatif.

Ce document définit les règles de gouvernance applicables à l'évolution de
l'architecture de Loop Platform.

## Objectif

Garantir que les évolutions du projet restent cohérentes, traçables et
déterministes.

## Règles

### Vision

La vision décrit les objectifs à long terme du projet.

Elle évolue uniquement lors d'un changement majeur d'orientation
architecturale.

### Glossaire

Le glossaire définit le vocabulaire officiel.

Tout nouveau terme architectural doit y être ajouté avant d'être utilisé
dans une RFC ou une ADR.

### Principes

Les principes décrivent les règles permanentes de conception.

Ils évoluent exceptionnellement.

### Cartographie

La cartographie définit les responsabilités des plateformes.

Toute nouvelle plateforme doit y être documentée.

### Règles de dépendance

Les dépendances autorisées et interdites sont définies dans un document unique.

Toute évolution des frontières architecturales doit être documentée avant son
implémentation.

### Frontière d'écriture dans les projets observés

Les projets déclarés dans `projects.yaml` sont en lecture seule par défaut.
Loop Engine ne peut pas écrire arbitrairement dans leur dépôt source.

Une exception explicite existe pour un artefact de gouvernance : lorsqu'un
projet déclare la propriété `execution_decision`, Loop Engine peut publier
uniquement ce fichier après approbation humaine. La publication est bornée par
le chemin déclaré, confinée dans le projet par `resolveContextPath`, réalisée
transactionnellement par `createTransactionalDecisionPublisher`, puis validée
par `validatePublishedExecutionDecision`. Une validation échouée déclenche la
récupération de l'état précédent.

À l'état courant, `lp-infra` déclare
`.governance/execution-decision.yaml`. Cette exception ne transfère aucune
logique métier LP-INFRA dans Loop Engine, n'autorise aucune autre écriture dans
le projet observé et ne constitue pas une permission générale attachée au mode
`execute`.

Toute nouvelle exception d'écriture inter-projet doit être déclarée
explicitement dans la configuration, documentée ici, bornée à un artefact
précis, soumise à une décision humaine et protégée par une validation/audit
avant d'être considérée comme autorisée.

### ADR

Une ADR est créée lorsqu'une décision architecturale durable est prise.

Elle explique pourquoi une décision a été retenue.

### RFC

Une RFC est créée avant toute évolution importante.

Elle décrit ce qui sera construit et la manière dont cette évolution sera
mise en œuvre.

Une RFC peut être remplacée ou devenir obsolète.

## Source de vérité

La documentation d'architecture, les contrats publics, les audits et le code
constituent ensemble la source de vérité du projet.

En cas de divergence, celle-ci doit être résolue explicitement.
