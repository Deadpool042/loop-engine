# Architecture Loop Engine

Loop Engine est un orchestrateur local, sobre et déterministe.

## Principes

- Pas d'IA automatique en V0.
- Pas de modification des projets pilotés.
- Pas de commit automatique.
- Pas de push automatique.
- Les appels IA doivent être explicites.
- Les validations locales passent avant toute revue IA.
- Aucun processus local ne s'exécute par défaut : le backend interne
  `local-process` exige une autorisation explicite par l'API Core.

## Responsabilités

Loop Engine peut :

- scanner les projets configurés ;
- détecter l'état Git ;
- vérifier la présence des documents importants ;
- afficher les commandes de validation ;
- préparer un contexte court pour un modèle IA.

Loop Engine ne doit pas :

- modifier Creatyss, lp-infra ou n8n sans commande explicite ;
- lancer des agents en boucle ;
- consommer des tokens en continu ;
- contourner la validation humaine.

## Philosophie

Automatiser le déterministe.
Limiter l'IA au jugement.
Garder l'humain sur les décisions.

## Runtime interne

La couche `src/runtime/` est derrière `src/core/`. V10.0 définit ses contrats
et stubs ; V10.1 y ajoute un backend local gardé, sans nouvelle commande CLI ni
mode `execute` public. V10.2 intercale `src/providers/` pour préparer des plans
fournisseur inertes, jamais des appels IA. V10.3 ajoute `src/transports/` : la
seule frontière qui peut déléguer explicitement au backend `local-process`.
Voir `docs/architecture/runtime-abstraction.md`,
`docs/architecture/provider-adapters.md` et
`docs/architecture/transport-adapters.md`.

V10.4 ajoute un protocole de planification OpenClaw sous `src/providers/`, sans
mapping exécutable et sans changement CLI. Voir
`docs/architecture/openclaw-provider-protocol.md`.

V11.0 établit le RFC normatif d'exécution. V11.1 ajoute le contrat
`src/transport-request/` comme demande déclarative, inactive, non dispatchable
et non exécutable entre l'autorisation et une future frontière de transport.
Voir `docs/architecture/rfc-execution-architecture-v11.md` et
`docs/architecture/transport-request.md`.

V11.2 ajoute `TransportRequestBuilder`, unique mécanisme supporté pour produire
une `TransportRequest` depuis un `ProviderExecutionPlan` et une
`AuthorizationConfiguration`. Le builder reste pur, déterministe, sans Runtime,
sans Transport et sans payload exécutable. Voir
`docs/architecture/transport-request-builder.md`.

V11.3 ajoute `ExecutionReviewGate`, unique mécanisme supporté pour produire une
`ReviewedTransportRequest` déclarative depuis une `TransportRequest` et une
`AuthorizationConfiguration`. La requête revue reste non approuvée, non
dispatchable et non exécutable. Voir
`docs/architecture/execution-review-gate.md`.

V11.4 ajoute `ApprovalProvenance`, contrat immuable décrivant les preuves de
revue associées à une `ReviewedTransportRequest` : identifiant abstrait,
périmètre, statut et versions revues. La provenance reste une preuve
descriptive, jamais une autorisation d'exécuter. Voir
`docs/architecture/approval-provenance.md`.

V11.5 ajoute `HandoffEligibility`, évaluation déclarative et immuable de la
cohérence entre `ReviewedTransportRequest` et `ApprovalProvenance`. Le résultat
reste une appréciation locale : aucune autorisation, aucun handoff, aucun
`TransportAdapterRequest` et aucune exécution ne sont créés. Voir
`docs/architecture/handoff-eligibility.md`.

V11.6 consolide les couches déclaratives V11 sans changer leurs contrats :
`TransportRequest`, `TransportRequestBuilder`, `ExecutionReviewGate`,
`ApprovalProvenance` et `HandoffEligibility` conservent leurs responsabilités,
mais partagent désormais les helpers techniques d'immuabilité, métadonnées,
validation, diagnostics et résumés. Voir
`docs/architecture/v11-consolidation.md`.
