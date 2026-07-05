# Audit implémentation RAG local

## Objectif

Évaluer le premier niveau d'implémentation possible pour un index RAG local Loop Engine.

## Contraintes

- Pas d'appel IA automatique.
- Pas d'embedding obligatoire.
- Pas de service externe.
- Pas de dépendance inutile.
- Index reconstructible.
- Sources traçables.

## Option A — Index texte simple

Indexer les fichiers autorisés sous forme JSON :

- path ;
- title ;
- content ;
- hash.

Recherche initiale :

- recherche substring ;
- score simple par nombre d'occurrences ;
- tri déterministe.

Avantages :

- zéro dépendance ;
- simple ;
- rapide à tester ;
- compatible avec la philosophie actuelle.

Limites :

- pas de sémantique ;
- moins puissant qu'un vrai RAG vectoriel.

## Option B — Index Markdown structuré

Découper par titres Markdown.

Avantages :

- résultats plus précis ;
- meilleures citations de sections.

Limites :

- parser plus complexe ;
- Markdown irrégulier.

## Option C — Embeddings locaux

Reporter à plus tard.

Raisons :

- dépendances ;
- coût CPU ;
- complexité ;
- non nécessaire pour un premier niveau.

## Recommandation

Commencer par Option A.

Premier lot Code recommandé :

- créer une commande `rag-index`;
- lire les sources autorisées ;
- produire un fichier local reconstructible ;
- ne pas ajouter de recherche dans le même lot.

