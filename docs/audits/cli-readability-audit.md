# Audit lisibilité CLI

## Objectif

Auditer les sorties humaines de Loop Engine après V1.4.1.

Les sorties JSON sont désormais compactes, testées et validées.
Ce document se concentre uniquement sur l'expérience terminal humaine.

## Commandes auditées

- `summary`
- `next`
- `context`
- `review`
- `help`

## Points à vérifier

- lisibilité en terminal ;
- verbosité ;
- cohérence des libellés ;
- cohérence entre sortie humaine et JSON ;
- utilité pour décider du prochain micro-lot ;
- absence d'ambiguïté entre information et recommandation.

## Premières observations

- `summary` est maintenant plus utile grâce à la synthèse roadmap.
- `next` reste la commande principale pour décider quoi faire.
- `context` est utile pour reprendre un projet, mais peut devenir long.
- `review` reste volontairement Git-oriented.
- `help` doit rester compact et orienté usage.

## Recommandation initiale

Prioriser une amélioration de `next`.

Raison :

- c'est la commande qui influence le plus la décision humaine ;
- elle contient déjà le candidat sélectionné ;
- elle peut mieux exploiter `roadmap.summary`;
- elle doit mieux distinguer information, risque et action recommandée.

## Premier micro-lot recommandé

Ajouter dans `next` une section courte `Roadmap summary` affichant :

- candidats actifs ;
- candidats terminés ;
- candidats sélectionnables ;
- présence d'un candidat bloqué.

Cette information existe déjà dans `snapshot.roadmap.summary`.


## Amélioration appliquée

La commande `next` affiche désormais une section `Roadmap summary`.

Elle expose :

- candidats actifs ;
- candidats terminés ;
- candidats sélectionnables ;
- présence d'un candidat bloqué.

Cette information utilise `snapshot.roadmap.summary` et ne recalcule rien dans la commande.

