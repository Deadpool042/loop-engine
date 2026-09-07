# V52.0 — Événement canonique gate.blocked

## Statut

- Décision : planifiée.
- Priorité : P0.
- Projet : Loop Engine.
- Parent transversal : OpenClaw Control OC-10.

## Objectif

Implémenter directement l’événement déterministe `gate.blocked` dans la projection agrégée existante `completion-events --json`, à partir de l’état canonique existant.

Le provider peut explorer le code en interne pour comprendre l’implémentation, mais **l’exploration n’est pas un livrable** : aucun fichier `v52-exploration.md`, aucune note exploratoire séparée et aucun rapport de découverte ne doivent être créés.

## Livrables provider

Le delta produit par Claude Code doit contenir des changements concrets, uniquement dans le périmètre d’écriture :

1. modifier `src/commands/completion-events.ts` pour projeter `gate.blocked` ;
2. compléter `tests/commands/completion-events.test.ts` avec les cas positifs, négatifs et l’idempotence ;
3. aligner `tests/core/roadmap-proposal-report.test.ts` sur le profil `balanced` attendu tant que V52 est du travail ouvert borné ;
4. mettre à jour `docs/roadmap/actionable-notifications-v52.md` et `docs/roadmap/loop-engine.md` comme partie du delta final.

## État existant à préserver

- `lot.completed` est déjà projeté ;
- `execution.failed` est déjà projeté et qualifié ;
- `completion-events --json` est le contrat agrégé consommé par le reader n8n ;
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

Aucun autre fichier ne doit être créé ou modifié.

## Frontière provider / validation

Claude Code produit uniquement le delta borné dans le worktree isolé.

- Claude ne doit pas exécuter `pnpm run ci`, attendre la CI ou conditionner son travail à son résultat ;
- Loop Engine exécute les validations configurées après le retour du provider ;
- la mise à jour de la source de planning fait partie du delta provider et ne dépend pas d’un résultat de CI observé par Claude ;
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
- exécute `pnpm run ci`.

## Critères de clôture

1. `completion-events --json` expose exactement un `gate.blocked` pour une gate canonique bloquante ;
2. le même état produit le même `eventId` ;
3. aucun événement n’est créé pour un état volontairement sans travail ;
4. aucun secret ni log brut n’est exposé ;
5. les événements existants ne régressent pas ;
6. CI verte.
