# Vérificateur d'assertion signée et protection contre le rejeu — proposition L7.3 (E1/E8)

## Statut

**Proposition du 2026-11-06, non acceptée, non implémentée.** Ce document ne modifie aucun comportement, aucun contrat JSON (`schemaVersion: 1`), aucune gate, aucune règle d'audit. Il prépare, sans l'engager, le lot L7.3 (évolutions E1 et E8) du plan de qualification L7 de la plateforme (documentation de gouvernance non publique). L'implémentation exige l'acceptation préalable des contrats d'identité et d'autorisation par le propriétaire, puis un mandat explicite dans ce dépôt, conformément à `AGENTS.md` ; la fusion se fait par merge commit, seul mode permis par le ruleset. Complète `docs/architecture/configured-inbound-security-adapter.md`, `project-identity-canonicalization.md` et `inbound-authorization-vocabulary-and-principal-resolution.md` sans les modifier. Aucun code n'est écrit ici, aucune gate (G3.2/B5 comprise) n'est levée.

Ce fichier n'est pas une feuille de route : il ne contient aucune ligne candidate pour le lecteur de roadmap.

## Faits vérifiés

Dépôt Loop Engine, `main` au commit `e52e372`. Tout ce qui suit provient du code lu.

| # | Constat | Source |
|---|---|---|
| V1 | Le vérificateur d'authentification est un **port** : `verify(input, context)` avec `input = {method, credential: unknown, issuerHint, subjectHint, metadata?}` et `context = {requestId, evaluatedAt}` ; résultat `verified:false` (raisons `rejected`, `unavailable`, `invalid`) ou `verified:true` avec une preuve `{evidenceId, method, subjectId, issuerId, credentialFingerprint, verified, issuedAt, validFrom, expiresAt, metadata?}`. La couche qui l'appelle valide la structure du résultat (clés exactes, descripteurs ordinaires, thenables refusés) et échoue fermé ; des tests dédiés existent. | `src/inbound-security/authentication-verification.ts`, `tests/inbound-security/authentication-verifier-*.test.ts` |
| V2 | La preuve **ne porte ni projet, ni opération, ni audience, ni identifiant de requête** : seulement `metadata?`, un enregistrement de chaînes non vides. | `src/inbound-security/types.ts`, `authentication-verification.ts` |
| V3 | Fenêtre de validité : une preuve est « pas encore valide » si `evaluatedAt < validFrom` ou `issuedAt > evaluatedAt`, « expirée » si `evaluatedAt > expiresAt` (valide à l'égalité) ; la cohérence `issuedAt ≤ validFrom ≤ expiresAt` est exigée. **Aucune tolérance d'horloge** dans l'évaluateur ; l'heure `evaluatedAt` est fournie par la composition. | `src/inbound-security/validation.ts` |
| V4 | Seule implémentation du vérificateur : clé API (SHA-256 comparé en temps constant, hachage factice pour un justificatif inconnu). `node:crypto` est déjà importé ; **aucun usage d'Ed25519 dans le dépôt**. CI sous Node 22. | `configured-api-key.ts`, `.github/workflows/ci.yml` |
| V5 | **Ordre exact des contrôles dans Core** (`verifyInboundAuthenticationAndPrepareLoopRuntimeRequest`), en deux temps. *Avant la réservation du rejeu* : vérification de l'authentification → concordance de la méthode, de l'indication d'émetteur et de l'indication de sujet avec la preuve → cohérence de l'heure d'évaluation (`evaluation_time_mismatch`) → fenêtre (pas encore valide, expirée) → principal présent → principal = sujet de la preuve → tenant → identifiant de requête (valide, égal au contexte) → décodage de la charge → projet (requête d'accès = charge) → opération (requête d'accès = mode de la charge) → opération autorisée par la politique → contrôles de la preuve de rejeu → **réservation du rejeu**. *Après la réservation* : Core appelle `evaluateInboundSecurityAndPrepareLoopRuntimeRequest`, qui **réévalue la sécurité puis appelle l'autorisateur et l'assembleur, chacun avec ses propres refus**. Un refus antérieur à la réservation ne consomme pas l'assertion ; un refus de la réévaluation, de l'autorisateur ou de l'assembleur **la consomme déjà**. Aucun refus n'atteint le service Runtime. | `src/core/inbound-authentication.ts`, `src/core/inbound-security.ts` |
| V6 | Dans Core, la preuve de rejeu doit porter le même `evidenceId` que la preuve d'authentification et le même `requestId` que la requête d'accès, sinon `replay_rejected`. **Core ne contrôle pas le nonce** (il vérifie seulement qu'un nonce présent est valide) : le nonce est construit par l'adaptateur avant la vérification, donc non authentifié. | idem |
| V7 | Protection du rejeu par fichier : clé = SHA-256(préfixe versionné ‖ `evidenceId` ‖ `nonce:<nonce>` ou `request:<requestId>`) ; création exclusive (`wx`, mode `0600`), répertoire créé en `0700`, `fsync` ; résultats `accepted`, `replayed`, `unavailable`, `invalid` ; `unavailable` entraîne un refus. La réservation (`claimedAt` inclus) est **persistante et sans purge**. | `src/inbound-security/file-replay-protection.ts` |
| V8 | Le principal de la requête est fourni par la composition (`envelope.principal`) ; l'adaptateur le prend dans l'enregistrement du justificatif. Core exige `principal.principalId === evidence.subjectId`. | `src/core/inbound-authentication.ts`, `configured-inbound-adapter.ts` |
| V9 | **Aucun journal persistant des refus** : la décision est retournée à l'appelant. | recherche dans `src/` |
| V10 | Précédent de maintenance explicite : `runDurableExecutionMaintenance` inspecte puis applique une action sur les enregistrements non actifs du magasin durable. | `src/loop/durable-execution-maintenance.ts` |
| V11 | Les contrôles d'audit épinglent les fichiers du pilote d'ACL, des types d'accès, de la validation et de la liaison d'opération de Core (`AUDIT-426`, `AUDIT-450`, `AUDIT-496`, règles de politique d'opération) : voir `inbound-authorization-vocabulary-and-principal-resolution.md`. | `src/audit/rules/` |

## Proposition E1 — vérificateur d'assertion signée

1. **Emplacement.** Un nouveau module d'`inbound-security` implémentant le port existant (V1). Aucun fichier épinglé n'est modifié. Aucun accès réseau, disque ni environnement dans le module : clés, audience et horloge sont injectées.
2. **Contenu de l'assertion.** Champs fixes, version de schéma, aucun champ supplémentaire accepté : version, service émetteur, identifiant de clé, audience (instance de Loop Engine), `sub` (identifiant opaque du principal), identifiant unique, émise à, valide à partir de, expire à, identifiant de requête, projet, opération. **L'assertion ne porte ni rôle, ni tenant, ni droit** : toute assertion qui en contient est refusée (clé en trop). Rôles et tenant sont résolus par Loop Engine (annuaire de principaux de L7.2).
3. **Signature.** Un seul algorithme, désigné par la configuration de Loop Engine et **jamais par l'assertion** (aucun champ d'algorithme accepté, donc aucune négociation ni valeur « none »). Proposition : Ed25519 via `node:crypto` (clé publique côté Loop Engine uniquement). Prise en charge à **qualifier** sur la version de Node utilisée sur le poste (V4). Le message signé est une chaîne canonique à champs ordonnés avec un préfixe de séparation de domaine versionné, jamais une sérialisation JSON ambiguë. **Chaque champ est encodé avec un préfixe de longueur** (ou un échappement), de sorte qu'aucune concaténation de champs libres (identifiant de requête, projet, opération) ne soit ambiguë. Le justificatif (`credential`, de type opaque) a un format de transport strict : encodage unique et strict, taille maximale, doublons de clés refusés, encodages non canoniques de la signature refusés.
4. **Clés.** Ensemble configuré `{identifiant de clé → clé publique, émetteur, validité, état}`. Rotation par recouvrement (au plus deux clés actives : valeur à qualifier). Révocation = retrait ou état « révoquée », **sans cache**, effet à la requête suivante. Identifiant de clé inconnu → refus indistinguable des autres échecs.
5. **Ordre de vérification** (refus à la première erreur, sans émettre de preuve) : structure stricte → clé connue et active à l'heure d'évaluation → signature → émetteur égal à celui de la clé → audience égale à celle de l'instance → fenêtre (cohérence, durée maximale `expire − émission` plafonnée par la configuration : valeur à qualifier, de l'ordre de la minute) → liaison (identifiant de requête, projet, opération attendus).
6. **Horloge.** L'évaluateur n'a pas de tolérance (V3) ; elle ne peut donc vivre que dans le vérificateur, qui mappe les dates de l'assertion vers la fenêtre de la preuve. Tolérance bornée (valeur à qualifier), appliquée au début de validité et à l'émission, **jamais à l'expiration**. L'heure est celle de Loop Engine, pas celle de l'émetteur.
7. **Liaison projet / opération / requête.** La preuve ne porte pas ces champs (V2) et les contrôles de Core sont épinglés (V11) : la liaison est donc faite **dans le vérificateur**, instancié **par requête** avec les valeurs attendues. L'adaptateur d'assertion (lot E4) construit la requête d'accès et ces valeurs attendues depuis la même source ; Core compare ensuite la requête d'accès à la charge (V5). Chaîne de confiance : assertion signée = valeurs attendues = requête d'accès = charge. Alternative écartée : ajouter une étape de liaison dans Core, qui modifie des fichiers épinglés.
8. **Sortie.** Preuve avec `subjectId` = identifiant opaque du principal, `issuerId` de la clé, empreinte de la clé publique comme `credentialFingerprint`, fenêtre calculée ; `metadata` limitée aux champs liés à des fins d'audit, **jamais utilisée pour autoriser**. Core exige ensuite `principal.principalId === subjectId` (V8) ; le principal est résolu par Loop Engine (annuaire), jamais déclaré par l'appelant.
9. **Échecs.** Toute erreur retourne `verified:false` ; aucune exception ne sort ; aucun détail exploitable n'est renvoyé à l'appelant ; ni assertion brute ni signature ne sont journalisées.
10. **Lecture avant vérification.** Pour résoudre le principal, construire la requête d'accès et la preuve de rejeu avant la vérification, l'adaptateur doit lire `sub` et l'identifiant de clé dans une donnée **non authentifiée** : un analyseur strict et borné est exigé, et rien de ce qui distingue « inconnu » de « signature invalide » ne doit sortir vers l'appelant.

## Proposition E8 — protection contre le rejeu et journal des refus

1. **Identifiant unique et nonce.** L'identifiant de l'assertion est aléatoire (au moins 128 bits), émis par le signataire ; il est l'identifiant de la preuve. La clé de réservation dépend aussi du nonce (V7) et Core ne contrôle pas le nonce (V6) : un nonce choisi par l'appelant permettrait de rejouer la même assertion avec un autre nonce. Exigence : **soit nonce nul** (la clé devient identifiant de la preuve + identifiant de requête, lui-même lié par la signature), **soit nonce dérivé uniquement d'octets signés**. Core et les fichiers épinglés ne peuvent pas le garantir : c'est une obligation de l'adaptateur d'assertion (lot E4), couverte par un test dédié.
2. **Consommation atomique.** Le port fichier existant suffit pour un hôte unique et un système de fichiers local (V7) : un seul gagnant par identifiant. Le comportement sur un système de fichiers réseau n'est pas qualifié. La consommation intervient **au milieu** de la chaîne de Core (V5) : une requête refusée avant la réservation ne consomme pas l'assertion ; une requête refusée **après** (réévaluation, autorisateur, assembleur) ou dont l'exécution aval échoue la consomme, et une nouvelle tentative exige une **nouvelle assertion**.
3. **Persistance et redémarrage.** Les réservations sont des fichiers synchronisés (`fsync` du fichier) : elles survivent à un redémarrage du processus. Après un **arrêt brutal du système**, le répertoire n'étant pas synchronisé (V7), une réservation récente pourrait être perdue : prévoir un `fsync` du répertoire, ou assumer et documenter cette fenêtre. Un port indisponible refuse (échec fermé).
4. **Concurrence.** La création exclusive donne exactement un gagnant ; les autres reçoivent `replayed` et sont refusés. Un test de concurrence est requis.
5. **Rétention.** Aujourd'hui sans purge (V7). Proposition : durée de conservation au moins égale à la **plus longue durée maximale de validité jamais acceptée** (jamais la valeur courante : réduire la durée avant purge rouvrirait le rejeu) plus la tolérance d'horloge, avec marge ; purge par **commande de maintenance explicite**, modelée sur V10, en simulation par défaut, qui ne supprime jamais une réservation encore dans sa fenêtre et, en cas de doute, ne supprime pas. Une purge trop tôt rouvrirait le rejeu.
6. **Trois notions distinctes.**

| Notion | Définition | Traitement |
|---|---|---|
| Rejeu | Réutiliser la **même assertion** | Refusé (E8), `replay_rejected` |
| Idempotence | Répéter la **même demande** (même clé d'idempotence, construite par Loop Engine) avec une **nouvelle assertion** | Le magasin durable répond avec l'enregistrement existant, sans nouvelle exécution |
| Déduplication | Reconnaître une demande équivalente par son contenu | N'existe pas ; non proposée |

7. **Aucune assertion rejetée ne déclenche de mutation.** La mutation n'est atteignable qu'après une décision « autorisée » de Core ; tout refus (V5), avant comme après la réservation, retourne avant le service Runtime ; une erreur du vérificateur ou du port de rejeu est un refus (V1, V7). Cette propriété doit être couverte par un test de bout en bout du futur adaptateur.
8. **Journal des refus.** Journal append-only (une ligne JSON par refus) dans le répertoire d'état, avec modes explicites (répertoire `0700`, fichier `0600`). Contenu minimal : horodatage, identifiant de requête, identifiant de clé si connu, identifiant du principal **seulement si l'assertion a été vérifiée**, projet et opération demandés, code et étape du refus. **Jamais** : assertion brute, signature, texte libre, secret. L'écriture ne modifie jamais la décision (une panne du journal ne change ni un refus ni une acceptation). Les champs contrôlés par un appelant non authentifié (identifiant de requête, projet, opération) sont bornés en longueur et encodés en JSON strict. « Append-only » n'est qu'une convention tant que le même utilisateur du système peut écrire le fichier (isolation : plan L7, E11). Protection contre la saturation par des assertions invalides : limitation de volume et rotation (valeurs à qualifier), **sans supprimer silencieusement** les refus liés à une clé connue (les agréger et les compter plutôt que les perdre).

## Tests proposés (à écrire lors de l'implémentation)

| Fichier | Cas |
|---|---|
| `tests/inbound-security/signed-assertion-verifier.test.ts` (nouveau) | signature valide, altérée, tronquée ; clé inconnue, révoquée, hors validité ; émetteur, audience, requête, projet, opération différents ; assertion expirée (limite incluse), pas encore valide, durée maximale dépassée ; tolérance sans effet sur l'expiration ; champ supplémentaire (dont rôle, tenant, algorithme) refusé ; entrées hostiles (descripteurs, prototypes, thenables) ; champ libre contenant un délimiteur ; signature malformée ou non canonique ; justificatif trop grand ou à clés dupliquées ; aucune exception propagée |
| `tests/inbound-security/replay-protection.test.ts` (étendu) | concurrence (plusieurs réclamations simultanées, un seul gagnant) ; redémarrage simulé ; port indisponible → refus ; **même assertion rejouée avec un autre nonce → refusée** ; refus après la réservation (autorisateur, assembleur) → assertion consommée |
| `tests/inbound-security/replay-retention.test.ts` (nouveau) | purge en simulation ; jamais de suppression dans la fenêtre ; réservation non datée ou illisible conservée |
| `tests/inbound-security/refusal-journal.test.ts` (nouveau) | contenu minimal ; absence de données interdites ; panne du journal sans effet sur la décision ; limitation de volume |
| Garde-fous | `pnpm run typecheck`, `pnpm run audit:strict` complet, `tests/audit/core-concrete-dependency-direction.test.ts` | aucun fichier épinglé modifié |

Validation locale proportionnée : tests ciblés puis `pnpm run validate` ; aucune commande lourde en parallèle.

## Compatibilité, risques et retour arrière

| Sujet | Évaluation |
|---|---|
| Compatibilité | Additive : nouveaux modules non câblés ; la voie à clé API, Core et les fichiers épinglés sont inchangés. |
| Cryptographie | Risque principal : canonicalisation, séparation de domaine, comparaison en temps constant, absence de négociation d'algorithme. Revue de sécurité dédiée avant toute implémentation ; prise en charge d'Ed25519 à qualifier. |
| Horloge | Une dérive entre l'émetteur et Loop Engine provoque des refus (échec fermé) ; la tolérance est bornée et n'allonge jamais l'expiration. |
| Rétention | Purge trop tôt = rejeu possible ; rétention trop longue = croissance du répertoire. Purge explicite, simulation par défaut. |
| Journal | Saturation et fuite de contenu hostile : contenu minimal, volume limité. |
| Données | Aucune migration : aucun état existant n'est modifié. |
| Retour arrière | Revert du commit ; la commande de purge ne s'exécute jamais sans action explicite. |

## Critères d'acceptation

1. Un vérificateur conforme au port refuse, sans exception ni détail, toute assertion invalide, expirée, mal liée, signée par une clé inconnue ou révoquée, ou portant un champ supplémentaire.
2. Une assertion valide ne peut être acceptée qu'une fois, y compris sous concurrence et après redémarrage.
3. Une requête refusée avant la réservation de rejeu ne consomme pas l'assertion ; une requête refusée par la réévaluation, l'autorisateur ou l'assembleur la consomme et exige une nouvelle assertion.
4. Rejouer la même assertion avec un autre nonce est refusé.
5. Aucune purge ne supprime une réservation dans sa fenêtre.
6. Le journal des refus ne contient aucune donnée interdite et n'influence aucune décision.
7. L'audit strict complet, le typage et le test de direction de dépendances passent sans modification de ces contrôles ; aucune gate n'est modifiée.

## Hors périmètre et décisions restantes

Hors périmètre : émission des assertions (côté plateforme), câblage dans un adaptateur ou une passerelle (lots E4/E12), annuaire de principaux (L7.2), persistance du principal (L7.4), rejeu multi-hôtes. Décisions restantes : acceptation des contrats d'identité et d'autorisation (gouvernance de la plateforme) ; algorithme, durée maximale d'assertion, tolérance d'horloge, nombre de clés actives, marge de rétention (valeurs à qualifier) ; emplacement et distribution des clés publiques ; format de l'audience ; format et rotation du journal ; revue de sécurité cryptographique ; mandat d'implémentation dans ce dépôt.
