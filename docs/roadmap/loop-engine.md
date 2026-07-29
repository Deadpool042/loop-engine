# Roadmap — Loop Engine (auto-hébergé)

Roadmap interne de Loop Engine, lue par son propre roadmap reader (`pnpm loop next loop-engine`, `pnpm loop run loop-engine --mode plan`). Voir `docs/architecture/roadmap-reader.md` pour le format et la classification des candidats.

La source de décision reste l'audit `docs/audits/architecture-delivery-readiness-v14.2u.md`; l'architecture V14.3 est documentée dans `docs/architecture/prepared-inbound-runtime-execution.md`.

## Baseline livrée

- [x] Lot V7.3 — Agent orchestration layer : types, registry, selector et escalade locale déterministe
- [x] Lot V7.4 — Agent Policy Engine et intégration prévisionnelle au LoopRunner
- [x] Lot V7.5 — Minimal Context Builder borné et déterministe
- [x] Lots V10–V13 — Runtime gardé, admission de politique, plans, receipts et projection publique opt-in
- [x] Lots V13.49–V13.68 — demande Runtime publique : decode, authorize, assemble et prepare
- [x] Lots V14.0–V14.2u — frontière inbound transport-neutral, authentification injectée, replay/security gates et hardening
- [x] Lot V14.3 — Prepared Inbound Runtime Execution Vertical Slice : dry-run sans effet, admission Runtime, exécution bornée et receipt public redacted

## Lot actif

- [ ] Lot V14.4 — LoopRunner Execute and Validation Cycle : exécuteur injecté, fichiers modifiés, validation/audit et réparation bornée ; aucun commit ni publish

## Séquence suivante — bloquée par V14.4

- V14.5 — identité/ACL/replay concrets et un seul adapter inbound
- V14.6 — un provider réel pilote et mode commit contrôlé ; publish reste différé

## Discipline de livraison

- Un lot doit produire une capacité observable avec une sortie terminale claire.
- Les tests adversariaux essentiels livrent avec la capacité ; ils ne deviennent pas une série autonome de micro-lots.
- Aucun nouveau lot test-only sans risque démontré, invariant manquant ou régression réelle.
- V14.4 doit livrer le cycle execute/validate/repair comme une capacité cohérente, sans micro-lots par état ou helper.
