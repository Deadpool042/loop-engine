# Architecture Consolidation V10.9

V10.9 n'ajoute aucune couche, aucune capacité d'exécution et aucun contrat de
requête. Il consolide les mécanismes répétés par les couches Runtime, Provider,
Mapping, Intent, Policy, Authorization et Transport tout en préservant leurs
API propres.

## Registres statiques

`src/registry.ts` centralise uniquement trois invariants mécaniques :
l'ordre de déclaration, la copie immuable et l'unicité des identifiants. Il
fournit aussi une recherche déterministe qui retourne `null` en l'absence d'une
entrée. Chaque couche conserve sa forme de registre, son ordre public, ses
fonctions de création et de lookup, ainsi que ses messages d'erreur stables.

Ce primitif ne sélectionne rien, n'applique aucune policy et ne connaît aucun
Runtime, Provider, protocole, Mapping, Intent, Authorization ou Transport. Les
responsabilités métier restent donc isolées dans les modules concernés.

## Contrats et erreurs

Les contrats existants restent inchangés : les statuts, résultats, sélections,
résolutions, validations, summaries, métadonnées et diagnostics appartiennent
toujours à leur domaine. Les erreurs gardent leurs codes, leurs diagnostics,
leurs métadonnées et leurs indicateurs de démarrage existants. La consolidation
ne fusionne pas des erreurs dont la sémantique est différente.

## Garanties inchangées

- aucun `TransportRequest` ou `RuntimeRequest` n'est créé par V10.9 ;
- aucun exécutable, commande, chemin, processus, réseau, credential ou
  `process.env` n'est introduit ;
- aucun appel Runtime, Provider ou Transport n'est ajouté ;
- les registres restent statiques, déterministes et sans discovery dynamique ;
- CLI, LoopRunner, rapports, JSON, Markdown et `schemaVersion` sont inchangés.
