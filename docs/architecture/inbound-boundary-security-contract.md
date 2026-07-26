# Contrat de sécurité de la frontière entrante

## Statut V14.0a

V14.0a introduit le contrat de sécurité déclaratif d'une future frontière
entrante (inbound boundary). Aucun transport réel, serveur HTTP, socket,
endpoint webhook, appel réseau, SDK de provider ou backend de credentials
n'est ajouté. Ce lot ne fait que définir — et évaluer de façon pure — le
modèle de données de sécurité qui devra exister avant qu'une requête externe
non fiable puisse entrer dans le chemin existant de préparation de la requête
publique Runtime (`decode -> authorize -> assemble -> prepare`).

```text
Requête entrante non fiable
  -> Preuve d'authentification (fournie par un transport/authenticator futur)
  -> Principal
  -> Tenant / domaine de sécurité
  -> Décision ACL
  -> Vérifications replay / identité de requête
  -> Requête publique Runtime autorisée (chaîne existante, inchangée)
```

## Modules

- `src/inbound-security/types.ts` — types déclaratifs : `InboundAuthenticationEvidence`,
  `InboundPrincipal`, `InboundAccessRequest`, `InboundReplayEvidence`,
  `InboundAccessPolicy`, `InboundSecurityDecision`.
- `src/inbound-security/errors.ts` — constructeurs purs des trois issues de
  décision (`allow` / `deny` / `indeterminate`).
- `src/inbound-security/validation.ts` — prédicats purs (vérification,
  expiration, correspondance de principal) sans accès à l'horloge système.
- `src/inbound-security/evaluation.ts` — `evaluateInboundSecurity(input, evaluatedAt)`,
  l'évaluateur pur et déterministe.
- `src/core/inbound-security.ts` — façade Core `evaluateInboundSecurityAndPrepareLoopRuntimeRequest`,
  seule frontière autorisée à conditionner l'appel à la chaîne existante
  `prepareAuthorizedLoopRuntimeRequest` (voir
  `loop-runtime-public-request-prepared-entry.ts`) à une décision explicite
  `allow`.

## Preuve d'authentification externe à Core

`InboundAuthenticationEvidence` représente une preuve déjà obtenue et vérifiée
par un transport/authenticator futur. Ce type n'authentifie jamais lui-même :
Core consomme une preuve déjà vérifiée (`verified: boolean`), avec une
empreinte/référence de credential (`credentialFingerprint`) — jamais de jeton,
mot de passe, clé, cookie ou secret brut.

## Décision ACL explicite et fail-closed

`evaluateInboundSecurity` est pure, déterministe, immuable et ne lit jamais
l'horloge, le hasard, le système de fichiers, le réseau ou l'environnement de
process — l'heure d'évaluation (`evaluatedAt`) et toutes les entrées sont
fournies explicitement par l'appelant. Le défaut est toujours `deny`. Les
raisons de refus sont distinguées explicitement : preuve absente, preuve
invalide, preuve expirée ou pas encore valide, principal non correspondant,
tenant non correspondant, opération non autorisée, preuve replay absente ou
rejetée. L'absence de principal, seule, produit une décision `indeterminate`
plutôt qu'un `deny` typé — mais la façade Core traite tout résultat autre que
`allow` explicite comme un refus d'accès à la chaîne existante.

## État de replay externe à Core

`InboundReplayEvidence` ne persiste, ne cache et ne stocke aucun nonce. Core
consomme une preuve de replay fournie explicitement par un futur adaptateur
externe ; il ne maintient aucun état de replay lui-même.

## Frontière de composition

`evaluateInboundSecurityAndPrepareLoopRuntimeRequest` est l'unique point qui
peut conditionner la chaîne publique existante. L'invariant critique :
qu'aucun appel à `prepareAuthorizedLoopRuntimeRequest` (et donc aucun appel à
l'assembleur, à la résolution Runtime, ou à l'exécution) ne peut se produire
avant qu'une décision explicite `allow` ait été retournée. Sur `deny` ou
`indeterminate`, la façade retourne immédiatement sans invoquer la chaîne
existante ; sur `allow`, elle l'invoque exactement une fois, avec uniquement
le `principalId` de la décision — jamais la preuve d'authentification.

Cette couche ne remplace ni l'Agent Policy Engine, ni l'admission Runtime
existante (`src/policy/`) : elle s'ajoute en frontière extérieure. Aucun
transport n'existe encore ; aucune vérification cryptographique réelle de
credential n'existe encore — ces éléments appartiennent à de futurs lots V14.

## Audit

- `AUDIT-426` — le contrat (`types.ts`, `evaluation.ts`, `inbound-security.ts`,
  export Core) reste déclaratif, sans secret, et l'évaluateur reste libre de
  tout accès horloge/fichier/réseau/process.
- `AUDIT-427` — la façade Core conditionne l'appel à
  `prepareAuthorizedLoopRuntimeRequest` à la décision explicite `allow`, dans
  cet ordre, sans appel inconditionnel.
