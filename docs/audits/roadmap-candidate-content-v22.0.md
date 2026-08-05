# Audit — Roadmap Candidate Content V22.0

## Problème observé

Le burn-in de commit contrôlé a montré qu'une consigne roadmap répartie sur plusieurs lignes pouvait perdre son contenu cible : le Roadmap Reader ne conservait que la ligne portant le marqueur candidat. Le prompt transmis au provider pouvait donc contenir l'action générale sans le chemin, le contenu exact ou la contrainte écrits sur les lignes indentées suivantes.

## Décision

Le candidat reste identifié par sa ligne de départ et conserve son numéro de ligne historique. Les lignes Markdown indentées immédiatement consécutives sont désormais agrégées dans `RoadmapCandidate.text`, sous forme d'une chaîne normalisée séparée par des espaces.

La capture s'arrête devant :

- une ligne vide ;
- un titre Markdown ;
- un nouveau marqueur candidat placé en début de ligne ;
- une ligne non indentée.

Un mot-clé candidat présent au milieu d'une continuation, par exemple « le prochain lot », ne crée pas un second candidat.

## Invariants

- Aucun appel IA n'est ajouté.
- Aucun contrat public n'est étendu : `RoadmapCandidate.text` reste une chaîne.
- `path` et `line` continuent de désigner la ligne de départ du candidat.
- Le statut et la priorité restent lus sur la ligne de départ.
- La classification de risque porte sur le contenu complet agrégé, afin qu'une contrainte sensible écrite en continuation ne soit pas ignorée.
- Deux candidats explicites successifs restent distincts.

## Couverture adversariale

`tests/intelligence/roadmap-candidate-content.test.ts` couvre :

- l'agrégation de plusieurs continuations ;
- la conservation du numéro de ligne, du statut et de la priorité ;
- la classification sensible depuis une continuation ;
- l'arrêt devant le candidat suivant ;
- le refus d'absorber une prose non indentée ;
- l'absence de doublon lorsqu'une continuation contient « prochain lot ».

## Effet observable

Les commandes et runners qui consomment déjà `snapshot.roadmap.selectedCandidate.text` reçoivent désormais la consigne complète sans modification de leur interface. Le chemin cible et les contraintes d'un lot multi-ligne sont donc conservés dans le prompt d'exécution.
