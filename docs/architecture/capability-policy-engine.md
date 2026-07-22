# Capability & Policy Engine

## Statut V10.7

V10.7 ajoute une évaluation déterministe de la possibilité théorique
d'autoriser une `TransportIntent`. Elle est interne au Core et ne modifie ni la
CLI, ni le LoopRunner, ni les rapports ou contrats JSON et Markdown publics.

```text
CLI -> Core -> RuntimeAdapter -> ProviderAdapter -> OpenClawProtocol
  -> ExecutableMapping -> TransportIntent -> CapabilityPolicyEngine
  -> ProviderExecutionPlan -> TransportAdapter -> LocalProcessTransport
```

Le moteur s'arrête à une `AuthorizationDecision`. Il ne crée pas de requête de
transport, ne sélectionne pas d'adaptateur et n'appelle ni Provider, Runtime
ni Transport.

## Pourquoi deux évaluations

L'évaluation de capacité compare les capacités et permissions requises par
l'intention à un ensemble de capacités déclaré par politique. L'évaluation de
politique vérifie, dans un ordre fixe, Provider, Runtime, mapping, intention,
transport abstrait, versions de protocole et de mapping, capacités et
permissions. Ces évaluations restent distinctes afin qu'une compatibilité
technique ne devienne jamais une autorisation implicite.

`TransportIntent` décrit une cible souhaitée et ses prérequis. Une
`AuthorizationDecision` explique si cette cible serait théoriquement
autorisable. `TransportAdapter` reste la frontière d'exécution V10.3 et ne
connaît pas le moteur de politique V10.7.

## Défaut-deny et OpenClaw

Le registre de capacités est statique. Le registre de politiques contient
uniquement `default-deny`, désactivé avec des allow-lists vides. Il est donc
impossible d'autoriser une exécution à partir de la configuration livrée.

OpenClaw est évalué à partir de `OpenClawExecutableMapping` et de
`openclaw-plan`. Sa décision reste `not_authorized`, avec la raison stable
`mapping_disabled`, car le mapping est volontairement désactivé et non
configuré. Claude Code et Codex n'ont ni mapping ni intention et restent non
autorisés.

Une décision `authorized`, construite uniquement dans des tests avec une
politique synthétique, reste théorique : elle ne représente ni droit
d'exécution, ni configuration de processus, ni passage à la couche Transport.

## Garanties de sécurité

- aucune commande, argument, flag, shell, chemin de binaire ou option de
  processus ;
- aucun `spawn`, `exec`, `execFile`, `fork`, `process.env`, réseau,
  credential ou discovery filesystem ;
- aucune requête Transport, exécution Runtime, exécution Provider ou
  exécution Transport ;
- aucun couplage CLI, LoopRunner, Runtime concret ou Transport concret ;
- registres, sélection, validations et décisions immuables et déterministes.

## Activation future

Une activation devra faire l'objet d'un lot distinct : mapping officiellement
accepté et configuré, intention active, politique restrictive explicitement
approuvée, puis contrat de requête Transport séparé et revu. Aucune de ces
étapes n'est introduite par V10.7.
