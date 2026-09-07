# V52.0 — Événement canonique gate.blocked

## Statut

- Décision : planifiée.
- Priorité : P0.
- Projet : Loop Engine.
- Parent transversal : OpenClaw Control OC-10.

## Objectif

Étendre la projection agrégée existante `completion-events --json` avec un événement déterministe `gate.blocked` lorsqu’un projet est réellement bloqué par sa première gate canonique.

Le lot ne crée aucun moteur de notification : il expose uniquement un fait gouverné supplémentaire pour les consommateurs read-only existants.

## État existant à préserver

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
- `docs/roadmap/loop-engine.md`
- `docs/roadmap/actionable-notifications-v52.md`

## Hors périmètre

- n8n ;
- ntfy ;
- OpenClaw UI ;
- Development Workspace ;
- nouveau scheduler ;
- nouvelle persistence ;
- nouveau type de gate ;
- modification des règles d’admissibilité ou de sélection ;
- appels IA ;
- push, merge ou déploiement.

## Validation

- ajouter une couverture positive d’une gate bloquante ;
- vérifier l’idempotence du `eventId` ;
- vérifier qu’une condition non bloquante n’émet rien ;
- vérifier que `lot.completed` et `execution.failed` restent inchangés ;
- `pnpm run ci` vert.

## Critères de clôture

1. `completion-events --json` expose exactement un `gate.blocked` pour une gate canonique bloquante ;
2. le même état produit le même `eventId` ;
3. aucun événement n’est créé pour un état volontairement sans travail ;
4. aucun secret ni log brut n’est exposé ;
5. les événements existants ne régressent pas ;
6. CI verte.
