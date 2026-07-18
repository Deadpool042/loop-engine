# Transport Adapters

## Statut

V10.3 introduit une couche Transport interne, explicite et déterministe. Son
unique implémentation est `local-process`, qui délègue au backend gardé de
V10.1 sans recopier sa logique de processus. Cette couche n’ajoute aucune
commande CLI, aucun mode `execute` public et aucune intégration fournisseur.

## Frontières

```text
CLI -> Core -> RuntimeAdapter -> ProviderAdapter -> TransportAdapter -> LocalProcessTransport
```

Le `RuntimeAdapter` conserve son rôle de contrat d’exécution général. Un
`ProviderAdapter` valide la compatibilité et produit un `ProviderExecutionPlan`
inspectable, mais demeure inerte. Un `TransportAdapter` est la seule frontière
architecturale autorisée à déléguer l’exécution à un backend approuvé.

`LocalProcessTransport` ne connaît ni OpenClaw, ni Claude Code, ni Codex. Il
ne construit aucune commande fournisseur : il transmet seulement une intention
structurée au `LocalProcessRuntime` existant.

## Chaîne explicite

```text
ProviderExecutionPlan (ready + transportIntent)
  -> createTransportRequest(...)
  -> resolveTransport(...)
  -> executeTransport(...)
  -> LocalProcessRuntime (V10.1 guarded backend)
  -> TransportResult
  -> normalizeProviderTransportResult(...)
```

La création d’un plan Provider, la création d’une requête Transport et la
résolution d’un transport sont sans effet de bord. Seul l’appel Core explicite
`executeTransport` (ou le raccourci Core `executeProviderPlan`) peut déclencher
le backend. Les plans Provider V10.2 restent des stubs `not_implemented` et
sont rejetés avec `provider_plan_not_executable` avant toute sélection ou tout
démarrage de processus.

## Contrats

`TransportRequest` porte uniquement des champs structurés : identifiant de
transport, identité Provider/Runtime, capacités requises, exécutable absolu,
vecteur d’arguments, répertoire de travail, limites de ressources, politique
locale existante, politique Transport explicite et métadonnées. Il n’accepte
pas de chaîne shell, credential, jeton, environnement parent ou secret.

`TransportExecutionPolicy` est séparée de la politique locale V10.1 : elle est
par défaut refusante et exige à la fois `enabled: true` et `local-process` dans
`allowedTransportIds`. Les allow-lists Runtime/Provider et l’autorisation
effective `shell_exec` doivent aussi être satisfaites. L’enregistrement d’un
transport ne l’autorise donc jamais implicitement.

`TransportResult` normalise le résultat gardé : statut, indicateur
`executionStarted`, sortie standard/erreur standard bornées, code de sortie,
signal, événements ordonnés, durée, diagnostics et erreur structurée non
sensible. La normalisation Provider conserve ensuite ce résultat dans le
contrat interne Provider sans modifier les rapports publics.

## Garanties conservées

- `shell: false`, aucun `exec` ni chaîne de commande shell ;
- allow-list fermée et validation canonique de l’exécutable ;
- confinement canonique du projet et du répertoire de travail ;
- limites positives et distinctes pour timeout, stdout et stderr ;
- événements Runtime ordonnés, erreurs structurées et indication du démarrage ;
- aucun accès réseau, chargement de secret ou lecture de l’environnement parent
  dans les transports ;
- aucun appel de processus dans les Providers ;
- aucune exposition CLI ou LoopRunner.

## Registre et extensions futures

`TRANSPORT_REGISTRY` contient uniquement `local-process`, dans un ordre fixe.
Il n’existe ni découverte filesystem, import dynamique, plugin ni injection de
dépendance. Les transports HTTP, SDK, MCP, worker distant et sandbox restent de
simples points d’extension futurs : ils ne sont ni enregistrés ni implémentés.

V10.3 n’implémente aucune exécution OpenClaw, Claude Code, Codex ou Gemini, ni
credentials, protocole de CLI fournisseur, retry, streaming ou comptabilité de
tokens.
