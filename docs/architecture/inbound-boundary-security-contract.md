# Contrat de sécurité de la frontière entrante

## Statut V14.0a–V14.0b

V14.0a introduit le contrat de sécurité déclaratif d'une future frontière
entrante (inbound boundary). V14.0b ajoute devant ce contrat un port explicite
de vérification d'authentification injecté. Aucun transport réel, serveur HTTP,
socket, endpoint webhook, appel réseau, SDK de provider, backend de credentials
ou vérification cryptographique concrète n'est ajouté.

```text
Requête entrante non fiable
  -> Matériel d'authentification non fiable
  -> InboundAuthenticationVerifier injecté
  -> InboundAuthenticationEvidence vérifiée
  -> Principal
  -> Tenant / domaine de sécurité
  -> Décision ACL
  -> Vérifications replay / identité de requête
  -> Requête publique Runtime autorisée (chaîne existante, inchangée)
```

## Modules

- `src/inbound-security/types.ts` — types déclaratifs V14.0a :
  `InboundAuthenticationEvidence`, `InboundPrincipal`, `InboundAccessRequest`,
  `InboundReplayEvidence`, `InboundAccessPolicy`, `InboundSecurityDecision`.
- `src/inbound-security/errors.ts` — constructeurs purs des trois issues de
  décision (`allow` / `deny` / `indeterminate`).
- `src/inbound-security/validation.ts` — prédicats purs (vérification,
  expiration, correspondance de principal) sans accès à l'horloge système.
- `src/inbound-security/evaluation.ts` — `evaluateInboundSecurity(input, evaluatedAt)`,
  l'évaluateur ACL/replay pur et déterministe.
- `src/inbound-security/authentication-verification.ts` — contrat V14.0b :
  `InboundAuthenticationInput` non fiable, `InboundAuthenticationVerifier`
  injecté et `evaluateInboundAuthenticationVerifier`, qui normalise toute issue
  en résultat fermé et redacted.
- `src/core/inbound-security.ts` — façade V14.0a
  `evaluateInboundSecurityAndPrepareLoopRuntimeRequest`.
- `src/core/inbound-authentication.ts` — façade V14.0b
  `verifyInboundAuthenticationAndPrepareLoopRuntimeRequest`, qui interdit
  d'atteindre V14.0a avant une vérification explicite réussie.

## Frontière de confiance d'authentification

`InboundAuthenticationInput` est non fiable. Son champ opaque `credential` peut
contenir du matériel secret destiné exclusivement à l'implémentation injectée
du verifier. Core ne lit jamais ce champ, ne le journalise pas, ne le sérialise
pas et ne le transmet jamais à l'ACL, à l'autorisation publique, à l'assembleur,
à la préparation ou au Runtime.

`InboundAuthenticationVerifier` est un port injecté sans implémentation par
défaut, registre, fallback ou retry. `evaluateInboundAuthenticationVerifier`
valide la forme de l'entrée et du contexte, lit le port sans exécuter de getter,
préserve `this`, appelle `verify` exactement une fois et accepte un résultat
sync ou async. Exception, rejection, thenable hostile ou sortie malformée sont
normalisés vers une raison stable sans exposer message d'exception, stack ou
credential.

Un succès du verifier produit une `InboundAuthenticationEvidence` structurée et
`verified: true`. Cette preuve est la seule valeur d'authentification autorisée
à traverser vers la façade V14.0a. L'identité de cette preuve est conservée ; le
matériel brut de `InboundAuthenticationInput` ne l'est jamais.

La séparation reste stricte :

```text
Verifier V14.0b
  "Cette preuve d'authentification est-elle authentique ?"

Inbound security V14.0a
  "Avec cette preuve authentique, cette requête est-elle autorisée ?"
```

Le verifier ne décide donc ni expiration ACL finale, ni tenant, ni opération,
ni replay, ni permission Runtime. Ces contrôles restent dans V14.0a et dans les
couches Policy/Runtime existantes.

## Décision ACL explicite et fail-closed

`evaluateInboundSecurity` est pure, déterministe, immuable et ne lit jamais
l'horloge, le hasard, le système de fichiers, le réseau ou l'environnement de
process — l'heure d'évaluation (`evaluatedAt`) et toutes les entrées sont
fournies explicitement par l'appelant. Le défaut est toujours `deny`. Les
raisons de refus sont distinguées explicitement : preuve absente, preuve
invalide, preuve expirée ou pas encore valide, principal non correspondant,
tenant non correspondant, opération non autorisée, preuve replay absente ou
rejetée. L'absence de principal, seule, produit une décision `indeterminate`,
mais toute issue autre que `allow` bloque la chaîne publique existante.

## État de replay externe à Core

`InboundReplayEvidence` ne persiste, ne cache et ne stocke aucun nonce. Core
consomme une preuve de replay fournie explicitement par un futur adaptateur
externe ; il ne maintient aucun état de replay lui-même.

## Frontières de composition

V14.0b impose l'ordre :

```text
verifyInboundAuthenticationAndPrepareLoopRuntimeRequest
  -> evaluateInboundAuthenticationVerifier
  -> échec : retour immédiat
  -> succès : preuve vérifiée uniquement
  -> evaluateInboundSecurityAndPrepareLoopRuntimeRequest
  -> allow uniquement
  -> prepareAuthorizedLoopRuntimeRequest
```

Un échec de vérification provoque zéro appel à V14.0a, à l'authorizer, à
l'assembleur, à la préparation, à la résolution Runtime ou à l'exécution. Un
succès appelle la façade V14.0a exactement une fois ; V14.0b ne duplique jamais
le decoder, l'autorisation, l'assemblage ou la préparation.

Cette couche ne remplace ni l'Agent Policy Engine, ni l'admission Runtime
existante (`src/policy/`) : elle s'ajoute en frontière extérieure.

## Hors périmètre

V14.0b n'ajoute aucun HTTP, JWT, OAuth/OIDC, API-key verifier concret, cookie,
session store, base de données, filesystem credential store, secret
d'environnement, rate limiter, persistance de nonce/replay, PKI, dépendance
crypto, SDK externe, réseau ou modification de l'exécution Runtime. Une future
implémentation de transport devra fournir explicitement le verifier et les
adaptateurs de replay nécessaires.

## Audit

- `AUDIT-426` — contrat V14.0a déclaratif, sans secret et non opérationnel.
- `AUDIT-427` — V14.0a gate la préparation publique sur `allow` explicite.
- `AUDIT-428` — le port de vérification V14.0b reste injecté, redacted,
  transport-neutral et sans comportement opérationnel concret.
- `AUDIT-429` — la vérification réussie précède obligatoirement toute évaluation
  V14.0a ; aucun bypass vers une préparation de plus bas niveau n'est admis.

## V14.0c — gestionnaire de requête entrante transport-neutre

`src/core/inbound.ts` ajoute le seul point d'entrée applicatif Core qu'un
futur adaptateur HTTP, webhook, socket ou queue doit appeler :

```text
adaptateur de transport (futur)
        ↓
enveloppe transport-neutre non fiable
        ↓
handleInboundLoopRuntimeRequest(...)
        ↓
verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(...)  (V14.0b)
        ↓
verifier V14.0b
        ↓
évaluation de sécurité V14.0a
        ↓
préparation Runtime publique existante
```

`InboundLoopRuntimeRequestEnvelope` est une enveloppe immuable et
transport-neutre : identifiant de requête, matériel d'authentification non
fiable, principal, requête d'accès, preuve de replay, politique d'accès, heure
d'évaluation explicite et payload Runtime public. Elle ne contient aucun
concept de méthode HTTP, URL, chemin, en-tête, code de statut, cookie, socket,
fournisseur de webhook ou framework — un futur adaptateur traduit son propre
protocole vers cette forme neutre.

Avant tout appel au verifier, `validateInboundLoopRuntimeRequestEnvelope`
vérifie de façon fail-closed la forme structurelle de l'enveloppe et la
cohérence de l'identifiant de requête entre l'enveloppe, le contexte de
vérification, la requête d'accès et — quand elle existe — la preuve de
replay. Une enveloppe malformée ou incohérente est rejetée (`outcome:
"invalid"`) sans déclencher le verifier, l'inbound security V14.0a,
l'authorizer, l'assembleur ou la préparation Runtime. Aucun identifiant n'est
jamais réécrit silencieusement.

Le résultat du handler est un type fermé et immuable
(`InboundLoopRuntimeRequestHandlerResult`) distinguant explicitement :
enveloppe invalide, échec de vérification d'authentification, refus/décision
indéterminée de l'inbound security, et résultat de préparation Runtime en aval
(qui peut lui-même échouer après une autorisation permise). Aucun code de
statut HTTP ni erreur spécifique à un transport n'y apparaît ; les frontières
de rédaction existantes (aucun secret brut, aucune trace d'exception) sont
préservées.

Le handler ne fait que composer la façade V14.0b existante
(`verifyInboundAuthenticationAndPrepareLoopRuntimeRequest`) — il n'appelle
jamais directement `evaluateInboundAuthenticationVerifier`,
`evaluateInboundSecurity`, `evaluateInboundSecurityAndPrepareLoopRuntimeRequest`
ou `prepareAuthorizedLoopRuntimeRequest`. Le verifier, l'authorizer et
l'assembleur restent des dépendances explicitement injectées — aucune
implémentation par défaut, aucun registre, aucune découverte.

Cette couche ne remplace ni l'Agent Policy Engine ni l'admission Runtime
(`src/policy/`), qui restent des contrôles séparés en aval.

### Hors périmètre (V14.0c)

Aucun serveur HTTP, route, port réseau, endpoint webhook, listener réseau,
TLS, CORS, CSRF, cookie, JWT, OAuth/OIDC, authentification API-key concrète,
rate limiter, base de données de replay, persistance, base de données, Redis,
stockage de secret sur système de fichiers, chargement d'identifiants
d'environnement, transport externe concret, SDK fournisseur, ou changement de
sémantique d'exécution Runtime.

### Audit (V14.0c)

- `AUDIT-430` — le handler transport-neutre reste protocole-indépendant et
  non opérationnel.
- `AUDIT-431` — le handler compose V14.0b plutôt que de contourner les portes
  d'authentification/sécurité.
