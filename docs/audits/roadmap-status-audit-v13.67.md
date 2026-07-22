# Roadmap Status Audit V13.67

## Executive Summary

Au commit de merge `b01e8a9`, Loop Engine dispose de deux acquis réels depuis la baseline observée par l’audit V13.12 : un bridge Runtime Core opt-in capable d’atteindre les runtimes V10 sous admission explicite, et une nouvelle famille de contrats Core pour recevoir, décoder, autoriser et préparer une demande Runtime publique.

La chaîne publique n’est toutefois pas encore un chemin fonctionnel complet. Les primitives disponibles permettent de décrire :

```text
unknown payload
-> strict decode
-> authenticated authorization context
-> authorization port evaluation
-> authorized canonical request
-> engine assembly contract
```

Les quatre premiers passages sont composés par `decodeAndAuthorizeLoopRuntimePublicRequest`. Le dernier n’est qu’un contrat : aucun code de production n’invoque `LoopRuntimeAuthorizedEngineAssembler`, ne normalise son résultat, ni ne transmet son assemblage à `prepareLoopRuntimePublicRequest`. De plus, `createLoopRuntimeAuthorizedEngineAssemblyRequest` accepte directement un principal et une demande valide ; son type nommé `Authorized` ne porte aucune preuve d’autorisation et peut donc être construit sans décision `authorized: true`.

La roadmap a progressé, mais la succession de micro-lots a optimisé la solidité locale plus vite que la capacité observable. La prochaine étape doit regrouper invocation de l’assembler, validation de son résultat et préparation dans un seul lot orienté résultat. Aucun transport entrant, provider réel ou exécution externe ne doit précéder cette composition.

## Repository Baseline

| Élément | Valeur observée |
| --- | --- |
| Dépôt | `/Users/laurent/Projects/loop-engine` |
| Branche initiale | `feature/runtime-public-request-engine-assembly-v13.66` |
| HEAD initial | `a3026524b76439e0c00d71697399489ed9973196` |
| Sujet initial | `feat(core): add authorized runtime engine assembly contract` |
| Worktree initial | propre |
| `main` avant merge | `7f033d6b7aed40df884f308451870c90c759c941` |
| Merge explicite | `b01e8a9102199e98a81115a34050d03a480906f4` |
| Sujet du merge | `merge: consolidate public runtime request authorization flow` |
| Parents du merge | `7f033d6` et `a302652` |
| Conflits | aucun ; stratégie `ort` |
| État distant après premier push de `main` | `origin/main` = `b01e8a9` |
| Tag créé | aucun |
| Node.js | `v22.16.0` |
| pnpm | `10.33.1` |
| Git | `2.50.1` |

La baseline historique de V13.12 était `13fc02c`, sur `feature/runtime-capability-rfc-v13.11`, avec `main` déjà à `7f033d6`. Entre `13fc02c` et `a302652`, le graphe contient 49 commits, dont le commit d’archivage de l’audit V13.12, et le diff cumulé porte sur 95 fichiers, 20 559 insertions et 106 suppressions.

La série demandée V13.61–V13.66 correspond à cinq commits de production observables : V13.61, V13.62, V13.63, V13.65 et V13.66. Aucun commit, branche ou document V13.64 n’est présent dans le dépôt ; il n’est donc pas compté comme un lot livré.

## Validation Results

| Barrière | Résultat | Preuve |
| --- | --- | --- |
| `git diff --check` avant push V13.66 | PASS | aucune sortie |
| `pnpm run validate` avant push, sandbox | BLOQUÉ ENVIRONNEMENT | `tsx` a échoué avec `listen EPERM` sur son socket IPC temporaire |
| `pnpm run validate` avant push, hors sandbox | PASS | typecheck, 994 tests sur 994, `json-check` |
| `pnpm run ci` avant push, hors sandbox | PASS | validation, audit strict et profils |
| `pnpm run audit:strict` avant push | PASS | 476/476, 0 warning, 0 fail, score 100, 0 recommandation |
| `pnpm run audit:profiles` avant push | PASS | `audit profile checks passed` |
| Push V13.66 | PASS | push non forcé de la seule branche demandée |
| Merge dans `main` | PASS | merge `--no-ff`, aucun conflit |
| `git diff --check` après merge | PASS | worktree et diff de merge sans erreur |
| `pnpm run validate` après merge | PASS | typecheck, 994 tests sur 994, `json-check` |
| `pnpm run ci` après merge | PASS | validation, audit strict et profils |
| `pnpm run audit:strict` après merge | PASS | 476/476, 0 warning, 0 fail, score 100, 0 recommandation |
| `pnpm run audit:profiles` après merge | PASS | `audit profile checks passed` |
| Tests ciblés de la chaîne publique et `tests/core/api.test.ts` | PASS | 113 tests sur 113 |
| Push du merge sur `main` | PASS | `7f033d6..b01e8a9` |
| Barrière finale du document V13.67 | PASS | `git diff --check`, validate 994/994, CI, audit strict 476/476 et profils passants |

Le blocage `listen EPERM` est strictement environnemental : la même commande passe hors sandbox sans modification du dépôt. Les validations prouvent les contrats testés et leur intégration au build ; elles ne prouvent ni transport entrant, ni authentification réelle, ni ACL, ni exécution fournisseur.

Tous les fichiers `*.test.ts` actuellement présents sont couverts par le script standard : `tests/**/*.test.ts`, `src/execution/*.test.ts` et `src/execution/**/*.test.ts`. Aucun test existant n’est absent du glob standard à cette baseline.

## Progress Since V13.12

### Réconciliation et exécution Runtime

- V13.13 a séparé `RuntimeCapability` de `AgentCapability`, ajouté les requirements, la compatibilité déterministe, la sélection par capability et des aliases Core explicites.
- V13.14 a corrigé la découverte standard des neuf suites sous `src/execution` et ajouté une règle d’audit dédiée. Il n’a pas livré le reste du grand lot « Architecture Boundary Enforcement » proposé par V13.12.
- V13.15–V13.19 ont livré le bridge déclaratif vers V10, l’admission de politique, le plan Runtime, l’adapter simulé et le receipt post-exécution.
- V13.21–V13.23 ont relié le backend local-process à la politique et renforcé sa terminaison et ses courses de fin.

### Frontière Loop et escalade

- V13.25–V13.29 ont ajouté le handoff Loop Runtime, sa variante d’exécution, une nomenclature de résultats, la frontière interdisant au LoopRunner d’importer le Runtime local-process, et l’intégrité du registre d’audit.
- V13.30–V13.47 ont ajouté taxonomie d’outcome et de failure, décision d’escalade, mapping agent, composition avec l’exécution, projection publique redacted, schéma et sérialisation, port de livraison, sender HTTP sortant et composition de livraison.
- Cette chaîne reste opt-in dans Core ; elle n’est pas un mode public `run --mode execute` et n’est pas consommée par un transport entrant.

### Demande Runtime publique

- V13.49–V13.56 ont ajouté le contrat public, la résolution de références, la configuration, les limites, le plan, le mapping d’options, la construction de demande Runtime et la préparation composée.
- V13.58–V13.59 ont ajouté le décodage strict depuis `unknown` puis un ancien chemin `decode -> prepare` sans autorisation.
- V13.61–V13.65 ont ajouté le contexte d’autorisation, le port, son évaluateur, la façade et l’entrée `decode -> authorize`.
- V13.66 a ajouté les types d’assemblage interne et la factory de demande d’assemblage, sans appel du port.

### Écarts encore hérités de V13.12

- `docs/architecture/execution-architecture-rfc.md` reste gelé à V13.0 et décrit Bridge et Runtime comme futurs alors que les deux familles existent désormais.
- `docs/roadmap/loop-engine.md` ne contient toujours que trois lots V7 terminés et ne fournit aucun candidat actif.
- La façade Core exporte la chaîne Runtime récente, mais n’expose toujours pas systématiquement les wrappers Approval, Authority Lifecycle et Bridge historiques.
- Les cycles de types entre Policy, Context, Provider, Runtime et Transport restent présents.
- README documente encore `pnpm run reports:fixtures`, alors que le script réel est `pnpm run generate:report-fixtures`; l’audit vérifie encore la chaîne obsolète.
- Help, le message d’usage final et `PUBLIC_COMMANDS` ne décrivent pas la même surface.

## Public Runtime Request Flow

### Flux réellement disponible

| Étape | État | Implémentation et limite |
| --- | --- | --- |
| `unknown payload` | IMPLEMENTED | entrée `unknown` de `decodeLoopRuntimePublicRequest` |
| `strict decode` | IMPLEMENTED | objet ordinaire exact, data properties uniquement, budget exact, copie canonique et frozen |
| `authenticated authorization context` | PARTIAL | `LoopRuntimeAuthenticatedPrincipal` est un DTO strict fourni par l’appelant ; aucune authentification n’est réalisée dans le dépôt |
| `authorization port evaluation` | IMPLEMENTED | port injecté sync/async, un seul appel, exceptions et décisions malformées normalisées en refus |
| `authorized canonical request` | IMPLEMENTED | `decodeAndAuthorizeLoopRuntimePublicRequest` retourne la demande canonique décodée par identité après `authorized: true` |
| `engine assembly contract` | PARTIAL | types, factory de contexte et raisons sûres existent ; aucun evaluator ou appel `.assemble(...)` n’existe |

Le chemin composé actuel est donc :

```text
unknown payload
-> decodeLoopRuntimePublicRequest (exactement une fois)
-> createLoopRuntimePublicRequestAuthorizationRequest
-> evaluateLoopRuntimePublicRequestAuthorization
-> authorized canonical LoopRuntimePublicRequest
-> STOP
```

Le contrat d’assemblage peut être construit ensuite manuellement :

```text
principal + valid LoopRuntimePublicRequest
-> createLoopRuntimeAuthorizedEngineAssemblyRequest
-> LoopRuntimeAuthorizedEngineAssemblyRequest
-> STOP
```

Cette seconde séquence ne consomme pas `LoopRuntimePublicRequestAuthorizedEntryResult`, ne vérifie pas une décision d’autorisation et ne porte aucun token ou evidence d’autorisation. L’ordre `decode -> authorize -> assemble -> prepare` est donc une intention d’appelant, pas une invariant imposée par les types ou une façade.

### Étapes encore non composées

```text
engine assembler evaluation
-> preparation
-> execution
-> public result projection
-> inbound transport
```

- `engine assembler evaluation` : MISSING ; aucun appel, validation de résultat, redaction d’exception ou garantie d’un seul appel.
- `preparation` : IMPLEMENTED séparément par `prepareLoopRuntimePublicRequest`, mais non reliée à l’autorisation ou à l’assembler.
- `execution` : PARTIAL à l’échelle du dépôt ; V10/local-process et simulated savent exécuter derrière Core, mais aucun consommateur ne transforme `LoopRuntimeConstructedRuntimeRequest` en `RuntimeRequest` V10.
- `public result projection` : MISSING pour cette famille ; la projection d’escalade V13.40 est une autre chaîne.
- `inbound transport` : MISSING ; aucun serveur, route, handler HTTP, webhook ou adapter d’authentification entrant n’existe.

Il n’y a pas de double décodage dans le chemin V13.65 : le source et les tests confirment un seul appel au decoder. En revanche, la validation sémantique de la demande est répétée dans le decoder, la factory d’autorisation et la factory d’assemblage.

## Runtime Execution Readiness

| Capacité | Statut | État réel |
| --- | --- | --- |
| Exécution simulée Core | IMPLEMENTED | adapter déterministe V13.18, bridge V13.15–V13.19 |
| Exécution local-process gardée | IMPLEMENTED | backend V10.1, admission policy-aware, receipt et terminaison bornée |
| Mode CLI `execute` | MISSING | `run` reste plan-only et rejette `execute`, `commit`, `publish` |
| Demande publique préparée | PARTIAL | construction pure possible, mais seulement avec catalog/limits/binding déjà fournis |
| Adaptation vers le Runtime V10 | MISSING | `LoopRuntimeConstructedRuntimeRequest` n’a aucun consommateur sous `src/` et n’est pas le `RuntimeRequest` V10 |
| Dry-run de la demande publique | PARTIAL | décodage et autorisation l’acceptent, mais la construction finale retourne `unsupported_dry_run` |
| Authentification | MISSING | le type `AuthenticatedPrincipal` affirme une provenance amont non vérifiée localement |
| ACL concrète | MISSING | le port Authorizer existe, sans implémentation, registre, rôle ou permission par défaut |
| Assembler concret | MISSING | aucune source de catalog, limits ou binding n’est branchée |
| Résultat public stable | MISSING | aucune union publique succès/échec pour cette entrée |
| Transport entrant | MISSING | aucun point d’entrée réseau ou transport-neutral handler |
| Provider externe réel | DOCUMENTED_ONLY | OpenClaw, Claude Code et Codex restent des stubs ; aucun SDK ou réseau fournisseur |
| Cancellation/recovery/replay/persistence | DOCUMENTED_ONLY | concepts de RFC sans cycle Runtime public opérationnel |

La readiness est suffisante pour le prochain lot purement composé et injecté. Elle n’est pas suffisante pour exposer HTTP ou déclencher une exécution externe. Le prochain point de preuve doit être un résultat préparé immuable obtenu uniquement après autorisation et assemblage validé.

## Roadmap Status Matrix

Les éléments de V13.12 sont consolidés lorsqu’ils visent la même capacité. Les lots réels qui ont réutilisé un numéro avec un objectif différent sont distingués de la proposition historique.

| # | Élément de roadmap | Statut | Preuve actuelle et écart |
| -: | --- | --- | --- |
| 1 | V1 Cockpit local et `ProjectSnapshot` | IMPLEMENTED | inspection, contexte, recommandations et validations restent opérationnels |
| 2 | V1.1–V2.4 contrats JSON publics | IMPLEMENTED | `schemaVersion: 1`, `json-check` et tests Core passent |
| 3 | V1.4 Roadmap Reader | IMPLEMENTED | lecteur lexical, statut/kind et sélection testés |
| 4 | V1.7 intégrations read-only documentaires | IMPLEMENTED | guides n8n/OpenClaw/JSON présents, sans promesse d’intégration active |
| 5 | V1.8–V2.2 RAG local | IMPLEMENTED | index et recherche locaux, aucun embedding réseau |
| 6 | V2.7–V8.1 Audit Engine | IMPLEMENTED | 476 règles passantes, six profils et strict CI |
| 7 | V1–V3.1 reporting d’exécution | PARTIAL | tests désormais découverts ; commande README de fixtures toujours invalide |
| 8 | V7.2 LoopRunner autonome | PARTIAL | mode plan livré ; execute/repair/commit/publish absents |
| 9 | V7.3 Agents | IMPLEMENTED | registry, sélection et escalade déterministes |
| 10 | V7.4 Policy forecast | PARTIAL | forecast utilisable ; vocabulaire encore couplé à Provider/Runtime/Transport |
| 11 | V7.5 Minimal Context Builder | IMPLEMENTED | local, borné et intégré au plan |
| 12 | V8 Loop Executor draft | SUPERSEDED | responsabilités redistribuées entre `src/execution`, Runtime et Core |
| 13 | V9 façade Core stable et exhaustive | PARTIAL | Runtime récent exporté ; wrappers de gouvernance encore non systématiques |
| 14 | V10.0–V10.1 Runtime V10 et local-process | IMPLEMENTED | adapters, sélection, backend gardé et tests présents |
| 15 | V10.2 provider stubs | IMPLEMENTED | stubs non exécutants conformes au lot |
| 16 | V10.3 TransportAdapter local-process | IMPLEMENTED | frontière Core-only existante, non reliée au CLI |
| 17 | V10.4–V10.9 protocoles, mapping, intent, policy et consolidation | PARTIAL | primitives présentes ; cycles de types et absence de chemin public persistent |
| 18 | V11 contrats de transport/review/provenance/eligibility | IMPLEMENTED | chaîne déclarative et default-deny livrée |
| 19 | V12 frontière, cancellation, recovery et evidence | PARTIAL | contrats de frontière livrés ; hardening opérationnel non livré |
| 20 | V13.0 RFC normatif consolidé | PARTIAL | document présent mais obsolète face à V13.1–V13.66 |
| 21 | V13.1–V13.11 chaîne authority/bridge/runtime déclarative | PARTIAL | primitives présentes ; topologie complète et façade gouvernance incomplètes |
| 22 | Proposition V13.13 de V13.12 — réconciliation globale V10/V13 | PARTIAL | capability réconciliée et bridge ajouté ; roadmap, cycles et gouvernance non réconciliés |
| 23 | Proposition V13.14 de V13.12 — boundary enforcement global | PARTIAL | découverte des tests corrigée ; graphe, exports, help et fraîcheur RFC restent ouverts |
| 24 | Proposition V13.15 de V13.12 — vocabulaire capability/budget | SUPERSEDED | numéro réutilisé pour le bridge déclaratif ; objectif initial non livré comme lot |
| 25 | Proposition V13.16 de V13.12 — composition déclarative | SUPERSEDED | numéro réutilisé pour policy admission ; composition redistribuée sur plusieurs versions |
| 26 | Proposition V14.0 de V13.12 — Execution Readiness RFC | DOCUMENTED_ONLY | intention conservée, aucun RFC de readiness actualisé |
| 27 | Lots réels V13.15–V13.19 — bridge, admission, plan, simulated, receipt | IMPLEMENTED | chemin Core opt-in et tests de bout en bout simulés |
| 28 | Lots réels V13.21–V13.23 — local-process policy-bound et terminaison | IMPLEMENTED | exécution locale gardée et courses terminales testées |
| 29 | V13.25–V13.29 — handoff Loop, frontière et intégrité audit | IMPLEMENTED | Core possède le handoff ; LoopRunner reste isolé du Runtime |
| 30 | V13.30–V13.47 — outcome, escalade, projection et livraison | PARTIAL | composition Core et sender sortant présents ; aucun consommateur public actif |
| 31 | V13.49 — contrat de demande Runtime publique | IMPLEMENTED | validation versionnée et budget borné |
| 32 | V13.50–V13.56 — pipeline de préparation | IMPLEMENTED | références, configuration, limites, plan, options et construction composés |
| 33 | V13.58 — decoder strict | IMPLEMENTED | entrée `unknown`, canonicalisation et hardening des propriétés |
| 34 | V13.59 — decode puis prepare | IMPLEMENTED | capacité promise livrée, mais elle contourne l’autorisation ajoutée ensuite |
| 35 | V13.61 — contrat d’autorisation | IMPLEMENTED | principal minimal, demande d’autorisation et port injecté |
| 36 | V13.62 — évaluation d’autorisation | IMPLEMENTED | un appel, fail-closed et décisions normalisées |
| 37 | V13.63 — façade d’autorisation | IMPLEMENTED | création puis évaluation composées |
| 38 | V13.65 — entrée decode puis authorize | IMPLEMENTED | un seul decode et demande canonique retournée après allow |
| 39 | V13.66 — contrat d’assemblage moteur | IMPLEMENTED | types et factory livrés conformément au sujet « contract », sans invocation |
| 40 | Composition authorize → assemble → prepare | MISSING | aucune façade ni test de chaîne complète |
| 41 | Adaptation de la demande préparée vers l’exécution Runtime | MISSING | aucun consommateur de `LoopRuntimeConstructedRuntimeRequest` |
| 42 | Projection publique du résultat Runtime public | MISSING | aucun schéma succès/échec pour cette entrée |
| 43 | Transport entrant et authentification | MISSING | aucune route, handler ou adapter entrant |
| 44 | Roadmap auto-hébergée actuelle | MISSING | fichier présent mais seulement trois lots V7 terminés, aucun candidat actif |
| 45 | Provider externe réel | DOCUMENTED_ONLY | stubs et RFC seulement |
| 46 | Cycle opérationnel cancellation/recovery/resume/journal | DOCUMENTED_ONLY | états décrits, intégration absente |

### Comptage

| Statut | Nombre |
| --- | ---: |
| IMPLEMENTED | 24 |
| PARTIAL | 11 |
| DOCUMENTED_ONLY | 3 |
| MISSING | 5 |
| SUPERSEDED | 3 |
| Total | 46 |

## Architectural Findings

| # | Axe demandé | Constat consolidé |
| -: | --- | --- |
| 1 | Cohérence des noms | La famille est lisible, mais `LoopRuntimeAuthorizedEngineAssemblyRequest` est trompeur : la factory ne consomme aucune preuve d’autorisation. `AuthorizationRequest` ajoute aussi un second suffixe Request à une demande déjà nommée Request. |
| 2 | Discriminants `created`, `authorized`, `assembled` | Les unions sont localement cohérentes. `assembled` reste purement déclaratif, et aucun lien nominal ne transforme un succès `authorized` en entrée d’assemblage. |
| 3 | Redondance de validation | Le decoder valide la structure puis le contrat public ; la factory d’autorisation revalide la demande ; l’évaluateur revalide la demande d’autorisation ; la factory d’assemblage rappelle la factory d’autorisation. Le fail-closed est fort, mais la composition heureuse refait plusieurs preuves déjà acquises. |
| 4 | Propagation par identité | Le payload brut est copié ; le résultat authorized conserve la demande canonique du decoder ; la factory d’assemblage conserve l’argument `request` par identité ; la préparation conserve le `runtimeRequest` construit. Les décisions de l’authorizer sont volontairement normalisées vers des singletons frozen plutôt que propagées. |
| 5 | Objets frozen | Les résultats produits par les fonctions sont frozen et le decoder fige demande et budget. L’assembly request est seulement shallow-frozen : une demande valide mais mutable reste mutable. Les types d’assembly et les résultats du port ne sont pas validés ou figés par du code de production. |
| 6 | Surface publique exportée | Les cinq modules V13.61–V13.66 sont tous exportés par `src/core/index.ts` et couverts par `tests/core/api.test.ts`. Cette largeur publique augmente le coût d’une consolidation ultérieure. |
| 7 | Fuite d’informations | Les refus d’autorisation sont redacted en `not_authorized`; les raisons d’assemblage sont stables et non sensibles ; le decoder n’écho pas les valeurs reçues. Un futur evaluator d’assembler devra encore normaliser les exceptions et résultats malformés. |
| 8 | ACL concrète | Aucune. Le dépôt définit un port injectable ; il ne vérifie ni rôle, ni permission, ni tenant, ni credential. C’est une séparation saine tant qu’aucune readiness opérationnelle n’est revendiquée. |
| 9 | Ordre decode → authorize → assemble → prepare | Decode → authorize est imposé par V13.65. Assemble et prepare restent deux îlots indépendants ; l’ordre complet n’est ni composé ni protégé. |
| 10 | Double décodage | Aucun dans V13.65. L’ancien `decodeAndPrepareLoopRuntimePublicRequest` est une autre entrée publique et ne doit pas être chaîné après V13.65. |
| 11 | Séparation Core / Runtime / transport | V13.61–V13.66 reste dans Core et n’importe ni Runtime, ni Transport, ni process, ni réseau. Les données internes d’assemblage contiennent néanmoins un binding exécutable qui devra rester une dépendance injectée, jamais dérivée du payload public. |
| 12 | Complexité accidentelle | Cinq micro-lots ont créé cinq modules, cinq exports et plusieurs étages de validation pour une seule progression fonctionnelle inachevée. La robustesse locale est élevée, mais la navigation et la compréhension du chemin heureux sont coûteuses. |
| 13 | Regroupement futur | Le decoder doit rester séparé. Le port d’autorisation peut rester une frontière. Les factories/evaluators/façades d’autorisation pourraient être regroupés derrière une surface publique plus petite lors d’une future version majeure ; assembly invocation et preparation doivent être livrés ensemble dès le prochain lot. |
| 14 | Couplage des tests | La majorité teste comportements hostiles, call counts, identité, freeze et redaction. Cinq tests lisent toutefois le source comme texte et vérifient tokens/imports/call counts ; ils sont sensibles au formatage et ne remplacent pas un graphe ou un test comportemental. Les tests d’assembly construisent manuellement le résultat du port sans tester son invocation. |
| 15 | Trous fonctionnels | Invocation/normalisation de l’assembler, composition vers preparation, adaptation vers le Runtime existant, résultat public, authentification/ACL et transport entrant sont absents. Dry-run n’atteint pas une sortie préparée. |

Les principaux risques sont donc la preuve d’autorisation non portée jusqu’à l’assemblage, la mutabilité possible du sous-objet `request`, et l’illusion qu’une campagne ciblée couvrant sept fichiers constitue un test de bout en bout. Les points positifs sont l’absence de double decode, le fail-closed systématique, la redaction des refus, l’injection des ports et la séparation nette des effets.

## Micro-Lot Complexity Review

### Série V13.61–V13.66

| Mesure | Valeur observée |
| --- | ---: |
| Commits de production livrés | 5 |
| Modules Core ajoutés | 5 |
| Types publics ajoutés | 13 |
| Fonctions publiques ajoutées | 5 |
| Lignes production + exports Core | 552 |
| Lignes de tests ajoutées, `api.test.ts` inclus | 2 312 |
| Insertions totales | 2 864 |
| Cas `it(...)` dans les cinq tests focalisés | 79 |
| Tests focalisés lisant le source comme texte | 5 |

La valeur architecturale obtenue est réelle : frontière d’identité minimale, port sync/async, refus fail-closed, surfaces exactes, protection contre accessors/proxies, appels uniques, demande canonique frozen et absence de couplage Runtime/Transport. Cette valeur ne produit pourtant encore aucune capacité au-delà de l’autorisation : l’assembler n’est pas appelé et la préparation n’est pas atteinte.

Le coût est disproportionné pour la navigation. Un lecteur traverse authorization contract, evaluation, facade, authorized entry et engine assembly avant d’atteindre un stop. Chaque niveau répète fixtures, raisons d’échec, tests de freeze, listes de tokens interdits et assertions d’exports. Le ratio est d’environ 4,2 lignes de test ajoutées par ligne de production/export, sans test de la chaîne complète.

### Famille V13.49–V13.66

La famille publique complète occupe 15 modules Core, 1 950 lignes de production, 46 types exportés et 15 fonctions exportées. Elle possède 15 fichiers de tests focalisés, 5 713 lignes et 176 cas `it(...)`, hors sections supplémentaires de `tests/core/api.test.ts`.

Le decoder strict, le port d’autorisation et la frontière d’exécution doivent rester séparés. En revanche, les prochaines étapes triviales ne doivent plus devenir chacune un fichier et un lot : invocation de l’assembler, normalisation, propagation de l’assembly et appel de preparation forment une seule capacité cohérente.

Aucune refactorisation immédiate des contrats V13.61–V13.66 n’est recommandée. La bonne preuve est d’abord une composition additive. Une réduction de surface publique ou un regroupement de modules ne devient rentable qu’après usage réel et avec une stratégie de compatibilité explicite.

## Recommended Resequencing

| Lot maximum | Capacité observable | Frontière et preuve de sortie |
| --- | --- | --- |
| V13.68 — Authorized Engine Preparation | Après un allow, invoquer exactement une fois l’assembler, valider son résultat, appeler preparation et retourner une demande déclarative prête pour exécution | Core pur à ports injectés ; un test de chaîne couvre allow, deny, assembly failures et preparation failures |
| V13.69 — Prepared Request Runtime Bridge | Adapter explicitement la demande préparée au Runtime canonique existant, d’abord avec simulated et dry-run, puis local-process seulement sous politique explicite | Aucun transport entrant ; receipt et identité corrélée ; décision explicite sur le contrat Runtime canonique |
| V13.70 — Public Runtime Result | Projeter succès, refus et échecs en schéma public stable, redacted et transport-neutral | Aucun détail command/cwd/credential ; tests de compatibilité et de sérialisation |
| V14.0 — Inbound Boundary and Operational Readiness | Ajouter authentification, ACL concrète, handler entrant puis un transport choisi, seulement après les trois preuves précédentes | Threat model actualisé, budgets/cancellation/evidence, go/no-go explicite ; pas de provider réel par défaut |

Cette séquence remplace les micro-lots par quatre incréments orientés résultat. Aucun audit intermédiaire n’est nécessaire entre V13.68 et V13.69 sauf découverte d’une incompatibilité entre `LoopRuntimeConstructedRuntimeRequest` et le Runtime V10. Le passage à un transport entrant constitue, lui, une frontière de risque justifiant un audit dédié.

## Next Delivery Batch

### Objectif

Livrer une seule façade Core qui, après succès de l’entrée autorisée, construit la demande d’assemblage, invoque exactement une fois le `LoopRuntimeAuthorizedEngineAssembler`, normalise son succès ou son échec, puis appelle `prepareLoopRuntimePublicRequest` avec `catalog`, `limits` et `binding` validés. Le résultat final est frozen, redacted et contient soit un `LoopRuntimeConstructedRuntimeRequest` déclaratif prêt pour une future exécution, soit un stage d’échec stable.

### Périmètre

- composer le succès de `decodeAndAuthorizeLoopRuntimePublicRequest` avec la factory V13.66 dans la même façade afin qu’aucun appel d’assembler ne précède `authorized: true` ;
- lire le port `assemble` sans getter, préserver `this`, l’appeler une seule fois et accepter sync/async ;
- normaliser exceptions, rejections, thenables hostiles et résultats malformés vers les raisons redacted existantes ;
- vérifier la forme de `catalog`, `limits` et `binding` avant de les transmettre à la preparation ;
- appeler `prepareLoopRuntimePublicRequest` une seule fois après `assembled: true` ;
- conserver l’identité de la demande canonique et de la demande Runtime préparée ;
- définir explicitement le comportement dry-run sans déclencher d’exécution ;
- ajouter un vrai test de chaîne, pas seulement une campagne multi-fichiers.

### Fichiers probables

- `src/core/loop-runtime-public-request-authorized-preparation.ts` — nouvelle composition, evaluator d’assembler inclus dans le même module ;
- `src/core/index.ts` — un export de façade intentionnel ;
- `tests/core/loop-runtime-public-request-authorized-preparation.test.ts` — comportements de bout en bout et adversariaux ;
- `tests/core/api.test.ts` — preuve d’export et de contrat ;
- éventuellement une courte mise à jour de `docs/architecture/runtime-abstraction.md` si la nouvelle frontière y est décrite, sans nouveau RFC.

### Exclusions

- aucun serveur ou transport HTTP entrant ;
- aucune exécution Runtime, process ou provider ;
- aucun authorizer ou assembler par défaut ;
- aucune ACL, rôle, permission, credential ou tenant inventé ;
- aucune modification des contrats V13.61–V13.66 ;
- aucune refactorisation des 15 modules existants ;
- aucune commande CLI, sortie JSON publique ou `schemaVersion` modifiée ;
- aucune nouvelle règle d’audit.

### Critères d’acceptation

1. Un payload invalide ou un refus d’autorisation provoque zéro appel assembler et zéro preparation.
2. Un allow provoque exactement un appel assembler avec la demande canonique attendue.
3. La demande V13.66 n’est créée qu’après `authorized: true` dans la façade composée.
4. Toute exception, rejection ou sortie d’assembler malformée échoue fermée avec une raison stable sans fuite interne.
5. Un assembly valide alimente exactement une fois `prepareLoopRuntimePublicRequest`.
6. Le résultat de succès contient par identité la demande Runtime frozen produite par preparation.
7. Aucun double decode, retry, fallback, cache, clock, random, filesystem, réseau, process ou transport n’est introduit.
8. Les tests couvrent execute et dry-run, sync et async, denial, assembly unavailable/ambiguous/invalid, preparation failure, freeze, identité et redaction.
9. `pnpm run validate`, `pnpm run ci`, `pnpm run audit:strict` et `pnpm run audit:profiles` passent.

### Branche et commit proposés

- Branche : `feature/runtime-public-request-authorized-preparation-v13.68`
- Commit : `feat(core): prepare authorized public runtime requests`
- Niveau d’effort : **medium**, un lot cohérent de composition ; ne pas le découper en factory/evaluator/facade séparés.

## Deferred Work

- adaptation de `LoopRuntimeConstructedRuntimeRequest` vers le Runtime V10 ou décision d’un contrat canonique de remplacement ;
- exécution simulée puis local-process depuis la demande publique ;
- projection publique stable distincte de la projection d’escalade ;
- authentification réelle, ACL, rate limiting, replay protection et transport entrant ;
- provider externe réel, SDK, réseau fournisseur et secrets ;
- cancellation, recovery, persistence, resume et journal du cycle autonome ;
- réconciliation des cycles de types et des wrappers Core de gouvernance ;
- mise à jour du RFC V13.0, de README/help et de la commande de fixtures ;
- remplacement de `docs/roadmap/loop-engine.md` par une roadmap courte contenant les quatre lots reséquencés ;
- éventuelle consolidation des modules V13.61–V13.66 après preuve d’usage et plan de compatibilité.

## Final Verdict

ROADMAP_NEEDS_RESEQUENCING
