# V52.0 — Événement canonique gate.blocked

## Statut

- Décision : implémentée et validée.
- Priorité : P0.
- Projet : Loop Engine.
- Parent transversal : OpenClaw Control OC-10.
- Preuve : PR #282, CI run `34150858465` verte.

## Objectif

`gate.blocked` est désormais projeté dans la projection agrégée existante `completion-events --json` à partir du snapshot canonique complet. La réalisation finale évite de dépendre de la projection roadmap bornée afin qu’un long historique de lots terminés ne puisse pas masquer le premier candidat ouvert bloqué.

Claude Code peut explorer le code en interne pour comprendre l’implémentation, mais l’exploration n’est pas un livrable : aucun fichier ou rapport d’exploration séparé ne doit être créé.

## Livrables

1. Modifier `src/commands/completion-events.ts` pour projeter `gate.blocked`.
2. Compléter `tests/commands/completion-events.test.ts` avec couverture positive, négative et idempotence.
3. Aligner `tests/core/roadmap-proposal-report.test.ts` sur le profil `balanced` attendu tant que V52 constitue du travail ouvert borné.
4. Mettre à jour `docs/roadmap/actionable-notifications-v52.md` et `docs/roadmap/loop-engine.md` comme partie du delta final.

## Contexte

- `lot.completed` est déjà projeté.
- `execution.failed` est déjà projeté et qualifié.
- `completion-events --json` est le contrat agrégé consommé par le reader n8n.
- l’ordre roadmap et les phase gates proviennent de la projection canonique existante.

## Comportement attendu

Émettre `gate.blocked` uniquement lorsque l’état canonique démontre qu’aucun travail ne peut démarrer parce que la frontière courante est bloquée par une gate.

Contrat minimal :

```json
{
  "schemaVersion": 1,
  "type": "gate.blocked",
  "eventId": "<32 hex>",
  "project": { "name": "<project>" },
  "candidate": { "id": "<candidate>" },
  "gate": {
    "fingerprint": "<stable bounded fingerprint>"
  }
}
```

Règles :

- `eventId` stable pour le même projet, candidat et même état de gate ;
- aucun timestamp synthétique nécessaire ;
- une gate inchangée doit produire le même `eventId` ;
- une gate réellement différente peut produire un nouvel `eventId` ;
- aucun secret, credential, contenu libre non borné ou log brut ;
- aucun événement si le projet est simplement en maintenance, roadmap épuisée ou sans travail volontaire ;
- ne pas modifier `lot.completed` ni `execution.failed`.

## Périmètre d’écriture

- `src/commands/completion-events.ts`
- `tests/commands/completion-events.test.ts`
- `tests/core/roadmap-proposal-report.test.ts`
- `docs/roadmap/loop-engine.md`
- `docs/roadmap/actionable-notifications-v52.md`

## Frontière provider / validation

Claude Code produit uniquement le delta borné dans le worktree isolé.

- Claude ne doit pas exécuter `pnpm run ci`, attendre la CI ou conditionner son travail à son résultat.
- Loop Engine exécute les validations configurées après le retour du provider.
- la mise à jour de la source de planning fait partie du delta provider et ne dépend pas d’un résultat de CI observé par Claude.
- la publication candidate n’a lieu qu’après validation verte par Loop Engine.

## Hors périmètre

- rapport ou fichier d’exploration séparé ;
- n8n ;
- ntfy ;
- OpenClaw UI ;
- Development Workspace ;
- nouveau scheduler ;
- nouvelle persistence ;
- nouveau type de gate ;
- modification des règles d’admissibilité ou de sélection ;
- appels IA supplémentaires hors runtime sélectionné ;
- push, merge ou déploiement.

## Validation

Après le retour du provider, Loop Engine :

- vérifie une couverture positive d’une gate bloquante ;
- vérifie l’idempotence du `eventId` ;
- vérifie qu’une condition non bloquante n’émet rien ;
- vérifie que `lot.completed` et `execution.failed` restent inchangés ;
- aligne `tests/core/roadmap-proposal-report.test.ts:353` sur le profil `balanced` réellement attendu tant que V52 constitue du travail ouvert borné ; la CI actuelle échoue avec `actual: balanced` / `expected: economy` ;
- exécute `pnpm run ci`.

## Preuves de validation

- `pnpm run typecheck` : vert ;
- `pnpm run json-check` : vert ;
- `pnpm run audit:strict` : vert, 560/560 ;
- `pnpm run audit:profiles` : vert ;
- PR #282, CI run `34150858465` : succès ;
- suite standard nettoyée de 372 à 326 fichiers de test ; 4 burn-ins historiques restent disponibles via `pnpm run test:burnin`.

## Critères de clôture

1. `completion-events --json` expose exactement un `gate.blocked` pour une gate canonique bloquante — **validé**.
2. Le même état produit le même `eventId` — **validé**.
3. Aucun événement n’est créé pour un état volontairement sans travail — **validé**.
4. Aucun secret ni log brut n’est exposé — **validé**.
5. Les événements existants ne régressent pas — **validé**.
6. CI verte — **validé**.
