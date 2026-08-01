# Cycle de vie des documents d'architecture

## Métadonnées

- Type : Normatif
- Statut : Actif
- Portée : Cycle de vie et métadonnées des futurs documents d'architecture
- Prédécesseur : Aucun
- Successeur : Aucun
- Décision associée : Aucun

Ce document établit des règles de gouvernance pour l'avenir. Il ne requalifie,
ne déplace ni ne modifie les documents antérieurs à V18.0a.

## Objectif

La documentation d'architecture doit permettre de déterminer, sans déduire
l'intention d'un auteur :

- la nature d'un document ;
- son autorité et son état de validité ;
- son prédécesseur ou son successeur, le cas échéant ;
- la relation entre une règle durable, une conception proposée et une trace de
  livraison.

Les statuts documentaires décrivent l'autorité du document. Ils ne remplacent
ni l'état observé du code, ni les validations, ni les audits.

## Convention de métadonnées

Tout nouveau document sous `docs/architecture/` commence par son titre, puis
par une section `## Métadonnées` placée avant son contenu.

```md
# Titre du document

## Métadonnées

- Type : Normatif | ADR | RFC | Contrat courant | Historique | Delivery Record
- Statut : <valeur autorisée pour le type>
- Portée : <frontière ou sujet couvert>
- Prédécesseur : <lien ou `Aucun`>
- Successeur : <lien ou `Aucun`>
- Décision associée : <lien ADR, RFC ou `Aucune`>
```

Les liens sont relatifs au document. Les valeurs `Aucun` et `Aucune` sont
explicites : l'absence d'un lien ne doit jamais être implicite.

Les champs `Type`, `Statut` et `Portée` sont obligatoires. Les trois champs de
relation sont obligatoires lorsque la relation existe ; sinon la valeur
explicite ci-dessus est utilisée.

Un document peut ajouter des métadonnées utiles, mais il ne doit pas changer le
sens de ces champs. Les termes employés doivent être définis par le
`glossary.md` avant leur première utilisation architecturale durable.

## Types de documents

### Normatif

Un document normatif établit une règle durable : vision, principes, glossaire,
cartographie, dépendances ou gouvernance. Son statut est `Proposé`, `Actif` ou
`Remplacé`.

Un document normatif actif définit une règle de référence. Un document remplacé
reste consultable et pointe vers son successeur ; il ne doit plus être utilisé
pour justifier une nouvelle décision.

### ADR

Une ADR enregistre une décision architecturale durable et son pourquoi. Ses
statuts sont `Proposé`, `Accepté`, `Déprécié` et `Remplacé`.

Une ADR acceptée reste la justification de la décision tant qu'elle n'est pas
dépréciée ou remplacée. Une ADR ne décrit pas un plan de livraison détaillé et
ne remplace pas un contrat courant.

### RFC

Une RFC décrit une évolution architecturale avant sa mise en œuvre : problème,
portée, conception, invariants, alternatives, non-objectifs et critères
d'acceptation. Ses statuts sont `Brouillon`, `En revue`, `Acceptée`, `Rejetée`,
`Retirée` et `Remplacée`.

Une RFC acceptée autorise la conception documentaire ; elle ne prouve pas que
l'implémentation existe. Lorsqu'une capacité est livrée, la RFC pointe vers le
contrat courant et, s'il existe, vers le Delivery Record correspondant.

### Contrat courant

Un contrat courant décrit le comportement et les frontières actuellement
attendus d'une capacité. Ses statuts sont `Actif`, `Déprécié` et `Remplacé`.

Pour une même capacité et une même surface publique, un seul contrat est
désigné `Actif`. Les documents de contexte peuvent le résumer, mais doivent
lier ce contrat au lieu d'en recopier les détails évolutifs.

### Historique

Un document historique conserve le contexte d'une architecture, d'une version
ou d'une décision passée. Ses statuts sont `Historique` et `Remplacé`.

Il ne définit pas le comportement courant. Sa première section de contenu doit
indiquer le contrat courant ou expliquer qu'il n'existe pas encore.

### Delivery Record

Un Delivery Record conserve la trace bornée d'un lot : portée livrée,
invariants préservés, validations effectuées et limites connues. Ses statuts
sont `Prévu`, `Livré`, `Invalidé` et `Archivé`.

Il ne devient jamais normatif par accumulation de détails de livraison. Il doit
pointer vers la RFC et le contrat courant qu'il matérialise, ou déclarer que le
lot n'a pas produit de contrat courant.

## Cycle de vie ADR

1. Une évolution durable est formulée dans une RFC ou dans une décision
   explicitement bornée.
2. L'ADR est proposée lorsque le choix architectural et ses conséquences sont
   suffisamment connus.
3. Après décision explicite, l'ADR devient `Accepté`.
4. Si le choix cesse d'être recommandé, l'ADR devient `Déprécié` ; si une autre
   ADR la remplace, elle devient `Remplacé` et lie son successeur.

Une nouvelle ADR ne réécrit pas l'historique d'une ADR acceptée. Elle explique
la nouvelle décision et référence celle qu'elle complète ou remplace.

## Cycle de vie RFC

1. Une RFC débute `Brouillon` avec une portée et des non-objectifs explicites.
2. Elle passe `En revue` lorsque ses contrats, invariants et conséquences sont
   suffisamment précis pour être évalués.
3. La décision la fait devenir `Acceptée`, `Rejetée` ou `Retirée`.
4. Une RFC acceptée est reliée au contrat courant créé ou mis à jour par son
   évolution.
5. Si une nouvelle RFC prend sa place, elle devient `Remplacée` et lie son
   successeur.

Une RFC rejetée ou retirée reste une trace de décision ; elle n'est pas une
spécification à implémenter.

## Relation entre courant, historique et livraison

Ces catégories ont des responsabilités distinctes :

| Catégorie       | Question à laquelle elle répond                                     | Peut définir le comportement actuel ? |
| --------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Contrat courant | « Quelle frontière et quels invariants sont attendus maintenant ? » | Oui, si `Actif`                       |
| Historique      | « Pourquoi ou comment cette architecture a-t-elle évolué ? »        | Non                                   |
| Delivery Record | « Qu'a livré ce lot et quelle preuve a été produite ? »             | Non                                   |

Une capacité évolue donc selon la chaîne de navigation suivante :

```text
RFC acceptée
  -> ADR acceptée, si une décision durable est prise
  -> Contrat courant actif
  -> Delivery Record livré
  -> Contrat courant successeur, si la capacité évolue
```

Tous les maillons ne sont pas obligatoires : une RFC peut ne pas nécessiter
d'ADR, et un changement documentaire peut ne pas produire de Delivery Record.
Lorsqu'un maillon existe, les liens de métadonnées rendent sa relation
traçable.

## Règles de maintenance

- Ne pas recopier dans un document historique ou un Delivery Record les règles
  évolutives déjà détenues par un contrat courant.
- Lorsqu'un contrat actif est remplacé, changer son statut et renseigner son
  successeur dans le même changement documentaire.
- Ne pas utiliser le mot « actuel », « implémenté » ou « futur » sans un statut
  de document qui permette de situer cette affirmation.
- L'index `README.md` est le point d'entrée de navigation ; il doit référencer
  les documents de gouvernance et les contrats courants sans devenir un
  duplicat de leurs contenus.
