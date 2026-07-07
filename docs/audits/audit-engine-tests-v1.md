# Audit Engine — Tests V1

## Objectif

Analyser la couverture de tests actuelle pour en déduire des règles automatisables.

## Constats mesurés

Le dépôt contient 6 fichiers de tests TypeScript.

Répartition :

- `tests/intelligence/roadmap.test.ts`
- `tests/commands/handoff.test.ts`
- `tests/commands/json-error.test.ts`
- `tests/commands/json-output.test.ts`
- `tests/commands/rag-index.test.ts`
- `tests/commands/rag-search.test.ts`

## Points forts

### Roadmap

`roadmap.test.ts` est le test le plus complet du projet.

Il couvre :

- détection des candidats ;
- statuts ;
- priorités ;
- sélection ;
- précédence `safe`, `warning`, `blocked`.

C'est cohérent : la roadmap est une zone critique du moteur de décision.

### JSON

Les sorties JSON principales sont couvertes par :

- `json-output.test.ts`
- `json-error.test.ts`
- `json-check`

### RAG

Le RAG local est couvert par :

- `rag-index.test.ts`
- `rag-search.test.ts`

Ces tests couvrent :

- génération d'index ;
- recherche ;
- snippets ;
- section titles ;
- JSON ;
- `--limit`;
- `--path`.

## Fragilités

Plusieurs commandes publiques n'ont pas de test dédié direct :

- `context`
- `doctor`
- `help`
- `next`
- `prompt`
- `review`
- `status`
- `summary`
- `validate`

Certaines sont couvertes indirectement par `json-output.test.ts` ou `json-check`, mais cela ne couvre pas forcément les sorties humaines.

## Angle mort principal

Les sorties humaines sont moins couvertes que les sorties JSON.

Risque :

- régression de format terminal non détectée ;
- sortie `prompt` ou `next` cassée sans échec de test ;
- perte de qualité pour l'usage humain.

## Recommandation

Priorité 1 :

- ajouter un test minimal humain pour les commandes principales.

Commandes prioritaires :

- `context`
- `next`
- `prompt`
- `handoff`
- `summary`

Priorité 2 :

- ajouter des tests directs pour `help`, `doctor`, `status`.

Priorité 3 :

- ne pas chercher une couverture exhaustive ;
- vérifier seulement que la sortie contient les sections clés.

## Règles candidates Audit Engine

### TEST-001

Toute commande publique doit avoir au moins un test direct ou une couverture explicite dans `json-check`.

### TEST-002

Toute commande avec sortie humaine importante doit avoir un test terminal minimal.

### TEST-003

Toute commande `--json` doit être couverte par `json-check`.

### TEST-004

Les tests de logique de sélection doivent rester dans `tests/intelligence`.

### TEST-005

Les tests CLI doivent rester des tests d'intégration simples via `execSync`.

## Conclusion

La couverture actuelle protège bien les contrats JSON et la logique roadmap.

Le prochain gain de qualité est la couverture minimale des sorties humaines.
