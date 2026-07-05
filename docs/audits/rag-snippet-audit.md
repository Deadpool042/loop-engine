# Audit RAG snippets

## Objectif

Préparer l'amélioration de `rag-search` avec des extraits lisibles.

## État actuel

`rag-search` affiche :

- chemin ;
- titre ;
- score.

Il ne montre pas encore pourquoi le document correspond.

## Besoin

Afficher un court extrait autour du premier match.

Exemple attendu :

- chemin ;
- titre ;
- score ;
- snippet contenant la requête.

## Contraintes

- pas d'embeddings ;
- pas d'IA ;
- pas de dépendance ;
- recherche déterministe ;
- sortie terminal courte ;
- ne pas exposer des fichiers exclus.

## Recommandation

Ajouter une fonction pure :

- `buildSnippet(content, query)`

Comportement :

- trouver le premier match insensible à la casse ;
- prendre environ 80 caractères avant/après ;
- remplacer les sauts de ligne par des espaces ;
- ajouter `...` si tronqué.

## Premier micro-lot Code

Modifier `rag-search` pour afficher un snippet par résultat.
