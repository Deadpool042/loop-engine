# Règles de dépendance

## Statut

Normatif.

Ce document définit les dépendances autorisées entre les plateformes de
Loop Platform.

## Objectif

Les dépendances entre plateformes doivent rester explicites, stables et
prévisibles.

Aucune plateforme ne peut dépendre directement des modules internes d'une autre
plateforme.

## Principe général

Une plateforme dépend exclusivement des API publiques exposées par une autre
plateforme.

Les implémentations internes ne constituent jamais des points de dépendance.

## Dépendances autorisées

Runtime Platform

- ne dépend d'aucune autre plateforme.

Audit Platform

- peut dépendre des API publiques de Runtime Platform.

Automation Platform

- peut dépendre des API publiques de Runtime Platform ;
- peut dépendre des API publiques d'Audit Platform.

CI Platform

- orchestre les commandes publiques du dépôt ;
- ne dépend d'aucune implémentation interne.

## Dépendances interdites

Les dépendances suivantes sont interdites :

- import d'un module interne d'une autre plateforme ;
- dépendance circulaire entre plateformes ;
- accès direct à une implémentation d'adaptateur ;
- utilisation directe d'un fournisseur externe depuis le cœur d'une plateforme ;
- lecture directe de secrets ou de variables d'environnement hors des adaptateurs
  prévus à cet effet.

## Dépendances externes

Toute dépendance vers un système externe est isolée derrière un port.

Exemples :

- fournisseur d'intelligence artificielle ;
- forge Git ;
- stockage ;
- réseau ;
- système de fichiers.

Chaque port possède au moins une implémentation d'adaptateur.

## Évolution

L'ajout d'un nouvel adaptateur, d'un nouveau fournisseur ou d'un nouvel agent ne
doit pas modifier les contrats publics existants.

Les nouvelles capacités sont introduites par extension et non par modification
des frontières architecturales.

## Vérification

Les règles décrites dans ce document ont vocation à être vérifiées par des
audits d'architecture et par la CI.
