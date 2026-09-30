# V59 — Copilot abonnement comme executor Loop gouverné via Hermes

## Objectif

Qualifier et intégrer GitHub Copilot comme executor autonome réellement prouvé dans Loop Engine, sans créer de second routeur et sans ajouter d'API payante.

Loop Engine reste seul responsable de la sélection `runtime/provider/model/effort`, des hard gates de quota, du worktree isolé, du scope et des validations. Hermes sert uniquement de runtime headless pour exécuter le choix explicite `copilot + modèle`.

## Faits vérifiés avant implémentation

- Hermes P2 a qualifié `provider=copilot`, `model=gpt-6-luna` sur `vps-main`.
- Le burn-in réel Copilot a appelé Development Workspace avec succès sans File / Terminal / code_execution / computer_use natifs.
- Sous panne Codex process-local, Hermes a basculé vers Copilot et terminé la même tâche bornée.
- Loop Engine sait déjà exiger une evidence explicite `availability + quota + capabilities` dans le portfolio AUTO et fail-close lorsque le quota est inconnu.
- Le profil `copilot.low` de `DEFAULT_AGENT_PROFILES` est illustratif et ne doit jamais devenir une preuve runtime.
- Aucun adapter Copilot exécutable n'est actuellement enregistré dans `src/composition/provider-registry.ts`.

## Décision

Ajouter un executor `copilot` dont le processus concret est Hermes CLI, mais sans déléguer le routage à Hermes :

- runtime Loop : `copilot`;
- provider Loop : `github`;
- executable concret : `hermes`;
- provider Hermes forcé : `--provider copilot`;
- modèle Hermes forcé : `--model <plan.model>`;
- effort forcé depuis le plan ;
- toolset Hermes limité à `file`;
- aucun Terminal, code execution, browser, web, MCP externe ou délégation ;
- Loop Engine continue d'exécuter les validations après le delta ;
- capacité initiale réelle : `code_edit` uniquement ;
- permissions initiales : `read_only + write_worktree`;
- financement AUTO : `included_subscription`;
- quota AUTO : obligatoire et explicite ; `unknown` reste fail-closed.

Le fichier d'usage Hermes est lu après le run afin de vérifier que le provider et le modèle réellement utilisés correspondent au plan. Une divergence échoue explicitement.

## Hors périmètre

- aucun fallback interne Hermes pendant une exécution Loop Copilot ;
- aucune API GitHub/Copilot directe ;
- aucune clé/token dans Git ou dans le plan ;
- aucun shell natif Hermes ;
- aucun test exécuté par Hermes ;
- aucun commit/push/publish par Hermes ;
- aucune qualification Claude supplémentaire ;
- aucun changement du routeur AUTO autre que l'ajout de cette candidate réellement exécutable.

## Critères de clôture

1. Le registry concret accepte `copilot` et construit un profil `configured.copilot.*` avec provider `github`.
2. L'executor rejette tout plan qui n'est pas `runtime=copilot/provider=github`.
3. Le processus Hermes reçoit provider, modèle, effort et `toolsets=file` explicitement.
4. Le provider est forcé par l'argument CLI `--provider copilot` et le modèle effectif est vérifié dans l'événement `system:init` stream-json ; si `--usage-file` produit une preuve sur la version Hermès active, elle doit corroborer strictement provider et modèle. Son absence observée en `chat --oneshot` n'est jamais remplacée par une valeur inventée.
5. Les tool calls stream-json ne contiennent aucun outil natif interdit.
6. Loop observe le delta du worktree et reste propriétaire de la validation.
7. Le portfolio AUTO accepte Copilot uniquement avec availability/capabilities/quota explicites.
8. `quota=unknown` est rejeté lorsque `requireKnownQuota=true`.
9. Aucun nom de modèle n'est inventé par Loop ; `gpt-6-luna` vient de l'evidence runtime.
10. Un burn-in VPS réel modifie uniquement un fichier dans un dépôt temporaire et confirme provider/modèle.
11. `pnpm run ci` est vert avant merge.
