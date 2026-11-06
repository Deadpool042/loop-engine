# Vocabulaire d'opérations et résolution du principal — proposition L7.2 (E2/E3)

## Statut

**Proposition du 2026-11-06, non acceptée, non implémentée.** Ce document ne modifie aucun comportement, aucun contrat JSON (`schemaVersion: 1`), aucune gate, aucune règle d'audit. Il prépare, sans l'engager, le lot L7.2 (évolutions E2 et E3) du plan de qualification L7 de la plateforme (documentation de gouvernance non publique). L'implémentation exige l'acceptation préalable des contrats d'identité et d'autorisation par le propriétaire, puis un mandat explicite dans ce dépôt, conformément à `AGENTS.md` ; la fusion se fait par merge commit, seul mode permis par le ruleset. Complète `docs/architecture/configured-inbound-security-adapter.md` sans le modifier.

Ce fichier n'est pas une feuille de route : il ne contient aucune ligne candidate pour le lecteur de roadmap.

## Faits vérifiés

Dépôt Loop Engine, `main` au commit `ce603a7`. Tout ce qui suit provient du code lu.

| # | Constat | Source |
|---|---|---|
| G1 | `LoopRuntimePublicRequest.mode` vaut `"dry-run"` ou `"execute"` ; toute autre valeur est refusée (`invalid_mode`). Ce type est repris par huit fichiers : `src/core/loop-runtime-public-request*.ts` (cinq), `src/inbound-adapters/configured-inbound-adapter.ts`, `src/inbound-security/types.ts`, `src/inbound-security/configured-acl.ts`. | `src/core/loop-runtime-public-request.ts` |
| G2 | Une règle d'ACL est `{ruleId, tenantId, requiredRoles, projects, operations}` ; `operations` est typé `readonly LoopRuntimePublicRequest["mode"][]` et la validation n'accepte que `dry-run` et `execute`. | `src/inbound-security/configured-acl.ts` |
| G3 | L'évaluation est ordonnée et distingue ses refus : tenant, puis rôles (`requiredRoles.every`), puis projet (`projects.includes`, comparaison exacte), puis opération (`candidate.operations.includes(input.operation)`). | idem |
| G4 | Le principal est `{principalId, principalType, tenantId \| null, roles}` ; il est **fixé par l'enregistrement du justificatif** (`ConfiguredApiKeyCredentialRecord.principal`) et l'adaptateur retrouve cet enregistrement par `credentialId`. La validation exige `subjectId === principalId`. | `configured-api-key.ts`, `configured-inbound-adapter.ts` |
| G5 | L'adaptateur dérive la politique `allowedOperations` de la décision d'ACL (`acl.allowed ? [operation] : []`) ; `evaluateInboundSecurity` vérifie ensuite que l'opération figure dans cette politique (type `readonly LoopRuntimePublicRequest["mode"][]`). | `configured-inbound-adapter.ts`, `types.ts`, `validation.ts` |
| G6 | Il existe aussi, dans Core, un port d'autorisation de la requête publique (`LoopRuntimePublicRequestAuthorizer`, requête `{principalId, project, policyRef, profileRef, mode}`) que l'adaptateur reçoit en dépendance et transmet au service Runtime. L7.2 **ne crée pas** de troisième mécanisme. | `src/core/loop-runtime-public-request-authorization.ts` |
| G7 | **La règle d'audit `AUDIT-496` (sévérité erreur) épingle le pilote** : elle exige des fragments de code précis dans les fichiers de justificatif, d'ACL, de rejeu et d'adaptateur (par exemple `candidate.operations.includes(input.operation)`, `rule.requiredRoles.every`, `subjectId === principalId`, `UNKNOWN_CREDENTIAL_HASH`, `timingSafeEqual`), impose un seul appel au service applicatif dans l'adaptateur et **interdit** certains jetons dans ces fichiers (`process.env`, `node:http`, `node:https`, `createServer(`, `fetch(`, `git commit`, `git push`…). | `src/audit/rules/configured-inbound-security-adapter.ts` |
| G8 | Le module Core `src/core/configured-inbound-security-adapter.ts` **réexporte** l'adaptateur et les types d'ACL : c'est une surface publique dont l'évolution doit être additive. | `src/core/configured-inbound-security-adapter.ts` |
| G9 | L'ACL et l'adaptateur configuré ne sont appelés **ni par le CLI, ni par la composition** : seulement par les modules d'`inbound-security`, d'`inbound-adapters`, le réexport de Core et la règle d'audit. L7.2 est donc sans effet à l'exécution tant que le lot E4 n'est pas livré. | recherche dans `src/` |
| G10 | Tests : `tests/inbound-security/` (30 fichiers : évaluation, rejeu, vérificateurs d'authentification), `tests/inbound-adapters/` (2 fichiers). Les fonctions d'ACL n'ont **pas de test unitaire dédié** : elles sont exercées par l'adaptateur et par `tests/audit/core-concrete-dependency-direction.test.ts`. | `tests/` |
| G11 | `docs/architecture/configured-inbound-security-adapter.md` doit conserver son titre : l'audit le vérifie. | règle `AUDIT-496` |

## Proposition E3 — vocabulaire d'opérations, additif

1. **Constat.** Pour exprimer « lire l'état » et « annuler », l'ACL n'a pas de valeur ; « demander une exécution » existe déjà sous le nom `execute`.
2. **Proposition recommandée (additive).** Conserver `dry-run` et `execute` et **ajouter deux valeurs**, `read` et `cancel`. Un nouveau type `InboundOperation = LoopRuntimePublicRequest["mode"] | "read" | "cancel"` est défini dans `inbound-security`. Il remplace `LoopRuntimePublicRequest["mode"]` uniquement aux endroits d'`inbound-security` qui portent l'opération d'ACL : `ConfiguredInboundAclRule.operations`, `InboundAccessRequest.operation`, `InboundAccessPolicy.allowedOperations`, et leurs validateurs. Aucune table de correspondance ni renommage : `execute` reste « demande d'exécution ».
3. **Inchangés.** Le type et la validation de la requête publique de Core (`dry-run` et `execute` seulement), la forme des règles, l'ordre d'évaluation et les codes de refus, le contenu des fichiers pinés par `AUDIT-496` (G7) : seules les annotations de type et la liste de valeurs acceptées par le validateur d'opérations changent, les fragments exigés sont conservés.
4. **Dépendance de direction.** Core n'importe pas le nouveau type (le test et la règle de direction de dépendances le vérifient). La surface réexportée (G8) n'évolue que par élargissement d'un type d'union.
5. **Alternative.** Renommer vers `read` / `request_execution` / `cancel` avec une table de correspondance depuis `dry-run` / `execute` : plus lisible, mais touche les règles existantes, le validateur et la sémantique ; **non retenue**, à arbitrer.
6. **Sans effet avant E4.** Les nouvelles valeurs n'ont aucun appelant (G9).

## Proposition E2 — résolution du principal et plafond de service, nouveaux modules

1. **Annuaire de principaux.** Nouveau port `InboundPrincipalDirectory` (`resolve(principalId) → InboundPrincipal | null`) et sa version configurée, dans un **nouveau fichier** d'`inbound-security`. Les entrées `{principalId, principalType, tenantId, roles}` sont validées avec la même rigueur que les enregistrements de justificatif (clés exactes, doublons refusés, descripteurs ordinaires). Le principal d'une requête issue d'une assertion (lot E1) sera **résolu par Loop Engine depuis cet annuaire**, jamais déclaré par l'appelant. Le chemin à clé API actuel n'est pas modifié.
2. **Plafond de service.** Nouvelle fonction pure `evaluateServiceCeiling({keyId, project, operation, rules})` et son type de règle `{keyId, projects, operations}` (liste explicite de projets, sans joker, opérations de `InboundOperation`), avec refus distincts (`service_unknown`, `service_project_not_authorized`, `service_operation_not_authorized`). Le **droit effectif** sera l'intersection de la décision d'ACL du principal et du plafond de service ; la composition est réalisée par les lots E1/E4, **pas** par L7.2.
3. **Pas de mécanisme parallèle.** L'annuaire fournit des *attributs* (tenant, rôles) à l'ACL existante ; le plafond ne fait que **restreindre**. Aucune décision d'autorisation nouvelle, aucun troisième point de décision (G6). Aucun accès réseau, disque ou environnement n'est introduit dans les fichiers pinés (G7) ; les nouveaux modules sont purs ou reçoivent leurs données par injection.
4. **Adaptateur inchangé.** L'adaptateur configuré n'est pas modifié par L7.2 (G7 : un seul appel applicatif, jetons exigés).

## Tests proposés (à écrire lors de l'implémentation)

| Évolution | Fichier | Cas |
|---|---|---|
| E3 | `tests/inbound-security/configured-acl.test.ts` (nouveau, **tests unitaires dédiés de l'ACL**, G10) | comportement actuel figé (refus tenant, rôle, projet, opération, ordre) ; `read` et `cancel` acceptés par le validateur ; valeur inconnue refusée ; règle existante avec `dry-run`/`execute` inchangée |
| E3 | `tests/inbound-security/evaluation.test.ts` (étendu) | opération `read`/`cancel` dans la politique ; hors politique → `operation_not_allowed` |
| E2 | `tests/inbound-security/principal-directory.test.ts` (nouveau) | principal inconnu → `null` ; doublon, clé en trop ou manquante, tenant/rôles invalides → refus de configuration ; entrées hostiles (descripteurs, prototypes) |
| E2 | `tests/inbound-security/service-ceiling.test.ts` (nouveau) | service inconnu, projet hors plafond, opération hors plafond → refus distincts ; liste explicite sans joker ; plafond vide → refus |
| Garde-fous | `pnpm run audit:strict` (AUDIT-496), `tests/audit/core-concrete-dependency-direction.test.ts` | aucun jeton exigé n'a disparu, aucun jeton interdit n'est apparu, Core n'importe pas `inbound-security` |

Validation locale proportionnée : tests ciblés des fichiers touchés, puis `pnpm run validate` et l'audit strict ; aucune commande lourde en parallèle. À l'implémentation, vérifier qu'un nouveau document d'architecture n'impose pas d'entrée d'index (`tests/documentation/documentation-impact.test.ts` référence `docs/architecture`).

## Compatibilité, migration, risques et retour arrière

| Sujet | Évaluation |
|---|---|
| Compatibilité | Additive : les règles et justificatifs existants restent valides ; la requête publique de Core est inchangée ; la surface réexportée n'est qu'élargie. |
| Données et migration | Aucune. |
| Dérive d'`AUDIT-496` | Risque principal : toute édition des fichiers pinés peut retirer un fragment exigé ou introduire un jeton interdit. Mitigation : éditions limitées aux annotations de type, nouveaux modules séparés, exécution de l'audit strict avant tout commit. Amender la règle d'audit serait une décision distincte, non proposée ici. |
| Sans appelant | Aucun effet à l'exécution avant E4 (G9) : le risque fonctionnel est faible, le risque de conception est de figer un vocabulaire trop tôt. |
| Ambiguïté sémantique | `dry-run` (plan sans effet) et `read` (lecture d'état) sont distincts : ne pas les fusionner. |
| Retour arrière | Revert du commit ; aucun état, schéma ni contrat JSON modifié. |

## Critères d'acceptation

1. L'ACL accepte `read` et `cancel`, refuse toute autre valeur inconnue, et son comportement actuel est couvert par des tests unitaires dédiés.
2. `LoopRuntimePublicRequest` et ses validations de Core sont inchangés.
3. L'annuaire de principaux et le plafond de service existent comme modules purs, testés, **non câblés**.
4. `AUDIT-496` et le test de direction de dépendances passent sans modification de ces contrôles.
5. Aucune gate n'est modifiée ; aucun contrat JSON `schemaVersion: 1` ne change.

## Hors périmètre et décisions restantes

L7.2 ne livre ni vérificateur d'assertion (E1), ni câblage du plafond ou de l'annuaire dans l'adaptateur (E1/E4), ni persistance du principal (E7), ni exposition de la passerelle (E4/E12). Décisions restantes : acceptation des contrats d'identité et d'autorisation (gouvernance de la plateforme) ; vocabulaire additif (recommandé) ou renommage ; emplacement et format de la configuration de l'annuaire et des plafonds (fichier d'état ou de configuration, sans secret) ; format de l'identifiant de clé de service ; mandat d'implémentation dans ce dépôt.
