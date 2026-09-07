# V49 — Durcissement de l'exécution CLI par abonnement

## Contexte

Development Workspace DW-V3.2 demande une délégation spécialiste bornée vers Claude Code / Codex, sans fallback payant implicite et sans capacité supérieure à ChatGPT/DW.

Loop Engine possède déjà les executors réels Codex CLI et Claude Code, le portefeuille de profils, la sélection coût/capacité, les quotas/funding, le worktree isolé, les validations, le content policy et le failover. Ajouter un launcher équivalent dans Development Workspace dupliquerait l'orchestration et augmenterait la surface de permissions.

L'audit V49 identifie néanmoins un défaut concret avant réutilisation : les subprocesses CLI héritent actuellement de l'environnement parent. Des variables comme des clés API pourraient donc devenir visibles pour une exécution qui doit privilégier les abonnements locaux.

## Décision

V49.0 durcit uniquement la frontière subprocess existante.

### Environnement enfant

Construire une allowlist minimale de variables nécessaires au lancement local et à l'authentification stockée par les CLI, sans recopier `process.env` en bloc.

Aucune variable de clé API ou credential fournisseur n'est transmise implicitement.

L'absence d'un credential abonnement local doit rendre le provider indisponible ou en erreur de façon explicite ; elle ne déclenche pas un fallback API secret.

### Codex

Conserver le durcissement `--ignore-user-config`, `workspace-write` et `approval_policy="never"`, mais ne **pas** considérer ce runtime comme qualifié pour une sélection autonome générale.

La documentation Codex actuelle recommande les permission profiles pour le least privilege et montre qu'une vraie isolation de lecture au workspace exige un profil custom qui nie `:root` puis rouvre `:minimal` et les workspace roots. Des régressions récentes existent cependant autour de ces profils sur Linux/worktrees. Introduire cette couche uniquement pour satisfaire DW-V3.2 augmenterait la complexité et la fragilité.

Décision V49 : Codex reste disponible en usage explicite/humain, mais le futur portefeuille `AUTO` doit l'exclure tant qu'une isolation de lecture équivalente au périmètre DW n'est pas démontrée simplement.

### Claude Code

Le run non interactif utilise `--restricted`, mode officiel destiné aux harness partagés : les outils fichier sont confinés aux working directories et les settings user/project ne sont pas chargés. Le run réduit en plus les built-ins à `Read,Edit,Write,Glob,Grep` et impose une configuration MCP vide stricte. Bash, MCP externes, navigateur et autres outils non requis ne sont donc pas disponibles implicitement.

Les tests/commandes de validation restent exécutés par Loop Engine, pas par Claude Code.

### Hors périmètre

- nouveau launcher dans Development Workspace ;
- nouveau scheduler/runner ;
- changement de gouvernance ;
- ajout d'un provider API ;
- gestion ou stockage de secrets ;
- exécution de commit/push/deploy dans les executors ;
- nouvelle télémétrie quota.

## Critères de clôture

- tests adversariaux sur l'environnement enfant : clés API/fournisseur absentes, variables système nécessaires conservées ;
- arguments Codex durcis et doctrine explicit-only documentée tant que son read boundary n'est pas prouvé ;
- arguments Claude explicitement bornés à `--restricted` et aux outils fichier autorisés ;
- executors toujours fail-closed sur mismatch provider/modèle, timeout, sortie invalide et content policy ;
- tests ciblés et CI verts ;
- preuve permettant à DW-V3.2 de conclure par réutilisation plutôt que par duplication.

## Preuve de livraison V49.0

L'implémentation ajoute `src/loop/subscription-cli-environment.ts`, une allowlist déterministe pour les subprocesses CLI. Les clés API/provider, tokens GitHub, agent SSH, URL de base de données, proxies et autres variables non déclarées ne sont plus hérités par défaut. Les emplacements locaux nécessaires à l'authentification abonnement (`HOME`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, XDG) et les variables système minimales restent disponibles.

Codex est lancé en mode non interactif avec :

- `--ignore-user-config` pour empêcher l'héritage de MCP/config utilisateur ;
- `--sandbox workspace-write` ;
- `approval_policy="never"` injecté pour la session ;
- le modèle explicitement issu du `LoopExecutionPlan`.

Ce durcissement protège l'environnement, l'écriture et le réseau, mais ne constitue pas une preuve suffisante d'isolation de **lecture** hors worktree. Codex est donc classé `explicit-only` pour la suite DW-V3.2 ; il ne doit pas être inclus dans le portefeuille AUTO.

Claude Code est lancé avec :

- `--restricted` pour confiner les outils fichier au working directory et ignorer les customisations/settings non managés ;
- `--permission-mode acceptEdits` ;
- `--tools Read,Edit,Write,Glob,Grep` ;
- `--strict-mcp-config --mcp-config {}` ;
- aucun outil Bash, MCP ou navigateur implicitement disponible ;
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` ajouté explicitement à l'environnement assaini.

Le contrôle mécanique existant reste inchangé : worktree Git propre et isolé, observation du delta réel, scope guard, content policy, validations Loop Engine, timeout/output limits et aucune capacité commit/push/publish/deploy dans les executors.

Qualification locale avant clôture : 37/37 tests V49 ciblés, groupe Core/frontières 635/635, TypeScript, `json-check`, audit strict 635/635, audit profiles et `git diff --check` verts. Les tests couvrent explicitement l'absence de `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` et `SSH_AUTH_SOCK` dans les deux subprocesses. La CI complète reste le gate final de livraison.

## Qualification complémentaire Codex AUTO — 2026-09-07

La restriction `explicit-only` de V49 reste l'historique correct de la livraison initiale. Elle est levée pour le runtime AUTO après une qualification dédiée sur le VPS Ubuntu 24.04 servant OpenClaw/Loop Engine.

### Runtime qualifié

- Codex CLI `0.153.4` ;
- authentification locale `chatgpt` confirmée par `codex doctor --json` ;
- aucun `OPENAI_API_KEY` stocké ou transmis ;
- modèles abonnement vérifiés par exécution réelle : `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`.

### Frontière filesystem et réseau

Le précédent `--sandbox workspace-write` est remplacé pour AUTO par un permission profile strict :

- `:root = deny` ;
- `:minimal = read` ;
- worktree courant rouvert en `write` ;
- répertoire d'installation Codex rouvert en `read` uniquement pour permettre au helper runtime de s'exécuter ;
- `:tmpdir` et `:slash_tmp` refusés ;
- réseau des commandes sandboxées désactivé ;
- `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--strict-config` et `approval_policy="never"`.

Ubuntu 24.04 bloque les user namespaces non profilés via AppArmor. La protection globale reste activée. Le prérequis hôte est le profil ciblé versionné dans `ops/apparmor/codex-auto-userns`, qui accorde uniquement `userns,` au binaire natif Codex ; bwrap reste responsable de l'isolation filesystem/réseau.

### Preuves adversariales

Canary mécanique sans modèle, sous le profil exact :

- lecture d'un fichier dans le worktree : autorisée ;
- lecture de `../outside-canary.txt` : masquée/refusée ;
- écriture dans le worktree : autorisée et persistée ;
- écriture hors worktree : aucune modification de l'hôte.

Canary end-to-end avec le vrai `codex exec` abonnement :

- Codex crée le fichier demandé dans le worktree ;
- une commande shell réelle `cat ../outside-canary.txt` termine en erreur ;
- aucun fichier `leaked.txt` n'est créé ;
- le canary externe reste inchangé.

### Portefeuille AUTO

Codex est donc admissible comme second provider autonome subscription-only :

- `gpt-5.6-luna` : economy ;
- `gpt-5.6-sol` : standard + `long_context` ;
- `gpt-5.6-terra` : advanced + `long_context` + `multi_file_refactor`.

Claude reste primaire à tier/effort/funding égal par le classement déterministe existant. Le failover AUTO est borné à deux providers et peut passer de Claude à Codex sur timeout, limite de process ou épuisement de tours. Aucun fallback API payant n'est ajouté.
