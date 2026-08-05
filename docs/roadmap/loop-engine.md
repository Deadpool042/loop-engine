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

## Lot actif — burn-in vertical

- [x] Burn-in 1 — Ajouter `tests/integration/claude-code-provider-burn-in.test.ts` en réutilisant `tests/fixtures/fake-claude/claude`. Le test doit exécuter le chemin `LoopApplicationAssembly -> LoopExecutor -> worktree observation` dans un dépôt Git temporaire, faire créer exactement un fichier par le faux provider, vérifier que `modifiedFiles` reflète exactement ce fichier, puis valider avec `pnpm exec tsx --test tests/integration/claude-code-provider-burn-in.test.ts`. Aucun provider réel, aucune nouvelle abstraction, aucun commit, push ou publish.
- [x] Burn-in 2 — Ajouter `tests/integration/claude-code-provider-repeated-burn-in.test.ts` couvrant plusieurs exécutions successives dans un même dépôt Git temporaire (isolation du delta après re-baseline explicite, refus `worktree_not_clean` sur état préexistant non attribué, échec sans faux delta ni contamination). Invariant démontré : le delta observé par une exécution ne dépend que de l'état du worktree au moment de cette exécution, jamais d'une exécution précédente. Aucun provider réel, aucune nouvelle abstraction de production, aucun commit, push ou publish depuis le moteur.
- [x] Burn-in 3 — Campagne réelle de 3 exécutions du CLI `claude` contre un dépôt Git temporaire dédié, hors moteur (`docs/audits/real-provider-pilot-burn-in.md`). Chaque run a produit exactement le fichier attendu sans contamination inter-run.
- [x] Burn-in 4 — Intégration `runLoopExecute -> validation -> runLoopCommit` dans un vrai dépôt Git temporaire : le faux provider crée un seul fichier, la validation passe, le committer Git réel crée un commit borné contenant exactement ce fichier et laisse le worktree propre (`tests/integration/controlled-commit-burn-in.test.ts`).
- [x] Burn-in 5 — Exécution réelle de `runLoopExecute` → validation réelle → `runLoopCommit` → commit Git réel sur un dépôt non-fixture (`docs/audits/real-controlled-commit-pilot.md`). Commit borné produit, ne contenant que le fichier validé.

## Gel architectural

- Decision gate levé : `runLoopExecute`/`runLoopCommit` ont été intégrés et démontrés en conditions réelles sur un projet non-fixture, avec commit borné explicite (`docs/audits/real-controlled-commit-pilot.md`).
- Prochain candidat explicite : durcir le format de roadmap candidate (ou la construction du prompt) pour que le contenu cible reste toujours capté sur la ligne candidate, évitant la classe d'échec observée aux runs 1–3 du burn-in 5.
- Une abstraction nouvelle exige deux usages réels, deux implémentations réelles ou une frontière externe démontrée.
- Les objets intermédiaires internes restent libres de refactor et ne deviennent pas des contrats versionnés par défaut.
- Les prochains changements doivent rendre la boucle plus utilisable, plus sûre ou plus observable dans un scénario exécuté.

## Discipline de livraison

- Un lot doit produire une capacité observable avec une sortie terminale claire.
- Les tests adversariaux essentiels livrent avec la capacité ; ils ne deviennent pas une série autonome de micro-lots.
- Aucun nouveau lot test-only sans risque démontré, invariant manquant ou régression réelle.
- Le burn-in doit utiliser les providers et contrats existants, sans ajouter de nouvelle couche de préparation, projection, admission, dispatch, handoff ou publication.
