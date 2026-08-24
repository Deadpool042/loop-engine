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

## Lot actif — burn-in vertical

- [x] Burn-in 1 — Ajouter `tests/integration/claude-code-provider-burn-in.test.ts` en réutilisant `tests/fixtures/fake-claude/claude`. Le test doit exécuter le chemin `LoopApplicationAssembly -> LoopExecutor -> worktree observation` dans un dépôt Git temporaire, faire créer exactement un fichier par le faux provider, vérifier que `modifiedFiles` reflète exactement ce fichier, puis valider avec `pnpm exec tsx --test tests/integration/claude-code-provider-burn-in.test.ts`. Aucun provider réel, aucune nouvelle abstraction, aucun commit, push ou publish.
- [x] Burn-in 2 — Ajouter `tests/integration/claude-code-provider-repeated-burn-in.test.ts` couvrant plusieurs exécutions successives dans un même dépôt Git temporaire (isolation du delta après re-baseline explicite, refus `worktree_not_clean` sur état préexistant non attribué, échec sans faux delta ni contamination). Invariant démontré : le delta observé par une exécution ne dépend que de l'état du worktree au moment de cette exécution, jamais d'une exécution précédente. Aucun provider réel, aucune nouvelle abstraction de production, aucun commit, push ou publish depuis le moteur.
- [x] Burn-in 3 — Campagne réelle de 3 exécutions du CLI `claude` contre un dépôt Git temporaire dédié, hors moteur (`docs/audits/real-provider-pilot-burn-in.md`). Chaque run a produit exactement le fichier attendu sans contamination inter-run.
- [x] Burn-in 4 — Intégration `runLoopExecute -> validation -> runLoopCommit` dans un vrai dépôt Git temporaire : le faux provider crée un seul fichier, la validation passe, le committer Git réel crée un commit borné contenant exactement ce fichier et laisse le worktree propre (`tests/integration/controlled-commit-burn-in.test.ts`).
- [x] Burn-in 5 — Exécution réelle de `runLoopExecute` → validation réelle → `runLoopCommit` → commit Git réel sur un dépôt non-fixture (`docs/audits/real-controlled-commit-pilot.md`). Commit borné produit, ne contenant que le fichier validé.

## Lot actif — cockpit d’exécution observable

- [x] Lot V23.0 — Observable GUI execution session : session unique observable validée en burn-in réel LP-INFRA H3-L2, avec progression `préparation -> provider -> validation -> terminé/échec`, garde-fous de scope effectifs, résultat final inchangé et export de patch sans modification du dépôt source.
- [x] Lot V23.1 — Recoverable isolated project locks : verrous locaux par projet publiés atomiquement avec metadata propriétaire, récupération uniquement lorsque le PID local est démontré mort, état ambigu fail-closed, quarantaine générationnelle anti-race et release protégée par identité de lock. Burn-in réel validé le 2026-08-18 sur `lp-infra` : un lock canonique valide avec PID réellement mort a été récupéré automatiquement, déplacé en quarantaine, remplacé puis relâché ; l’exécution s’est ensuite bloquée sur `sha_stale` avant tout appel provider. Aucun parallélisme multi-projet, aucune queue, aucun terminal, aucun contrôle distant/mobile ajouté.

## Lot V24 — Planning state & deterministic roadmap discovery

- [x] V24.0 — état de planning explicite (`roadmap`, `maintenance`, `deferred`, `external`) et découverte bornée des seuls emplacements conventionnels dans le root d'un projet déjà déclaré. Aucune lecture de contenu, aucun scan global ou récursif et aucune création de travail.
- [x] V24.1 — `loop roadmap status <project> [--json]` : rapport déterministe, read-only, distinguant roadmap configurée, roadmap détectée non raccordée, absence réelle, maintenance, report et source externe. Le parser, `next`, l'admissibilité et le runner restent inchangés.
- [x] V24.2 — Run History / Execution Evidence Store : persistance append-only, project-scoped du résultat terminal de chaque cycle `run` (`.loop-engine/runs/<project>.jsonl`) et lecture bornée `loop runs <project> [--json] [--limit N]`, la plus récente d'abord. Observabilité pure — aucun détecteur de stagnation, circuit breaker ou cap de dépense cumulée ; ces capacités restent différées jusqu'à preuve d'usage réel. Voir `docs/architecture/autonomous-loop-runner.md` (section « Run History »).
- [x] V24.3 — Cockpit work availability overview : le `summary --json` projette, pour chaque projet, l'admissibilité de travail déjà calculée par Project Intelligence et le dernier résultat terminal du Run History ; le cockpit les affiche dans la liste multi-projets sans recalcul de policy, sans lecture directe des journaux JSONL et sans nouvelle écriture.
- [x] V24.4 — Frontière d'écriture gouvernée des projets observés : lecture seule par défaut, avec l'unique exception actuellement configurée `execution_decision` bornée à l'artefact déclaré, soumise à approbation humaine, confinement de chemin, publication transactionnelle, validation post-écriture et récupération ; `DOCS-026` protège l'alignement doctrine/configuration/implémentation sans autoriser d'écriture générale ni déplacer la logique métier du projet observé.

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
