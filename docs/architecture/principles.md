# Principes architecturaux

## Statut

Normatif.

Les principes décrits dans ce document s'appliquent à l'ensemble des plateformes
de Loop Platform.

## P1 — Contract First

Toute nouvelle capacité débute par des contrats explicites.

Les interfaces publiques, les types et les invariants sont définis avant toute
implémentation.

## P2 — Platform First

Une fonctionnalité réutilisable doit être conçue comme une capacité de
plateforme avant d'être implémentée pour un cas d'usage particulier.

## P3 — Ports & Adapters

Toute dépendance externe est isolée derrière un port.

Les implémentations concrètes sont fournies par des adaptateurs remplaçables.

## P4 — Public API Only

Une plateforme ne dépend jamais des modules internes d'une autre plateforme.

Seules les API publiques constituent des points de dépendance autorisés.

## P5 — Policy Driven

Les décisions variables sont exprimées sous forme de politiques.

La logique métier ne contient pas de décisions spécifiques à un fournisseur,
à une forge ou à un environnement.

## P6 — Fail Closed

En cas d'incertitude, d'erreur ou d'absence d'information fiable, le système
adopte le comportement le plus sûr.

## P7 — Déterminisme

Une même entrée doit produire un même résultat.

Les décisions critiques ne reposent jamais exclusivement sur un fournisseur
d'intelligence artificielle.

## P8 — Source de vérité

Le dépôt Git constitue la source de vérité.

La documentation, le code, les audits et la CI décrivent l'architecture réelle.

## P9 — Observabilité

Toute plateforme expose des métriques, des événements ou des états permettant
de comprendre son fonctionnement.

## P10 — Évolutivité

L'ajout d'un agent, d'un adaptateur, d'un fournisseur ou d'une politique ne
doit pas imposer la réécriture du cœur d'une plateforme.

## P11 — Testabilité

Les composants sont conçus pour être testés de manière déterministe et isolée.

## P12 — Gouvernance déterministe

Les audits, les politiques et la CI constituent l'autorité du système.

Les analyses produites par des modèles d'IA assistent les décisions mais ne les
remplacent jamais.
