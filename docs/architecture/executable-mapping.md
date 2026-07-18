# Executable Mapping

## Statut V10.5

V10.5 ajoute une couche interne de mapping exécutable entre le protocole
Provider et le plan Provider destiné, plus tard, au transport. Elle sépare trois
questions qui ne doivent jamais être confondues : la validité du protocole,
l'existence et la configuration d'un mapping, puis l'autorisation d'exécution.

```text
CLI
  -> Core
  -> RuntimeAdapter
  -> ProviderAdapter
  -> OpenClawProtocol
  -> ExecutableMapping
  -> ProviderExecutionPlan
  -> TransportAdapter
  -> LocalProcessTransport
```

Cette couche est Core-only. Elle n'ajoute aucune commande publique, ne modifie
ni `LoopRunResult`, ni les rapports, ni les contrats JSON ou Markdown.

## Protocole, mapping et transport

Le protocole Provider vérifie une enveloppe déclarative : version, opération,
identités, contexte, capacités et permissions. Cette validité ne prétend pas
connaître un binaire ou une manière de l'appeler.

Le mapping est une déclaration immuable de compatibilité entre ce protocole et
une intention d'exécution future. Il contient seulement l'identité
Provider/Runtime, la version et l'opération de protocole, ainsi que des
capacités transport abstraites. Il ne contient ni chemin, ni commande, ni
arguments, ni flags, ni environnement, ni credential, ni référence à une
implémentation de transport.

Le transport reste la frontière qui, dans un lot futur explicitement autorisé,
recevra une intention structurée et décidera s'il peut déléguer au backend
gardé. V10.5 ne crée aucune `TransportRequest`, ne résout aucun transport et
n'appelle aucun transport.

## Etats déterministes

Un plan de protocole valide peut aboutir à des résultats distincts :

1. `mapping_missing` : aucun mapping ne correspond au plan ;
2. `mapping_disabled` : le mapping existe mais son activation statique est
   refusée ;
3. `mapping_policy_denied` ou `mapping_not_authorized` : le mapping existe et
   est activable, mais la politique de mapping l'interdit ;
4. `mapping_not_configured` : le mapping existe et est autorisé, mais ne porte
   encore aucune configuration exécutable.

Les incompatibilités Provider, Runtime et Transport ont aussi des erreurs
stables distinctes. Chaque erreur ne contient que des diagnostics sûrs et
rapporte toujours `executionStarted: false`.

## Registre OpenClaw

Le registre statique contient exactement `OpenClawExecutableMapping`, pour le
schéma interne `loop-engine-openclaw-planning/v1` et l'opération abstraite
`plan`. Il est immuable, sans discovery filesystem, plugin, import dynamique,
réflexion ou injection de dépendance.

Ce mapping reste `enabled: false` et `configured: false`. Il ne déclare aucun
exécutable, aucune commande ni intention de transport. Claude Code et Codex ne
possèdent aucun mapping et restent des stubs Provider inertes.

Le plan de protocole V10.4 conserve son diagnostic de mapping absent : il
décrit l'absence de mapping exécutable configuré. Le registre V10.5 documente
pour sa part une compatibilité potentielle, mais désactivée. Aucun contrat
public V10.4 n'est ainsi modifié.

## Garanties de sécurité

- aucun `spawn`, `exec`, `execFile`, shell ou appel de processus ;
- aucun accès réseau, `process.env`, credential ou secret ;
- aucun lookup filesystem, binaire, commande, argument ou flag ;
- aucune résolution ou exécution Transport ;
- aucune exposition CLI ou LoopRunner ;
- sélection et validation pures, déterministes et sans heuristique.

## Evolution future

Un lot ultérieur devra apporter une source officielle acceptée par le projet,
un mapping explicitement configuré, une politique restrictive, des tests de
compatibilité et une intention transport structurée. Il devra garder la
séparation entre protocole, mapping et transport, puis passer les garde-fous
V10.1 à V10.3 avant toute possibilité d'exécution.
