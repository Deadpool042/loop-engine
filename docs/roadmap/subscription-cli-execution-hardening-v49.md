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

Conserver le mode `workspace-write` et empêcher toute escalade interactive hors sandbox dans le run autonome.

La sandbox reste l'autorité technique de write/network ; Loop Engine conserve le worktree isolé, le contrôle de scope, l'inspection du diff et les validations.

### Claude Code

Le run non interactif ne doit disposer que des outils fichier nécessaires à la lecture/modification de la mission. Bash, MCP externes et autres outils non requis ne sont pas disponibles implicitement.

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
- arguments Codex explicitement bornés au sandbox autonome ;
- arguments Claude explicitement bornés aux outils fichier autorisés ;
- executors toujours fail-closed sur mismatch provider/modèle, timeout, sortie invalide et content policy ;
- tests ciblés et CI verts ;
- preuve permettant à DW-V3.2 de conclure par réutilisation plutôt que par duplication.
