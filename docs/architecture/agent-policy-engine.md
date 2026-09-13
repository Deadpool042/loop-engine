# Agent Policy Engine

## Statut

Lot V7.4 — moteur de politique local et déterministe, intégré au `LoopRunner` **uniquement en mode `plan`**, sous forme de sélection prévisionnelle (forecast). Aucun appel réseau, aucun SDK fournisseur, aucune clé API, aucun mode `execute` réel, aucun appel d'agent, aucun commit ou push automatique.

## Objectif

Transformer un micro-lot planifié (le candidat de roadmap sélectionné par [`next`](roadmap-reader.md)/[`LoopPlanner`](autonomous-loop-runner.md)) en une décision explicable :

```text
micro-lot
  -> requirements   (LoopTaskRequirements — catégorie, capacités, outils, scope, complexité, permissions, effort, budget, contexte)
  -> policy         (AgentPolicy — plafonds globaux, fournisseurs/runtimes autorisés)
  -> selection request (AgentSelectionRequest — voir agent-orchestration.md)
  -> selector        (selectAgentProfile — lookup pur dans l'AgentRegistry)
  -> resolution      (AgentPolicyResolution — statut, sélection, raisons)
```

Ce lot relie la couche [`src/agents/`](agent-orchestration.md) (types, registry, sélecteur, escalade — V7.3) au [`LoopRunner`](autonomous-loop-runner.md) (V7.2, mode `plan`), sans jamais implémenter le mode `execute`.

## Principes obligatoires

- **Local first, retrieval first, smallest capable agent first, escalation only on failure** — les principes du [moteur d'orchestration d'agents](agent-orchestration.md) s'appliquent intégralement ici et ne sont jamais contournés.
- **Aucune permission implicite** — une capacité ne confère jamais une permission ; une permission de mode ne confère jamais `git_tag` (voir "Politique Git" ci-dessous).
- **Fusion toujours restrictive** — un appelant (y compris n8n) ne peut que réduire un plafond de politique (budget, effort, fournisseurs, runtimes, financement), jamais l'élargir. Voir "Fusion restrictive" ci-dessous.
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
  requiredTools: readonly LoopTaskTool[];
  scope: LoopTaskScope;
  complexity: LoopTaskComplexity;
  requiredPermissions: readonly AgentPermission[];
  minimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  preferredProviders?: readonly AgentProvider[];
  preferredCapabilityTier?: AgentProfileTier;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  contextBudget: ContextBudget;
  executionBudget: AgentBudget;
  rationale: readonly string[];
}
```

`requiredCapabilities`, `requiredTools`, `scope` et `complexity` dépendent uniquement de la catégorie déterministe du lot. `requiredTools` décrit les surfaces techniques nécessaires (`filesystem_read`, `filesystem_write`, `shell_exec`, `test_runner`) ; `scope` vaut `none`, `read_only` ou `bounded_write` ; `complexity` vaut `low`, `medium` ou `high`. Ces trois champs sont **descriptifs et non autorisants** : ils servent au futur routage AUTO, mais ne peuvent jamais élargir une permission.

`requiredPermissions` dépend du **plafond du mode** (`getAllowedPermissionsForMode`) filtré par les besoins de la catégorie — jamais l'inverse : c'est ce qui garantit qu'un lot décrit comme `bounded_write` reste strictement `read_only` en mode `plan`. La complexité est également distincte de l'effort d'invocation : une architecture peut être `high` en complexité tout en gardant `minimumEffort=medium`, l'effort `high` restant réservé à une escalade réellement justifiée.

`preferredCapabilityTier` (`CATEGORY_PREFERRED_CAPABILITY_TIER` dans `src/policy/resolver.ts`) exprime une préférence doctrinale abstraite et indépendante du fournisseur. Elle ne contraint jamais la sélection : `selectAgentProfile` reste un lookup pur sur les exigences hard `requiredCapabilities`/`requiredPermissions`/provider/runtime/effort/budget (voir "Cible de politique vs profil résolu" ci-dessous).

### `AgentPolicy`

```ts
interface AgentPolicy {
  id: string;
  enabled: boolean;
  defaultMinimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  defaultBudget: AgentBudget;
  contextBudget: ContextBudget;
  quotaReserve?: QuotaReservePolicy;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  allowedFundingModes?: readonly AgentFundingMode[];
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
  fallback: AgentPolicyFallback; // { active: boolean; reason: AgentPolicyFallbackReason | null }
}
```

Codes de statut (`AGENT_POLICY_STATUS_CODES`) : `resolved`, `no_safe_candidate`, `no_compatible_agent`, `policy_disabled`, `permission_denied`, `budget_exhausted`, `effort_not_supported`, `provider_not_allowed`, `runtime_not_allowed`. Chacun est déterministe et couvert par des tests (`tests/policy/resolver.test.ts`) ; aucun profil absent ou incompatible ne provoque d'exception non structurée.

### Cible de politique vs profil résolu (`fallback`)

`requirements.preferredCapabilityTier` exprime la cible doctrinale abstraite d'une catégorie (par exemple `high_reasoning` pour `architecture`) — une **préférence**, jamais une exigence. `requirements.requiredCapabilities`/`requiredPermissions`/`minimumEffort`/budgets restent les seules contraintes fail-closed : un profil qui ne les satisfait pas n'est jamais sélectionné, préférence ou non.

`resolution.fallback` vérifie, après coup, si le profil réellement sélectionné déclare le tier préféré dans `selection.profile.tiers` :

- `{ active: false, reason: null }` — la catégorie n'a pas de préférence déclarée, ou le profil sélectionné porte le tier préféré ;
- `{ active: true, reason: "preferred_capability_tier_unavailable" }` — le profil sélectionné satisfait toutes les exigences obligatoires mais ne porte pas le tier doctrinal préféré actuellement disponible.

Un `fallback` n'est **jamais** une escalade (`src/agents/escalation.ts`) : l'escalade ne se déclenche que sur un échec réel d'une tentative précédente (`previousProfileId` + `failureReason` explicites) et ne fait jamais partie de `resolvePolicy`. Un fallback reflète une préférence indisponible au moment de la résolution, sans jamais élever l'effort au-delà de `requirements.minimumEffort`.

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
execute -> maxCalls: 2, maxRepairs: 1
commit  -> maxCalls: 2, maxRepairs: 1
publish -> maxCalls: 2, maxRepairs: 1
```

Cette valeur reste `requirements.executionBudget` — un champ purement informatif en mode `plan`. Pour les modes exécutables, `maxCalls: 2` borne V48.5 à une tentative initiale plus au plus une escalade intra-provider ; une requête plus restrictive peut ramener ce plafond à 1. Si le budget `plan` était utilisé pour filtrer la prévision, **tout** profil serait rejeté (aucun profil réel n'annonce `maxCalls: 0`), rendant la prévision inutilisable.

`getForecastSelectionBudgetForMode(mode)` répond à ce problème. Son nom est délibérément explicite : ce n'est **pas** un budget exécutable, seulement une **simulation de compatibilité** — elle fournit le budget utilisé pour filtrer les profils candidats pendant `resolvePolicy` — celui du mode `execute` lorsque le mode courant est `plan` (on prévisualise "que se passerait-il si ce candidat passait à l'exécution réelle ?"), et le budget propre du mode sinon. Elle n'autorise jamais un appel : la garantie "le mode `plan` ne fait jamais d'appel réel" reste portée uniquement par le flux de contrôle du `LoopRunner` (aucun code n'appelle jamais un agent), jamais par la valeur retournée par cette fonction.

## Escalade intra-provider bornée (V48.5)

Le runner consomme `AgentPolicy.allowEscalation` et le plafond
`selectionRequest.budgetCeiling.maxCalls` uniquement après une vraie tentative.
Le défaut autorise **au plus deux tentatives top-level** : le modèle initial puis
une seule montée de niveau.

L'escalade est fail-closed et ne s'applique qu'à des causes structurées liées au
modèle : `provider_max_turns`, ou `validation_failed` après épuisement du
cycle de réparation. Les erreurs de runtime, timeout, rate-limit ou
indisponibilité ne montent pas de modèle : elles restent du ressort du failover
inter-provider existant ou d'un arrêt explicite.

Le profil suivant doit appartenir au **même provider et au même runtime**,
rester disponible, satisfaire exactement les hard requirements déjà admis et
être strictement supérieur dans le portefeuille configuré. Le plan reconstruit
conserve le même candidat, contexte, `allowedPaths`, permissions et validations.
L'evidence `modelEscalationEvidence` expose le trigger et la transition de profil
sans diagnostic fournisseur sensible.

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

## Décision de sélection observable

La `selectionRequest` d'une `AgentPolicyResolution` contient les contraintes effectives, après fusion restrictive : capacités, permissions, plafond d'effort, budget et, lorsqu'elles sont déclarées, `allowedProviders` et `allowedRuntimes`. Ces deux dernières contraintes sont transmises au sélecteur ; elles ne sont pas de simples diagnostics de policy.

Une sélection résolue conserve le profil effectivement choisi (`id`, runtime, provider, modèle, effort de classement) et deux listes compactes : `rejected` pour les profils qui échouent une exigence hard, puis `notSelected` pour les profils admissibles qui perdent uniquement le classement (`higher_effort_than_selected` ou `deterministic_tiebreak`). Les listes sont triées par identifiant ; le résultat ne dépend donc ni de l'ordre du registry ni de l'ordre de déclaration d'un ensemble de capacités.

L'effort d'invocation reste `requirements.minimumEffort`, distinct de l'effort de classement du profil. L'exécution consomme le profil effectivement sélectionné, conservant ainsi le binding runtime/provider/modèle V26 ; aucun fallback de modèle ou de provider n'est introduit. Une absence de profil compatible reste `no_compatible_agent`, sans choisir un profil partiellement compatible.

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

n8n peut fournir, via `AgentPolicyRequest` (`src/policy/types.ts`) : `requestedBudget` (partiel), `requestedMaxEffort`, `requestedProviders`, `requestedRuntimes`, `requestedFundingModes` — plus, au niveau de l'appel `run`, le projet, l'objectif, et le mode demandé (voir `autonomous-loop-runner.md`). `requestedFundingModes` ne peut jamais créer une autorisation payante : si la policy n'a pas explicitement déclaré `additional_credits` ou `metered_api`, la demande caller est ignorée comme source d'élargissement et le selector reste fail-closed.

Loop Engine applique une **fusion restrictive** systématique (voir ci-dessus) : n8n ne peut jamais élargir le budget global, l'effort maximum, ajouter une permission interdite, transformer `execute` en `commit` ou `commit` en `publish`, contourner le sélecteur, choisir un profil incompatible, ignorer une CI échouée, ou déclencher un force-push. Aucune de ces garanties ne dépend de la confiance en n8n : elles sont appliquées côté Loop Engine, par construction (fusion à sens unique, plafonds de permissions par mode, sélecteur pur).

```text
n8n            -> demande et limite
Loop Engine    -> réduit, valide et sélectionne (ce lot : jusqu'à la sélection prévisionnelle)
Agent          -> exécutera dans un futur lot (LoopExecutor, non implémenté ici)
```

## Snapshot quota OpenClaw pour le routage AUTO

`src/policy/quota.ts` normalise uniquement un snapshot externe marqué `source="openclaw_usage_status"` et `freshness="fresh"`. Le module ne lit aucun fichier, ne lance aucun CLI, ne persiste rien et ne maintient aucun compteur parallèle : OpenClaw reste la source provider.

Chaque fenêtre conserve son `label`, `usedPercent`, `remainingPercent` calculé directement comme `100 - usedPercent` et son `resetAt`. La fenêtre gouvernante d'un provider est celle qui possède le plus faible `remainingPercent`; à égalité, le reset le plus tardif est retenu comme contrainte la plus durable. Un snapshot stale, non supporté ou sans horodatage valide reste `unknown`. Une fenêtre absente n'est jamais inventée.

La réserve quota est une politique séparée et configurable (`QuotaReservePolicy`) : réparation, CI et urgence sont exprimées en pourcentages explicites. Le défaut courant réserve `10% + 5% + 5% = 20%`. `applyQuotaReserve()` calcule uniquement le quota utilisable (`max(0, remaining - reserve)`) sans modifier le snapshot OpenClaw. Chaque composante doit être comprise entre 0 et 100 et la somme ne peut pas dépasser 100 ; une configuration invalide échoue fermement au lieu d'être corrigée implicitement.

### Estimation depuis Run History

Le Run History peut porter une evidence additive `quotaConsumptionEvidence`, dérivée uniquement de deux snapshots OpenClaw frais capturés avant/après une exécution. Une fenêtre n'est comparable que si son `resetAt` est identique dans les deux snapshots et si `usedPercent` reste monotone. Un reset ou une baisse d'usage invalide cette mesure au lieu de produire un delta artificiel.

`estimateExpectedQuotaConsumption()` applique un exact-match sur `provider + model + effort + taskCategory + scopeSize`. Les runs dont le modèle terminal résulte d'un failover sont exclus de cette attribution. `scopeSize` est déterministe depuis le nombre de chemins autorisés : `none=0`, `small=1..3`, `medium=4..10`, `large>=11`.

Le seuil minimal est **5 exécutions comparables**. En dessous, le résultat reste `unknown/insufficient_samples`. À partir de cinq observations, l'estimation est la **médiane** des pourcentages réellement consommés, calculée séparément pour chaque fenêtre disposant elle-même d'au moins cinq mesures. Ce choix limite l'influence d'un run exceptionnel sans introduire de ML ni d'extrapolation. Une fenêtre insuffisamment observée reste inconnue.

Lors de la qualification OC-14.7, les 20 dernières entrées réelles de `loop-engine` étaient des runs `plan`, avec **0 run d'exécution** et aucune evidence quota. La commande `runs --models` retourne donc correctement `quota=unavailable` : aucune estimation de secours n'est inventée.

### Classement capacité puis rendement

Le classement AUTO reste strictement en deux étages. `evaluateAgentProfile()` applique d'abord les hard gates : disponibilité, quota explicitement épuisé, financement, provider/runtime, capacités, permissions, effort maximum et budget. Un profil rejeté à cette étape ne peut jamais revenir grâce à un bon rendement historique.

Parmi les profils admissibles, la valeur attendue utilise le même exact-match et le même seuil minimal de 5 runs. Elle correspond au taux de résultats gouvernés réussis : run `completed`, validation non échouée et aucune violation de scope observée. Le rendement n'est calculé que si la valeur attendue et le quota attendu de la **fenêtre quota actuellement gouvernante** sont tous deux disponibles. La formule est `expectedValuePercent / expectedQuotaConsumedPercent`.

Un quota attendu à `0%` n'est pas interprété comme une consommation gratuite : avec la granularité des snapshots provider, cela reste une résolution insuffisante et donc `unknown`. `rankAgentProfilesByEfficiency()` produit seulement trois projections : `rejected` pour les hard gates, `ranked` pour les profils dont le rendement est défendable, et `unranked` pour les profils admissibles sans mesure fiable. Aucun score fictif n'est attribué à `unknown` et ce classement ne choisit pas encore l'exécuteur final.

### Portfolio de modèles réellement disponible

Le routage AUTO ne consomme plus de catalogue commercial codé en dur. `buildAutoSubscriptionProviderConfigurations()` reçoit un `AutoSubscriptionModelPortfolio` explicite ; chaque profil fournit son `model`, son `availability`, son evidence `quota` et ses `capabilities`. La couche AUTO ne fixe que le financement `included_subscription` et les contraintes d'exécution du CLI : elle ne déduit jamais un modèle, un tier économique, une capacité ou une disponibilité depuis un nom commercial.

Le CLI charge cette projection éphémère depuis `LOOP_AUTO_SUBSCRIPTION_PORTFOLIO_JSON`. Sans cette preuve, AUTO retourne `auto_subscription_portfolio_unavailable`. Une exécution provider explicite exige également `--provider-model`, et `provider-registry.ts` refuse une configuration sans `model` ni `profiles`. Des identifiants de modèle inconnus du code restent admissibles lorsqu'ils sont explicitement fournis : le modèle est une donnée de runtime/configuration, pas une union statique.

Qualification live du 2026-09-13 sur OpenClaw `2026.9.4` : `openai/gpt-5.6-sol` est le modèle par défaut résolu avec OAuth OpenAI sain ; `gpt-5.6-terra` et `gpt-6-astra` ne sont pas présents. `gpt-5.6-luna` apparaît uniquement comme `utilityModel` provider-default et n'est donc pas promu automatiquement comme candidat AUTO. Côté Claude, la source native ne fournit actuellement ni provider ni fenêtres et le bridge est `unavailable` car son cache est stale ; aucun profil Claude n'est inventé tant qu'une source fraîche runtime/déploiement ne le déclare pas explicitement disponible.

Les `DEFAULT_AGENT_PROFILES` historiques restent des fixtures illustratives du forecast Policy Engine. Ils ne constituent jamais le portfolio AUTO et ne sont pas une preuve de disponibilité runtime.

### Candidats runtime AUTO et binding d'exécution

Le portfolio AUTO distingue désormais le **candidat de routage** du **binding actuellement exécutable**. `buildAutoSubscriptionExecutionCandidates()` conserve l'identité réelle de chaque chemin : `runtime=codex` / `runtime=claude_code` pour les bindings CLI directs existants, et `runtime=openclaw` pour un profil natif OpenClaw explicitement observé.

Un profil OpenClaw natif doit fournir explicitement provider, modèle, availability, quota, capacités, permissions et budget ; aucune de ces valeurs n'est déduite du nom commercial du modèle ni de la présence du Gateway. Le candidat est exposé avec `executionPath=openclaw_native`.

Conformément au gate OC-14.5, l'adapter `src/runtime/openclaw.ts` reste un stub déterministe non exécutant tant que la parité de binding native n'est pas promue. Le candidat OpenClaw porte donc actuellement `executableNow=false` / `openclaw_native_binding_not_yet_promoted`. Il peut être comparé par le futur routeur sans être transformé en faux transport CLI ni déclencher une exécution implicite. Les executors Codex/Claude existants restent inchangés.

### Garde frontier

Un profil `economicTier=frontier` ne gagne jamais simplement parce qu'il représente le tier le plus puissant. Après les hard gates, `selectAgentProfile()` et `rankAgentProfilesByEfficiency()` retiennent par défaut les tiers économiques connus inférieurs lorsqu'au moins l'un d'eux satisfait déjà le lot. Le frontier reste alors hors compétition avec la raison explicite `frontier_not_required`.

Deux exceptions seulement : aucun tier inférieur connu ne satisfait les capacités/permissions du lot, ou l'appelant gouverné fournit `allowFrontier=true`. Cette autorisation ne sélectionne pas automatiquement le frontier : elle lui permet seulement de concourir aux mêmes règles de rendement et de préférence que les autres profils. Ainsi un modèle frontier peut être nécessaire ou justifié, mais jamais choisi sur son seul prestige/capacité maximale supposée.

### Décision AUTO complète

`decideAgentRoute()` est la décision déterministe finale sur un ensemble de candidats déjà observés. L'ordre reste unique : binding exécutable -> hard gates -> rendement mesuré lorsqu'il existe -> sinon `smallest_capable`. `decideAutoSubscriptionRoute()` raccorde ce moteur au portfolio AUTO et à l'`AgentPolicyResolution` déjà calculée ; l'effort d'invocation est donc `requirements.minimumEffort`, jamais une valeur réinventée dans le routeur.

La décision `selected` expose explicitement `profileId`, `runtime`, `provider`, `model`, `effort`, `executionPath`, la base de sélection (`measured_efficiency` ou `smallest_capable`) et, si disponible, le score/fenêtre quota. Chaque autre candidat est conservé dans `notSelected` avec une raison structurée (`binding_unavailable`, hard gate, `frontier_not_required`, efficiency inconnue/invalide, rendement inférieur ou préférence inférieure). Un candidat OpenClaw non promu reste donc visible et explicable sans pouvoir être exécuté.

### Fallback quota/rate-limit borné

Le fallback d'exécution reste distinct du routage initial. Une erreur récupérable de type quota/rate-limit (`provider_limit_exceeded` / `provider_rate_limited`) peut ouvrir **au plus une tentative par provider** dans le budget `maxAttempts`. `createLoopProviderFailoverAssembly()` ne parcourt jamais les modèles d'un même provider : il conserve le plan primaire puis choisit au plus un profil compatible dans chaque autre assembly provider. En mode AUTO, l'escalade intra-provider reste bornée séparément à `maxModelAttempts=1`.

Avant toute tentative suivante, un reset worktree explicite est obligatoire ; son absence ou son échec ferme le fallback. Les profils indisponibles, incompatibles ou en funding payant non autorisé sont filtrés avant l'appel. Cette structure empêche une cascade exhaustive de modèles/providers tout en conservant un recovery utile sur quota/rate-limit.

## Position d'OpenClaw, Codex, Claude Code et autres

Inchangée par rapport à `agent-orchestration.md` : aucune hiérarchie fixe. La politique ne connaît que provider/runtime/modèle/effort/capacités/permissions/budget/disponibilité/financement/quota, jamais un statut privilégié pour un runtime particulier. Un quota inconnu n'est pas converti en estimation et ne bloque pas à lui seul la résolution ; un quota explicitement épuisé est un hard gate du selector.

## Portée du lot V7.4

Dans ce lot :

- `src/agents/types.ts` — ajout de la permission `git_tag`, distincte de `git_push`, jamais implicite ;
- `src/policy/types.ts` — `AgentPolicyMode`, `LoopTaskCategory`, `ContextBudget`, `LoopTaskRequirements`, `AgentPolicy`, `AgentPolicyRequest`, `AgentPolicyResolution`, `AgentPolicyFallback`, `AGENT_POLICY_STATUS_CODES`, `AGENT_POLICY_FALLBACK_REASONS` ;
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
