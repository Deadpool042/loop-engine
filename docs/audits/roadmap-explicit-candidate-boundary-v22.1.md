# Audit — Roadmap Explicit Candidate Boundary V22.1

## Écart constaté

Après V22.0, le contenu multi-ligne d'un candidat est correctement conservé. Toutefois, la détection initiale utilisait encore une recherche de mots-clés n'importe où dans la ligne. Une prose ordinaire contenant « prochain lot », « lot » ou « TODO » pouvait donc être interprétée comme un travail exécutable.

## Décision

Une ligne n'est candidate que si elle commence par un marqueur explicite reconnu :

- case Markdown `- [ ]`, `- [x]` ou `- [X]` ;
- `TODO` ;
- `À faire` ou `A faire` ;
- `Prochain` ou `prochain` ;
- `Lot` ou `lot` ;
- `H1-L`, `H2-L` ou `H3-L` ;
- `⏳`.

La même fonction détermine désormais le début d'un candidat et la frontière d'arrêt d'une continuation. Il n'existe donc plus deux définitions divergentes du format candidat.

## Invariants

- Les formats explicites historiques restent acceptés.
- Les titres Markdown ne deviennent jamais candidats.
- La prose qui mentionne un mot-clé au milieu d'une ligne reste ignorée.
- Le contenu indenté d'un candidat explicite reste agrégé conformément à V22.0.
- Aucun appel IA, commit, push ou publish n'est ajouté au moteur.

## Couverture

Les tests adversariaux vérifient que :

- deux phrases de prose contenant « prochain lot » et « lot » ne produisent aucun candidat ;
- les formes explicites `TODO` et `Prochain lot` restent reconnues ;
- la couverture multi-ligne et la classification sensible de V22.0 restent intactes.

## Effet observable

`pnpm loop next` et les runners qui sélectionnent `snapshot.roadmap.selectedCandidate` ne peuvent plus proposer une phrase documentaire comme lot exécutable uniquement parce qu'elle contient un mot-clé candidat.
