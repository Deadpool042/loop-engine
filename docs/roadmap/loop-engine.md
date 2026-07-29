# Roadmap — Loop Engine (auto-hébergé)

Roadmap interne de Loop Engine, lue par son propre roadmap reader (`pnpm loop next loop-engine`, `pnpm loop run loop-engine --mode plan`). Voir `docs/architecture/roadmap-reader.md` pour le format et la classification des candidats.

La source de décision actuelle est l'audit `docs/audits/architecture-delivery-readiness-v14.2u.md`.

## Baseline livrée

- [x] Lot V7.3 — Agent orchestration layer : types, registry, selector et escalade locale déterministe
- [x] Lot V7.4 — Agent Policy Engine et intégration prévisionnelle au LoopRunner
- [x] Lot V7.5 — Minimal Context Builder borné et déterministe
- [x] Lots V10–V13 — Runtime gardé, admission de politique, plans, receipts et projection publique opt-in
- [x] Lots V13.49–V13.68 — demande Runtime publique : decode, authorize, assemble et prepare
- [x] Lots V14.0–V14.2u — frontière inbound transport-neutral, authentification injectée, replay/security gates et hardening

## Lot actif

- [ ] Lot V14.3 — Prepared Inbound Runtime Execution Vertical Slice : relier la requête inbound préparée au Runtime policy-aware, avec dry-run, exécution simulée, receipt et résultat public redacted

## Séquence suivante — bloquée par V14.3

- V14.4 — LoopRunner execute, validation et réparation bornée ; aucun commit
- V14.5 — identité/ACL/replay concrets et un seul adapter inbound
- V14.6 — un provider réel pilote et mode commit contrôlé ; publish reste différé

## Discipline de livraison

- Un lot doit produire une capacité observable avec une sortie terminale claire.
- Les tests adversariaux essentiels livrent avec la capacité ; ils ne deviennent pas une série autonome de micro-lots.
- Aucun nouveau lot test-only sans risque démontré, invariant manquant ou régression réelle.
- V14.3 ne doit pas être découpé en lots adapter/facade/receipt/documentation séparés.
