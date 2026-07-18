# Authorization Configuration

## Statut V10.8

V10.8 introduit des contrats immuables de configuration d'autorisation. Ils
décrivent la manière dont une `AuthorizationDecision` pourrait être revue et
configurée plus tard, sans changer la CLI, le LoopRunner, les rapports ou les
contrats JSON et Markdown publics.

```text
CLI -> Core -> RuntimeAdapter -> ProviderAdapter -> OpenClawProtocol
  -> ExecutableMapping -> TransportIntent -> CapabilityPolicyEngine
  -> AuthorizationDecision -> AuthorizationConfiguration
  -> ProviderExecutionPlan -> TransportAdapter -> LocalProcessTransport
```

La configuration s'arrête avant toute frontière d'exécution. Elle ne crée ni
requête de transport, ni requête Runtime, ni appel Provider, Runtime ou
Transport.

## Décision et configuration

L'évaluation V10.7 répond à la question théorique : les identités, capacités,
permissions et politiques sont-elles compatibles ? La configuration V10.8
décrit séparément ce qui devrait être approuvé et revu : Provider, protocole,
mapping, intention, Runtime, capacité Transport et versions déclarées.

Une décision favorable ne configure rien. Une configuration compatible ne vaut
pas autorisation d'exécution. Le `TransportAdapter` reste totalement ignorant
de cette couche.

## Modèle de revue et défaut-deny

Le registre statique contient seulement `OpenClawAuthorizationConfiguration`.
Il est `active: false`, `approved: false`, `configured: false` et
`reviewRequired: true`. Il porte les identités et versions abstraites requises,
mais aucune information d'exécutable.

La validation vérifie dans un ordre fixe la décision, l'activation, la politique
de configuration, l'approbation et la revue. Tous les résultats sont des
diagnostics structurés avec `executionStarted: false`. Même une configuration
synthétique active, approuvée et revue ne franchit pas la frontière V10.8 : le
contrat ne fabrique aucun payload exécutable.

Claude Code et Codex n'ont aucune configuration ; ils ne peuvent donc pas être
sélectionnés ni configurés implicitement.

## Garanties de sécurité

- aucune commande, argument, flag, chemin de binaire, répertoire de travail,
  environnement, credential ou option de processus ;
- aucun `spawn`, `exec`, `execFile`, `fork`, `process.env`, réseau ou discovery
  filesystem ;
- aucune requête Transport ou Runtime, aucune exécution Provider, Runtime ou
  Transport ;
- aucun couplage CLI, LoopRunner, Runtime concret ou Transport concret ;
- registre, sélection, validation et résumé immuables et déterministes.

## Activation future

Un lot futur devra définir séparément une revue humaine traçable, une source de
configuration explicitement approuvée et un contrat de requête Transport revu.
Ces étapes devront rester default-deny et ne sont pas implémentées par V10.8.
