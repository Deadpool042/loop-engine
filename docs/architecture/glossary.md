# Glossaire

## Statut

Normatif.

Ce document définit le vocabulaire officiel utilisé dans l'architecture de
Loop Platform et Loop Engine.

## Platform

Ensemble cohérent de capacités partageant une responsabilité unique et exposant
une API publique.

## Capability

Fonctionnalité fournie par une plateforme.

Une capacité peut être composée d'autres capacités mais possède une
responsabilité clairement identifiée.

## Contract

Définition publique d'une capacité.

Un contrat décrit les types, les interfaces et les invariants sans imposer une
implémentation particulière.

## Public API

Surface officielle exposée par une plateforme.

Toute dépendance entre plateformes passe exclusivement par une API publique.

## Internal Module

Implémentation interne d'une plateforme.

Les modules internes ne constituent jamais des points de dépendance autorisés.

## Port

Contrat représentant une dépendance externe.

Un port définit ce qui est attendu d'un système externe sans en connaître
l'implémentation.

## Adapter

Implémentation concrète d'un port.

Un adaptateur permet d'intégrer un fournisseur ou un système externe sans
modifier le cœur de la plateforme.

## Policy

Ensemble de règles déterministes pilotant une décision variable.

Les politiques permettent de modifier le comportement sans modifier les
contrats.

## Agent

Composant d'automatisation spécialisé réalisant une tâche précise.

Les agents réutilisent les services fournis par la plateforme sans en modifier
l'architecture.

## Provider

Système externe fournissant une capacité spécialisée.

Un fournisseur est toujours consommé au travers d'un port et d'un adaptateur.

## Runtime

Ensemble des capacités exécutées par Loop Engine.

## Audit

Vérification déterministe d'une règle architecturale, documentaire ou
fonctionnelle.

## CI

Ensemble des mécanismes assurant la validation continue du dépôt.

## CI Gate

Point de décision unique agrégeant les validations obligatoires avant une fusion.

## RFC

Document décrivant une évolution proposée avant son implémentation.

## ADR

Document expliquant une décision architecturale et ses conséquences.

## Source de vérité

Le dépôt Git, sa documentation, ses contrats, ses audits et son code
constituent la source de vérité du projet.
