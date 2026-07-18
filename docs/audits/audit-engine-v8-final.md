# Audit Engine V8.0 — Rapport final

## Livraison

V8.0 introduit un registre de règles typé, local et déterministe. `AUDIT_RULES`
reste sa source de vérité; aucun plugin, chargement dynamique, configuration
externe ou découverte runtime n'a été ajouté.

Les métadonnées normalisées sont : `introducedIn`, `tags`, `stability` et
`dependsOn`. Les versions historiques inconnues restent `null`; aucune version
n'a été inventée. Les dépendances sont seulement déclaratives.

## Contrats et compatibilité

- `AuditReport.schemaVersion` reste `1` et sa structure n'est pas modifiée.
- `audit --manifest` expose un contrat JSON distinct en `schemaVersion: 1`.
- Le manifeste est stable, sans `generatedAt`, et respecte l'ordre du registre.
- Les profils et les commandes CI existants restent non filtrés et inchangés.

## Contrôles V8

Les règles `AUDIT-073` à `AUDIT-078` vérifient automatiquement la complétude
des métadonnées, les tags, la stabilité, les dépendances, l'absence
d'auto-dépendance et la cohérence du manifeste.

Les filtres `--rule`, `--tag` et `--stability` sont additifs. Les valeurs
répétées sont réunies par dimension, les dimensions sont intersectées, et une
sélection vide échoue sans produire de score artificiel.

## Validation

État final attendu : audit strict à 100/100, tests complets et `json-check`
passants, y compris le manifeste.
