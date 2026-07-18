# Execution Reporting

## Statut

Cette architecture définit le contrat public des rapports d’exécution produits par Loop Engine.

Le reporting reste :

- local ;
- déterministe ;
- sans appel réseau ;
- sans exécution d’agent implicite ;
- sans commit ni push automatique.

## Objectif

Une exécution peut produire deux représentations complémentaires du même résultat :

- `report.json` pour les outils et les intégrations ;
- `report.md` pour la lecture humaine.

Les deux formats doivent décrire la même session, les mêmes étapes et les mêmes statuts.

## Rapport JSON

Le fichier `report.json` constitue le format machine-readable.

Il expose notamment :

- `schemaVersion` ;
- `summary` ;
- `summary.sessionId` ;
- `summary.status` ;
- `summary.startedAt` ;
- `summary.completedAt` ;
- `summary.stepCount` ;
- les compteurs de succès et d’échecs ;
- `steps` ;
- le nom, le statut, les dates et les détails de chaque étape.

Les consommateurs doivent ignorer les champs inconnus afin de permettre des extensions additives.

La suppression ou la modification sémantique d’un champ existant constitue un breaking change.

## Rapport Markdown

Le fichier `report.md` constitue le rapport destiné aux humains.

Il doit présenter de manière lisible :

- l’identité de la session ;
- le statut global ;
- les dates de début et de fin ;
- le nombre d’étapes ;
- les étapes exécutées ;
- leur statut ;
- leurs détails significatifs.

Le rapport Markdown peut évoluer visuellement tant que les informations contractuelles restent présentes.

## Cohérence des formats

`report.json` et `report.md` sont générés à partir du même modèle de rapport.

Ils ne doivent pas reconstruire indépendamment les données d’exécution.

Pour une même entrée déterministe :

- les statuts doivent être identiques ;
- les compteurs doivent être identiques ;
- l’ordre des étapes doit être stable ;
- l’ordre des détails doit être stable ;
- aucune donnée volatile non maîtrisée ne doit modifier les fixtures.

## Golden fixtures

Les fichiers de référence sont stockés dans :

```text
tests/fixtures/reports/report.json
tests/fixtures/reports/report.md
