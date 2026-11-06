# Persistance du principal demandeur — proposition L7.4 (E7)

## Statut

**Proposition du 2026-11-06, non acceptée, non implémentée.** Ce document ne modifie aucun comportement, aucun contrat JSON (`schemaVersion: 1`), aucune gate, aucune règle d'audit. Il prépare, sans l'engager, le lot L7.4 (évolution E7) du plan de qualification L7 de la plateforme (documentation de gouvernance non publique). L'implémentation exige l'acceptation préalable des contrats d'identité et d'autorisation par le propriétaire, puis un mandat explicite dans ce dépôt, conformément à `AGENTS.md` ; la fusion se fait par merge commit, seul mode permis par le ruleset. Aucun code n'est écrit ici ; la gate G3.2/B5 n'est ni levée ni contournée.

Ce fichier n'est pas une feuille de route : il ne contient aucune ligne candidate pour le lecteur de roadmap. Il est indépendant du document de vérification des assertions (L7.3) : il suppose seulement qu'un principal vérifié existe en amont, quel que soit le mécanisme qui le produit.

## Faits vérifiés

Dépôt Loop Engine, `main` au commit `e52e372`. Tout ce qui suit provient du code lu.

| # | Constat | Source |
|---|---|---|
| R1 | Un enregistrement durable (`schemaVersion` 1) porte `revision`, `idempotencyKey`, `project`, `status`, `attempt`, `leaseOwner`, `leaseExpiresAt`, `cancellationRequested`, `createdAt`, `updatedAt`, `progress`, `progressEvents`, `result`, `failure`, `events`. **Aucun champ ne désigne le demandeur.** | `src/loop/durable-execution.ts` |
| R2 | Un événement porte `{sequence, at, type, owner}`. Le champ `owner` est le détenteur du bail pour les événements de bail et de fin, mais pour `cancellation_requested` il reçoit `requestedBy` (chaîne libre, après `trim`) : le champ est **surchargé**. Les types d'événements sont énumérés et la séquence doit être continue. | `durable-execution-controller.ts`, `durable-execution-envelope.ts` |
| R3 | Le lecteur d'enregistrement vérifie les champs listés mais **ne rejette pas les clés supplémentaires** ; un type d'événement inconnu est rejeté. | `src/loop/durable-execution-envelope.ts` |
| R4 | L'**empreinte** d'un enregistrement est calculée sur une liste blanche de champs (dont `result`, `failure`, et pour chaque événement `type`, `at`, `owner`), avec inclusion **conditionnelle** de `progress` ; la lecture vérifie l'empreinte et rejette en cas d'écart (`fingerprint_mismatch`). | `src/loop/durable-execution-integrity.ts` |
| R5 | Le magasin écrit un fichier par empreinte de clé (mode `0600`), par renommage atomique, avec comparaison de révision ; il propose `list(projet)` et `verify`. | `src/loop/file-durable-execution-store.ts` |
| R6 | La demande d'exécution porte `owner` (identité de bail, par exemple `loop-engine-cli:<pid>`), pas un principal ; l'annulation exige `requestedBy` non vide. La passerelle décode ces deux champs depuis l'enveloppe JSON de l'appelant. | `orchestration-gateway.ts`, `durable-auto-publish.ts` |
| R7 | L'événement de progression émis vers un récepteur ne porte ni demandeur ni principal. | `durable-execution-controller.ts` |
| R8 | Aucun magasin durable n'a été trouvé sur le poste d'audit : aucune donnée historique locale. Les autres hôtes ne sont pas vérifiés. | système de fichiers |
| R9 | La voie CLI qui produit des enregistrements durables est refusée en l'état par la gate G3.2/B5 ; la passerelle n'a pas de commande. | `src/cli.ts`, `auto-subscription-execution.ts` |

## Proposition E7 — champs optionnels, immuables, issus de l'entrée authentifiée

1. **Demandeur de l'enregistrement.** Champ optionnel `requester` sur l'enregistrement : identifiant opaque du principal, identifiant de la clé de service, identifiant de requête et horodatage. Positionné **une seule fois**, à la création de l'enregistrement, et **immuable** : `requester` désigne le **premier demandeur**. Une tentative ultérieure d'un autre principal (reprise de bail, relance d'un enregistrement terminal) n'écrase rien ; l'auteur de chaque tentative est l'`actor` de l'événement d'acquisition ou de reprise de bail correspondant.
2. **Acteur par événement.** Champ optionnel `actor` sur les événements d'acquisition et de reprise de bail et sur l'annulation (mêmes sous-champs). Le champ `owner` est conservé tel quel pour la compatibilité ; **aucun nouveau type d'événement** n'est ajouté (R3 : un type inconnu est rejeté par un lecteur plus ancien).
3. **Origine et propagation.** Le principal vient de la preuve vérifiée en amont ; il traverse la composition jusqu'au contrôleur par un champ **interne**, renseigné par l'entrée authentifiée. L'enveloppe JSON de l'appelant **ne peut pas** fournir `requester` ni `actor` : leur présence dans le corps d'une requête est un refus (R6). **C'est un changement de comportement de la passerelle** : aujourd'hui `decodeRequest` ignore silencieusement les clés qu'il ne lit pas. Le refus est nouveau et strictement borné à ces deux clés ; le schéma `schemaVersion: 1` des enveloppes n'est pas modifié, mais le comportement l'est, et un test le couvre. `requestedBy` libre reste toléré tant qu'aucune entrée authentifiée n'existe, mais ne vaut jamais identité.
4. **Intégrité.** Les champs nouveaux entrent dans l'empreinte **uniquement lorsqu'ils sont présents**, sur le modèle de `progress` (R4) : l'empreinte des enregistrements historiques est inchangée. Cette empreinte est un SHA-256 **sans clé, stocké dans la même enveloppe** : elle protège contre la corruption accidentelle, **pas contre une écriture délibérée** (quiconque peut écrire le fichier peut recalculer l'empreinte). Le demandeur persisté ne vaut donc pas preuve contre un acteur ayant l'accès en écriture au magasin, tant que l'exécution n'est pas séparée par identité (plan L7, E11). Conséquence assumée : un enregistrement portant ces champs **ne se vérifie plus avec un code plus ancien** (`fingerprint_mismatch`), donc retour arrière à sens unique une fois de tels enregistrements écrits. Alternative écartée : exclure les champs de l'empreinte, qui les laisserait sans protection d'intégrité.
5. **Déploiement en deux temps.** D'abord le lecteur et le calcul d'empreinte capables de lire ces champs, sans écriture ; ensuite l'activation de l'écriture, quand tous les lecteurs sont à jour. Aucun enregistrement n'existe aujourd'hui (R8, R9), mais l'ordre doit être documenté.
6. **Un droit n'est pas déduit du demandeur.** Le demandeur persisté sert à l'**audit** et à la corrélation ; il ne confère aucun droit. Les droits de lecture, d'annulation et de liste restent évalués par l'ACL sur le principal courant, à chaque requête (O9). Une éventuelle règle « seul le demandeur peut annuler » est une décision distincte, non proposée.
7. **Preuves et corrélation.** Chaîne : identifiant de requête (journal de la plateforme) ↔ `requester.requestId` ↔ `runId` et empreinte de l'enregistrement. Elle permet de relire, après coup, qui a demandé quoi, y compris en cas de révocation d'un droit pendant une exécution.
8. **Minimisation et confidentialité.** On ne stocke que : identifiant opaque du principal (sans nom ni adresse électronique), identifiant de clé, identifiant de requête, horodatage. **Jamais** : assertion, signature, rôles, droits, texte libre, contexte conversationnel, secret. Durée de conservation = durée de vie de l'enregistrement ; la suppression suit la maintenance existante du magasin.
9. **Données historiques.** Un enregistrement sans `requester` reste valide et se lit comme « demandeur inconnu » ; il n'est jamais complété par déduction. `execution-status` n'ajoute les champs à sa sortie JSON que lorsqu'ils sont présents (champs optionnels, `schemaVersion: 1` conservé).

## Tests proposés (à écrire lors de l'implémentation)

| Fichier | Cas |
|---|---|
| `tests/loop/durable-execution-requester.test.ts` (nouveau) | création avec demandeur ; immutabilité (reprise par un autre principal) ; acteur sur reprise de bail et annulation ; absence de demandeur lisible ; refus d'un `requester`/`actor` fourni dans le corps d'une requête |
| `tests/loop/durable-execution-envelope.test.ts` (étendu) | aller-retour d'empreinte avec et sans champs nouveaux ; empreinte d'un enregistrement historique inchangée ; simulation d'un lecteur ancien (`fingerprint_mismatch` attendu et documenté) ; type d'événement inchangé |
| `tests/composition/production-orchestration-gateway.test.ts` (étendu) | le demandeur n'est jamais pris dans l'enveloppe JSON ; `requester`/`actor` dans le corps → refus, les autres clés inconnues restant ignorées ; propagation depuis l'entrée authentifiée |
| `tests/commands/execution-status.test.ts` | sortie JSON inchangée pour un enregistrement historique ; champs optionnels présents seulement s'ils existent |
| Garde-fous | `pnpm run typecheck`, `pnpm run audit:strict` complet | aucun fichier épinglé modifié |

Validation locale proportionnée : tests ciblés puis `pnpm run validate` ; aucune commande lourde en parallèle.

## Compatibilité, risques et retour arrière

| Sujet | Évaluation |
|---|---|
| Données historiques | Aucune migration ; les enregistrements sans demandeur restent valides (R8). |
| Compatibilité ascendante | Lecteur plus ancien : un enregistrement avec champs nouveaux est rejeté par l'empreinte. À maîtriser par le déploiement en deux temps (point 5). |
| Intégrité | Les champs sont couverts par l'empreinte lorsqu'ils sont présents : intégrité contre la corruption, **non authenticité** (point 4). |
| Confidentialité | Identifiant opaque uniquement ; durée de conservation alignée sur l'enregistrement. |
| Surcharge de `owner` | Non corrigée par suppression : coexistence avec `actor` ; la sémantique de `owner` pour l'annulation devient historique. |
| Retour arrière | Avant toute écriture : revert du commit. Après écriture d'enregistrements avec les champs : à sens unique, d'où le déploiement en deux temps et l'activation tardive de l'écriture. |

## Critères d'acceptation

1. Un enregistrement créé par une entrée authentifiée porte le demandeur, immuable, et chaque reprise ou annulation porte son acteur.
2. Aucune requête externe ne peut fournir `requester` ou `actor`.
3. L'empreinte d'un enregistrement historique est inchangée ; l'aller-retour avec champs nouveaux est vérifié.
4. `execution-status` est inchangé pour les enregistrements historiques.
5. Aucun droit n'est déduit du demandeur persisté.
6. L'audit strict complet et le typage passent sans modification de ces contrôles ; aucune gate n'est modifiée.

## Hors périmètre et décisions restantes

Hors périmètre : production du principal vérifié (L7.3), entrée authentifiée et propagation interne effective (lot E4), accusé et annulation (E12), politique « seul le demandeur annule ». Décisions restantes : acceptation des contrats d'identité et d'autorisation (gouvernance de la plateforme) ; forme exacte des sous-champs ; conservation de `owner` à des fins de compatibilité ; calendrier du déploiement en deux temps ; mandat d'implémentation dans ce dépôt.
