# Provider Adapters

## Statut

V10.2 ajoute une couche Provider interne et déterministe. Elle prépare les
intégrations futures pour OpenClaw, Claude Code et Codex sans appeler de modèle,
sans réseau, sans lecture de credentials et sans exécution de processus.

Les trois adaptateurs actuels sont des stubs. Ils construisent seulement un
`ProviderExecutionPlan` inerte avec le statut `not_implemented`.

## Frontières

```text
CLI -> Core -> RuntimeAdapter -> ProviderAdapter -> TransportAdapter -> LocalProcessTransport
```

Le `RuntimeAdapter` pilote le cycle d'exécution général. Le `ProviderAdapter`
traduit une `RuntimeRequest` normalisée vers un plan spécifique au fournisseur,
sans décider de permissions ni lancer le transport. Depuis V10.3, un
`TransportAdapter` explicite porte seul la délégation vers le backend
`local-process`, qui reste une primitive générique : il ne connaît aucun
fournisseur, aucun format de CLI fournisseur et aucune credential.

Le Core n'importe pas de type OpenClaw, Claude Code ou Codex. Il expose
uniquement `createProviderRequest`, `resolveProvider` et
`createProviderExecutionPlan`; aucun de ces helpers ne crée une commande ou un
processus.

## Contrats

`ProviderRequest` encapsule le `RuntimeRequest` existant : politique résolue,
contexte borné, tâche, effort et métadonnées sont ainsi réutilisés sans modèle
parallèle. Il ne contient ni commande shell, ni exécutable, ni allow-list, ni
environnement brut, ni secret.

`ProviderExecutionPlan` est un objet inspectable, sérialisable et sans effet
de bord. Les stubs V10.2 gardent leur transport `not_configured`; ils ne
portent donc ni argument de commande spéculatif ni chemin d'exécutable. Un plan
futur explicitement `ready` pourra déclarer une intention Transport structurée,
mais devra encore être validé et résolu par le Core avant tout démarrage. Voir
`transport-adapters.md`.

## Registre et sélection

Le registre statique, dans cet ordre, contient :

1. `openclaw` (`local`, runtime `openclaw`)
2. `claude-code` (`anthropic`, runtime `claude_code`)
3. `codex` (`openai`, runtime `codex`)

La sélection est pure : le fournisseur explicitement demandé est essayé en
premier ; à défaut, un adaptateur compatible est retenu selon l'ordre du
registre. Elle contrôle les allow-lists provider/runtime existantes, l'état de
la politique résolue et les capacités requises. Elle ne fait ni score, ni
estimation de prix, ni découverte distante, ni fallback vers un fournisseur
interdit.

## Garanties V10.2

- les adaptateurs Provider ne peuvent pas contourner la politique ;
- aucun adaptateur Provider ne lance `spawn`, `exec`, shell ou transport ;
- aucun accès réseau, chargement de secret ou lecture de `process.env` ;
- aucune intégration CLI, LoopRunner ou rapport public ;
- aucune activation implicite de `local-process` ;
- les contrats Runtime, `LoopRunResult`, `AuditReport` et les schémas publics
  restent inchangés.

## Suite envisagée

Un lot ultérieur pourra définir, fournisseur par fournisseur, un protocole de
plan structuré et le relier explicitement à un transport gardé. Il devra encore
exiger la sélection explicite Runtime/Provider, l'autorisation de politique,
l'activation du backend, l'allow-list d'exécutables et les limites de ressources.
V10.2 n'implémente ni OpenClaw, ni Claude Code, ni Codex, ni Gemini, ni un mode
public `execute`.

## Protocole OpenClaw interne (V10.4)

V10.4 ajoute sous `src/providers/openclaw/` un schéma interne de planification
OpenClaw. Il ne décrit aucun protocole fournisseur officiel ni commande. Son
unique opération abstraite `plan` est validée de façon pure puis reste
`valid_non_executable`, faute de mapping exécutable documenté. L’adaptateur
OpenClaw garde donc son plan Provider `not_implemented`, sans `transportIntent`.
Voir `openclaw-provider-protocol.md`.

V10.5 ajoute un registre de mapping séparé : il déclare seulement une
compatibilité OpenClaw potentielle, désactivée et non configurée. Il ne modifie
pas les adaptateurs Provider ni leurs plans inertes. Voir
`executable-mapping.md`.
