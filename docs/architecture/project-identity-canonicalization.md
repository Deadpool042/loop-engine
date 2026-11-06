# Identité de projet canonique et entrées canoniques — proposition L7.1 (E5/E6)

## Statut

**Proposition du 2026-11-06, non acceptée, non implémentée.** Ce document ne modifie aucun comportement, aucun contrat JSON (`schemaVersion: 1`), aucune gate. En particulier la gate G3.2/B5 (exécution `--auto-subscription`) n'est ni levée ni contournée. Il prépare, sans l'engager, le lot L7.1 (évolutions E5 et E6) du plan de qualification L7 consigné dans la documentation de gouvernance de la plateforme (non publique). L'implémentation exige l'acceptation préalable des contrats concernés par le propriétaire, puis un mandat explicite dans ce dépôt, conformément à `AGENTS.md` ; la fusion se fait par merge commit, seul mode permis par le ruleset (F12).

Ce fichier n'est pas une feuille de route : il ne contient aucune ligne candidate pour le lecteur de roadmap.

## Faits vérifiés

Dépôt Loop Engine, `main` au commit `0e22b45`. Tout ce qui suit provient du code lu.

| # | Constat | Source |
|---|---|---|
| F1 | `loadConfig` analyse `projects.yaml` et confine les chemins, mais **ne valide ni le nom, ni l'unicité des noms**. | `src/core/config.ts` |
| F2 | Le motif de nom `^[a-z0-9][a-z0-9-]{0,62}$` est **dupliqué dans quatre fichiers** (enregistrement, archivage, retrait, `set-repository`) ; il s'applique à l'écriture du registre par commande, **pas au chargement**. Un motif plus large (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`) sert de garde de chemin dans l'historique d'exécutions. | `src/workspace/project-*.ts`, `src/core/run-history.ts` |
| F3 | Unicité : l'enregistrement refuse tout nom déjà présent (message distinct pour un nom retiré, jamais ré-enregistrable) ; `project retire` refuse un nom présent plusieurs fois ; l'archivage et `set-repository` prennent la **première** entrée ; `findProject` prend la première entrée non archivée et non retirée. | `src/workspace/*`, `src/core/project.ts` |
| F4 | Les cinq noms actuels de `projects.yaml` (`development-workspace`, `creatyss`, `lp-infra`, `n8n`, `loop-engine`) sont distincts et conformes au motif. | `projects.yaml` |
| F5 | Clé d'idempotence de la voie `--auto-subscription` : `auto-subscription:<projet>:<candidat>:<head>`, head en minuscules, construite par Loop Engine ; `execution-status` l'analyse par la forme `^auto-subscription:[^:]+:([^:]+):([a-f0-9]{40})$` avec le drapeau `i` (insensible à la casse). Aucun motif de validation de l'identifiant de candidat n'a été trouvé (`--candidate` : valeur libre). | `src/composition/durable-auto-publish.ts`, `src/composition/execution-status.ts`, `src/cli.ts` |
| F6 | Contrôleur durable : `validRequest` accepte toute chaîne non vide après `trim` ; `.trim()` est appliqué à la clé, au projet et au détenteur à l'exécution et à l'annulation. La passerelle (`decodeRequest`) vérifie « non vide » mais transmet la **valeur brute**. | `src/loop/durable-execution-controller.ts`, `src/composition/orchestration-gateway.ts` |
| F7 | **Incohérence constatée** : `execute` et `cancel` normalisent la clé (`trim`), mais `status` et `verify` interrogent le magasin avec la clé **brute** ; le nom de fichier du magasin est l'empreinte SHA-256 de la clé. Ainsi `execute` avec `"k "` enregistre sous `"k"`, et `status` avec `"k "` répond `not_found` alors que `"k"` existe. `list(project)` compare le projet brut. | idem, `src/loop/file-durable-execution-store.ts` |
| F8 | La passerelle ne transmet pas `retryTerminal` à l'exécution. | `src/composition/orchestration-gateway.ts` |
| F9 | Aucun magasin d'exécutions durables n'a été trouvé sur le poste d'audit (ni emplacement d'état utilisateur, ni emplacement historique du dépôt) : aucune donnée locale à migrer. Les autres hôtes ne sont pas vérifiés. | lecture du système de fichiers |
| F10 | Aucune correspondance Project Factory ↔ Loop Engine n'existe (hors L7.1 : évolution E9). | — |
| F11 | Tests existants à préserver : `tests/loop/durable-execution-*.test.ts`, `tests/commands/project-{register,archive,retire,set-repository}.test.ts`, `tests/core/project-*.test.ts`, `tests/composition/production-orchestration-gateway.test.ts`. | `tests/` |
| F12 | Intégration : ruleset `Protect Main` actif, merge commit seul autorisé, contrôle requis `CI gate`, aucun bypass (ADR-0022). Le dépôt est public. | GitHub |

## Proposition E6 — registre validé au chargement

1. **Un seul module** (`src/core/project-identity.ts`) porte le motif de nom ; les quatre copies sont remplacées par son import (refactor sans changement de comportement).
2. **`loadConfig` valide** chaque entrée : nom conforme au motif ; **unicité exacte** des noms, entrées archivées et retirées comprises (le retrait est une tombstone : un nom retiré reste réservé) ; en cas d'erreur, **échec fermé** avec la liste des noms en cause.
3. Hors périmètre : renommage (aucune commande n'existe, aucune n'est ajoutée) ; identifiant opaque et stable distinct du nom (point ouvert, dépend de l'acceptation du contrat O9) ; toute correspondance Project Factory (E9).

## Proposition E5 — entrées canoniques, refus plutôt que normalisation

1. **Définition.** Une chaîne d'entrée est canonique si elle est non vide, égale à sa propre version `trim()` (ce qui exclut aussi les blancs Unicode de début et de fin), sans caractère de contrôle, et de longueur bornée (borne à fixer). Pour les clés, restreindre le jeu de caractères à l'ASCII imprimable est à instruire : sans cela, des variantes « presque identiques » (espace insécable interne, caractères de largeur nulle ou bidirectionnels) restent possibles. Un nom de projet doit en outre satisfaire le motif du registre.
2. **Règle.** Toute frontière **refuse** (`invalid_request`) une entrée non canonique et ne la normalise jamais : `validRequest` du contrôleur, `decodeRequest` de la passerelle pour `execute`, `status`, `verify`, `cancel`, `list`, et l'annulation, **y compris le détenteur (`owner`) et le demandeur d'annulation (`requestedBy`, chaîne libre aujourd'hui)**. Les `.trim()` deviennent inutiles et sont supprimés après validation.
3. **Effet sur F7.** Les opérations `execute`, `cancel`, `status`, `verify` et `list` traitent désormais la même chaîne ; l'incohérence disparaît.
4. **Clés.** Pas de grammaire imposée aux appelants au-delà de la règle 1. La grammaire `auto-subscription:…` reste produite par `durableAutoSubscriptionKey` ; la validation de l'identifiant de candidat (F5) est notée comme point à instruire, non traitée ici.
5. **Compatibilité.** Les clés construites par Loop Engine sont canoniques. Les enregistrements existants portent une clé, un projet et un détenteur déjà normalisés (le contrôleur les normalise à l'écriture ; vérifié dans le code, aucune autre source de clé n'a été trouvée) : aucune migration. Ce constat vaut pour le code et pour ce poste ; les autres hôtes ne sont pas vérifiés. Le changement de comportement est un **durcissement** : une requête avec espaces, acceptée hier par `execute`/`cancel`, est refusée. Aucun appelant n'est connu pour la passerelle (sans commande CLI) ; la voie CLI durable est de toute façon refusée par la gate G3.2/B5.

## Tests proposés (à écrire lors de l'implémentation)

| Évolution | Fichier | Cas |
|---|---|---|
| E6 | `tests/core/project-registry-validation.test.ts` (nouveau) | doublon → erreur ; nom non conforme → erreur ; archivé + retiré dupliqué → erreur ; registre aux noms actuels → accepté ; `loadConfig` appelle la validation |
| E6 | tests existants `project-*` | comportements inchangés après remplacement du motif dupliqué |
| E5 | `tests/loop/durable-execution-canonical-input.test.ts` (nouveau) | clé/projet/détenteur avec espace, vide, caractère de contrôle → `invalid_request` ; clé `auto-subscription:` canonique acceptée ; non-régression du rejeu et de la reprise |
| E5 | `tests/composition/production-orchestration-gateway.test.ts` (étendu) | `execute`, `status`, `verify`, `cancel`, `list` refusent l'entrée non canonique ; `status "k "` ne répond plus `not_found` mais `invalid_request` |

À l'implémentation, vérifier que ce document n'impose pas d'entrée d'index (`tests/documentation/documentation-impact.test.ts` référence `docs/architecture`). Validation locale proportionnée : tests ciblés des fichiers touchés, puis `pnpm run validate` ; aucun lancement parallèle de commandes lourdes.

## Migration, risques et retour arrière

| Sujet | Évaluation |
|---|---|
| Données | Aucune donnée modifiée ni migrée (F9, point 5.5). |
| Registre invalide | `loadConfig` est appelé partout : un `projects.yaml` non conforme bloquerait le CLI. **Voulu (échec fermé)**, mais d'impact large : contrôle préalable en lecture seule du registre avant activation ; message d'erreur explicite. |
| Fixtures et worktrees | `projects.yaml` est lu relativement au répertoire courant : la validation s'applique à tout registre lu depuis n'importe quel répertoire ou worktree. Vérifier, à l'implémentation, les registres des worktrees et les fixtures de tests (noms non conformes possibles ; non audité ici). |
| Appelants externes | Un appelant envoyant des espaces serait refusé ; aucun connu. |
| Refactor du motif | Mécanique ; couvert par les tests existants des commandes projet. |
| Retour arrière | Revert du commit (aucune donnée, aucun schéma, aucun contrat JSON modifié). |

## Critères d'acceptation

1. Un registre avec doublon ou nom non conforme est refusé au chargement, avec l'erreur explicite ; le registre actuel est accepté.
2. Les quatre copies du motif de nom du registre sont remplacées par une définition unique ; le motif plus large de l'historique d'exécutions (`run-history.ts`, simple garde de chemin) coexiste explicitement, son alignement éventuel exigeant d'évaluer les fichiers d'historique existants.
3. `"p "` et `"p"` ne désignent plus le même projet ; `"k "` n'est ni stocké ni interrogé sous `"k"`.
4. Les contrats JSON `schemaVersion: 1` et la sortie de `execution-status` sont inchangés.
5. Aucune gate n'est modifiée ; la gate G3.2/B5 reste active.

## Hors périmètre et dépendances

E5 et E6 n'ont **aucune dépendance de sécurité** et ne créent aucun mécanisme d'autorisation ni d'orchestration. Elles préparent l'ACL par projet (lot L7.2) en garantissant que la chaîne autorisée est la chaîne exécutée. Décisions restantes : acceptation des contrats d'identité et d'autorisation (gouvernance de la plateforme), mandat d'implémentation dans ce dépôt, bornes de longueur et jeu de caractères admis.
