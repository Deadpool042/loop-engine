# Audit Engine V4 — Rapport final

## Résumé

Audit Engine V4 transforme le moteur d'audit en système profilable.

Le cycle V4 introduit :

- des profils d'audit typés ;
- des définitions de profils centralisées ;
- une sélection de règles par profil ;
- le routage CLI via `--profile` ;
- des contrôles CI dédiés aux profils ;
- la couverture des erreurs publiques de `--profile` ;
- la documentation utilisateur et architecture associée.

## État final

À la fin de V4.16, le moteur contient 81 règles exécutables :

- 29 règles JSON ;
- 1 règle CLI ;
- 11 règles docs ;
- 40 règles architecture.

Toutes les règles sont en pass.

Score attendu : 100.

## Profils publics

Les profils publics sont :

- `quick` ;
- `strict` ;
- `release` ;
- `docs` ;
- `json` ;
- `architecture`.

Chaque profil est typé, défini, sélectionnable et vérifié en CI.

## Couverture CLI

Le CLI accepte l'option publique `--profile`.

Exemples :

- `pnpm loop audit --profile docs` ;
- `pnpm loop audit --json --profile json` ;
- `pnpm loop audit --json --profile architecture`.

Le runner reçoit ensuite l'option de profil et filtre les règles via les définitions centralisées.

## Couverture CI

Le script `pnpm run audit:profiles` exécute `scripts/audit-profile-check.ts`.

Il vérifie :

- les profils valides ;
- les catégories attendues par profil ;
- le profil inconnu ;
- le profil manquant ;
- les codes de sortie non nuls pour les erreurs publiques.

Ce contrôle est intégré à `pnpm run ci`.

## Structure interne

Le script `scripts/audit-profile-check.ts` est organisé autour de :

- `PROFILE_EXPECTATIONS` ;
- `FAILURE_EXPECTATIONS` ;
- `runAuditProfileCommand` ;
- `assertExpectedCategories` ;
- `assertCommandFails`.

Cette structure évite la duplication et rend l'ajout de nouveaux profils ou scénarios plus simple.

## Règles ajoutées pendant V4

Le cycle V4 ajoute les règles suivantes :

- `AUDIT-030` à `AUDIT-040` ;
- `DOCS-006` à `DOCS-011`.

## Bilan

Audit Engine V4 ferme la boucle des profils d'audit.

Le système sait maintenant :

- exposer des profils publics ;
- filtrer les règles par profil ;
- documenter les profils ;
- tester tous les profils en CI ;
- tester les erreurs publiques ;
- documenter la structure de contrôle.

Le socle est prêt pour un prochain cycle orienté rapport, scoring avancé ou recommandations.
