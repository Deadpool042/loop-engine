# Agent Policy Engine

## Statut

Lot V7.4 — moteur de politique local et déterministe, intégré au `LoopRunner` **uniquement en mode `plan`**, sous forme de sélection prévisionnelle (forecast). Aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun mode `execute` réel, aucun appel d'agent, aucun commit ou push automatique.

## Objectif

Transformer un micro-lot planifié (le candidat de roadmap sélectionné par [`next`](roadmap-reader.md)/[`LoopPlanner`](autonomous-loop-runner.md)) en une décision explicable :

```text
micro-lot
  -> requirements   (LoopTaskRequirements — capacités, permissions, effort, budget, contexte)
  -> policy         (AgentPolicy — plafonds globaux, fournisseurs/runtimes autorisés)
  -> selection request (AgentSelectionRequest — voir agent-orchestration.md)
  -> selector        (selectAgentProfile — lookup pur dans l'AgentRegistry)
  -> resolution      (AgentPolicyResolution — statut, sélection, raisons)
```

Ce lot relie la couche [`src/agents/`](agent-orchestration.md) (types, registry, sélecteur, escalade — V7.3) au [`LoopRunner`](autonomous-loop-runner.md) (V7.2, mode `plan`), sans jamais implémenter le mode `execute`.

## Principes obligatoires

- **Local first, retrieval first, smallest capable agent first, escalation only on failure** — les principes du [moteur d'orchestration d'agents](agent-orchestration.md) s'appliquent intégralement ici et ne sont jamais contournés.
- **Aucune permission implicite** — une capacité ne confère jamais une permission ; une permission de mode ne confère jamais `git_tag` (voir "Politique Git" ci-dessous).
- **Fusion toujours restrictive** — un appelant (y compris n8n) ne peut que réduire un plafond de politique (budget, effort, fournisseurs, runtimes), jamais l'élargir. Voir "Fusion restrictive" ci-dessous.
- **Sélection prévisionnelle, jamais d'exécution** — même en mode `plan`, une résolution de politique peut produire un profil d'agent "sélectionné" ; cela reste une prévision (forecast), jamais un appel réel. Voir "Intégration au LoopRunner" ci-dessous.

## Placement dans le layering

```text
cli.ts
  └─ commands/
       └─ loop/          (LoopRunner — consomme policy/ et agents/)
            ├─ intelligence/
            ├─ policy/    (ce lot : requirements, politique, résolution)
            │    └─ agents/  (V7.3 : types, registry, sélecteur, escalade)
            └─ agents/
```

Règles de dépendance, strictes :

- `src/policy/` dépend de `src/agents/` (vocabulaire capacités/permissions/effort/budget/sélecteur) et, en lecture seule, de `src/intelligence/roadmap.js` pour le type `RoadmapCandidate` — exactement la même dépendance que `src/loop/types.ts` a déjà.
- `src/policy/` ne dépend **jamais** de `src/loop/`, `src/commands/` ni `src/cli.ts`. Le `LoopRunner` consomme `src/policy/`, jamais l'inverse.
- `src/agents/` continue de ne dépendre d'aucune autre couche (règle V7.3 inchangée) — en particulier, `src/agents/` ne dépend jamais de `src/policy/`.

## Contrats

### `LoopTaskCategory`

Catégorie déduite du texte du candidat de roadmap, par mots-clés déterministes et dans cet ordre fixe (favorise la précision, comme le [roadmap reader](roadmap-reader.md)) : `documentation`, `tests`, `validation`, `architecture`, `review`, sinon `code` par défaut, ou `none` si aucun candidat n'est disponible.

Seul `candidate.text` est inspecté — jamais `candidate.path` : le `path` d'un `RoadmapCandidate` est le fichier roadmap source (presque toujours sous `docs/roadmap/`), pas le fichier que le lot modifierait. L'inspecter aurait classé presque tous les lots comme `documentation`.

### `LoopTaskRequirements`

```ts
interface LoopTaskRequirements {
  category: LoopTaskCategory;
  mode: AgentPolicyMode;
  requiredCapabilities: readonly AgentCapability[];
  requiredPermissions: readonly AgentPermission[];
  minimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  preferredProviders?: readonly AgentProvider[];
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  contextBudget: ContextBudget;
  executionBudget: AgentBudget;
  rationale: readonly string[];
}
```

`requiredCapabilities` dépend uniquement de la catégorie. `requiredPermissions` dépend du **plafond du mode** (`getAllowedPermissionsForMode`) filtré par les besoins de la catégorie — jamais l'inverse : c'est ce qui garantit qu'aucune capacité d'écriture n'est jamais requise en mode `plan`, quelle que soit la catégorie du lot.

### `AgentPolicy`

```ts
interface AgentPolicy {
  id: string;
  enabled: boolean;
  defaultMinimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  defaultBudget: AgentBudget;
  contextBudget: ContextBudget;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  deniedPermissions?: readonly AgentPermission[];
  allowTagCreation?: boolean;
  allowEscalation: boolean;
}
```

`DEFAULT_AGENT_POLICY` (`src/policy/defaults.ts`) est, comme `DEFAULT_AGENT_PROFILES`, **explicitement illustratif** : une configuration de démonstration, pas une politique de production.

### `AgentPolicyResolution`

```ts
interface AgentPolicyResolution {
  policyId: string;
  mode: AgentPolicyMode;
  status: AgentPolicyStatusCode;
  requirements: LoopTaskRequirements;
  selectionRequest: AgentSelectionRequest;
  selection: AgentSelectionResult | null;
  reasons: readonly string[];
}
```

Codes de statut (`AGENT_POLICY_STATUS_CODES`) : `resolved`, `no_safe_candidate`, `no_compatible_agent`, `policy_disabled`, `permission_denied`, `budget_exhausted`, `effort_not_supported`, `provider_not_allowed`, `runtime_not_allowed`. Chacun est déterministe et couvert par des tests (`tests/policy/resolver.test.ts`) ; aucun profil absent ou incompatible ne provoque d'exception non structurée.

## Permissions par mode

`getAllowedPermissionsForMode(mode)` (`src/policy/defaults.ts`) — chaque mode inclut strictement les permissions du mode précédent, plus exactement une nouvelle :

| Mode      | Permissions                                                           |
| --------- | --------------------------------------------------------------------- |
| `plan`    | `read_only`                                                           |
| `execute` | `read_only`, `write_worktree`, `shell_exec`                           |
| `commit`  | `read_only`, `write_worktree`, `shell_exec`, `git_commit`             |
| `publish` | `read_only`, `write_worktree`, `shell_exec`, `git_commit`, `git_push` |

`git_tag` n'apparaît **jamais** dans ce plafond, quel que soit le mode : elle reste une permission séparée du `git_push` (`AGENT_PERMISSIONS` dans `src/agents/types.ts`), jamais implicite. Elle ne peut être envisagée que via `AgentPolicy.allowTagCreation`, en mode `publish`, et ce lot ne l'accorde jamais automatiquement (pas de mode `execute` réel).

Une politique ne peut jamais accorder plus que le mode : `AgentPolicy.deniedPermissions` ne peut que retirer une permission déjà dans le plafond du mode, jamais en ajouter une hors plafond.

## Politique Git

Invariants garantis par construction (pas d'exécution réelle dans ce lot, donc pas de risque direct, mais les contrats sont posés pour le futur `LoopExecutor`) :

- aucun force-push, jamais mentionné dans `src/policy/` ;
- aucun push ni commit possible en mode `plan` ou `execute` (absents du plafond de permissions) ;
- `git_tag` toujours séparée de `git_push`, jamais implicite ;
- aucune publication tant que la validation n'est pas `completed` (porté par la machine à états du [`LoopRunner`](autonomous-loop-runner.md), inchangée) ;
- aucune élévation automatique de permission pendant une réparation — ce lot n'implémente aucune boucle de réparation.

## Fusion restrictive

`src/policy/defaults.ts` expose les primitives de fusion, toutes à sens unique (ne peuvent que réduire) :

- `mergeBudgetsRestrictively(global, requested)` — `résultat[dimension] = min(global, requested)`, `null` traité comme "non borné" (+infini). Les deux `null` restent `null` : ce n'est jamais une autorisation illimitée accidentelle, seulement l'absence explicite de restriction des deux côtés.
- `toBudget(partial)` — normalise un budget partiel (n8n) en `AgentBudget` complet, chaque dimension omise devenant `null` plutôt qu'une valeur par défaut surprenante.
- `mergeAllowedProviders` / `mergeAllowedRuntimes` — intersection stricte, jamais union ; `undefined` d'un côté défère entièrement à l'autre.
- `restrictMaximumEffort(globalMax, requestedMax)` — un effort maximum demandé ne peut qu'abaisser le plafond global, jamais le dépasser.
- `mergeContextBudgetsRestrictively` — même principe pour `ContextBudget` (minimum par dimension, `includeFullFiles` uniquement si les deux côtés l'autorisent).

## Budget par mode et budget de simulation de sélection

`DEFAULT_MODE_BUDGETS[mode]` (`src/policy/defaults.ts`) documente le budget **réel** de chaque mode :

```text
plan    -> maxCalls: 0, maxRepairs: 0   (jamais d'appel réel)
execute -> maxCalls: 1, maxRepairs: 1
commit  -> maxCalls: 1, maxRepairs: 1
publish -> maxCalls: 1, maxRepairs: 1
```

Cette valeur reste `requirements.executionBudget` — un champ purement informatif, jamais utilisé pour filtrer les profils d'agents pendant une résolution en mode `plan`. Si elle l'était, **tout** profil serait rejeté (aucun profil réel n'annonce `maxCalls: 0`), rendant la prévision inutilisable.

`getForecastSelectionBudgetForMode(mode)` répond à ce problème. Son nom est délibérément explicite : ce n'est **pas** un budget exécutable, seulement une **simulation de compatibilité** — elle fournit le budget utilisé pour filtrer les profils candidats pendant `resolvePolicy` — celui du mode `execute` lorsque le mode courant est `plan` (on prévisualise "que se passerait-il si ce candidat passait à l'exécution réelle ?"), et le budget propre du mode sinon. Elle n'autorise jamais un appel : la garantie "le mode `plan` ne fait jamais d'appel réel" reste portée uniquement par le flux de contrôle du `LoopRunner` (aucun code n'appelle jamais un agent), jamais par la valeur retournée par cette fonction.

## Politique de contexte

`ContextBudget` (`maxFiles`, `maxCharacters`, `maxEstimatedTokens`, `includeFullFiles`) est dérivé de manière déterministe à partir de l'effort minimum requis (`getContextBudgetForEffort`, `src/policy/defaults.ts`) : plus l'effort minimum est élevé, plus le budget de contexte s'élargit, toujours borné (jamais illimité, à aucun niveau d'effort). Ce lot (V7.4) produit uniquement ce budget et sa justification (`rationale`) ; `src/policy/` ne lit jamais de fichier et n'appelle jamais `context`/`rag-search`.

Depuis le lot V7.5, ce budget est effectivement consommé par le [Minimal Context Builder](minimal-context-builder.md) (`src/context/`) : `runLoopPlan` construit un `MinimalContextPackage` via `buildMinimalContext(snapshot, agentPolicy.requirements.contextBudget)`, exposé sur le champ additif `contextPackage` de `LoopRunResult`. `src/policy/` continue de ne dépendre à aucun moment de `src/context/` — c'est le `LoopRunner` qui relie les deux, jamais l'inverse.

## Intégration au LoopRunner (mode `plan`)

Le comportement terminal du mode `plan` est inchangé : `idle -> planning -> ready -> completed` (candidat sûr) ou `idle -> planning -> blocked` (aucun candidat sûr). Voir [`autonomous-loop-runner.md`](autonomous-loop-runner.md).

`runLoopPlan` (`src/loop/runner.ts`), une fois le cycle `ready`, calcule une résolution de politique **prévisionnelle** via `resolvePolicy` (`policy: DEFAULT_AGENT_POLICY`, `registry: defaultAgentRegistry`, `mode: "plan"`, tous injectables pour les tests) et l'expose sur un champ additif du `LoopRunResult` :

```ts
agentPolicy: AgentPolicyResolution | null;
```

`null` lorsque le cycle est `blocked` ou `failed` (pas de candidat prêt), toujours renseigné lorsque le cycle atteint `completed`. Cet ajout est rétrocompatible : `schemaVersion` reste `1`, aucun champ existant n'est retiré ou modifié — voir `tests/commands/json-output.test.ts` et `tests/loop/runner.test.ts` pour la couverture.

La résolution distingue explicitement deux échecs de nature différente :

- `no_safe_candidate` — aucun candidat n'était disponible à résoudre (le `LoopPlanner` a déjà filtré les candidats `blocked`, voir `autonomous-loop-runner.md`) ;
- `no_compatible_agent` — un candidat existe, mais aucun profil de l'`AgentRegistry` ne satisfait les exigences dérivées.

`resolvePolicy` n'appelle jamais un agent réel : `selectAgentProfile` (`src/agents/selector.ts`) est un lookup pur sur un registre local, jamais une invocation. Aucun réseau, aucun processus, aucune écriture.

## Consommation par l'admission Runtime V13.16

Depuis V13.16, le bridge Core policy-aware consomme une
`AgentPolicyResolution` déjà calculée pour décider si une exécution Runtime peut
continuer après la sélection par capacités. Cette consommation est
unidirectionnelle : `src/core/runtime-execution-bridge.ts` importe les contrats
publics Policy/Agent, mais `src/policy/` ne dépend pas de `src/core/`,
`src/runtime/`, `src/loop/` ou `src/execution/`.

L'admission ne résout pas une politique, ne charge pas les defaults et ne
modifie pas les règles du Policy Engine. Elle lit seulement les exigences
résolues (`allowedRuntimes`, `allowedProviders`, `maximumEffort`,
`executionBudget`) et réutilise les helpers existants (`compareAgentEffort`,
`toBudget`, `mergeBudgetsRestrictively`) pour vérifier un runtime mappé, un
provider explicitement connu, un effort demandé et un budget demandé. Si le
provider n'est pas connu et qu'une allow-list provider existe, l'admission refuse
avec un résultat structuré plutôt que de déduire le provider depuis le runtime.

Cette phase ne remplace pas les permissions par mode : aucune permission
d'exécution n'est inventée à partir d'un runtime ou d'un adapter. Les contrôles
de permissions restent portés par les contrats de politique, le futur
LoopRunner/LoopExecutor explicite, et les garde-fous V10 comme
`LocalProcessExecutionPolicy`.

Depuis V13.17, une admission réussie peut alimenter un `RuntimeExecutionPlan`
Core. Le plan ne copie pas l'`AgentPolicyResolution` complète : il expose une
vue minimale de la décision admise (`policyId`, mode, checks, provider connu ou
`null`, effort, budget demandé/limite/effectif). Cette vue sert au dry-run et à
l'observabilité future ; elle n'autorise pas une exécution depuis un document
sérialisé et ne déplace pas les responsabilités du Policy Engine.

## Position de n8n

n8n peut fournir, via `AgentPolicyRequest` (`src/policy/types.ts`) : `requestedBudget` (partiel), `requestedMaxEffort`, `requestedProviders`, `requestedRuntimes` — plus, au niveau de l'appel `run`, le projet, l'objectif, et le mode demandé (voir `autonomous-loop-runner.md`).

Loop Engine applique une **fusion restrictive** systématique (voir ci-dessus) : n8n ne peut jamais élargir le budget global, l'effort maximum, ajouter une permission interdite, transformer `execute` en `commit` ou `commit` en `publish`, contourner le sélecteur, choisir un profil incompatible, ignorer une CI échouée, ou déclencher un force-push. Aucune de ces garanties ne dépend de la confiance en n8n : elles sont appliquées côté Loop Engine, par construction (fusion à sens unique, plafonds de permissions par mode, sélecteur pur).

```text
n8n            -> demande et limite
Loop Engine    -> réduit, valide et sélectionne (ce lot : jusqu'à la sélection prévisionnelle)
Agent          -> exécutera dans un futur lot (LoopExecutor, non implémenté ici)
```

## Position d'OpenClaw, Codex, Claude Code et autres

Inchangée par rapport à `agent-orchestration.md` : aucune hiérarchie fixe. La politique ne connaît que provider/runtime/modèle/effort/capacités/permissions/budget/disponibilité, jamais un statut privilégié pour un runtime particulier.

## Portée du lot V7.4

Dans ce lot :

- `src/agents/types.ts` — ajout de la permission `git_tag`, distincte de `git_push`, jamais implicite ;
- `src/policy/types.ts` — `AgentPolicyMode`, `LoopTaskCategory`, `ContextBudget`, `LoopTaskRequirements`, `AgentPolicy`, `AgentPolicyRequest`, `AgentPolicyResolution`, `AGENT_POLICY_STATUS_CODES` ;
- `src/policy/defaults.ts` — plafonds de permissions par mode, budgets par mode, budget de simulation de sélection (`getForecastSelectionBudgetForMode`), primitives de fusion restrictive, budget de contexte par effort, `DEFAULT_AGENT_POLICY` ;
- `src/policy/resolver.ts` — `classifyLoopTaskCategory`, `deriveRequiredPermissions`, `deriveTaskRequirements`, `resolvePolicy` ;
- intégration additive au `LoopRunner` (mode `plan` uniquement) — champ `agentPolicy` sur `LoopRunResult`, sélection prévisionnelle, jamais d'appel réel.

Explicitement hors périmètre :

- aucun mode `execute` réel, aucun `LoopExecutor` ;
- aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun processus Claude/Codex/OpenClaw/Copilot/ChatGPT ;
- aucune construction du paquet de contexte final (seulement le budget qui l'encadrerait) ;
- aucune boucle de réparation, aucune escalade automatique (`escalateAgentProfile` reste un appel explicite séparé, V7.3, jamais invoqué depuis `src/policy/`) ;
- aucun commit, push ou tag automatique.

## Voir aussi

- `docs/architecture/agent-orchestration.md`
- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/minimal-context-builder.md`
- `docs/architecture/final-objective.md`
- `docs/architecture/roadmap-reader.md`
- `CLAUDE.md`
