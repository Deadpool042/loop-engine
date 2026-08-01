# Cartographie des plateformes

## Statut

Normatif.

Ce document définit les plateformes constituant Loop Platform ainsi que leurs
responsabilités respectives.

## Vue d'ensemble

Loop Platform est composée de quatre plateformes principales :

- Runtime Platform
- Audit Platform
- Automation Platform
- CI Platform

Chaque plateforme possède une responsabilité unique et expose une API publique.

## Runtime Platform

### Responsabilité

La Runtime Platform regroupe les capacités métier exécutables de Loop Engine.

### Exemples

- traitement des requêtes ;
- sécurité ;
- autorisation ;
- exécution ;
- composition ;
- persistance ;
- contrats runtime.

La Runtime Platform ne contient aucune logique spécifique à une forge, à un
workflow CI ou à un fournisseur d'intelligence artificielle.

## Audit Platform

### Responsabilité

L'Audit Platform vérifie le respect des règles architecturales et des invariants
du dépôt.

### Exemples

- audits d'architecture ;
- audits de documentation ;
- audits runtime ;
- audits d'automatisation ;
- profils d'audit.

L'Audit Platform ne modifie jamais le dépôt. Elle produit uniquement des
constats déterministes.

## Automation Platform

### Responsabilité

L'Automation Platform regroupe les capacités d'automatisation du développement.

### Exemples

- agents ;
- routage des fournisseurs ;
- politiques ;
- métriques ;
- publication de reviews ;
- orchestration du merge ;
- adaptateurs de forge.

Le premier cas d'usage est la revue de Pull Request, mais la plateforme est
générique et extensible.

## CI Platform

### Responsabilité

La CI Platform orchestre la validation continue.

### Exemples

- typecheck ;
- tests ;
- audits ;
- agrégation des résultats ;
- CI gate.

La CI Platform n'implémente aucune logique métier. Elle orchestre uniquement
l'exécution des validations définies par les autres plateformes.

## Règle de responsabilité

Toute nouvelle capacité doit appartenir à une seule plateforme.

Si une fonctionnalité semble relever de plusieurs plateformes, les responsabilités
doivent être séparées au moyen de contrats publics.
