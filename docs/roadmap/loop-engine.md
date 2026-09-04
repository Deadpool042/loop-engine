# Roadmap — Loop Engine (auto-hébergé)

Roadmap interne de Loop Engine, lue par son propre roadmap reader (`pnpm loop next loop-engine`, `pnpm loop run loop-engine --mode plan`). Voir `docs/architecture/roadmap-reader.md` pour le format et la classification des candidats.

La source de décision reste l'audit `docs/audits/architecture-delivery-readiness-v14.2u.md`; les architectures V14.3 à V14.5 sont documentées dans `docs/architecture/prepared-inbound-runtime-execution.md`, `docs/architecture/looprunner-execute-validation-repair.md` et `docs/architecture/configured-inbound-security-adapter.md`.

## Baseline livrée

- [x] Lot V7.3 — Agent orchestration layer : types, registry, selector et escalade locale déterministe
- [x] Lot V7.4 — Agent Policy Engine et intégration prévisionnelle au LoopRunner
- [x] Lot V7.5 — Minimal Context Builder borné et déterministe
- [x] Lots V10–V13 — Runtime gardé, admission de politique, plans, receipts et projection publique opt-in
- [x] Lots V13.49–V13.68 — demande Runtime publique : decode, authorize, assemble et prepare
- [x] Lots V14.0–V14.2u — frontière inbound transport-neutral, authentification injectée, replay/security gates et hardening
- [x] Lot V14.3 — Prepared Inbound Runtime Execution Vertical Slice : dry-run sans effet, admission Runtime, exécution bornée et receipt public redacted
- [x] Lot V14.4 — LoopRunner Execute and Validation Cycle : exécuteur injecté, fichiers modifiés, validation/audit et réparation bornée ; aucun commit ni publish
- [x] Lot V14.5 — Concrete Inbound Security and Adapter Pilot : identité par clé API configurée, ACL tenant/rôle/projet/opération, replay fichier atomique persistant et adapter unique vers V14.3
- [x] Lot V14.6 — Real Provider Pilot and Controlled Commit Mode : providers CLI concrets, invocation bornée et redacted, commit uniquement en mode explicite ; publish reste différé
- [x] Lot V22.0 — contenu multi-ligne des candidats roadmap conservé et classifié dans le prompt d'exécution
- [x] Lot V22.1 — frontière candidate explicite, inventaire de prose conservé et sélection exécutable protégée

## Cycle livré V40 — renouvellement de roadmap et alignement du runtime principal

Contexte vérifié le 2026-09-03 : toutes les capacités précédemment planifiées sont livrées, mais le premier renouvellement réel d'une roadmap a révélé deux gaps de gouvernance. D'une part, `roadmap decision --request-proposal` reste codé autour de `anthropic_api` alors que l'architecture canonique définit ChatGPT comme orchestrateur interactif principal et OpenClaw/Sol comme runtime autonome secondaire sans fallback API payant. D'autre part, un projet dont la roadmap est épuisée est aujourd'hui projeté comme `no_admissible_candidate`, sans distinguer « objectif atteint / attente volontaire » de « objectif encore disponible, roadmap à renouveler ».

- [x] [P1] V40.0 — Contrat `roadmap decision --request-proposal` aligné sur la politique provider réelle : `anthropic_api` et `openclaw_agent` sont des sélections explicites, OpenClaw utilise le probe modèle brut du Gateway avec un modèle `provider/model` imposé, et aucun fallback API payant implicite n'est introduit. Couverture provider + CLI livrée ; le wrapper Development Workspace accepte désormais `openclaw_agent`. Burn-in VPS du 2026-09-03 : la demande atteint bien OpenClaw/Sol sans credential Anthropic ; le runtime OpenClaw actuellement dégradé renvoie `LLM request failed.`, correctement projeté comme absence de proposition au lieu d'être masqué ou remplacé par un autre provider.
- [x] [P2] V40.1 — État déterministe de renouvellement livré : `roadmap_exhausted_objective_available`, `objective_required`, `maintenance_no_work`, `gated_no_work` et `no_admissible_candidate` sont distingués depuis le snapshot canonique. `handoff`, `roadmap status/overview/decision`, `context` et `summary` projettent cette sémantique sans créer de candidat ni appeler de provider ; une phase-gate fermée reste un blocage et n'est pas classée comme absence volontaire de travail.
- [x] [P2] V40.2 — Contrat de proposition de renouvellement livré : la proposition est un artefact JSON borné et reviewable dérivé de l'objectif canonique + état réel, avec validation locale et au plus trois lots. Aucun appel provider sans demande explicite et aucune proposition n'écrit la roadmap ; la matérialisation reste une mutation Development Workspace après validation humaine. Aucun nouveau système de persistence ni second format de roadmap.
- [x] [P3] V40.3 — Project Cockpit existant aligné : il distingue roadmap épuisée avec renouvellement disponible, objectif canonique requis et travail bloqué par gate ; l'action de proposition n'est exposée que pour `roadmap_exhausted_objective_available`. L'affichage reste purement déterministe, sans LLM, nouveau cockpit ni duplication des contrats existants.

### Gates V40

- aucun provider IA payant requis par défaut ;
- aucune génération automatique au simple affichage d'un projet ;
- aucune écriture de roadmap sans validation humaine explicite ;
- les modes `maintenance`, `deferred` et les phase-gates existantes conservent leur sémantique ;
- ne pas transformer un projet volontairement sans travail en backlog artificiel.

## Cycle livré V41 — délégation runtime-native bornée

Contexte vérifié le 2026-09-04 : `LoopExecutionPlan` porte déjà la mission, le contexte borné, `allowedPaths`, les permissions, l'effort, les budgets et la policy ; le runner impose déjà le scope après exécution puis les validations et l'evidence. Ajouter un graphe Fable, un scheduler de sous-agents ou un second contrat d'exécution dupliquerait donc des capacités existantes. Le gap réel est uniquement d'autoriser Codex et Claude Code à exploiter leurs skills/sous-agents natifs lorsque cela apporte un gain, sans leur transférer l'autorité de gouvernance.

- [x] [P1] V41.0 — Runtime-managed delegation : les deux executors CLI existants reçoivent une consigne dérivée de `LoopExecutionPlan.effort`. Un plan `low` privilégie l'exécution directe ; les efforts supérieurs peuvent employer skills ou sous-agents uniquement pour des flux indépendants ou une revue indépendante utile. La consigne impose le même objectif, livrables, hors-périmètre, `allowedPaths`, permissions et interdiction de publication, et interdit d'introduire un autre provider, runtime, credential ou API payante. Aucun sandbox ou observateur spécifique des sous-agents n'est revendiqué : le contrôle mécanique reste le delta final unique, soumis aux scope guards, validations et evidence Loop Engine existants. Aucun nouveau type, graphe, scheduler, provider ou système de persistence.

### Gates V41

- aucun Fable, routeur externe ou crédit/API payante requis ;
- aucune nouvelle abstraction de planification ou de persistence ;
- la délégation interne reste une optimisation du runtime, jamais une autorité de validation ;
- les petits lots `low` évitent le coût de coordination par défaut ;
- le scope post-executor, les validations, audits et frontières Git existants restent inchangés.

## Cycle livré V42 — CI de référence consolidée

Contexte vérifié le 2026-09-04 : le workflow GitHub dupliquait la validation canonique en quatre jobs Node distincts, chacun répétant checkout, setup pnpm, setup Node et `pnpm install --frozen-lockfile`. Or `package.json` et `AGENTS.md` définissent déjà `pnpm run ci` comme source de vérité de la validation complète (`validate + audit:strict + audit:profiles`). Le coût principal observé sur les PR V40/V41 provenait du bootstrap répété avant les validations. Le premier burn-in de la PR #231 a aussi révélé que `AUDIT-012` et ses tests codifiaient encore l'ancien parallélisme comme invariant et rejetaient explicitement `pnpm run ci`; ce contrat est remplacé dans le même lot par un invariant consolidé fail-closed (un seul setup/install, `Quality`, un seul `CI gate`, validation canonique et diagnostics d'échec).

- [x] [P1] V42.0 — Consolider la CI sur la validation canonique : conserver `Quality` pour `git diff --check`, puis exécuter `pnpm run ci` dans un unique job `CI gate` avec un seul setup/install. Conserver un log diagnostic borné en artifact uniquement en cas d'échec. Aucun changement des commandes de validation, des règles d'audit, des tests, des contrats JSON ou du runtime applicatif. La PR sert de burn-in réel : merge uniquement si GitHub considère le nouveau `CI gate` vert et la branche mergeable.

### Gates V42

- une seule installation de dépendances Node par workflow de PR ;
- `pnpm run ci` reste l'unique définition de la validation de référence ;
- aucun check fonctionnel n'est supprimé : typecheck, tests, JSON contracts, strict audit et audit profiles restent exécutés ;
- aucun cache de `node_modules`, artifact de dépendances ou nouveau service de CI ;
- rollback immédiat si la protection de branche exige un ancien statut supprimé.

## Cycle actif V43 — suppression du bootstrap pnpm redondant

Contexte vérifié le 2026-09-04 : après consolidation V42, les runs #1294/#1296 ont passé plusieurs minutes dans `pnpm/action-setup@v6` sur `Running self-installer...`, alors que `Setup Node` et `pnpm install --frozen-lockfile` ont pris seulement quelques secondes. `package.json` fixe déjà exactement `pnpm@10.33.1` via `packageManager`, et Node 22 fournit Corepack pour activer cette version sans action pnpm séparée. V43 supprime donc l'action `pnpm/action-setup` au lieu de simplement la rétrograder.

- [ ] [P1] V43.0 — Supprimer `pnpm/action-setup` du job `CI gate`, conserver un unique `actions/setup-node@v6` en Node 22, activer Corepack puis vérifier la version pnpm avant l'installation. Retirer temporairement le cache pnpm de `setup-node`, qui suppose que `pnpm` soit déjà disponible au moment du setup. La PR constitue le burn-in réel : conserver le changement uniquement si `CI gate` reste vert et si le temps total baisse nettement ; un cache séparé ne sera réintroduit que si les mesures montrent qu'il est utile.

### Gates V43

- aucun changement de pnpm 10.33.1 ni de `packageManager` ;
- aucun changement des commandes de validation ;
- aucun `pnpm/action-setup` ni second bootstrap de package manager ;
- `AUDIT-012` vérifie explicitement Node unique + Corepack + absence du setup pnpm séparé ;
- décision fondée sur les temps réels `Setup Node`, `Enable pinned pnpm`, `Install dependencies` et `CI gate` ;
- aucun changement applicatif.

## Lot actif — burn-in vertical

- [x] Burn-in 1 — Ajouter `tests/integration/claude-code-provider-burn-in.test.ts` en réutilisant `tests/fixtures/fake-claude/claude`. Le test doit exécuter le chemin `LoopApplicationAssembly -> LoopExecutor -> worktree observation` dans un dépôt Git temporaire, faire créer exactement un fichier par le faux provider, vérifier que `modifiedFiles` reflète exactement ce fichier, puis valider avec `pnpm exec tsx --test tests/integration/claude-code-provider-burn-in.test.ts`. Aucun provider réel, aucune nouvelle abstraction, aucun commit, push ou publish.
- [x] Burn-in 2 — Ajouter `tests/integration/claude-code-provider-repeated-burn-in.test.ts` couvrant plusieurs exécutions successives dans un même dépôt Git temporaire (isolation du delta après re-baseline explicite, refus `worktree_not_clean` sur état préexistant non attribué, échec sans faux delta ni contamination). Invariant démontré : le delta observé par une exécution ne dépend que de l'état du worktree au moment de cette exécution, jamais d'une exécution précédente. Aucun provider réel, aucune nouvelle abstraction de production, aucun commit, push ou publish depuis le moteur.
- [x] Burn-in 3 — Campagne réelle de 3 exécutions du CLI `claude` contre un dépôt Git temporaire dédié, hors moteur (`docs/audits/real-provider-pilot-burn-in.md`). Chaque run a produit exactement le fichier attendu sans contamination inter-run.
- [x] Burn-in 4 — Intégration `runLoopExecute -> validation -> runLoopCommit` dans un vrai dépôt Git temporaire : le faux provider crée un seul fichier, la validation passe, le committer Git réel crée un commit borné contenant exactement ce fichier et laisse le worktree propre (`tests/integration/controlled-commit-burn-in.test.ts`).
- [x] Burn-in 5 — Exécution réelle de `runLoopExecute` → validation réelle → `runLoopCommit` → commit Git réel sur un dépôt non-fixture (`docs/audits/real-controlled-commit-pilot.md`). Commit borné produit, ne contenant que le fichier validé.

## Lot actif — cockpit d’exécution observable

- [x] Lot V23.0 — Observable GUI execution session : session unique observable validée en burn-in réel LP-INFRA H3-L2, avec progression `préparation -> provider -> validation -> terminé/échec`, garde-fous de scope effectifs, résultat final inchangé et export de patch sans modification du dépôt source.
- [x] Lot V23.1 — Recoverable isolated project locks : verrous locaux par projet publiés atomiquement avec metadata propriétaire, récupération uniquement lorsque le PID local est démontré mort, état ambigu fail-closed, quarantaine générationnelle anti-race et release protégée par identité de lock. Burn-in réel validé le 2026-08-18 sur `lp-infra` : un lock canonique valide avec PID réellement mort a été récupéré automatiquement, déplacé en quarantaine, remplacé puis relâché ; l’exécution s’est ensuite bloquée sur `sha_stale` avant tout appel provider. Aucun parallélisme multi-projet, aucune queue, aucun terminal, aucun contrôle distant/mobile ajouté.
- [x] Lot V30 — Cockpit Patch Review : revue read-only du patch exporté de la session courante par IPC spécialisé. Le main process vérifie fichier régulier non symlinké, borne 2 MiB, UTF-8, SHA-256 et `fileCount`, puis projette un unified diff sans exposer de lecture filesystem générique. Aucune application, édition ou persistance de patch ajoutée.
- [x] V31 — Patch identity hardening / base SHA prerequisite : **NO-GO** pour une governed patch application. Le seul prérequis livré transporte de façon déterministe et fail-closed le `baseSha` du worktree isolé avec `patchExport` jusqu'à Patch Review. Aucune primitive existante ne garantit actuellement une publication multi-fichiers atomique et récupérable dans le dépôt source ; aucun apply, IPC d'écriture ni bouton Apply n'est donc livré.
- [x] V32 — Atomic Source Publication Feasibility : **NO-GO** confirmé par probes Git sur dépôts temporaires. `read-tree` → `apply --cached` → `write-tree` prépare une tree candidate exacte sans écrire dans la source, et un worktree temporaire isole validation et delta ; aucune de ces stratégies, ni `git apply`, ne fournit une bascule multi-fichiers atomique et récupérable vers le worktree source. Aucun code de publication, Apply, IPC d'écriture, commit, push, PR ou merge cockpit n'est livré.
- [x] V33 — Governed Candidate Ref Publication : **GO** borné à un artefact Git isolé. Après exécution isolée validée, `publish` prépare la tree et le commit candidat depuis `baseSha` et le patch SHA-256 vérifié, puis crée seulement `refs/loop-engine/candidates/<project>/<runId>` par `update-ref` compare-and-create. Le worktree source, son index, HEAD et `refs/heads/*` restent inchangés; aucune application de patch, interface cockpit, push, PR ou merge. Governed Patch Application reste distincte et différée.
- [x] V34 — Candidate Publication Review & Promotion Contract : revue locale fail-closed de la candidate V33 depuis l'identité Run History et les objets Git `baseSha..candidateCommitSha` (`loop candidate review <project> --run-id <runId>`). **NO-GO** pour tout push, branche distante, PR ou merge : Git/GitHub restent responsables de ces opérations et aucune Governed Patch Application n'est introduite.
- [x] V35 — Addressable Run History Evidence Lookup : un `runId` explicite est résolu dans le journal append-only indépendamment de la fenêtre récente bornée à 100 entrées. Le lookup scanne un seul journal par chunks avec mémoire bornée, compte les lignes corrompues et rejette les `runId` dupliqués ; V34 l'utilise désormais sans augmenter la limite des listes ni ajouter d'index secondaire.
- [x] V36 — Candidate Review Cockpit : le détail d’un run `publish` terminé peut relire la candidate V33/V34/V35 via un IPC spécialisé borné à `projectName + runId`. Le main process invoque la commande publique `candidate review`, le renderer valide fail-closed la projection puis affiche ref, SHAs, métadonnées, fichiers et compteurs. Aucun ref/SHA/path/cwd libre, Apply, push, PR, merge ou écriture Git n’est exposé.
- [x] V37 — Addressable Run History Cockpit Lookup : `runs <project> --run-id <runId>` expose la primitive V35 sans modifier la fenêtre récente ; le cockpit peut ouvrir un run exact via un IPC borné à `projectName + runId`, puis réutiliser le détail V28 et Candidate Review V36. Aucun second reader JSONL, index secondaire, scan multi-projets ou effet Git n’est ajouté.
- [x] V38 — Governed Candidate Publication Cockpit : le mode `publish` V33 est déclenchable depuis l'action candidate du cockpit en réutilisant intégralement la session d'exécution observable V23/V27 et l'IPC `loop:execution-start` (champ additif `mode?: "execute" | "publish"`, jamais de second canal ni de seconde session). Le renderer transmet uniquement `projectName`, `candidateId`, `provider`, `model` et ce mode explicite ; aucun ref, SHA, chemin, `cwd` ou argument Git. `runLoopPublish` (V33) reste l'unique primitive de publication. Le résultat est reparsé fail-closed (`mode`, `runId`, `project`, `publication` contraint au namespace `refs/loop-engine/candidates/`) et continue d'alimenter Run History V28, le lookup exact V37 et Candidate Review V36 sans nouvelle persistance ni nouveau contrat Git renderer. Aucun bouton Push, Create PR, Merge ou Apply n'est exposé — ces capacités différées restent en prose seule (voir V31/V32/V34).
- [x] V39 — Governed Candidate Publication Cockpit Burn-in : après les régressions réelles corrigées par #211/#212, un burn-in d'intégration traverse le handler desktop `publish`, la policy réelle avec capacité `long_context`, l'exécution/validation isolée, la publication V33 en candidate ref et la review V34. La preuve utilise uniquement le faux provider existant et un dépôt Git temporaire, vérifie que le worktree source, son index, HEAD et `refs/heads/*` restent inchangés, et n'ajoute aucun comportement de production, push, PR, merge ou Apply.

Governed Patch Application reste différée : à reconsidérer seulement après l'existence et la qualification d'une primitive de publication multi-fichiers atomique et récupérable dans le dépôt source. Les prérequis minimaux restent une bascule finale réellement atomique, une seconde vérification `HEAD === baseSha`, un worktree source propre obligatoire et une récupération démontrée sans rollback destructif. Cette capacité n'est livrée ni par V31 ni par V32.

## Lot V24 — Planning state & deterministic roadmap discovery

- [x] V24.0 — état de planning explicite (`roadmap`, `maintenance`, `deferred`, `external`) et découverte bornée des seuls emplacements conventionnels dans le root d'un projet déjà déclaré. Aucune lecture de contenu, aucun scan global ou récursif et aucune création de travail.
- [x] V24.1 — `loop roadmap status <project> [--json]` : rapport déterministe, read-only, distinguant roadmap configurée, roadmap détectée non raccordée, absence réelle, maintenance, report et source externe. Le parser, `next`, l'admissibilité et le runner restent inchangés.
- [x] V24.2 — Run History / Execution Evidence Store : persistance append-only, project-scoped du résultat terminal de chaque cycle `run` (`.loop-engine/runs/<project>.jsonl`) et lecture bornée `loop runs <project> [--json] [--limit N]`, la plus récente d'abord. Observabilité pure — aucun détecteur de stagnation, circuit breaker ou cap de dépense cumulée ; ces capacités restent différées jusqu'à preuve d'usage réel. Voir `docs/architecture/autonomous-loop-runner.md` (section « Run History »).
- [x] V24.3 — Cockpit work availability overview : le `summary --json` projette, pour chaque projet, l'admissibilité de travail déjà calculée par Project Intelligence et le dernier résultat terminal du Run History ; le cockpit les affiche dans la liste multi-projets sans recalcul de policy, sans lecture directe des journaux JSONL et sans nouvelle écriture.
- [x] V24.4 — Frontière d'écriture gouvernée des projets observés : lecture seule par défaut, avec l'unique exception actuellement configurée `execution_decision` bornée à l'artefact déclaré, soumise à approbation humaine, confinement de chemin, publication transactionnelle, validation post-écriture et récupération ; `DOCS-026` protège l'alignement doctrine/configuration/implémentation sans autoriser d'écriture générale ni déplacer la logique métier du projet observé.

## Réconciliation stratégique (2026-08-24)

`docs/roadmap/roadmap-v16.md` recommandait encore "V16.1 — Isolated Execution Workspace and Project Lock" comme prochain travail alors que cette capacité est déjà livrée ici sous V23.1. Un audit factuel (code, tests, docs) a reconstruit le statut réel des macro-lots V16 à V20 et ce document en tient désormais lieu de source pour le prochain candidat exécutable ; voir `docs/roadmap/roadmap-v16.md` pour le bilan détaillé et les preuves.

Trois candidats ont été comparés pour la suite de ce dépôt.

Premier candidat : ajouter un heartbeat de renouvellement de bail aux locks de projet (`src/execution/project-lock-manager.ts`), qui reposent aujourd'hui sur une vérification statique de PID sans renouvellement périodique. Valeur réelle mais gap non reconnu par le projet lui-même ; conception d'un mécanisme de liveness non triviale ; risque de sur-ingénierie sans preuve d'un blocage réel observé en usage.

Deuxième candidat : statuer sur le devenir de `src/service/**` et `src/automation/**`, du code de production non consommé en dehors de ses propres tests (transport HTTP, auth store persistant, forge GitHub). Décision de gouvernance légitime à terme, mais ce n'est pas une capacité observable et ce lot l'exclut explicitement de son périmètre (`src/**` hors périmètre sauf preuve démontrée).

Troisième candidat, retenu et livré : borner le nettoyage à l'annulation d'une exécution GUI. Avant V25.0, `docs/architecture/gui-cockpit.md` et `src/gui/desktop/execution-session.ts` limitaient la garantie au process CLI direct, sans terminaison démontrée des descendants provider ni vérification explicite de libération du worktree isolé et du lock projet. V25.0 ferme ce gap par une terminaison POSIX bornée et fail-closed, avec couverture adversariale d'un descendant résistant au SIGTERM et vérification du nettoyage associé. Aucun nouveau contrat IPC public n'a été ajouté.

- [x] V25.0 — Nettoyage borné à l'annulation d'une exécution GUI : garantir qu'une annulation termine effectivement tout processus descendant lancé par le provider dans le worktree isolé (pas seulement le process CLI direct), et vérifier explicitement que le worktree isolé et le lock projet associés à la session annulée sont bien libérés à l'issue de l'annulation. Couverture adversariale avec un provider factice engendrant un descendant. Aucune nouvelle abstraction de préparation, dispatch ou publication ; aucun changement de contrat IPC public au-delà de ce qui existe déjà (`loop:execution-cancel`).
- [x] V26 — Agent decision observability and provider-bound routing : les providers réellement configurés pour `execute` respectent la séparation effort de classement / effort d'invocation, avec un profil `configured.<provider>` construit directement depuis la registration et la configuration du provider concret, sans capacité ni plafond fabriqué. Voir `docs/architecture/agent-orchestration.md`.
- [x] V27 — Cockpit Execution Result Review : le résultat terminal d'une exécution isolée du cockpit est projeté via un contrat GUI dédié fail-closed (`src/gui/desktop/execution-result-contract.ts`, `ExecutionResultDetail`) plutôt que casté brut et affiché en JSON technique. Statut, fichiers modifiés, validation, export de patch et échec structuré restent lisibles sans dump JSON ; aucune application de patch, commit, push ou merge ajoutée. Voir `docs/architecture/gui-cockpit.md`.
- [x] V28 — Cockpit Run History Drill-down : le cockpit consomme la lecture Run History existante via `loop:runs`, IPC explicite read-only borné à 20, et un contrat GUI fail-closed. Il affiche plusieurs runs récents, leur détail compact, `cancelled` et les lignes corrompues déjà comptées par le Core, sans lecture JSONL renderer, sans nouvelle persistence ni effet sur policy/sélection.
- [x] V29 — Agent Decision Intelligence : la sélection existante transmet désormais les allow-lists provider/runtime effectivement fusionnées au sélecteur, conserve les profils rejetés et les alternatives admissibles non retenues sous forme compacte, puis stabilise cette décision face à un ordre de registry équivalent. Aucun nouveau selector, budget, provider ou appel IA ; voir `docs/architecture/agent-orchestration.md` et `docs/architecture/agent-policy-engine.md`.

## Gel architectural

- Aucun nouveau lot V15+ n'est désormais bloqué par le decision gate précédent : `runLoopExecute`/`runLoopCommit` ont été intégrés et démontrés en conditions réelles sur un projet non-fixture, avec commit borné explicite (`docs/audits/real-controlled-commit-pilot.md`).
- [x] V22.0 — Durcir le contenu des candidats multi-lignes afin de conserver le chemin cible et les contraintes dans le prompt.
- [x] V22.1 — Exiger une frontière candidate explicite en début de ligne afin que la prose contenant « prochain lot », « lot » ou « TODO » ne soit jamais sélectionnée comme travail exécutable.
      Préserver les formats explicites historiques (`- [ ]`, `TODO`, `Prochain`, `Lot`, `H1-L` à `H3-L`, `⏳`) et livrer la couverture adversariale dans le même lot.
- Une abstraction nouvelle exige deux usages réels, deux implémentations réelles ou une frontière externe démontrée.
- Les objets intermédiaires internes restent libres de refactor et ne deviennent pas des contrats versionnés par défaut.
- Les prochains changements doivent rendre la boucle plus utilisable, plus sûre ou plus observable dans un scénario exécuté.

## Discipline de livraison

- Un lot doit produire une capacité observable avec une sortie terminale claire.
- Les tests adversariaux essentiels livrent avec la capacité ; ils ne deviennent pas une série autonome de micro-lots.
- Aucun nouveau lot test-only sans risque démontré, invariant manquant ou régression réelle.
- Le burn-in doit utiliser les providers et contrats existants, sans ajouter de nouvelle couche de préparation, projection, admission, dispatch, handoff ou publication.

## Axe Job Package portable

Voir `docs/architecture/job-package-portable-contract.md` pour l'audit complet.

- [x] Lot JP0 — Audit du contrat Job Package portable : comparaison factuelle de `LoopExecutionPlan`, du Project Handoff JSON et de `BoundaryHandoff` (usages réels, champs consommés, données host-specific), démonstration du problème de portabilité du chemin physique porté par `project: ProjectConfig` dans `LoopExecutionPlan`, et décision retenue de faire évoluer `LoopExecutionPlan` plutôt que de créer un nouveau type ou de réutiliser le Project Handoff. Aucune modification de `src/**`.
- [x] Lot JP1 — Séparer le contrat gouverné `LoopExecutionPlan` du contexte physique local d'invocation du `LoopExecutor` : `LoopExecutor` reçoit désormais un second paramètre `cwd` explicite ; `runLoopExecute` le fournit depuis `executionProject.path` qu'il connaît déjà (y compris pour un worktree isolé via `executionProjectPath`), sans changer son calcul ; `claude-code-cli-executor.ts` et `codex-cli-executor.ts` consomment ce `cwd` fourni séparément au lieu de lire `plan.project.path` ; le failover provider (`provider-failover.ts`, `provider-failover-evidence-executor.ts`) propage le même `cwd` à chaque tentative. `project: ProjectConfig` reste dans le plan pour compatibilité ; seule sa consommation comme emplacement physique par les executors est éliminée. Aucun resolver host, health check, routing ou worker selection ajouté. Voir `docs/architecture/job-package-portable-contract.md` (section « JP1 — réalisé »).
- [x] Lot JP2 — Retirer `ProjectConfig` de `LoopExecutionPlan` : l'audit post-JP1 confirme que seul `project.name` est encore effectivement consommé depuis `LoopExecutionPlan.project` (par les deux executors CLI, pour le texte du prompt) ; aucun autre champ de `ProjectConfig` (`path`, `type`, `docs`, `roadmap`, `validation`) n'est lu à travers le plan gouverné. `LoopExecutionPlan.project` est désormais `Readonly<{ name: string }>` au lieu de `ProjectConfig` complet ; `runLoopExecute` construit ce sous-ensemble explicitement depuis `executionProject.name` ; `claude-code-cli-executor.ts` et `codex-cli-executor.ts` n'ont pas changé de comportement (ils ne lisaient déjà que `plan.project.name`). Le `cwd` continue d'être fourni exclusivement via le second paramètre `LoopExecutor` introduit par JP1, jamais par le plan ; le failover conserve exactement le même `cwd` pour toutes ses tentatives. `LoopValidatorInput.project` et `LoopRepairerInput.project` restent des `ProjectConfig` complets (contrats distincts, hors périmètre). Aucun contrat JSON public existant n'est modifié. Aucun nouveau type `JobPackage`, resolver host, mapping projectName → chemin, worker registry, health check, routage multi-environnement, failover de worker, provisioning de workspace ou intégration OpenClaw. Tests : `plan.project` ne contient plus que `{ name }` et un `project.path` source différent ne change plus le plan produit ; `tests/integration/isolated-provider-execution.test.ts` observe désormais le `cwd` explicite au lieu de `plan.project.path` pour démontrer l'isolation entre projets. Voir `docs/architecture/job-package-portable-contract.md` (section « JP2 — réalisé »).
