# V56 — Événements canoniques de progression d’exécution

## Objectif

Exposer les transitions déjà persistées par l’exécution durable de Loop Engine sous forme d’événements bornés, ordonnés et transport-neutral afin qu’une UI externe puisse se mettre à jour en push sans polling, sans lecture directe du stockage interne et sans dupliquer le Run History.

## Constat de départ

Loop Engine possède déjà la source de vérité nécessaire :

- le durable record contient `status`, `revision`, `updatedAt`, `progress` et `progressEvents` ;
- `execution-status` projette une timeline bornée jusqu’à 32 événements ;
- les progressions décrivent déjà l’étape, le statut, le timestamp, les détails bornés et l’exécuteur ;
- les états terminaux, validation, réparations et failovers restent dans le résultat canonique.

Le gap est uniquement événementiel : les mises à jour sont persistées, mais aucune primitive transport-neutral ne signale encore à un consommateur qu’une nouvelle révision est disponible.

## Principes

- Loop Engine reste la seule source de vérité de l’exécution.
- Aucun événement ne transporte de secret, stdout/stderr brut, prompt, réponse provider ou contenu de fichier.
- Aucun nouveau ledger : l’événement référence la révision durable existante.
- Aucun scheduler, watcher filesystem ou poller.
- Aucun changement du selector AUTO, du provider, du modèle, des permissions Git ou de la publication candidate.
- Un consommateur doit pouvoir perdre un événement puis se resynchroniser via `execution-status`.
- L’ordre est défini par la révision durable monotone, pas par l’horloge murale seule.

## Contrat cible

Introduire une projection publique minimale de type `execution.progressed` :

- `schemaVersion`
- `type = execution.progressed`
- `project`
- `idempotencyKey` ou identité bornée équivalente
- `runId` si déjà connu
- `revision`
- `status`
- `step`
- `updatedAt`
- `terminal` booléen

L’événement ne duplique pas la timeline. Après réception, le consommateur relit `execution-status <project>` pour obtenir le snapshot canonique complet.

## Checklist

### A — Contrat et invariants

- [x] Définir un type public borné d’événement de progression à partir de `DurableExecutionRecord`.
- [x] Garantir une identité de déduplication stable basée sur projet + exécution + révision.
- [x] Garantir que les révisions sont strictement monotones pour une même exécution.
- [x] Garder les payloads redacted et indépendants du provider.

### B — Émission

- [x] Émettre après chaque sauvegarde durable réussie qui change l’état observable : acquisition/recovery utile, progression, terminal et annulation.
- [x] Ne jamais émettre avant la persistance.
- [x] Une erreur du sink événementiel ne doit jamais faire échouer l’exécution.
- [x] Ne pas émettre de doublon pour une même révision.

### C — Frontière transport-neutral

- [x] Injecter un sink/callback optionnel plutôt qu’un transport réseau dans Core.
- [x] Conserver le comportement actuel bit-for-bit lorsque le sink est absent.
- [x] Fournir une projection sérialisable et testée que Development Workspace/OpenClaw pourra transporter sans lire les fichiers internes.

### D — Tests et burn-in

- [x] Couvrir ordre, déduplication, progression, terminal, recovery et perte/échec du sink.
- [x] Vérifier qu’un snapshot `execution-status` permet toujours la resynchronisation après événement perdu.
- [ ] Validation canonique complète verte.
- [x] Aucun nouveau stockage ni modification de Run History.

## Critères de clôture

V56 est terminé lorsque Loop Engine peut signaler de façon déterministe qu’une nouvelle révision d’exécution durable existe, sans transporter la timeline elle-même, sans polling et sans couplage OpenClaw. L’intégration OpenClaw/Feature Plugin reste explicitement hors de ce lot et sera réalisée dans OC-29.
