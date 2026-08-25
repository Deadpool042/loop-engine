# Gouvernance de l'architecture

## Statut

Normatif.

Ce document définit les règles de gouvernance applicables à l'évolution de
l'architecture de Loop Platform.

## Objectif

Garantir que les évolutions du projet restent cohérentes, traçables et
déterministes.

## Règles

### Vision

La vision décrit les objectifs à long terme du projet.

Elle évolue uniquement lors d'un changement majeur d'orientation
architecturale.

### Glossaire

Le glossaire définit le vocabulaire officiel.

Tout nouveau terme architectural doit y être ajouté avant d'être utilisé
dans une RFC ou une ADR.

### Principes

Les principes décrivent les règles permanentes de conception.

Ils évoluent exceptionnellement.

### Cartographie

La cartographie définit les responsabilités des plateformes.

Toute nouvelle plateforme doit y être documentée.

### Règles de dépendance

Les dépendances autorisées et interdites sont définies dans un document unique.

Toute évolution des frontières architecturales doit être documentée avant son
implémentation.

### Frontière d'écriture dans les projets observés

Les projets déclarés dans `projects.yaml` sont en lecture seule par défaut.
Loop Engine ne peut pas écrire arbitrairement dans leur dépôt source.

Une exception explicite existe pour un artefact de gouvernance : lorsqu'un
projet déclare la propriété `execution_decision`, Loop Engine peut publier
uniquement ce fichier après approbation humaine. La publication est bornée par
le chemin déclaré, confinée dans le projet par `resolveContextPath`, réalisée
transactionnellement par `createTransactionalDecisionPublisher`, puis validée
par `validatePublishedExecutionDecision`. Une validation échouée déclenche la
récupération de l'état précédent.

À l'état courant, `lp-infra` déclare
`.governance/execution-decision.yaml`. Cette exception ne transfère aucune
logique métier LP-INFRA dans Loop Engine, n'autorise aucune autre écriture dans
le projet observé et ne constitue pas une permission générale attachée au mode
`execute`.

Toute nouvelle exception d'écriture inter-projet doit être déclarée
explicitement dans la configuration, documentée ici, bornée à un artefact
précis, soumise à une décision humaine et protégée par une validation/audit
avant d'être considérée comme autorisée.

### Candidate Ref Publication Git

V33 ajoute une sortie Git distincte de toute publication vers le worktree
source. `loop run <project> --mode publish` reste une action CLI humaine et
explicite, et ne peut suivre qu'une exécution isolée dont les validations ont
réussi. Elle ne réutilise pas `runLoopCommit` et ne demande ni push, ni PR, ni
merge, ni checkout.

Le patch validé est ré-identifié par SHA-256, appliqué seulement dans un index
temporaire (`GIT_INDEX_FILE`) chargé depuis son `baseSha`, puis comparé au
fileset validé. Git écrit ensuite la tree et un commit candidat avec ce seul
parent `baseSha`; l'identité author/committer est celle déjà configurée dans le
dépôt Git, jamais une identité humaine fabriquée par Loop Engine. Le commit ne
devient pas `HEAD`.

La seule mutation finale observable est la création compare-and-create de
`refs/loop-engine/candidates/<project>/<runId>` par `git update-ref` avec
l'ancien OID nul. Les composants `project` et `runId` sont validés avant de
former la ref; aucune ref fournie par un renderer ou l'utilisateur n'est
acceptée. Une ref existante, y compris une collision de course, échoue sans
remplacement. Avant cette opération, aucun ref candidat n'est publié; après,
la ref pointe entièrement vers le commit déjà préparé.

La source doit toujours avoir `HEAD === baseSha`, vérifié avant la préparation
et juste avant `update-ref`. Un worktree source dirty est admis: son contenu et
son index ne participent pas à la candidate tree, qui est exclusivement dérivée
de `baseSha` et du patch validé. V33 vérifie que `HEAD`, `git status`, `git
diff`, `git diff --cached`, la branche courante et `refs/heads/*` restent
inchangés. La rétention et le nettoyage des refs candidates restent hors
périmètre; aucun GC manager n'est introduit.

Cette capacité est une exception Git interne, bornée et explicitement demandée;
elle ne change pas l'exception `execution_decision`, ne crée pas de nouvel
Approval Engine et ne rend jamais la publication implicite après `execute`.

### Candidate Review et promotion distante

La **Candidate Publication** V33 crée l'artefact Git local
`refs/loop-engine/candidates/<project>/<runId>` ; elle ne constitue ni une
revue, ni une promotion. V34 ajoute une **Candidate Review** strictement en
lecture seule : `loop candidate review <project> --run-id <runId>` résout
d'abord l'identité déjà journalisée du run `publish` terminé dans Run History,
puis vérifie que la ref pointe encore vers le commit attendu et que son unique
parent est exactement `baseSha`. Il calcule ensuite les fichiers et compteurs
depuis les objets Git canoniques `baseSha..candidateCommitSha`.

Le lecteur n'accepte ni ref, SHA, chemin, cwd ni argument Git fournis par
l'appelant. Une entrée d'historique absente, une ref absente ou déplacée, un
parent différent ou un diff incohérent échouent fermés. La revue ne modifie ni
worktree, ni index, ni HEAD, ni aucune ref.

**Promotion distante : NO-GO en V34.** Une branche/ref distante, un push et une
PR GitHub nécessitent une destination trusted explicite, une action humaine
explicite, une protection contre les courses et des preuves d'état conservées.
Loop Engine ne déplace donc aucune `refs/heads/*`, n'appelle pas `git push` et
ne crée pas de PR. Git reste responsable des opérations de ref/push ; GitHub
(CLI, API ou connecteur) reste responsable de la PR, de la review, des
protections de branche, de la CI et du merge. La promotion reste distincte de
toute Governed Patch Application vers le worktree source.

### Publication multi-fichiers vers le dépôt source

V32 a qualifié les primitives Git disponibles sur des dépôts temporaires. Un
index alternatif (`read-tree` → `apply --cached` → `write-tree`) prépare et
compare un delta multi-fichiers exact sans écrire dans le worktree source. Un
worktree temporaire permet la même validation isolée. Ces deux préparations ne
fournissent toutefois aucune bascule atomique et récupérable de plusieurs
fichiers vers le worktree source : `git apply` et les opérations de checkout
restent des mutations de fichiers, sans journal de reprise qualifié ici.

La seule publication inter-projet vers le **worktree source** autorisée demeure
donc l'artefact unique `execution_decision`. Toute publication multi-fichiers
vers ce worktree reste refusée tant
qu'une primitive de bascule atomique, avec préflight complet, seconde
vérification de `baseSha`, protection d'un worktree source propre et
récupération démontrée, n'existe pas.

### ADR

Une ADR est créée lorsqu'une décision architecturale durable est prise.

Elle explique pourquoi une décision a été retenue.

### RFC

Une RFC est créée avant toute évolution importante.

Elle décrit ce qui sera construit et la manière dont cette évolution sera
mise en œuvre.

Une RFC peut être remplacée ou devenir obsolète.

## Source de vérité

La documentation d'architecture, les contrats publics, les audits et le code
constituent ensemble la source de vérité du projet.

En cas de divergence, celle-ci doit être résolue explicitement.
