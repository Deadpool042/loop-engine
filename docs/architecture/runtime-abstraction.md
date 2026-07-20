# Runtime Abstraction

## Statut

V10.0 introduit l'interface Runtime locale, déterministe et **non exécutante**.
Les adaptateurs OpenClaw, Claude Code et Codex restent des stubs : aucun accès
réseau, SDK fournisseur, chargement de plugin ou exécution de tâche n'est
implémenté.

V10.1 ajoute uniquement `local-process`, premier backend local réel. Il est
Core-only, désactivé par défaut, et ne devient jamais un mode public `execute`.

## Dépendances

```text
CLI -> Core -> Runtime -> Provider -> Transport -> LocalProcessTransport
```

Le CLI ne connaît pas `runtime/`. `src/core/runtime.ts` assemble une
`RuntimeRequest` depuis un `LoopRunResult` déjà calculé, résout l'adaptateur
statique et délègue sans branche spécifique à `local-process`. `LoopRunResult`,
les rapports d'exécution et les sorties JSON restent inchangés : le résultat
Runtime est interne à ce lot.

Depuis V10.2, `src/providers/` se place entre Runtime et le transport. Les
adaptateurs Provider construisent des plans inertes et ne remplacent pas
`RuntimeAdapter`. Depuis V10.3, `src/transports/` porte seul la délégation vers
le backend `local-process`, par un appel Core explicite. Voir
`provider-adapters.md` et `transport-adapters.md`.

V10.4 ajoute sous Provider un schéma interne OpenClaw, sans dépendance Runtime
et sans exécution. Les plans restent non exécutables faute de mapping documenté.

## Contrats

`RuntimeRequest` réutilise les modèles existants : `RoadmapCandidate`,
`AgentPolicyMode`, `MinimalContextPackage`, `AgentPolicyResolution`,
`AgentProvider` et `AgentEffort`. Il ne duplique aucun modèle d'agent, de
politique ou de contexte.

`RuntimeAdapter` expose seulement :

- `runtimeId` ;
- `capabilities` déclaratives ;
- `supports(request)` ;
- `execute(request)`.

Depuis V13.13, le champ V10 `RuntimeAdapter.capabilities` est explicitement
qualifié de liste de labels `AgentCapability` conservée pour compatibilité avec
la politique d’agent. Il ne s’agit pas de déclarations `RuntimeCapability` et
aucune conversion implicite n’existe entre ces deux contrats. La sélection
déclarative par capabilities vit dans `runtime/resolution/selection.ts` et ne
retourne jamais un adapter ; `resolveRuntime` et `executeRuntime` restent des
surfaces V10 séparées.

## Bridge déclaratif V13.15

V13.15 ajoute une façade Core opt-in entre la résolution déclarative V13 et
l’exécution abstraite V10. Elle ne fusionne pas les modèles :

```text
Declarative Runtime Request
  -> Capability validation
  -> Compatibility evaluation
  -> Eligible descriptor selection
  -> explicit descriptorId -> RuntimeId mapping
  -> V10 resolveRuntime
  -> V10 executeRuntime
```

La phase pure `resolveDeclarativeRuntimeExecution` reçoit une requête
déclarative, un registre déclaratif, un catalogue de `RuntimeCapability`, un
mapping explicite `descriptorId -> RuntimeId` et un `LoopRunResult` déjà
calculé. Elle délègue la sélection V13 à `selectRuntimeByCapabilities`, associe
le descriptor choisi au runtime V10 via le mapping fourni, construit une
`RuntimeRequest` V10 avec `createRuntimeRequest`, puis vérifie `resolveRuntime`.
Elle ne lit ni horloge, ni filesystem, ni environnement, ne lance aucun
processus et ne retourne aucun adapter ou callback.

La phase avec effets `executeDeclarativeRuntime` réutilise la résolution pure
et délègue ensuite uniquement à `executeRuntime`. L’exécution V10 reste donc la
seule couche responsable d’appeler l’adapter sélectionné. Le bridge ne réordonne
pas les descriptors après la sélection V13 et conserve le tie-break lexical
défini par `selectRuntimeByCapabilities`.

Les erreurs typées distinguent :

- requête déclarative invalide ;
- absence de descriptor compatible ;
- descriptor sélectionné sans mapping V10 ;
- impossibilité de construire une `RuntimeRequest` V10 ;
- runtime V10 non résolu par le registre V10 ;
- statut d’exécution V10 non réussi.

Le bridge ne modifie pas `RuntimeRequest`, `RuntimeResult`, `LoopRunResult`, le
CLI ou les schémas JSON publics. Les appels V10 historiques à
`createRuntimeRequest`, `resolveRuntime` et `executeRuntime` restent utilisables
sans configuration déclarative.

`RuntimeResult` est additif par conception : runtime, statut, horodatages,
diagnostics, sortie et métadonnées. V10.1 ajoute optionnellement `exitCode`,
`signal`, `stdout`, `stderr`, une erreur structurée et les événements. Les
stubs retournent toujours `not_implemented`, avec les horodatages fournis par
la requête ; ils restent déterministes.

## local-process (V10.1)

`LocalProcessCommand` sépare strictement la commande demandée de sa politique
d'exécution : `executable` absolu, `args` structurés, `cwd`, environnement
explicite et stdin optionnel. Aucune chaîne shell n'est acceptée.

`LocalProcessExecutionPolicy` doit être explicitement fourni par l'appelant
Core. L'exécution est refusée avant `spawn` si une seule condition manque :

- `requestedRuntime: "local-process"` ;
- `enabled: true` ;
- permission `shell_exec` effectivement autorisée par la résolution de
  politique ;
- exécutable présent dans l'allow-list fermée ;
- `cwd` canonique contenu dans `projectRoot` canonique ;
- environnement limité aux clés explicitement autorisées ;
- timeout, limites stdout et stderr positifs.

L'adaptateur appelle directement `node:child_process.spawn` avec `shell: false`.
Il n'hérite pas automatiquement l'environnement parent, ferme stdin
sans entrée, limite chaque flux indépendamment et termine l'enfant en cas de
timeout ou de dépassement. Les résultats utilisent des codes d'erreur stables
et indiquent toujours si un processus a réellement démarré.

Les observations internes (`request_validated`, `process_started`, réception
de flux, terminaison, completion/échec) reçoivent un numéro de séquence
monotone. Elles ne sont ni persistées ni ajoutées aux rapports publics.

## Registre et sélection

`RUNTIME_REGISTRY` est une liste statique dans l'ordre déclaré : OpenClaw,
Claude Code, Codex, puis `local-process`. Il n'existe ni découverte filesystem,
ni injection de dépendance, ni reflection, ni système de plugin.

`selectRuntime` est pur. Il retient d'abord le runtime explicitement demandé,
sinon celui du profil sélectionné par la politique ; il vérifie ensuite le
registre et les restrictions explicites provider/runtime. `local-process` ne
peut être sélectionné que lorsqu'il est demandé explicitement. Il n'applique ni
score, ni heuristique, ni aléa.

## Limites actuelles

Le Runtime ne donne aucune autorisation supplémentaire. La politique demeure
la source de vérité pour la compatibilité d'agent, et le mode `plan` ne lance
aucune exécution réelle. V10.1 n'ajoute ni fournisseur d'IA, ni réseau, ni
intégration LoopRunner, ni persistance, reprise ou réparation. Il ne déclenche
ni commit, push ou tag. L'arrêt vise seulement le processus enfant ; il ne peut
pas garantir le contrôle universel de tous ses descendants éventuels.
