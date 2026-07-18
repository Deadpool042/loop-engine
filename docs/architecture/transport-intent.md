# Transport Intent

## Statut V10.6

V10.6 introduit une intention de transport interne, typée et déclarative. Elle
formalise ce qu'un mapping exécutable pourrait demander à une future frontière
Transport, sans produire de payload Transport ni appeler aucune implémentation.

```text
CLI -> Core -> RuntimeAdapter -> ProviderAdapter -> OpenClawProtocol
  -> ExecutableMapping -> TransportIntent -> ProviderExecutionPlan
  -> TransportAdapter -> LocalProcessTransport
```

L'intention est Core-only et ne modifie ni la CLI, ni `LoopRunResult`, ni les
rapports, ni les contrats JSON ou Markdown.

## Quatre étapes séparées

1. Le protocole valide une enveloppe Provider sûre.
2. Le mapping valide une compatibilité Provider/Runtime/protocole.
3. L'intention valide une cible Transport souhaitée, ses capacités,
   permissions et sa politique propre.
4. Le Transport Adapter, hors du périmètre V10.6, serait seul habilité à
   examiner un futur payload exécutable.

Un résultat positif ne vaut jamais autorisation pour l'étape suivante.
L'intention V10.6 ne communique pas avec le `TransportAdapter` et ne crée aucun
objet de requête Transport.

## Mapping, intention et adaptateur

`ExecutableMapping` décrit une compatibilité entre protocole Provider et une
possibilité future. `TransportIntent` décrit ensuite la cible de transport,
capacités, permissions, Provider, Runtime, mapping et politique requis. Il ne
décrit ni commande, argument, chaîne shell, chemin de binaire, environnement,
credential, répertoire de travail ou option de processus.

Le `TransportAdapter` reste le point d'exécution gardé de V10.3. Il ne consomme
pas les intentions V10.6 : cette absence de connexion est volontaire et
auditée.

## Registre et états

Le registre statique contient uniquement `OpenClawTransportIntent`. Il déclare
la cible abstraite `local-process`, l'identité OpenClaw et la permission
`read_only` déjà résolue, sans commande ni payload transport.

Chaque intention est `active: false` et `configured: false`. Sa validation
retourne `intent_disabled`; une intention active refusée par politique retourne
`intent_policy_denied`; une intention autorisée mais sans configuration retourne
`intent_not_configured`. Les incompatibilités Provider, Runtime, Mapping et
capacités Transport ont aussi leurs erreurs stables. Toutes portent
`executionStarted: false`.

## Garanties et revue

- aucun exécutable, commande, argument, flag ou chemin de binaire ;
- aucun `spawn`, `exec`, `execFile`, `fork`, shell, réseau ou `process.env` ;
- aucun credential, filesystem, Runtime ou Transport concret ;
- aucune requête Transport, résolution Transport ou exécution ;
- aucune exposition CLI ou LoopRunner ;
- registre, sélection, validation et normalisation déterministes.

Avant toute activation future, une revue doit confirmer une source officielle
pour le mapping, une politique restrictive explicite, une configuration
auditable et un payload Transport séparé. Ces revues resteront des lots
distincts : V10.6 ne les anticipe pas.

V10.7 ajoute l'évaluation théorique de ces capacités et politiques après
l'intention. Elle reste default-deny et ne relie toujours pas l'intention au
`TransportAdapter`. Voir `capability-policy-engine.md`.
