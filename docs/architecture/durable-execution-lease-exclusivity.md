# Exclusivité du bail d'exécution durable — audit et correctif

**Statut :** correctif borné ; renouvellement et reprise **non raccordés** au chemin opérationnel.
**Périmètre :** `src/loop/file-durable-execution-store.ts`, `src/loop/durable-execution-controller.ts`, `src/loop/durable-execution-heartbeat.ts`.
**Gate G3.2/B5 :** inchangée (`hasVerifiedAutoSubscriptionExecutionEvidence()` reste faux ; `cli.ts` n'est pas modifié). Aucune entrée authentifiée (E4) n'est raccordée.

## 1. Comportement constaté avant correctif (`main` à `f446075`)

| #   | Constat                                                                                                                                                                                                                                  | Nature                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Bail créé par `runDurableLoopExecution` : enregistrement `running`, `leaseOwner`, `leaseExpiresAt` (30 min en production), `attempt` incrémenté à chaque acquisition ; écriture par comparaison de révision (CAS) sous verrou de fichier | Lecture du code                                                                     |
| 2   | **Un bail actif était repris par n'importe quel demandeur portant la même étiquette de détenteur** (`leaseOwner !== request.owner` seul bloquait). Deux processus partageant l'étiquette exécutaient tous deux                           | **Défaut démontré** (test D1)                                                       |
| 3   | Verrou de fichier `<digest>.lock` créé en `wx` ; considéré périmé après `lockTimeoutMs` (10 s) sur son seul `mtime`, **même si le détenteur est vivant** ; libération par `rm` sans vérifier l'identité du détenteur                     | Lecture du code                                                                     |
| 4   | Un détenteur vivant bloqué dans la section critique (arrêt de processus, veille, E/S lente) se faisait **voler le verrou** : deux écritures acceptées pour la même révision attendue, donc deux acquéreurs                               | **Défaut démontré** (tests D2, T10)                                                 |
| 5   | Un verrou orphelin (détenteur tué) n'était repris qu'après la péremption du `mtime` (10 s en production)                                                                                                                                 | **Défaut de vivacité démontré** (D3)                                                |
| 6   | Course de double suppression d'un verrou périmé (un attendeur supprime le verrou neuf d'un autre)                                                                                                                                        | Analyse du code ; **non reproduite** en huit processus (D4 passait avant correctif) |
| 7   | Répertoire d'état créé sans mode : `0777 & ~umask`                                                                                                                                                                                       | **Défaut démontré** (P1 : `0777` sous umask 0)                                      |
| 8   | Aucun `fsync` du fichier ni du répertoire avant l'accusé                                                                                                                                                                                 | Lecture du code ; non testable par un test d'arrêt de processus                     |
| 9   | `runDurableExecutionHeartbeat` et `recoverDurableExecution` ne sont appelés par **aucun** module de production                                                                                                                           | Fonctionnalités non raccordées                                                      |
| 10  | Renouvellement et reprise concurrents sur un bail expiré : exactement un aboutit (CAS) ; un ancien détenteur d'étiquette distincte ne peut pas terminer le bail de son successeur                                                        | Comportement correct (tests T6, T7, non-régression)                                 |

## 2. Cause racine

L'exclusion mutuelle reposait sur **une hypothèse de temps** (un verrou plus vieux que 10 s est mort) au lieu d'une **vérification de vie du détenteur**, et l'identité du détenteur d'un bail était une **étiquette libre** sans compteur de tentative.

## 3. Correctif

1. **Verrou du magasin** : remplacement du verrou `mtime` par le gestionnaire de verrous de répertoire existant (`createLocalProjectLockManager`, déjà testé, notamment le cas « un récupérateur retardé ne peut pas mettre en quarantaine un verrou de remplacement ») : métadonnées de détenteur (PID, hôte, identifiant de verrou), reprise **seulement si le détenteur est mort sur le même hôte**, mise en quarantaine nommée par l'identifiant du verrou mort (une seule reprise possible par verrou), libération conditionnée à l'identifiant. Un détenteur **vivant** n'est jamais dépossédé : la contention aboutit à un refus borné (`lockTimeoutMs`), jamais à une écriture. Aucune dépendance nouvelle.
2. **Identité du détenteur** : `(owner, attempt)`. Un bail actif exclut tout demandeur, quelle que soit son étiquette. Les écritures de progression et de fin du contrôleur, et le renouvellement (champ optionnel `attempt`), vérifient la tentative : un ancien détenteur ne peut ni terminer, ni renouveler, ni libérer le bail d'un successeur portant la même étiquette.
3. **Persistance** : écriture par descripteur, `fsync` du fichier, `rename` atomique, `fsync` du répertoire, avant le retour de `save` (donc avant tout accusé). Répertoire d'état et répertoire de verrous créés en `0700`, fichiers en `0600`.

## 4. Garanties démontrées (tests `tests/loop/durable-execution-concurrency.test.ts`)

- Six processus demandant le même bail : un seul exécute (T1).
- Un bail actif n'est pas repris, même sous la même étiquette (D1) ; une reprise sur bail actif est refusée (T5) ; une reprise répétée est refusée ; deux reprises concurrentes sur bail expiré : une seule aboutit (T5).
- Renouvellement concurrent d'une reprise : exactement un aboutit (T6), sur 15 tours.
- Un ancien détenteur ne peut pas terminer le bail de son successeur (T7, T11) ; un renouvellement d'une ancienne tentative est refusé (`lease_lost`, T11).
- Un détenteur de verrou vivant n'est jamais dépossédé (D2, T10) ; un verrou de détenteur tué est repris sans attendre une péremption (D3) ; huit processus se disputant un verrou orphelin : une seule écriture (D4).
- `SIGKILL` pendant l'exécution : état `running`, reprise refusée tant que le bail est actif (T5) ; arrêt entre la persistance et l'accusé : bail actif, exécuteur non démarré, nouvelle demande refusée (T8).
- Magasin indisponible : échec fermé, exécuteur non appelé, aucun enregistrement (T9).
- Mode `0700` / `0600` indépendant de l'umask (P1).

## 5. Garanties **non** démontrées

- **Exécution exactement une fois** : non démontrée et non revendiquée. Le compteur de tentative protège l'**enregistrement**, pas les **effets externes** (Git, publication, fournisseur) : un détenteur dont le bail a expiré mais dont le processus est vivant peut encore produire des effets. Un jeton de génération n'a de valeur que si chaque opération à effet externe le vérifie ; ce n'est pas le cas, et l'exécuteur ne reçoit aucun signal d'annulation.
- **Survie à une coupure de courant** : `fsync` ≠ `F_FULLFSYNC` sur macOS ; les tests `SIGKILL` ne prouvent rien sur ce point.
- **Hôtes multiples ou systèmes de fichiers partagés** : la reprise d'un verrou exige le même hôte ; un verrou d'un autre hôte n'est jamais repris (refus après `lockTimeoutMs`).
- **Réutilisation d'un PID** : un verrou orphelin dont le PID a été réattribué à un processus vivant n'est pas repris (échec fermé, intervention manuelle).
- **Déploiement mixte** : un ancien processus utilisant l'ancien verrou `<digest>.lock` n'est pas exclu mutuellement avec le nouveau code ; ne pas faire coexister les deux versions sur un même répertoire d'état.
- Les répertoires de quarantaine `.locks/*.recovered-*` ne sont pas purgés.

## 6. Pourquoi renouvellement et reprise restent désactivés

Raccorder `runDurableExecutionHeartbeat` ou `recoverDurableExecution` au chemin opérationnel exigerait, en plus de l'exclusivité de l'enregistrement (désormais démontrée) : (a) un signal d'annulation propagé à l'exécuteur lorsque le bail est perdu (`lease_lost`), faute de quoi l'ancien détenteur continue d'agir ; (b) une commande de reprise autorisée (E4) ; (c) une décision sur le modèle de supervision (processus détaché, E12). Ces éléments modifient le modèle d'exécution et relèvent d'une tranche distincte.

## 7. Tranche suivante recommandée

1. Propager l'annulation à l'exécuteur et l'arrêter à la perte du bail.
2. Câbler le renouvellement avec `attempt`, intervalle nettement inférieur au bail, arrêt de l'exécution sur `lease_lost`.
3. Commande de reprise autorisée (E4), jamais automatique.
4. Vérification de la tentative par chaque opération à effet externe, ou preuve qu'aucun effet n'est possible après perte du bail.
5. Purge bornée des quarantaines de verrous.
