# Entrée locale authentifiée vers l'exécution durable — proposition L7.5 (E4/E12/E11b)

## Statut

**Proposition du 2026-11-06, non acceptée, non implémentée.** Ce document ne modifie aucun comportement, aucun contrat JSON (`schemaVersion: 1`), aucune règle d'audit et **ne lève aucune gate** : la barrière G3.2/B5 reste fermée et ce document n'en change ni la condition ni la portée. Il prépare, sans l'engager, le lot L7.5 (évolutions E4, E12 et E11b) du plan de qualification L7 de la plateforme (documentation de gouvernance non publique). Il s'appuie sur les propositions `project-identity-canonicalization.md` (L7.1), `inbound-authorization-vocabulary-and-principal-resolution.md` (L7.2) et `signed-assertion-verification-and-replay.md` (L7.3) ; la proposition de persistance du principal demandeur (L7.4) est en cours de revue séparée et n'est qu'un prérequis d'audit, non de conception. L'implémentation exige l'acceptation préalable des contrats d'identité et d'autorisation, puis un mandat explicite dans ce dépôt (`AGENTS.md`) ; la fusion se fait par merge commit, seul mode permis par le ruleset.

Ce fichier n'est pas une feuille de route : il ne contient aucune ligne candidate pour le lecteur de roadmap.

## Faits vérifiés

Dépôt Loop Engine, `main` au commit `2b77add`. Tout ce qui suit provient du code lu.

| # | Constat | Source |
|---|---|---|
| U1 | La passerelle durable (`execute`, `status`, `verify`, `cancel`, `list`) est une bibliothèque sans commande, sans authentification. Son `execute` ne reçoit que `{idempotencyKey, project, owner, leaseDurationMs}` et un exécuteur : **aucune liaison de candidat, aucune tête Git attendue, aucune décision d'exécution, aucun crochet d'admission** (le crochet `prepareExecution` n'existe pas dans la passerelle). | `src/composition/orchestration-gateway.ts`, `production-orchestration-gateway.ts` |
| U2 | La seule voie qui produit des enregistrements durables est `run <projet> --mode publish --auto-subscription --durable` : elle exige un candidat canonique, une tête Git attendue de 40 hexadécimaux, interdit toute option de fournisseur, **est refusée par la barrière G3.2/B5** (la fonction de preuve renvoie toujours `false`), puis appelle `runDurableAutoSubscriptionPublish`, qui exécute `ensureAutoSubscriptionExecutionDecision` (décision d'exécution) via `prepareExecution` avant l'exécuteur. La clé d'idempotence est construite par Loop Engine ; le détenteur du bail est `loop-engine-cli:<pid>` ; le bail dure 30 minutes. | `src/cli.ts`, `src/composition/durable-auto-publish.ts`, `auto-subscription-execution.ts`, `auto-subscription-decision-renewal.ts` |
| U3 | Avec `--progress-events`, le CLI écrit sur la sortie d'erreur des lignes `LOOP_EXECUTION_EVENT:<json>`. Le contrôleur émet un premier événement de progression **juste après avoir persisté le bail** et avant l'exécution. | `src/cli.ts`, `src/loop/durable-execution-controller.ts` |
| U4 | Le pipeline d'authentification de Core est lié à la requête publique (`dry-run`/`execute`) : il décode la charge comme telle et refuse tout autre contenu (`operation_mismatch`). Il ne peut pas servir tel quel à `status`, `cancel` ou `list`. | `src/core/inbound-authentication.ts` |
| U5 | Le renouvellement périodique du bail (`durable-execution-heartbeat.ts`) et la supervision de l'annulation active (`durable-execution-active-cancellation.ts`) **existent en bibliothèque mais ne sont appelés ni par la composition, ni par le CLI**. Sans renouvellement, une exécution plus longue que le bail laisse un enregistrement `running` dont le bail a expiré, **que n'importe quel autre détenteur peut reprendre**. | recherche dans `src/` |
| U6 | L'annulation positionne `cancellationRequested` ; le contrôleur ne l'observe qu'à la **persistance terminale**, où l'état devient `cancelled`, le **résultat de l'exécution est écarté** (`result = null`) et un échec `execution_cancelled` est enregistré. Le validateur de l'enveloppe impose `result = null` pour un enregistrement annulé. | `durable-execution-controller.ts`, `durable-execution-envelope.ts` |
| U7 | Aucun signal d'annulation n'est propagé à l'exécuteur dans ce chemin (`AbortSignal` n'apparaît que dans le fournisseur API texte seul). La supervision d'annulation active suppose un objet exposant `cancel()` que l'exécuteur ne fournit pas aujourd'hui. | recherche dans `src/` |
| U8 | Aucune configuration d'ACL, de justificatifs ou de clés n'est chargée par la composition : l'adaptateur configuré les reçoit par injection ; `application-assembly` ne référence ni passerelle ni ACL. | `src/composition/`, `configured-inbound-adapter.ts` |
| U9 | `cli.ts` route les arguments sans logique métier ; les commandes consomment l'assembly injecté ; toute modification de `src/commands/` rend `docs/architecture/commands.md` obligatoire (test d'impact documentaire) et l'aide en ligne liste les commandes. | `AGENTS.md`, `tests/documentation/documentation-impact.test.ts`, `src/commands/help.ts` |
| U10 | Le CLI local n'authentifie aucun appelant. L'état est sous le répertoire d'état de l'utilisateur d'exécution ; le magasin durable crée son répertoire sans mode explicite (fichiers `0600`) ; le rejeu crée répertoire `0700` et fichiers `0600`. `projects.yaml` est lu relativement au répertoire courant. | `src/core/runtime-state.ts`, `file-durable-execution-store.ts`, `file-replay-protection.ts`, `src/core/config.ts` |
| U11 | Conditions de la gate telles que documentées par Loop Engine : la barrière AUTO reste fermée « tant que les producteurs, les environnements actifs et l'E2E local ne sont pas qualifiés » ; la barrière CLI est indépendante de la provenance déclarée. | `docs/architecture/agent-orchestration.md` |

## Proposition E4 — entrée authentifiée

1. **Principe : un front authentifié de la voie durable existante, pas une nouvelle voie d'exécution.** L'opération `request_execution` (opération d'ACL `execute`, L7.2) prend `(projet, candidat canonique, tête Git attendue)` et appelle **la même fonction** que la voie CLI (`runDurableAutoSubscriptionPublish`), avec son admission complète : candidat canonique, tête attendue, décision d'exécution, clé construite par Loop Engine. **La barrière G3.2/B5 est appliquée telle quelle** : tant qu'elle refuse, l'entrée refuse. L'entrée n'est donc pas une porte de contournement. `execute` de la passerelle brute, qui n'a aucune admission (U1), **n'est pas exposé**.
2. **Pipeline distinct de la requête publique (U4).** Ordre : lecture bornée de la donnée non authentifiée (identifiant de clé, sujet) → vérificateur d'assertion instancié par requête (L7.3) → résolution du principal par l'annuaire (L7.2) → plafond de service → ACL (tenant, rôles, projet, opération) → réservation du rejeu → admission de Loop Engine → opération. Le pipeline réutilise les primitives pures existantes (évaluateur de sécurité, ACL, port de rejeu) et **n'appelle pas** la fonction de Core liée à la requête publique ; il n'introduit ni second moteur d'autorisation ni second orchestrateur.
3. **Opérations.** `read` : statut, liste (projet **obligatoire**, filtrée par les droits du principal) ; `request_execution` ; `cancel`. Aucune autre opération ; aucune intention en texte libre.
4. **Autorisation avant résolution.** Le droit est évalué avant la résolution du projet et avant tout chargement d'enregistrement ; l'égalité entre le projet autorisé et le projet de l'enregistrement est ensuite vérifiée, avec un refus uniforme (L7.1, L7.2).
5. **Emplacement.** Une fonction d'assemblage dans `src/composition/` (seule couche concrète) ; une commande dans `src/commands/` ; une route dans `cli.ts` sans logique ; mise à jour de l'aide et de `docs/architecture/commands.md` (U9).
6. **Configuration.** Aucun chargeur n'existe (U8) : le format et l'emplacement de la configuration (clés publiques, annuaire, plafonds, ACL) sont à décider par Loop Engine ; sans secret ; propriété et mode vérifiés à l'ouverture (E11b).

## Proposition E12 — exécution durable fiable

1. **Accusé d'acceptation.** Le programme enveloppe renvoie un accusé après la persistance du bail, en lisant le premier événement de progression (U3) : `{identifiant de requête, clé d'idempotence, état running, révision}`. L'exécution se poursuit **détachée, dans un processus géré par Loop Engine** (nouvelle session de processus, sortie vers un fichier d'état en `0600`), jamais par LP Control. Si le lancement échoue avant l'acquisition du bail : erreur claire, aucun enregistrement. Après : l'enregistrement existe et l'état est lisible.
2. **Renouvellement du bail — prérequis bloquant.** Câbler le renouvellement périodique existant (U5) dans le processus détaché, avec un intervalle nettement inférieur au bail ; en cas de perte du bail, arrêt de l'exécution et état explicite. Sans cela, une mission de plus de 30 minutes peut être reprise en double.
3. **Reprise après interruption.** Un processus mort laisse un bail qui expire ; la reprise se fait par une **nouvelle demande autorisée** avec la même clé (tentative suivante), jamais automatiquement. La tête Git attendue protège contre une reprise sur un état différent (`git_head_changed`). Des effets partiels peuvent exister : la reprise ne les considère pas comme acquis.
4. **Idempotence et concurrence.** Clé construite par Loop Engine (L7.1) ; bail actif d'un autre détenteur → `execution_in_progress` ; comparaison de révision à l'écriture ; deux demandes concurrentes ne produisent qu'un détenteur. Chaque tentative exige une **nouvelle assertion** (L7.3).
5. **Annulation autorisée et active.** (a) Droit `cancel` évalué sur le principal courant à chaque demande. (b) Câbler la supervision d'annulation active existante (U5). (c) **Exiger une propagation de l'annulation à l'exécuteur** (U7) — ou accepter explicitement, et l'afficher, que l'annulation reste coopérative et ne prenne effet qu'en fin d'exécution.
6. **Conservation des preuves.** Aujourd'hui l'annulation écarte le résultat (U6) alors que des effets ont pu avoir lieu. Proposition : enregistrer le résultat et les étapes déjà accomplies dans un **champ optionnel distinct** (le validateur actuel impose `result = null` pour l'état annulé), additif, inclus dans l'empreinte uniquement lorsqu'il est présent, avec le même déploiement en deux temps que la persistance du demandeur.
7. **Limites des effets irréversibles.** L'annulation n'annule pas ce qui a déjà été produit (modifications de l'espace de travail isolé, commits locaux, publication locale). L'état `cancelled` doit rester lisible comme « annulation observée, effets éventuels non défaits », avec les étapes accomplies.

## Proposition E11b — isolation

1. **Sous-processus local, sans service.** Le programme enveloppe lit l'enveloppe sur l'entrée standard et répond sur la sortie standard ; aucun écouteur HTTP, aucune socket, aucun accès réseau.
2. **Compte distinct.** LP Control s'exécute sous un utilisateur système dédié et sans privilège, sans accès aux dépôts du propriétaire, à l'état de Loop Engine ni à la configuration d'autorisation ; Loop Engine reste sous l'utilisateur du propriétaire. Le canal étroit (élévation limitée à ce seul programme, chemin absolu fixe) est **à qualifier sur le poste** : rien de cela n'est vérifié ici.
3. **Un processus lancé sous le même utilisateur n'est pas une frontière de sécurité** (U10 : le CLI local n'authentifie personne). Le programme enveloppe **refuse en échec fermé** si l'isolation attendue est absente : identité de l'appelant non conforme à la liste déclarée, ou fichiers d'état, de configuration, de clés ou de journaux dont le propriétaire ou le mode ne sont pas ceux attendus (écriture par groupe ou autres, répertoire parent inscriptible, lien symbolique).
4. **Permissions minimales.** Répertoire d'état en `0700` (mode explicite, contrairement au magasin durable actuel), fichiers en `0600` ; configuration d'autorisation et clés publiques non inscriptibles par l'utilisateur de LP Control ; programme enveloppe non inscriptible par lui ; `umask` explicite ; chemin de travail fixe (U10).
5. **Droits avant toute opération.** Aucune lecture d'état ni chargement d'enregistrement avant la vérification de l'assertion et des droits (E4.4).
6. **Journaux.** Journal des refus en `0600`, sans assertion brute ni donnée interdite (L7.3).
7. **Confiance.** Tout ce qui s'exécute sous l'utilisateur de LP Control est considéré non fiable ; la sécurité repose alors sur le programme enveloppe (arguments, environnement, entrée standard), qui doit être minimal et revu.

## Tests proposés (à écrire lors de l'implémentation)

| Fichier | Cas |
|---|---|
| `tests/composition/authenticated-execution-entry.test.ts` (nouveau) | ordre du pipeline ; refus avant tout chargement ; `execute` brut de la passerelle non exposé ; barrière G3.2/B5 appliquée (entrée refusée tant qu'elle refuse) ; admission complète ; projet obligatoire ; refus uniforme ; aucune assertion rejetée ne déclenche d'exécution |
| `tests/loop/durable-execution-lease-renewal-wiring.test.ts` (nouveau) | renouvellement pendant une exécution longue ; perte de bail → arrêt ; pas de reprise concurrente |
| `tests/loop/durable-execution-active-cancellation.test.ts` (étendu) | annulation propagée à l'exécuteur ; conservation des preuves ; état annulé lisible avec étapes |
| `tests/cli/` et `tests/commands/` | nouvelle commande, aide, sortie JSON inchangée pour les commandes existantes |
| Isolation | refus fermé si propriétaire ou mode inattendus, lien symbolique, appelant non déclaré |
| Garde-fous | `pnpm run typecheck`, `pnpm run audit:strict` complet, `tests/documentation/documentation-impact.test.ts`, `tests/audit/core-concrete-dependency-direction.test.ts` | aucun fichier épinglé modifié |

Validation locale proportionnée : tests ciblés puis `pnpm run validate` ; aucune commande lourde en parallèle.

## Compatibilité, risques et retour arrière

| Sujet | Évaluation |
|---|---|
| Compatibilité | Nouvelle commande et nouveaux modules ; la voie CLI existante et la requête publique de Core sont inchangées. |
| Contournement de gate | Risque principal : une nouvelle entrée ne doit exposer aucun exécuteur sans l'admission et la barrière existantes (point E4.1). |
| Bail | Sans renouvellement câblé, reprise concurrente possible : prérequis bloquant (E12.2). |
| Annulation | Coopérative tant qu'aucune propagation n'existe ; perte de preuve aujourd'hui (U6) : correctif additif à déployer en deux temps. |
| Isolation | Hypothèses d'exploitation du poste non qualifiées ; sans isolation, l'assertion ne protège que des défauts de logique. |
| Détachement | Processus sans superviseur : repose sur l'expiration du bail et sur une reprise explicite. |
| Retour arrière | Retrait de la commande et des modules avant tout enregistrement écrit avec champs nouveaux ; ensuite à sens unique pour ces champs. |

## Critères d'acceptation

1. L'entrée authentifiée refuse en échec fermé toute requête dont l'assertion, les droits ou l'isolation ne sont pas vérifiés, avant de lire un enregistrement.
2. `request_execution` applique l'admission complète et la barrière G3.2/B5 ; `execute` brut n'est pas atteignable.
3. Un accusé est renvoyé après la persistance du bail, l'exécution se poursuit détachée, le bail est renouvelé, et une exécution longue n'est pas reprise en double.
4. Une annulation autorisée est propagée à l'exécuteur, ou son caractère coopératif est explicite ; les preuves de l'exécution sont conservées.
5. Aucun service réseau n'est ajouté ; l'état, la configuration, les clés et les journaux ont les propriétaires et modes attendus, sinon refus.
6. L'audit strict complet, le typage, le test d'impact documentaire et le test de direction de dépendances passent sans modification de ces contrôles ; aucune gate n'est modifiée.

## Décisions restantes

**Relevant de Loop Engine** : format et emplacement de la configuration d'autorisation (clés publiques, annuaire, plafonds) ; câblage du renouvellement de bail et de l'annulation active, et propagation d'un signal d'annulation à l'exécuteur ; conservation des preuves en cas d'annulation (champ optionnel) ; qualification de la barrière G3.2/B5 et position de l'exécution durable par rapport à elle ; forme de l'accusé et du détachement ; mandat d'implémentation dans ce dépôt.

**Relevant de la plateforme (gouvernance non publique)** : acceptation des contrats d'identité, d'autorisation, de transport et de topologie ; isolation du compte de LP Control sur le poste (ou acceptation explicite du risque « même utilisateur ») ; paramètres cryptographiques (algorithme, durée d'assertion, tolérance d'horloge, nombre de clés actives) et leur revue de sécurité ; distribution des clés publiques ; hôte cible de LP Control.
