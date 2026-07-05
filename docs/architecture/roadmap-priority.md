# Roadmap Priority

## Objectif

La priorité roadmap permet de départager plusieurs candidats valides sans IA.

Elle ne remplace pas la classification de risque `safe`, `warning`, `blocked`.

Elle sert uniquement à choisir le meilleur candidat à l'intérieur d'une même catégorie.

## Format supporté

Formats V1.6 :

- `[P1]`
- `[P2]`
- `[P3]`

Les espaces sont tolérés : `[ P1 ]`.

Le parsing est insensible à la casse : `[p1]`.

## Modèle interne

Le moteur expose :

- `p1`
- `p2`
- `p3`
- `default`

`default` est utilisé lorsqu'aucune priorité explicite n'est trouvée.

## Règles de sélection

Ordre :

1. ignorer les candidats `done`
2. trier par `kind` : `safe`, `warning`, `blocked`
3. à `kind` égal, trier par priorité : `p1`, `p2`, `p3`, `default`
4. à priorité égale, conserver l'ordre d'apparition

La priorité ne permet jamais à un `warning` de passer devant un `safe`.

La priorité ne permet jamais à un `blocked` de passer devant un `warning`.

## Rétrocompatibilité

Les roadmaps existantes restent valides.

Une ligne sans priorité explicite reçoit `priority = default`.

## Limites V1.6

V1.6 ne supporte pas :

- priorités numériques libres
- dates d'échéance
- dépendances entre lots
- poids calculés
- priorité déduite par IA
- priorité héritée d'une section
- priorité multi-lignes

Une seule priorité est lue par ligne candidate.

Si plusieurs priorités sont présentes sur une même ligne, la première priorité reconnue gagne.

## Garde-fous

La priorité est une information de sélection, pas une information de risque.

Le risque reste porté par `kind` et `reason`.

La progression reste portée par `status`.

La priorité reste portée par `priority`.
