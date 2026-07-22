## Métadonnées d’archive

- version auditée : V13.12
- nature : audit de statut de roadmap
- verdict historique : ROADMAP_NEEDS_RESEQUENCING
- prochain lot recommandé à l’époque : V13.13
- caractère historique : rapport daté conservé tel quel

# Audit de statut de roadmap — V13.12

Date de l’audit : 2026-07-20

Périmètre observé : README.md, CLAUDE.md, package.json, src/, tests/, docs/, scripts/, .github/, historique Git récent, tags, commandes CLI et validations exécutables.

Méthode de preuve :

- Observé : présent dans le code, les exports, les tests ou la sortie d’une commande exécutée pendant cet audit.
- Documenté : présent dans un document, sans que ce document soit utilisé comme preuve d’implémentation.
- Déduit : conclusion issue de la confrontation entre documentation, code, graphe d’imports et validations.
- Non vérifié : aucun comportement réseau ou fournisseur externe n’a été exercé, car aucun SDK fournisseur ni intégration réseau n’est déclaré dans package.json ou importé par src/.

## 1. Executive Summary

Loop Engine est mature comme cockpit CLI local, moteur de lecture de projets, générateur de contexte, moteur d’audit et bibliothèque de contrats déterministes. Le dépôt expose quinze commandes routées, un contrat JSON en schemaVersion 1, un Audit Engine de 433 règles et une suite standard de 557 tests passants. Les fonctions réellement utilisables aujourd’hui sont surtout l’inspection locale, le RAG lexical, la sélection de roadmap, le mode plan du LoopRunner, la prévision d’agent, le contexte borné, l’audit et, derrière une API Core explicite, un backend local-process gardé.

La trajectoire effectivement réalisée n’est pas une progression linéaire vers un unique Runtime. Elle comporte trois branches :

1. V7.2–V7.5 : planification, profils d’agents, politique prévisionnelle et contexte borné ;
2. V10.0–V10.3 : RuntimeAdapter, RuntimeRequest, RuntimeResult, registre et sélecteur opérationnels, avec un vrai backend local-process et un TransportAdapter Core-only ;
3. V11–V13.11 : chaîne de preuves déclaratives, default-deny et non opérationnelles, jusqu’à RuntimeRequest, RuntimeResolution, RuntimeDescriptor, RuntimeRegistry et RuntimeCapability.

L’écart principal entre la roadmap et le dépôt est l’absence de décision normative reliant ou séparant les trajectoires V10 et V13. Le dépôt contient deux familles de RuntimeRequest, deux registres Runtime et deux fonctions createRuntimeRegistry, tandis que RuntimeCapability V13.11 n’est relié par aucun type fort à RuntimeDescriptor ou RuntimeRegistry et chevauche le vocabulaire AgentCapability déjà utilisé par RuntimeAdapter, Provider, Transport et Policy.

Le risque architectural principal est donc une intégration future construite sur la mauvaise surface : un adapter réel pourrait se brancher sur le Runtime V10 alors que la chaîne V13 reste isolée, ou contourner la gouvernance V11–V13 en considérant une capacité déclarative comme une permission d’exécuter. Ce risque est accentué par une façade src/core/index.ts qui n’exporte pas les wrappers V13.1–V13.11, par deux cycles de types et par des règles d’audit principalement fondées sur la présence de chaînes.

La recommandation principale est de ne créer ni adapter fournisseur, ni injection de dépendances, ni nouveau chemin d’exécution. Le prochain lot doit être architectural et non exécutable : V13.13 — Runtime and Capability Contract Reconciliation. Il doit décider la topologie canonique, les noms, les responsabilités, la façade Core et la stratégie de compatibilité avant tout renforcement exécutable.

## 2. Repository Baseline

### Référence Git

| Élément            | Valeur observée                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Dépôt              | loop-engine                                                                                                         |
| Branche active     | feature/runtime-capability-rfc-v13.11                                                                               |
| Branche attendue   | feature/runtime-capability-rfc-v13.11                                                                               |
| HEAD               | 13fc02c0113d20a0ad451b413fa9f8dcb5f8c5b8                                                                            |
| Sujet HEAD         | docs(architecture): introduce runtime capability RFC                                                                |
| Worktree initial   | propre ; git status --short --branch ne contenait que l’en-tête de branche                                          |
| Base main observée | 7f033d6, tag transport-adapters-v10.3                                                                               |
| Écart main...HEAD  | 29 commits, 265 fichiers, 22 292 insertions, 79 suppressions                                                        |
| Tags récents       | transport-adapters-v10.3, provider-adapters-v10.2, runtime-local-process-v10.1, core-engine-v9.0, audit-engine-v8.1 |

L’historique a servi à repérer les lots V10.4 à V13.11, mais aucun message de commit ni tag n’a été utilisé comme preuve de complétude.

### Outillage attendu et utilisé

| Outil      | Attendu par le dépôt             | Utilisé                           |
| ---------- | -------------------------------- | --------------------------------- |
| Node.js    | 22 dans .github/workflows/ci.yml | v22.16.0                          |
| pnpm       | 10.33.1 dans package.json        | 10.33.1                           |
| TypeScript | dépendance 5.9.x                 | résolu par pnpm et validé par tsc |
| Git        | non épinglé                      | 2.50.1                            |

Les scripts publics de package.json sont : loop, typecheck, test, generate:report-fixtures, validate, json-check, rag-index, rag-search, audit:strict, ci, audit:profiles, audit:release-check, format et format:check.

### Surfaces CLI et audit

Le routeur src/cli.ts reconnaît quinze commandes : help, summary, status, json-check, rag-index, rag-search, doctor, audit, handoff, context, validate, review, next, prompt et run. Seul run en mode plan est accepté ; execute, commit et publish sont rejetés.

Le manifeste d’audit contient 433 règles, toutes marquées stable :

| Catégorie    | Nombre |
| ------------ | -----: |
| architecture |    360 |
| docs         |     41 |
| json         |     31 |
| cli          |      1 |
| Total        |    433 |

Les six profils disponibles sont quick, strict, release, docs, json et architecture.

### Validations exécutées

| Validation                                                                    | Résultat             | Détail                                                                    |
| ----------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| git diff --check avant rapport                                                | PASS                 | aucune sortie                                                             |
| pnpm run validate, sandbox                                                    | BLOQUÉ ENVIRONNEMENT | tsc a passé, puis tsx a échoué avec listen EPERM sur un socket temporaire |
| pnpm run validate, hors sandbox                                               | PASS                 | typecheck, 557 tests sur 557, json-check sur dix sorties publiques        |
| pnpm run ci, hors sandbox                                                     | PASS                 | validate, audit strict et six profils ; 557 tests sur 557                 |
| pnpm exec tsx src/cli.ts audit --json                                         | PASS                 | 433 pass, 0 warning, 0 fail, score 100                                    |
| pnpm exec tsx src/cli.ts audit --json --profile architecture                  | PASS                 | 360 pass, score 100                                                       |
| pnpm exec tsx src/cli.ts audit --json --profile docs                          | PASS                 | 41 pass, score 100                                                        |
| Tests ciblés Runtime, agents, policy, Core, commandes, JSON, audit et roadmap | PASS                 | campagne dédiée, code de sortie 0                                         |
| Neuf fichiers de tests sous src/execution                                     | PASS                 | 28 tests, exécutés séparément car absents du glob standard                |
| Analyse statique des imports de 293 fichiers TypeScript                       | PASS avec constats   | aucun cycle d’import runtime ; deux composantes cycliques de types        |

Résultat global : les validations exécutables passent. Elles prouvent la cohérence des contrats actuellement testés, pas la préparation à un adapter réel. Le score 100 de l’Audit Engine ne couvre pas plusieurs contradictions décrites dans les sections 5 et 6.

## 3. Roadmap Inventory

Les éléments historiques proches ont été consolidés lorsqu’ils portent le même objectif. Un lot explicitement documentaire peut être IMPLEMENTED si son livrable annoncé était uniquement documentaire. À l’inverse, un module isolé n’est pas considéré complet lorsque la promesse porte sur une chaîne ou une frontière intégrée.

| Domaine                  | Élément de roadmap                                                          | Source                                                                                           | Statut          | Preuves                                                                                                                                 | Écart                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cockpit local            | V1 : inspection Git, docs, validations et ProjectSnapshot                   | docs/architecture/final-objective.md ; docs/audits/v1-local-audit.md                             | IMPLEMENTED     | src/intelligence/project-snapshot.ts ; src/intelligence/snapshot.ts ; src/core/reports.ts ; tests/intelligence/                         | Le produit reste un cockpit plus qu’un orchestrateur autonome, ce qui est cohérent avec V1.                                                                                                       |
| JSON public              | V1.1–V2.4 : sorties compactes, schemaVersion 1, erreurs JSON                | docs/architecture/json-contracts.md ; docs/audits/post-v2.4-json-contracts-audit.md              | IMPLEMENTED     | src/core/reports.ts ; src/commands/json-error.ts ; tests/commands/json-output.test.ts ; tests/core/api.test.ts ; json-check passant     | La liste documentaire de docs/architecture/commands.md omet plusieurs sorties ajoutées ensuite.                                                                                                   |
| Intelligence             | V1.4 : Roadmap Reader, statuts, kinds, priorités et synthèse                | docs/roadmap/v1.4.md ; docs/architecture/roadmap-reader.md                                       | IMPLEMENTED     | src/intelligence/roadmap.ts ; src/intelligence/project-snapshot.ts ; tests/intelligence/roadmap.test.ts                                 | Lecteur volontairement lexical, sans dépendances entre lots.                                                                                                                                      |
| Intégrations read-only   | V1.7 : guides n8n, OpenClaw et consommateurs JSON                           | docs/roadmap/v1.7.md                                                                             | IMPLEMENTED     | docs/integrations/n8n-read-only.md ; docs/integrations/openclaw-read-only.md ; docs/integrations/json-consumers.md                      | Livrable documentaire respecté ; aucune intégration active n’était promise.                                                                                                                       |
| RAG local                | V1.8–V2.2 : index, sections, recherche JSON et filtres                      | docs/architecture/local-rag-index.md ; docs/architecture/local-rag-sections.md ; audits post-RAG | IMPLEMENTED     | src/core/reports.ts, generateRagIndex et generateRagSearchReport ; src/commands/rag-index.ts ; src/commands/rag-search.ts ; tests/rag/  | Écriture locale de .loop-engine assumée ; aucun embedding ni réseau.                                                                                                                              |
| Consolidation CLI        | V2 : dispatcher, erreurs, commandes, handoff et source de vérité snapshot   | docs/audits/v2-consolidation-plan.md                                                             | IMPLEMENTED     | src/cli.ts, resolveProjectOrExit ; src/core/reports.ts ; src/commands/handoff.ts ; tests/commands/                                      | La commande help et le message d’usage final ne reflètent plus toute la surface routée.                                                                                                           |
| Audit Engine             | V2.7–V8.1 : règles, profils, manifeste, strict CI                           | docs/architecture/audit-engine.md ; docs/audits/audit-engine-v8-final.md                         | IMPLEMENTED     | src/audit/runner.ts ; src/audit/registry.ts ; src/audit/rules/ ; scripts/audit-profile-check.ts ; tests/audit/ ; 433 règles passantes   | La couverture sémantique ne suit pas la croissance des contrats V13.                                                                                                                              |
| Reporting d’exécution    | V1–V3.1 : ExecutionResult, JSON, Markdown, fixtures                         | docs/architecture/execution-reporting.md ; README.md                                             | PARTIAL         | src/execution/ ; tests/execution/ ; tests/fixtures/reports/ ; scripts/generate-report-fixtures.ts                                       | Neuf fichiers de tests sous src/execution ne sont pas lancés par pnpm run test ; README demande un script reports:fixtures inexistant.                                                            |
| LoopRunner               | V7.2 : commande run, mode plan seulement                                    | docs/architecture/autonomous-loop-runner.md                                                      | PARTIAL         | src/loop/runner.ts, runLoopPlan ; src/commands/run.ts ; tests/loop/runner.test.ts ; tests/commands/json-error.test.ts                   | Le comportement public est correct, mais runLoopPlan appelle createExecutionPlan puis executePlan sur un plan vide et jette le résultat.                                                          |
| Agents                   | V7.3 : AgentProfile, registry, sélection et escalade                        | docs/roadmap/loop-engine.md ; docs/architecture/agent-orchestration.md                           | IMPLEMENTED     | src/agents/types.ts ; registry.ts ; selector.ts ; escalation.ts ; tests/agents/                                                         | Pur et déterministe ; non relié à une exécution réelle, conformément au lot.                                                                                                                      |
| Policy forecast          | V7.4 : besoins, budget, smallest capable first et forecast LoopRunner       | docs/roadmap/loop-engine.md ; docs/architecture/agent-policy-engine.md                           | PARTIAL         | src/policy/defaults.ts ; resolver.ts ; src/loop/runner.ts ; tests/policy/                                                               | Le forecast fonctionne, mais src/policy/types.ts dépend désormais des types Provider, OpenClaw, Mapping, Intent, Runtime et Transport, contrairement à la frontière V7.4 documentée.              |
| Context                  | V7.5 : Minimal Context Builder borné                                        | docs/roadmap/loop-engine.md ; docs/architecture/minimal-context-builder.md                       | IMPLEMENTED     | src/context/builder.ts ; path.ts ; sources.ts ; tests/context/ ; intégration src/loop/runner.ts                                         | Dépendance de type vers Policy ; aucune écriture ni réseau.                                                                                                                                       |
| Executor                 | V8 : ExecutionSession puis running, completed, failed, cancelled            | docs/architecture/loop-executor.md                                                               | SUPERSEDED      | src/executor/types.ts ne contient que created et prepared ; planner.ts crée zéro étape ; index.ts exporte plus que l’API documentée     | Le draft promet project, candidate, policy, context, artifacts et prepareExecution, absents du code. Les trajectoires V10–V13 ont déplacé les frontières sans clôturer ce draft.                  |
| Core                     | V9 : façade interne stable pour CLI et futurs adapters                      | docs/architecture/commands.md ; tag core-engine-v9.0                                             | PARTIAL         | src/core/index.ts ; tests/core/api.test.ts                                                                                              | Onze wrappers V13.1–V13.11 et plusieurs wrappers récents ne sont pas exportés par la façade ; le test Core couvre surtout les rapports CLI existants.                                             |
| Runtime historique       | V10.0 : RuntimeAdapter, RuntimeRequest, RuntimeResult, registre et selector | docs/architecture/runtime-abstraction.md                                                         | IMPLEMENTED     | src/runtime/types.ts ; src/runtime/registry.ts ; src/runtime/selector.ts ; tests/runtime/runtime.test.ts ; src/core/runtime.ts          | Cette famille demeure active et entre en collision nominale avec V13.7–V13.10.                                                                                                                    |
| Runtime local            | V10.1 : backend local-process gardé                                         | docs/architecture/runtime-abstraction.md                                                         | IMPLEMENTED     | src/runtime/local-process.ts, spawn avec shell false ; tests/runtime/local-process.test.ts ; tests/core/runtime.test.ts                 | Vrai processus, horloge implicite et filesystem, mais uniquement derrière une demande Core explicite et non relié au CLI.                                                                         |
| Providers                | V10.2 : adapters OpenClaw, Claude Code et Codex inertes                     | docs/architecture/provider-adapters.md                                                           | IMPLEMENTED     | src/providers/types.ts ; registry.ts ; openclaw.ts ; claude-code.ts ; codex.ts ; tests/providers/providers.test.ts                      | Ce sont des stubs not_implemented, ce qui est exactement le périmètre annoncé ; aucune intégration fournisseur réelle.                                                                            |
| Transport                | V10.3 : TransportAdapter local-process                                      | docs/architecture/transport-adapters.md                                                          | IMPLEMENTED     | src/transports/local-process.ts ; src/core/transports.ts, executeTransport et executeProviderPlan ; tests/transports/transports.test.ts | Frontière impérative réelle, Core-only, sans chemin depuis le CLI ou le LoopRunner.                                                                                                               |
| Provider protocol        | V10.4 : protocole interne OpenClaw                                          | docs/architecture/openclaw-provider-protocol.md                                                  | IMPLEMENTED     | src/providers/openclaw/ ; tests/providers/openclaw-protocol.test.ts                                                                     | Protocole interne non officiel et non exécutable ; aucun mapping activé.                                                                                                                          |
| Mapping                  | V10.5 : Executable Mapping déclaratif                                       | docs/architecture/executable-mapping.md                                                          | IMPLEMENTED     | src/providers/mapping/ ; tests/providers/executable-mapping.test.ts                                                                     | Registre statique, mapping désactivé et non configuré.                                                                                                                                            |
| Intent                   | V10.6 : Transport Intent                                                    | docs/architecture/transport-intent.md                                                            | IMPLEMENTED     | src/providers/intent/ ; tests/providers/transport-intent.test.ts                                                                        | Intention inactive et volontairement non consommée par TransportAdapter.                                                                                                                          |
| Capability et Policy     | V10.7 : évaluation théorique default-deny                                   | docs/architecture/capability-policy-engine.md                                                    | PARTIAL         | src/policy/evaluation.ts ; selector.ts ; registry.ts ; tests/policy/capability-policy-engine.test.ts                                    | Fonctionnel, mais CapabilityId est un alias de AgentCapability et la couche Policy porte des types Provider et Transport, créant un chevauchement de responsabilités.                             |
| Autorisation             | V10.8 : Authorization Configuration                                         | docs/architecture/authorization-configuration.md                                                 | IMPLEMENTED     | src/authorization/ ; src/core/authorization.ts ; tests/authorization/configuration.test.ts                                              | Contrat inactif, non approuvé et review-required, sans exécution.                                                                                                                                 |
| Consolidation            | V10.9 : registries partagés et frontières clarifiées                        | docs/architecture/architecture-consolidation.md                                                  | PARTIAL         | src/registry.ts ; tests/core/registry.test.ts                                                                                           | L’unicité statique est factorisée, mais un cycle de types relie Context, Policy, Provider, Runtime et Transport.                                                                                  |
| Architecture d’exécution | V11.0 : RFC normatif                                                        | docs/architecture/rfc-execution-architecture-v11.md                                              | DOCUMENTED_ONLY | RFC présent et règles d’audit associées                                                                                                 | Lot documentaire par conception ; aucune capacité opérationnelle ajoutée.                                                                                                                         |
| Transport request        | V11.1 : TransportRequest déclarative                                        | docs/architecture/transport-request.md                                                           | IMPLEMENTED     | src/transport-request/types.ts ; validation.ts ; src/core/transport-request.ts ; tests/transport-request/transport-request.test.ts      | Contrat default-deny distinct du TransportAdapterRequest V10.3.                                                                                                                                   |
| Builder                  | V11.2 : fabrique unique TransportRequestBuilder                             | docs/architecture/transport-request-builder.md                                                   | IMPLEMENTED     | src/transport-request/builder.ts ; src/core/transport-request-builder.ts ; tests/transport-request/transport-request-builder.test.ts    | Pur et testé ; second cycle de types interne entre builder, support, validation et erreurs.                                                                                                       |
| Review                   | V11.3 : ExecutionReviewGate                                                 | docs/architecture/execution-review-gate.md                                                       | IMPLEMENTED     | src/review/ ; src/core/review.ts ; tests/review/execution-review-gate.test.ts                                                           | Produit une preuve revue, jamais une approbation.                                                                                                                                                 |
| Provenance               | V11.4 : ApprovalProvenance                                                  | docs/architecture/approval-provenance.md                                                         | IMPLEMENTED     | src/provenance/ ; src/core/provenance.ts ; tests/provenance/approval-provenance.test.ts                                                 | Preuve descriptive et immuable.                                                                                                                                                                   |
| Eligibility              | V11.5 : HandoffEligibility                                                  | docs/architecture/handoff-eligibility.md                                                         | IMPLEMENTED     | src/handoff-eligibility/ ; src/core/handoff-eligibility.ts ; tests/handoff-eligibility/                                                 | Évaluation default-deny, sans handoff opérationnel.                                                                                                                                               |
| Consolidation review     | V11.6 : helpers communs sans nouveau concept                                | docs/architecture/v11-consolidation.md                                                           | IMPLEMENTED     | src/review-architecture/shared.ts ; tests V11 ; validations passantes                                                                   | Les responsabilités V11 restent séparées ; les contrats restent toutefois isolés de la chaîne Runtime V13.                                                                                        |
| Frontière d’exécution    | V12.0 : RFC de frontière                                                    | docs/architecture/rfc-execution-boundary-v12.md                                                  | DOCUMENTED_ONLY | RFC présent, 507 lignes, et contrôles documentaires                                                                                     | Lot explicitement documentaire.                                                                                                                                                                   |
| Dispatch                 | V12.1 : DispatchDescriptor                                                  | docs/architecture/dispatch-descriptor.md                                                         | IMPLEMENTED     | src/dispatch/ ; src/core/dispatch.ts ; tests/dispatch/dispatch-descriptor.test.ts                                                       | Déclaratif et non dispatchable, comme annoncé.                                                                                                                                                    |
| Séquencement V12         | V12.2 : première implémentation selon le roadmap du RFC                     | docs/architecture/rfc-execution-boundary-v12.md, section Roadmap                                 | SUPERSEDED      | Aucun lot V12.2 dans le code ou l’historique ; DispatchDescriptor a été livré en V12.1                                                  | Le numéro et le contenu ont été absorbés par V12.1, V12.3 et V12.4 sans mise à jour du roadmap normatif.                                                                                          |
| Boundary                 | V12.3 : BoundaryHandoff                                                     | docs/architecture/boundary-handoff.md                                                            | IMPLEMENTED     | src/boundary/handoff.ts ; src/core/boundary.ts ; tests/boundary/boundary-handoff.test.ts                                                | Contrat inactif, non accepté et non exécutable.                                                                                                                                                   |
| Séquencement V12         | V12.3 : lot de validation annoncé par le RFC                                | docs/architecture/rfc-execution-boundary-v12.md, section Roadmap                                 | SUPERSEDED      | Les tests existent, mais le lot nommé V12.3 livre surtout BoundaryHandoff                                                               | La promesse de version ne correspond plus au contenu livré sous ce numéro.                                                                                                                        |
| Boundary RFC contract    | V12.4 : ExecutionBoundaryRFC                                                | docs/architecture/execution-boundary-rfc.md                                                      | IMPLEMENTED     | src/boundary/rfc/ ; src/core/boundary-rfc.ts ; tests/boundary/execution-boundary-rfc.test.ts                                            | Catalogue d’invariants pur, sans passage de frontière.                                                                                                                                            |
| Hardening d’exécution    | V12.4 : cancellation, recovery, replay, observability et audit evidence     | docs/architecture/rfc-execution-boundary-v12.md, lignes 504–507                                  | DOCUMENTED_ONLY | Concepts décrits dans le RFC ; aucun module Cancellation, Recovery, RuntimeLease ou ExecutionEvidence opérationnel                      | Le lot V12.4 réel a livré un catalogue d’invariants, pas le hardening annoncé.                                                                                                                    |
| RFC consolidé            | V13.0 : référence normative de toute la chaîne                              | docs/architecture/execution-architecture-rfc.md                                                  | PARTIAL         | RFC présent ; AUDIT-286 à AUDIT-293 passent                                                                                             | Le document s’arrête à V13.0, affirme Bridge, Transport et Runtime futurs ou absents, et n’intègre ni V13.4–V13.11 ni le Runtime opérationnel V10.                                                |
| Approval                 | V13.1 : Operator Approval                                                   | docs/architecture/operator-approval-rfc.md                                                       | IMPLEMENTED     | src/authority/rfc/ ; src/core/operator-approval.ts ; tests/authority/operator-approval-rfc.test.ts                                      | Contrat isolé, default-deny ; wrapper absent de src/core/index.ts.                                                                                                                                |
| Verification             | V13.2 : Authority Verification                                              | docs/architecture/authority-verification-rfc.md                                                  | IMPLEMENTED     | src/authority/verification/ ; src/core/authority-verification.ts ; tests/authority/authority-verification-rfc.test.ts                   | Contrat pur ; wrapper absent de la façade Core.                                                                                                                                                   |
| Lifecycle                | V13.3 : revocation et expiry                                                | docs/architecture/revocation-expiry-rfc.md                                                       | IMPLEMENTED     | src/authority/lifecycle/ ; tests/authority/revocation-expiry-rfc.test.ts                                                                | Contrat pur ; wrapper Core non exporté par index.                                                                                                                                                 |
| Bridge                   | V13.4 : Bridge Contract                                                     | docs/architecture/bridge-contract-rfc.md                                                         | IMPLEMENTED     | src/bridge/contract/ ; src/core/bridge-contract.ts ; tests/bridge/bridge-contract-rfc.test.ts                                           | Contrat isolé et non opérationnel ; façade Core incomplète.                                                                                                                                       |
| Bridge                   | V13.5 : Bridge Request                                                      | docs/architecture/bridge-request-rfc.md                                                          | IMPLEMENTED     | src/bridge/request/ ; src/core/bridge-request.ts ; tests/bridge/bridge-request-rfc.test.ts                                              | Représentation déclarative ; aucune composition de production.                                                                                                                                    |
| Bridge                   | V13.6 : Execution Bridge                                                    | docs/architecture/execution-bridge-rfc.md                                                        | IMPLEMENTED     | src/bridge/execution/ ; src/core/execution-bridge.ts ; tests/bridge/execution-bridge-rfc.test.ts                                        | Le nom Bridge existe désormais, contrairement au RFC V13.0 non actualisé.                                                                                                                         |
| Runtime déclaratif       | V13.7 : Runtime Request                                                     | docs/architecture/runtime-request-rfc.md                                                         | IMPLEMENTED     | src/runtime/request/ ; src/core/runtime-request.ts ; tests/runtime/runtime-request-rfc.test.ts                                          | Contrat local complet, mais createRuntimeRequest existe déjà avec une autre signature dans src/core/runtime.ts.                                                                                   |
| Runtime déclaratif       | V13.8 : Runtime Resolution                                                  | docs/architecture/runtime-resolution-rfc.md                                                      | IMPLEMENTED     | src/runtime/resolution/ ; src/core/runtime-resolution.ts ; tests/runtime/runtime-resolution-rfc.test.ts                                 | Évalue une référence aplatie de Runtime Request, sans RuntimeSelector opérationnel ni composition de production.                                                                                  |
| Runtime déclaratif       | V13.9 : Runtime Descriptor                                                  | docs/architecture/runtime-descriptor-rfc.md                                                      | IMPLEMENTED     | src/runtime/descriptor/ ; src/core/runtime-descriptor.ts ; tests/runtime/runtime-descriptor-rfc.test.ts                                 | Métadonnées isolées et testées ; aucune relation typée avec la résolution.                                                                                                                        |
| Runtime déclaratif       | V13.10 : Runtime Registry                                                   | docs/architecture/runtime-registry-rfc.md                                                        | PARTIAL         | src/runtime/registry/ ; src/core/runtime-registry.ts ; tests/runtime/runtime-registry-rfc.test.ts                                       | Deux RuntimeRegistry et deux createRuntimeRegistry coexistent avec src/runtime/registry.ts ; le nouveau wrapper n’est pas dans src/core/index.ts.                                                 |
| Capabilities             | V13.11 : Runtime Capability                                                 | docs/architecture/runtime-capability-rfc.md                                                      | PARTIAL         | src/runtime/capability/ ; src/core/runtime-capability.ts ; tests/runtime/runtime-capability-rfc.test.ts ; AUDIT-370 à AUDIT-377         | Métadonnées immuables présentes, mais aucune référence typée vers RuntimeRegistry ou RuntimeDescriptor, aucune composition, aucune façade Core et chevauchement non arbitré avec AgentCapability. |
| Boucle autonome          | Execute, validate, repair, commit, publish, journal et resume               | docs/architecture/autonomous-loop-runner.md                                                      | DOCUMENTED_ONLY | États et contrats documentés ; src/commands/run.ts rejette les trois modes opérationnels                                                | LoopValidator, LoopRepairer, LoopCommitter, LoopPublisher et journal persistant absents.                                                                                                          |
| Topologie canonique      | Relation officielle V10 Runtime ↔ V13 Runtime ↔ Agent Capability ↔ Policy   | Déduite de final-objective.md et des RFC V10–V13                                                 | MISSING         | Aucun document opérationnel ni module de composition ne tranche les doublons ; src/core/index.ts ne fournit pas cette surface           | Absence bloquante avant tout adapter réel.                                                                                                                                                        |
| Adapter réel             | Agent adapter, provider adapter exécutable ou intégration fournisseur       | autonomous-loop-runner.md ; provider-adapters.md ; execution-architecture-rfc.md                 | DOCUMENTED_ONLY | Stubs Provider et Runtime présents ; aucune dépendance SDK, aucun réseau, aucune commande fournisseur                                   | Correctement différé ; ne constitue pas un défaut tant que les contrats ne sont pas réconciliés.                                                                                                  |
| Cycle opérationnel       | Runtime lease, evidence, cancellation, recovery et execution audit          | rfc-execution-boundary-v12.md ; execution-architecture-rfc.md                                    | DOCUMENTED_ONLY | Terminologie et états futurs documentés                                                                                                 | Aucun contrat canonique relié au local-process réel ; à ne pas implémenter avant la réconciliation.                                                                                               |

### Comptage

| Statut          | Nombre |
| --------------- | -----: |
| IMPLEMENTED     |     35 |
| PARTIAL         |      9 |
| DOCUMENTED_ONLY |      6 |
| MISSING         |      1 |
| SUPERSEDED      |      3 |
| Total           |     54 |

## 4. Architecture Status

| Domaine                           | État réel             | Preuves et limites                                                                                                                                                                                        |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI                               | Usable but incomplete | Quinze commandes routées dans src/cli.ts et tests JSON passants. src/commands/help.ts omet audit, run et rag-search ; le message d’usage final omet encore davantage de commandes.                        |
| Core                              | Usable but incomplete | src/core/index.ts est bien la façade des commandes et les tests Core protègent les rapports. Les wrappers Approval, Verification, Lifecycle, Bridge et Runtime V13 ne sont pas exportés par cette façade. |
| Audit Engine                      | Stable                | Registre, manifeste, six profils, strict CI et 433 règles passent. La stabilité concerne le moteur et ses règles actuelles, pas l’exhaustivité architecturale de leur couverture.                         |
| Policy                            | Usable but incomplete | Le forecast V7.4 et la décision default-deny V10.7 sont testés. Un même fichier de types porte deux domaines et dépend de Provider, OpenClaw, Mapping, Intent, Runtime et Transport.                      |
| Context                           | Stable                | Construction locale, bornée, déterministe, confinée et testée. Dépendance de type vers ContextBudget dans Policy.                                                                                         |
| Agents                            | Stable                | Profils, registry, selector smallest capable first et escalade explicite sont purs et testés. Aucun appel réel ni suivi de consommation.                                                                  |
| Runtime V10                       | Usable but incomplete | Contrats, selector, registre et backend local-process effectif. Surface interne Core-only, non reliée à la gouvernance V11–V13.                                                                           |
| Runtime V13                       | Contract only         | Request, Resolution, Descriptor, Registry et Capability sont des contrats immuables testés séparément. Ils ne forment pas une chaîne typée consommée par Core ou par un adapter.                          |
| Capabilities                      | Usable but incomplete | AgentCapability gouverne agents, runtime V10, providers, mappings, intents et transports. RuntimeCapability V13.11 est un second vocabulaire non relié.                                                   |
| Intelligence et Roadmap           | Stable                | ProjectSnapshot et le lecteur lexical sont testés et utilisés par les commandes. docs/roadmap/loop-engine.md ne contient cependant que trois lots V7 terminés et ne reflète pas V8–V13.                   |
| Reporting                         | Usable but incomplete | JSON et Markdown partagent un modèle et des fixtures. Le script documenté est erroné et neuf fichiers de tests sous src/ ne sont pas inclus dans le script standard.                                      |
| Adapters et intégrations externes | Contract only         | ProviderAdapter OpenClaw, Claude Code et Codex sont des stubs. TransportAdapter local-process est effectif et local. Aucune intégration IA, réseau, n8n active ou injection de dépendances.               |

### Frontières et graphe de dépendances

L’analyse de 293 fichiers TypeScript ne détecte aucun cycle d’import runtime. Elle détecte deux cycles lorsque les imports de types sont inclus :

1. src/context/types.ts, src/policy/types.ts, src/providers/intent/types.ts, src/providers/mapping/types.ts, src/providers/openclaw/types.ts, src/providers/types.ts, src/runtime/types.ts et src/transports/types.ts ;
2. src/transport-request/builder-errors.ts, builder-support.ts, builder-validation.ts et builder.ts.

Le premier cycle est architecturalement significatif : il montre que les contrats de Policy, Context, Provider, Runtime et Transport ne suivent plus une direction simple. Le second est local au builder et ne produit pas de cycle runtime, mais rend la frontière de contrat plus difficile à isoler.

### Effets de bord

Les couches Agents, Policy et les nouveaux contrats V13 n’importent ni réseau, ni filesystem, ni processus. Les effets de bord observés sont concentrés dans des couches explicites :

- Git, docs, configuration, reports et roadmap utilisent filesystem ou child_process dans src/core/ et src/intelligence/ ;
- validate et json-check lancent des processus à la demande ;
- local-process utilise spawn, realpathSync, setTimeout et une horloge interne ;
- LoopRunner utilise une horloge et randomUUID par défaut, mais permet leur injection dans les tests ;
- AuditReport et l’index RAG ajoutent un generatedAt réel.

Aucun import réseau, fetch ou SDK fournisseur n’a été trouvé sous src/.

## 5. Runtime and Capability Assessment

### État concept par concept

| Concept              | État actuel                          | Qualification                                                                                                                                        | Preuves                                                                                    |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| RuntimeAdapter       | Présent en V10                       | Contrat stable interne ; une implémentation locale réelle et trois stubs                                                                             | src/runtime/types.ts ; local-process.ts ; openclaw.ts ; claude.ts ; codex.ts               |
| RuntimeRequest       | Deux concepts                        | V10 : demande opérationnelle interne ; V13.7 : contrat déclaratif default-deny                                                                       | src/runtime/types.ts, RuntimeRequest ; src/runtime/request/types.ts, RuntimeRequestInput   |
| RuntimeResult        | Présent en V10                       | Résultat interne utilisable, y compris statuts de processus                                                                                          | src/runtime/types.ts, RuntimeResult ; tests/runtime/local-process.test.ts                  |
| RuntimeRegistry      | Deux concepts                        | V10 : registre d’adapters ; V13.10 : registre de métadonnées                                                                                         | src/runtime/registry.ts ; src/runtime/registry/types.ts                                    |
| RuntimeSelector      | Présent en V10                       | Logique pure selectRuntime ; aucun type nommé RuntimeSelector                                                                                        | src/runtime/selector.ts                                                                    |
| RuntimeCapability    | Présent en V13.11                    | Contrat de métadonnées isolé, expérimental dans l’architecture malgré une stabilité déclarée par l’audit                                             | src/runtime/capability/types.ts ; evaluation.ts                                            |
| AgentProfile         | Présent                              | Contrat stable, utilisé par registry, policy et tests                                                                                                | src/agents/types.ts                                                                        |
| AgentCapability      | Présent                              | Union stable mais transversale et surchargée                                                                                                         | src/agents/types.ts ; aliases dans Runtime, Provider, Mapping, Intent, Transport et Policy |
| AgentSelector        | Présent                              | Fonctions pures selectAgentProfile et evaluateAgentProfile ; aucun objet adapter                                                                     | src/agents/selector.ts                                                                     |
| ExecutionBudget      | Présent seulement comme nom de champ | Alias sémantique vers AgentBudget, pas contrat autonome                                                                                              | src/policy/types.ts, LoopTaskRequirements.executionBudget                                  |
| TokenBudget          | Absent                               | Concept absent comme type autonome ; maxTokens est un champ de AgentBudget                                                                           | src/agents/types.ts                                                                        |
| CostBudget           | Absent                               | Concept absent comme type autonome ; maxCostUsd est un plafond non mesuré                                                                            | src/agents/types.ts ; tests/agents/invariants.test.ts                                      |
| AgentEffort          | Présent                              | Union ordonnée stable, utilisée pour sélection et escalade                                                                                           | src/agents/types.ts, AGENT_EFFORTS                                                         |
| Escalation policy    | Partielle                            | Une escalade déterministe vers l’effort supérieur existe ; failureReason est conservé mais ne change pas la décision ; aucune intégration LoopRunner | src/agents/escalation.ts ; tests/agents/escalation.test.ts                                 |
| Provider adapter     | Stubs                                | OpenClaw, Claude Code et Codex préparent des plans not_implemented                                                                                   | src/providers/                                                                             |
| Runtime execution    | Effective mais limitée               | local-process exécute réellement un processus autorisé ; src/execution exécute aussi des callbacks en mémoire ; aucun mode CLI execute               | src/runtime/local-process.ts ; src/core/transports.ts ; src/execution/engine.ts            |
| Dependency injection | Absente                              | Registries statiques, aucun container, discovery, factory dynamique ou service locator                                                               | src/runtime/registry.ts ; src/providers/registry.ts ; src/transports/registry.ts           |

### Réponses explicites

#### 1. Les contrats runtime et capability ont-ils des responsabilités clairement distinctes ?

À l’intérieur de la seule série V13.7–V13.11, oui : Request porte une preuve d’entrée, Resolution évalue l’éligibilité, Descriptor décrit un runtime, Registry indexe des descriptors et Capability décrit des métadonnées. À l’échelle du dépôt, non : RuntimeAdapter V10 porte déjà capabilities: AgentCapability[], le RuntimeRegistry V10 stocke des adapters exécutables et le Runtime V13 redéfinit un registre de métadonnées sans relation normative avec le premier.

#### 2. Existe-t-il des duplications entre runtime capability et agent capability ?

Oui, de nature sémantique plutôt que structurelle. AgentCapability est une union fermée utilisée pour sélectionner des profils et autoriser Provider, Runtime et Transport. RuntimeCapabilityInput est une structure libre avec category, supportedFeatures, constraints et compatibilityReferences. Aucune règle ne définit la conversion, la compatibilité, la priorité ou l’interdiction de conversion implicite entre les deux.

#### 3. Le Core dépend-il uniquement d’abstractions ?

Non. Le Core est une façade d’intégration, pas une couche pure : src/core/runtime.ts importe le selector et le registre Runtime concrets ; src/core/transports.ts peut appeler le TransportAdapter concret ; src/core/reports.ts utilise filesystem et processus Git. Ce choix est acceptable pour une façade impérative, mais il contredit une lecture selon laquelle Core serait uniquement un ensemble de contrats. Surtout, les abstractions V13 récentes ne sont pas exposées par src/core/index.ts.

#### 4. Les APIs sont-elles assez stables pour accueillir un adapter réel ?

Non. Le backend local-process V10 est suffisamment testé pour son usage interne explicite, mais la surface globale n’est pas prête pour un adapter fournisseur. Il faut d’abord choisir le RuntimeRequest canonique, le registre canonique, la relation entre RuntimeCapability et AgentCapability, le point exact de passage depuis Execution Bridge et les exports Core autorisés. Ajouter un adapter maintenant figerait probablement le mauvais couplage.

#### 5. Quelles invariantes doivent être verrouillées avant toute exécution réelle ?

Les invariantes minimales sont :

1. un seul contrat canonique par responsabilité et un nom non ambigu pour les contrats legacy ;
2. une direction d’imports sans cycle entre Agents, Policy, Context, Runtime, Provider et Transport ;
3. une conversion explicite, pure et auditée entre capacités d’agent, capacités runtime et permissions ;
4. une autorité explicite, non inférée, liée à un unique request, descriptor, runtime et transport ;
5. un handoff consommable une seule fois, avec preuve executionStarted avant tout retry ;
6. des identifiants et horloges injectés ou fournis explicitement à la frontière ;
7. des budgets mesurables et décrémentés, pas seulement des plafonds déclaratifs ;
8. des limites de processus, environnement, output, timeout, cancellation et descendants ;
9. des états de failure, cancellation, recovery et terminalité sans retry implicite ;
10. une façade Core intentionnelle et une stabilité CLI/JSON inchangée ou versionnée explicitement.

#### 6. Quelles règles d’audit manquent pour empêcher les régressions ?

Il manque au minimum des règles qui :

- analysent le graphe d’imports, y compris les cycles de types ;
- interdisent les noms de contrats concurrents non qualifiés ou exigent une table de compatibilité ;
- vérifient l’exhaustivité intentionnelle de src/core/index.ts ;
- vérifient que le RFC normatif cite toutes les couches réellement présentes ;
- vérifient une relation typée entre Request, Resolution, Descriptor, Registry et Capability ;
- empêchent la conversion implicite RuntimeCapability vers AgentCapability ou permission ;
- contrôlent les imports d’horloge, aléatoire, filesystem, réseau, environnement et processus par zone ;
- vérifient que tous les fichiers de test sont inclus dans pnpm run test ;
- comparent les commandes README et help aux scripts package.json et au routeur ;
- distinguent présence de token, export, consommation et comportement testé.

#### 7. Le prochain lot doit-il être documentaire, architectural ou exécutable ?

Architectural et non exécutable. Il doit produire une décision normative vérifiable et préparer les contrôles d’architecture. Un lot fournisseur ou runtime exécutable est prématuré.

## 6. Gaps and Contradictions

### Critical

Aucun écart Critical n’a été observé dans la surface publique actuelle : le CLI ne propose pas de mode execute, aucun fournisseur réel n’est appelé et local-process exige un appel Core explicite. Les écarts High ci-dessous deviendraient Critical si un adapter réel était ajouté sans réconciliation.

### High

| ID  | Constat                                                                       | Preuve                                                                                                                                             | Conséquence                                                                                                          | Correction recommandée                                                                            | Lot suggéré        |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| H1  | Deux architectures Runtime concurrentes et un RFC normatif obsolète           | src/runtime/types.ts et registry.ts ; src/runtime/request/ à capability/ ; docs/architecture/execution-architecture-rfc.md lignes 16–47 et 203–231 | Un adapter peut contourner la chaîne V13 ou rendre ses contrats décoratifs.                                          | Décider topologie, noms, compatibilité et autorité de chaque famille.                             | V13.13             |
| H2  | Façade Core incomplète pour V13.1–V13.11                                      | src/core/index.ts lignes 1–29 ; wrappers src/core/operator-approval.ts à runtime-capability.ts ; reachability limitée aux tests                    | Les futurs consommateurs sont poussés vers des imports directs, en contradiction avec docs/architecture/commands.md. | Documenter puis appliquer une politique d’exports, avec test d’exhaustivité.                      | V13.13 puis V13.14 |
| H3  | Capability et Policy mélangent plusieurs couches et forment un cycle de types | src/policy/types.ts lignes 11–39 et 143–325 ; SCC à huit fichiers                                                                                  | Couplage futur au Provider ou Transport dans une couche qui devait rester une politique d’agent pure.                | Séparer vocabulaire agent, runtime et transport ; introduire des mappings explicites.             | V13.15             |
| H4  | Audit 100 % donne une impression de readiness non justifiée                   | AUDIT-287 vérifie des tokens V13.0 ; AUDIT-370 à AUDIT-377 vérifient des chaînes ; audit général 433/433                                           | Une régression de composition ou d’export peut passer CI.                                                            | Ajouter contrôles de graphe, façade, composition, documentation courante et découverte des tests. | V13.14             |

### Medium

| ID  | Constat                                                                                    | Preuve                                                                                                                                                                           | Conséquence                                                                                                                       | Correction recommandée                                                               | Lot suggéré |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| M1  | La chaîne V13 est testée module par module mais non composée                               | tests/runtime/runtime-*-rfc.test.ts importent directement des wrappers ; aucune consommation sous src/ hors wrappers                                                             | Les références aplaties peuvent diverger sans erreur de type.                                                                     | Définir une composition pure après stabilisation des noms.                           | V13.16      |
| M2  | LoopRunner appelle une pipeline d’exécution vide en mode plan                              | src/loop/runner.ts lignes 53–60 ; src/executor/planner.ts lignes 10–24                                                                                                           | Confusion entre planification et exécution, et maintien artificiel d’une architecture V8.                                         | Décider retrait ou rôle canonique de src/executor et src/execution.                  | V13.14      |
| M3  | Neuf fichiers de tests sont hors du script standard                                        | package.json lance tests/**/\*.test.ts ; neuf fichiers src/execution/**/*.test.ts ; 28 tests passent seulement en exécution séparée                                              | Une régression du reporting ou de l’engine peut ne pas casser CI.                                                                 | Déplacer les tests ou élargir explicitement le glob, puis auditer la découverte.     | V13.14      |
| M4  | Commande de génération de fixtures incohérente                                             | README.md ligne 303 : reports:fixtures ; package.json : generate:report-fixtures ; AUDIT-070 vérifie la mauvaise chaîne                                                          | Documentation et audit passent ensemble tout en donnant une commande invalide.                                                    | Aligner script, README et règle sur une source unique.                               | V13.14      |
| M5  | Roadmap et documents de synthèse s’arrêtent avant la trajectoire réelle                    | docs/roadmap/loop-engine.md ne contient que V7.3–V7.5 ; docs/architecture.md et README.md s’arrêtent à V13.3 ; stable-tags.md annonce V6.6 comme dernier stable global documenté | Le self-hosting ne peut pas proposer le prochain lot réel et les lecteurs prennent des documents historiques pour l’état courant. | Refaire une roadmap active courte et marquer les historiques.                        | V13.13      |
| M6  | Horloge et identifiants ne sont pas uniformément explicites aux frontières opérationnelles | src/runtime/local-process.ts, now interne ; src/loop/runner.ts, Date et randomUUID injectables                                                                                   | Reproductibilité et preuve temporelle inégales avant une exécution réelle.                                                        | Imposer clock/id providers explicites à toute frontière impérative, sans DI globale. | V13.16      |

### Low

| ID  | Constat                                                                                                  | Preuve                                                                          | Conséquence                                                      | Correction recommandée                                                     | Lot suggéré |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------- |
| L1  | Help, usage final et registre PUBLIC_COMMANDS ne décrivent pas la même surface                           | src/commands/help.ts ; src/cli.ts lignes 227–230 ; src/audit/public-commands.ts | Découvrabilité incomplète et couverture CLI-001 partielle.       | Définir une source canonique de commandes ou un test de parité.            | V13.14      |
| L2  | Aucun TODO métier explicite n’existe dans src/ ; la suite dépend presque entièrement de documents future | rg ne trouve TODO que comme token du roadmap reader                             | Les intentions ne deviennent pas des candidats actifs du moteur. | Maintenir une roadmap courte avec cases non cochées et critères de sortie. | V13.13      |

## 7. Obsolete or Superseded Roadmap Items

### Loop Executor V8

La progression V8.0 à V8.6 de docs/architecture/loop-executor.md est devenue incohérente avec le dépôt. L’ExecutionSession documentée devait porter project, roadmapCandidate, agentPolicy, contextPackage, artifacts et metadata ; le type réel ne porte que sessionId, createdAt, executionMode et executionState. L’API documentée prepareExecution n’existe pas, tandis que index.ts exporte tout le module. Les préoccupations ont été redistribuées entre src/execution, Runtime V10, Transport V10.3 et la chaîne de gouvernance V11–V13. Ce draft doit être déclaré historique ou réécrit, pas poursuivi comme si ses numéros restaient actifs.

### Séquence V12.1–V12.4

Le roadmap du RFC V12 annonçait documentation, implementation, validation puis hardening. Le dépôt a livré DispatchDescriptor en V12.1, aucun V12.2 nommé, BoundaryHandoff en V12.3 et ExecutionBoundaryRFC en V12.4. Le hardening cancellation, recovery, replay, observability et audit evidence n’a pas été livré. Les objectifs V12.2 et V12.3 sont superseded par les lots réellement nommés ; le hardening V12.4 reste une intention documentaire à reséquencer.

### RFC consolidé V13.0

Le RFC affirme que Future Bridge, Future Transport et Future Runtime n’existent pas, puis classe Operator Approval, Bridge et Runtime parmi le futur. Le dépôt contient désormais Operator Approval V13.1, Bridge V13.4–V13.6 et Runtime metadata V13.7–V13.11, en plus du Runtime opérationnel V10. Le RFC n’est pas entièrement remplacé, mais ses tableaux de statut et son schéma de couches sont obsolètes et ne doivent plus guider une intégration sans révision.

### Roadmap auto-hébergée

docs/roadmap/loop-engine.md ne contient que trois lots V7 cochés. Elle n’est plus une roadmap opérationnelle de l’état actuel ; elle est un fragment historique. Elle doit être remplacée par une roadmap courte issue du présent audit, tout en gardant l’historique dans les audits ou changelogs.

### Hiérarchie de tags

docs/audits/stable-tags.md reste utile pour le cycle Audit Engine V6, mais l’expression dernier tag stable global actuel est obsolète face aux tags V8.1, V9.0 et V10.1–V10.3 observés. Cette page doit être qualifiée comme historique du sous-système Audit Engine.

## 8. Recommended Roadmap

| Priorité | Lot proposé                                             | Objectif                                                                                             | Pourquoi maintenant                                       | Dépendances    | Critères de sortie                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | V13.13 — Runtime and Capability Contract Reconciliation | Décider la topologie canonique V10/V13, les noms, la responsabilité de Capability et la surface Core | Bloque tout adapter sûr                                   | Rapport V13.12 | RFC normatif à jour ; chaque doublon classé canonical, legacy, deprecated ou bridge-only ; aucune modification CLI/JSON ; règles de graphe, façade et composition spécifiées.                                                   |
| P1       | V13.14 — Architecture Boundary Enforcement              | Transformer les décisions V13.13 en tests d’exports, de dépendances et règles d’audit sémantiques    | Le score d’audit actuel ne protège pas les décisions      | V13.13         | Zéro cycle de types non explicitement accepté ; façade Core testée ; tous les tests découverts ; README/package/help cohérents ; CLI/JSON inchangés ; nouvelles règles d’audit sur imports, exports et docs.                    |
| P2       | V13.15 — Capability and Budget Vocabulary               | Séparer AgentCapability, RuntimeCapability, TransportCapability, permissions et budgets mesurables   | Évite qu’une capacité devienne une autorisation implicite | V13.13–V13.14  | Mappings purs et default-deny ; Token et Cost restent des plafonds explicites ou deviennent des contrats versionnés ; aucune tarification inventée ; audits de conversion et de non-escalade ; pas d’adapter.                   |
| P3       | V13.16 — Declarative Runtime Composition                | Composer Request, Resolution, Descriptor, Registry et Capability via des références typées           | Rend la chaîne vérifiable avant toute exécution           | V13.15         | Une entrée canonique, sorties profondément immuables, ordre stable, horloge explicite, aucune I/O ; tests de bout en bout déclaratifs ; règles interdisant Provider, Transport, process et réseau ; CLI/JSON publics inchangés. |
| P4       | V14.0 — Execution Readiness RFC                         | Décider les préconditions d’un futur adapter et le sort de local-process V10                         | Seulement après stabilisation des contrats                | V13.16         | RFC sécurité, single-use, budgets, start evidence, cancellation, recovery et audit ; décision Go/No-Go explicite ; aucune implémentation fournisseur dans ce lot ; règles d’audit prévues avant code opérationnel.              |

Surfaces publiques : aucun des cinq lots ne doit modifier les schémas CLI ou JSON sans un lot de versioning séparé. V13.13 peut seulement documenter la future surface Core. V13.14 peut modifier les exports internes Core si la décision V13.13 le demande et si les tests de compatibilité l’encadrent. V13.15 et V13.16 peuvent faire évoluer les contrats internes non publiés, mais doivent préserver les commandes et schemaVersion 1.

## 9. Recommended Next Lot

### Identifiant et titre

V13.13 — Runtime and Capability Contract Reconciliation

### Objectif

Produire une architecture normative unique qui explique comment le Runtime opérationnel V10, la gouvernance V11–V13, le Runtime déclaratif V13.7–V13.11, AgentCapability, Policy et la façade Core se combinent ou restent volontairement séparés.

### Périmètre

- mettre à jour docs/architecture/execution-architecture-rfc.md pour inclure V13.1–V13.11 et le Runtime V10 existant ;
- établir un tableau de décision pour RuntimeRequest, RuntimeRegistry, createRuntimeRequest, createRuntimeRegistry, RuntimeAdapter, RuntimeCapability et AgentCapability ;
- décider pour chaque élément : canonical, legacy-supported, deprecated, internal-only ou future bridge input ;
- définir une matrice unidirectionnelle Agents, Policy, Context, Intelligence, Runtime metadata, Runtime execution, Provider, Transport et Core ;
- définir la surface que src/core/index.ts doit exposer à terme ;
- décider si src/executor et src/execution restent des composants actifs, historiques ou à migrer ;
- publier une roadmap auto-hébergée courte avec des candidats actifs ;
- spécifier les règles d’audit exactes du lot V13.14 : graphe de types, exports Core, composition, test discovery et fraîcheur du RFC.

### Hors périmètre

- aucun adapter fournisseur réel ;
- aucun appel OpenAI, Claude, Codex, OpenClaw, n8n ou réseau ;
- aucun nouveau RuntimeAdapter ou TransportAdapter ;
- aucun changement de local-process ;
- aucune injection de dépendances ou découverte dynamique ;
- aucune exécution, retry, cancellation ou recovery ;
- aucun changement de commande CLI, de sortie JSON, de schemaVersion ou de fixture publique ;
- aucun refactoring large de production avant la décision normative.

### Critères d’acceptation

1. Le RFC normatif représente toutes les couches réellement présentes jusqu’à V13.11.
2. Les deux familles Runtime sont nommées sans ambiguïté et leur relation est explicitement acceptée ou interdite.
3. Une seule couche possède chaque responsabilité : sélection d’agent, capacité d’agent, capacité runtime, permission, résolution runtime, registre de métadonnées, registre d’adapters et exécution.
4. La matrice d’imports autorisés et interdits tranche les deux cycles de types observés.
5. La politique d’exports de src/core/index.ts classe chaque wrapper récent.
6. Le statut de src/executor et src/execution est décidé.
7. Les invariantes préalables à tout adapter réel sont listées et testables.
8. Les futures règles d’audit sont définies par comportement attendu, pas par simple présence de tokens.
9. docs/roadmap/loop-engine.md contient au plus cinq lots actifs, ordonnés et vérifiables.
10. Les surfaces CLI et JSON restent strictement inchangées.

### Validations attendues

- git diff --check ;
- pnpm run validate ;
- pnpm run ci ;
- audit général, architecture et docs en JSON ;
- test ou script de graphe d’imports en mode constat, sans modifier la production ;
- vérification de parité entre le RFC, la liste des modules et la future politique Core ;
- git status limité aux documents explicitement autorisés par le lot.

### Risques

- produire un RFC supplémentaire sans retirer l’ambiguïté : chaque doublon doit donc recevoir une décision explicite ;
- déclarer legacy le Runtime V10 sans traiter ses consommateurs Core et Transport ;
- confondre renommage interne et breaking change public ;
- tenter de corriger les cycles ou les exports avant d’avoir décidé la direction normative ;
- élargir le lot vers un adapter réel sous prétexte de valider la topologie.

### Justification de priorité

Ce lot est prioritaire parce que le dépôt possède déjà assez de code pour rendre un mauvais branchement crédible, mais pas assez de cohérence pour le rendre sûr. Une décision architecturale maintenant coûte peu, ne consomme aucun fournisseur et évite de figer un couplage entre gouvernance, capacité et exécution.

## 10. Final Verdict

ROADMAP_NEEDS_RESEQUENCING — Les briques locales et déclaratives sont solides et validées isolément, mais la roadmap doit insérer une réconciliation V10/V13 et des garde-fous de dépendances avant toute phase exécutable ou fournisseur.
