# Loop Engine

Orchestrateur local léger pour piloter les projets de développement sans IA automatique par défaut.

## Objectif final

Voir `docs/architecture/final-objective.md`.

Cette page constitue la source de vérité du produit et définit l'objectif final de Loop Engine.

Claude doit s’y référer avant toute évolution structurante.

Loop Engine vise désormais l'orchestration autonome par petits lots. Voir `docs/architecture/autonomous-loop-runner.md` pour l'architecture historique du LoopRunner et `docs/architecture/looprunner-execute-validation-repair.md` pour le contrat courant du mode `execute`.

## Objectifs V0

- lister les projets locaux ;
- détecter leur état Git ;
- documenter les sources importantes ;
- préparer des contextes courts pour Claude, Codex ou GPT ;
- limiter la consommation de tokens ;
- garder les décisions humaines.

Le mode d'inspection et le mode `plan` ne modifient pas les dépôts pilotés. Le mode `execute` ne peut modifier que le projet explicitement ciblé, au travers d'un `LoopExecutor` injecté et admis par la politique.

## Principes

- 0 IA automatique par défaut.
- 0 token consommé par défaut.
- Pas de commit automatique.
- Pas de push automatique.
- Le mode par défaut (`plan`) ne modifie rien.
- `execute` doit être demandé explicitement et nécessite un provider CLI concret explicitement configuré ; il s'exécute dans un Git worktree isolé et temporaire, jamais dans le dépôt source.
- `commit` exige un message explicite et reste contrôlé ; `publish` est une
  action CLI explicite qui crée seulement une ref Git candidate interne après
  validation isolée, sans modifier le worktree, l'index, HEAD ou une branche
  utilisateur.
- Les validations locales passent après l'exécution et avant toute future revue, réparation, commit ou publication.
- Les projets pilotés restent indépendants.

## Commandes

- `pnpm loop summary` : affiche une vue compacte du workspace.
- `pnpm loop summary --json` : affiche la vue workspace en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop status` : affiche l'état détaillé des projets configurés.
- `pnpm loop doctor` : vérifie la cohérence des chemins, docs et contraintes Git.
- `pnpm loop json-check` : vérifie que les sorties JSON publiques sont valides.
- `pnpm run rag-index` : reconstruit l'index RAG local dans `.loop-engine/`.
- `pnpm run rag-search -- <query>` : recherche dans l'index RAG local.
- `pnpm loop context creatyss` : prépare un contexte court pour reprendre un projet.
- `pnpm loop handoff creatyss` : prépare un contexte humain supervisé.
- `pnpm loop context creatyss --json` : affiche le contexte projet en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop validate creatyss` : lance les validations configurées.
- `pnpm loop review creatyss` : prépare un contexte de revue basé sur Git sans appeler d'IA.
- `pnpm loop review creatyss --json` : prépare un contexte de revue Git en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop next creatyss` : affiche la prochaine action sûre pour un projet.
- `pnpm loop next creatyss --json` : affiche la prochaine action sûre en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop prompt creatyss` : génère un prompt court à coller dans un assistant IA.
- `pnpm loop prompt creatyss --json` : génère le contexte de prompt en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop run creatyss` : lance un cycle `plan` du LoopRunner. Le mode `plan` (V7.2) reste le défaut : aucun agent n'est appelé, aucune modification du worktree, aucun commit et aucun push.
- `pnpm loop run creatyss --mode plan --json` : sortie JSON du cycle (`LoopRunResult`, `schemaVersion: 1`), avec la sélection d'agent prévisionnelle `agentPolicy` et le paquet borné `contextPackage`.
- `pnpm loop run lp-infra --candidate H1-L4 --mode plan --json` : planifie exactement un lot de roadmap structuré adressable ; un identifiant invalide ou devenu non admissible est refusé sans repli sur `next`.
- `pnpm loop run creatyss --mode execute --provider claude_code --provider-executable claude --json` : exécute le cycle provider → validation dans un Git worktree isolé et temporaire ; le dépôt source reste inchangé et aucun commit ni publication n'est produit.
- `pnpm loop run creatyss --mode execute --provider codex --provider-executable codex --export-patch ./artifacts/creatyss.patch --json` : après une exécution et validation réussies, exporte le diff Git binaire du worktree isolé vers le chemin explicite, sans l'appliquer au dépôt source.
- `pnpm loop run creatyss --mode commit --provider codex --provider-executable codex --commit-message "..."` : effectue le commit Git borné existant après validation.
- `pnpm loop run creatyss --mode publish --provider codex --provider-executable codex --json` : exécute et valide dans un worktree isolé, puis crée au plus `refs/loop-engine/candidates/<project>/<runId>` pointant vers un commit candidat parenté par le `baseSha` validé. Aucun apply, checkout, push, PR, merge ou branche utilisateur.
- `pnpm loop candidate review creatyss --run-id <runId> --json` : relit une candidate V33 déjà enregistrée dans Run History, vérifie sa ref et son parent Git, puis projette son diff `baseSha..candidateCommitSha`. Cette revue ne pousse pas, ne crée pas de PR et ne modifie aucune ref utilisateur.

## Configuration

Les projets sont déclarés dans `projects.yaml`.

Champs optionnels :

- `optional: true`
- `requires_git: false`

## Philosophie

Automatiser le déterministe.  
Limiter l'IA au jugement.  
Garder l'humain sur les décisions.

### Lecture du summary

La commande `pnpm loop summary` affiche une vue compacte du workspace.

La partie roadmap utilise :

- `A` : candidats actifs ;
- `D` : candidats terminés ;
- `🟢` : aucun candidat bloqué ;
- `🔴` : au moins un candidat bloqué.

## Validation locale

- `pnpm run typecheck` : vérifie le typage TypeScript.
- `pnpm run test` : lance les tests unitaires Node sous `tests/` et `src/execution/`.
- `pnpm run validate` : lance le typecheck, les tests et `json-check`.

## Auto-pilotage local

Loop Engine est déclaré dans `projects.yaml` comme projet `loop-engine`.

Cela permet d'utiliser la CLI sur elle-même :

- `pnpm loop summary`
- `pnpm loop context loop-engine`
- `pnpm loop validate loop-engine`
- `pnpm loop review loop-engine`
- `pnpm loop run loop-engine --mode plan --json`
- `pnpm loop run loop-engine --mode execute --json` — échoue fermée avec `executor_unavailable` tant qu'aucun provider concret n'est explicitement configuré.

La boucle par défaut reste déterministe et non destructive :

- aucun appel IA automatique implicite ;
- aucune modification en mode `plan` ;
- aucun commit ni publication en mode `execute`, dont les modifications restent dans un worktree temporaire supprimé en fin de cycle ;
- validation uniquement après une exécution admise et déclarée réussie.

## Structure du projet

- `src/cli.ts` : routeur CLI minimal.
- `src/commands/` : commandes utilisateur et cas d'usage.
- `src/composition/` : contrat d'assemblage applicatif et câblage concret unique.
- `src/loop/` : orchestration `plan` et cycle `execute/validate/repair` par ports injectés.
- `src/core/` : primitives bas niveau comme config, Git, docs, résolution projet et surfaces internes opt-in.
- `src/intelligence/` : états calculés, ProjectSnapshot, roadmap et sélection de candidats.
- `src/ui/` : helpers d'affichage terminal.

Les commandes doivent consommer le `ProjectSnapshot` plutôt que relire directement Git, les docs ou la roadmap.

Depuis V13.15, Core expose aussi le bridge opt-in
`resolveDeclarativeRuntimeExecution` / `executeDeclarativeRuntime`. Il compose
la sélection déclarative V13, un mapping explicite `descriptorId -> RuntimeId`,
et les APIs V10 existantes `createRuntimeRequest`, `resolveRuntime` et
`executeRuntime`. Il ne modifie ni le CLI, ni le JSON public, ni
`LoopRunResult`, et ne crée aucun provider ou adapter réel.

Depuis V13.16, la variante policy-aware ajoute une admission pure et explicite
avant V10 : `evaluateRuntimeExecutionAdmission`,
`resolvePolicyAwareDeclarativeRuntimeExecution` et
`executePolicyAwareDeclarativeRuntime` consomment une `AgentPolicyResolution`
déjà fournie, refusent runtime/provider/effort/budget hors politique, puis
délèguent seulement après admission.

Depuis V13.17, `createRuntimeExecutionPlan` et
`dryRunPolicyAwareDeclarativeRuntimeExecution` exposent un plan Runtime
`schemaVersion: 1`, déterministe et sérialisable, pour décrire ce qui serait
exécuté sans appeler d'adapter.

Depuis V14.3, `executePreparedInboundRuntimeRequest(...)` compose la frontière
inbound préparée avec l'admission Runtime, le dry-run sans effet ou une invocation
Runtime bornée, puis une receipt publique redacted.

Depuis V14.4, `runLoopExecute(...)` orchestre un `LoopExecutor`, un
`LoopValidator` et un `LoopRepairer` injectés. La sélection de politique devient
une admission réelle pour le cycle, les validations configurées sont exécutées
après l'exécuteur, chaque réparation est bornée par `maxRepairs` et suivie d'une
nouvelle validation. `execute` conserve `commit` et `publication` à `null`; le
mode `publish` V33 peut retourner une publication `candidate_ref` compacte.

Voir aussi :

- `docs/architecture/autonomous-loop-runner.md`
- `docs/architecture/looprunner-execute-validation-repair.md`
- `docs/architecture/prepared-inbound-runtime-execution.md`
- `docs/architecture/commands.md`
- `docs/architecture/json-contracts.md`
- `docs/architecture/project-intelligence.md`
- `docs/architecture/roadmap-reader.md`
- `docs/architecture/memory-layer.md`
- `docs/architecture/memory-layer-checklist.md`
- `docs/architecture/local-rag-index.md`
- `docs/architecture/local-rag-sections.md`
- `docs/integrations/README.md`
- `docs/integrations/json-consumers.md`
- `docs/integrations/n8n-read-only.md`
- `docs/integrations/n8n-read-only-checklist.md`
- `docs/integrations/openclaw-read-only.md`
- `docs/integrations/openclaw-read-only-checklist.md`
- `docs/architecture/audit-engine.md`
- `docs/architecture/agent-orchestration.md`
- `docs/architecture/agent-policy-engine.md`
- `docs/architecture/minimal-context-builder.md`
- `docs/architecture/runtime-abstraction.md`
- `docs/architecture/provider-adapters.md`
- `docs/architecture/transport-adapters.md`
- `docs/architecture/openclaw-provider-protocol.md`
- `docs/architecture/executable-mapping.md`
- `docs/architecture/transport-intent.md`
- `docs/architecture/capability-policy-engine.md`
- `docs/architecture/authorization-configuration.md`
- `docs/architecture/architecture-consolidation.md`
- `docs/architecture/rfc-execution-architecture-v11.md`
- `docs/architecture/transport-request.md`
- `docs/architecture/transport-request-builder.md`
- `docs/architecture/execution-review-gate.md`
- `docs/architecture/approval-provenance.md`
- `docs/architecture/handoff-eligibility.md`
- `docs/architecture/v11-consolidation.md`
- `docs/architecture/rfc-execution-boundary-v12.md`
- `docs/architecture/dispatch-descriptor.md`
- `docs/architecture/boundary-handoff.md`
- `docs/architecture/execution-boundary-rfc.md`
- `docs/architecture/execution-architecture-rfc.md`
- `docs/architecture/operator-approval-rfc.md`

## Audit et CI

Loop Engine expose un moteur d'audit intégré.

Commandes principales :

- `pnpm loop audit`
- `pnpm loop audit --json`
- `pnpm loop audit --strict`
- `pnpm loop audit --json --strict`
- `pnpm loop audit --manifest`
- `pnpm run audit:strict`
- `pnpm run ci`

Le rapport JSON expose notamment :

- `schemaVersion` ;
- `summary.status` ;
- `summary.score` ;
- `summary.byCategory` ;
- `summary.byPriority` ;
- `findings` ;
- `recommendations`.

Le script `pnpm run ci` exécute la validation générale puis l'audit strict. Il est utilisé par le workflow GitHub Actions du dépôt.

### Contrat des recommandations JSON

Le rapport JSON d'audit expose un contrat stable pour les recommandations actionnables.

- `summary.recommendations.total` est le total canonique des recommandations actionnables.
- `summary.recommendations.byPriority` est le compteur canonique par priorité.
- `summary.recommendationsByPriority` est un champ legacy et déprécié.
- `summary.recommendationsByPriority` reste exposé pour compatibilité avec les consommateurs JSON existants.
- `summary.recommendations.byPriority` est synchronisé avec `summary.recommendationsByPriority` par `json-check`.
- un test de non-régression couvre cette synchronisation.
- les consommateurs JSON doivent migrer vers `summary.recommendations.byPriority`.

## Voir aussi

- [Audit Engine V4 — Rapport final](docs/audits/audit-engine-v4-final.md)

- [Audit Engine V3 — Rapport final](docs/audits/audit-engine-v3-final.md)

### Profils d'audit

La commande `audit` accepte un profil optionnel avec `--profile`.

Exemples :

```bash
pnpm loop audit --profile docs
pnpm loop audit --json --profile docs
pnpm loop audit --json --profile json
pnpm loop audit --json --profile architecture
```

Profils disponibles :

- `quick`
- `strict`
- `release`
- `docs`
- `json`
- `architecture`

Les profils filtrent les règles exécutées par catégorie, sans modifier le format du rapport.

### Contrôle CI des profils d'audit

Le script `pnpm run audit:profiles` exécute `scripts/audit-profile-check.ts`.

Il vérifie que les profils `quick`, `strict`, `release`, `json`, `docs` et `architecture` filtrent bien les règles par catégorie.

Ce contrôle est inclus dans `pnpm run ci`.

### Erreurs de profils d'audit

Si `--profile` reçoit un profil inconnu, la commande échoue avec `Invalid audit profile`.

Si `--profile` est fourni sans valeur, la commande échoue avec `Invalid audit profile: <missing>`.

### Registre et manifeste des règles

Le moteur expose un manifeste JSON déterministe, séparé du rapport d'audit :

```bash
pnpm loop audit --manifest
pnpm loop audit --manifest --tag self-audit
pnpm loop audit --rule AUDIT-016
pnpm loop audit --stability stable
```

Les filtres `--rule`, `--tag` et `--stability` acceptent plusieurs valeurs :
elles sont réunies par filtre puis intersectées entre filtres et profil. Une
sélection vide échoue explicitement. Le manifeste ne contient aucun timestamp
et conserve l'ordre de `AUDIT_RULES`; `AuditReport` reste inchangé.

Ces erreurs retournent un code de sortie non nul.

## Rapports d’exécution

Loop Engine produit deux formats complémentaires de rapport d’exécution.

```text
report.json
report.md
```

### Rapport JSON

Le fichier `report.json` constitue le contrat public destiné aux outils et aux intégrations.

Il expose notamment :

- `schemaVersion`
- `summary`
- `steps`

Les consommateurs doivent ignorer les champs inconnus afin de permettre des extensions additives.

### Rapport Markdown

Le fichier `report.md` constitue la représentation destinée aux humains.

Il reprend les mêmes informations que le rapport JSON dans un format lisible.

Les deux rapports sont générés à partir du même modèle d'exécution et doivent rester cohérents.

### Golden fixtures

Les fixtures de référence sont conservées dans :

```text
tests/fixtures/reports/report.json
tests/fixtures/reports/report.md
```

Elles peuvent être régénérées avec :

```bash
pnpm run reports:fixtures
```

Toute évolution volontaire du contrat doit être visible dans le diff Git.

La documentation complète du contrat est disponible dans :

```text
docs/architecture/execution-reporting.md
```

- [Authority Verification RFC](docs/architecture/authority-verification-rfc.md) — V13.2 declarative verification of authority and approval evidence; verification is not execution authority.
- [Revocation & Expiry Lifecycle RFC](docs/architecture/revocation-expiry-rfc.md) — V13.3 declarative governance lifecycle; no lifecycle state authorizes execution.
