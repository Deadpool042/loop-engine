# Audit — routage AUTO ChatGPT / Codex / Claude — 2026-09-14

## Objectif

Rendre le choix AUTO réellement opérationnel entre l’orchestrateur ChatGPT interactif et les executors abonnement Codex CLI / Claude Code CLI, sans réouvrir les migrations natives OpenClaw de Codex/Claude déjà rejetées sur `2026.9.4` et sans introduire d’API payante.

## Verdict

Le sélecteur Loop Engine, les executors Codex/Claude, les quotas OpenAI, le bridge quota Claude, le CTA `Continuer` et les garde-fous d’exécution existent déjà. Le défaut principal est un raccord cassé et incomplet entre ces briques.

Trois gaps sont démontrés :

1. **Le portfolio AUTO n’arrive plus au handoff.** Development Workspace appelle encore le script npm `oc14:auto-route:evidence`, renommé en `auto-route:evidence` pendant OC-22. L’échec est absorbé et `buildAutoRouteEnvironmentDelta()` retourne `null`; Loop Engine reçoit donc zéro `LOOP_AUTO_SUBSCRIPTION_PORTFOLIO_JSON` et projette `auto_portfolio_unavailable`.
2. **La preuve runtime actuelle est mono-provider.** `openclaw-control/scripts/oc14-auto-route-evidence.mjs` ne produit qu’un profil `codex` dérivé du modèle OpenAI observé et du `usage.status` natif. Le bridge Claude est managé, mais ses fenêtres ne sont pas injectées dans le portfolio/quota snapshot AUTO.
3. **ChatGPT existe comme runtime de type, pas comme route de continuation.** `AGENT_RUNTIMES` contient déjà `chatgpt`, mais `AutoSubscriptionModelPortfolio` et `buildAutoSubscriptionExecutionCandidates()` ne modélisent que `codex`, `claude_code` et `openclaw`. `roadmap.continue` n’accepte aujourd’hui qu’un `autoRoute.status=selected` provenant de ces candidates. ChatGPT ne doit pas être transformé en faux CLI : sa route correcte est un handoff interactif gouverné vers la session ChatGPT qui utilise ensuite Development Workspace / Loop Engine.

## Faits vérifiés

### Loop Engine

- Le chargement AUTO repose sur `LOOP_AUTO_SUBSCRIPTION_PORTFOLIO_JSON`; aucun catalog commercial n’est inféré en son absence.
- Le handoff utilise le même portfolio et un quota snapshot séparé (`LOOP_AUTO_QUOTA_SNAPSHOT_JSON`).
- Le selector sait déjà comparer provider/runtime/model/effort, appliquer capabilities/permissions, funding, quota et evidence d’efficacité.
- Codex CLI et Claude Code CLI sont des bindings directs existants, isolés et gouvernés.
- V53 a déjà qualifié Codex Astra par abonnement et le fallback inter-provider propre.
- Les qualifications OpenClaw natives OC-15/OC-16 restent négatives sur `2026.9.4`; elles ne doivent pas être rouvertes.
- Le runtime `chatgpt` est déjà un identifiant Agent valide, mais aucun binding AUTO de continuation ne l’exploite.

### Development Workspace

`packages/dw-shell/src/tools/project-handoff.ts` contient :

- `AUTO_ROUTE_EVIDENCE_SCRIPT = "oc14:auto-route:evidence"` ;
- appel optionnel au dépôt `openclaw-control` ;
- injection bornée des deux variables AUTO uniquement dans le process enfant `loop handoff` ;
- fallback silencieux `null` sur tout échec de preuve.

Le test `project-handoff.test.ts` reproduit encore explicitement l’ancien nom de script. Le drift n’était donc pas couvert par un contrat cross-repo.

### OpenClaw Control

`package.json` expose désormais uniquement `auto-route:evidence`.

Le script de preuve :

- lit `models status` et `usage.status` natifs ;
- ne persiste aucun compteur ;
- produit actuellement uniquement `portfolio.codex` ;
- ne consomme pas `readClaudeQuotaCache()` alors que le bridge Claude est conservé précisément faute de parité native Anthropic sur le VPS.

Le CTA `roadmap.continue` :

- vérifie candidat canonique, Git propre, admissibilité et SHA ;
- refuse si AUTO est indisponible ;
- retourne la route sélectionnée et l’evidence de quota ;
- ne doit pas choisir localement un provider.

## Architecture cible

Une seule décision canonique reste dans Loop Engine.

```text
OpenClaw / ChatGPT
      |
      v
Development Workspace project_handoff
      |
      +--> preuve runtime bornée OpenClaw Control
      |      - OpenAI/Codex usage natif
      |      - Claude quota bridge fail-closed
      |      - disponibilité runtime observée
      v
Loop Engine AUTO continuation router
      |
      +--> chatgpt_handoff  -> ChatGPT orchestre avec DW/Loop Engine
      +--> direct_cli Codex -> executor Codex existant
      +--> direct_cli Claude-> executor Claude Code existant
```

Le routeur ne doit jamais appeler un LLM pour choisir un LLM. La décision reste déterministe à partir de la catégorie du lot, des capabilities, du scope, de l’effort, de la disponibilité, du quota et de l’efficacité historique lorsque disponible.

## Politique proposée pour ChatGPT

ChatGPT est une **route d’orchestration interactive**, pas un executor de worktree. Elle est admissible pour les tâches où l’orchestration, l’audit, la revue, la gouvernance ou la coordination multi-outils est la valeur principale. Elle ne doit pas être présentée comme une exécution autonome durable.

Codex/Claude restent privilégiés pour une mission autonome bornée de modification de code lorsque le candidat est exécutable par le pipeline provider isolé.

La décision doit être explicitement observable via `executionPath` :

- `chatgpt_handoff` ;
- `direct_cli`.

Aucune route `openclaw_native` Codex/Claude n’est promue.

## Risques

- **Faux automatisme ChatGPT** : prétendre qu’un bouton peut invoquer la session ChatGPT courante comme un CLI. À éviter : la route doit être un handoff, consommé par l’orchestrateur interactif.
- **Quota Claude périmé** : le bridge doit rester fail-closed ; Claude est rejeté si la preuve est absente/stale.
- **Drift cross-repo** : le nom du script et le schéma de preuve doivent avoir un test de compatibilité explicite.
- **Catalog de modèles figé** : conserver des profils configurés/révisables et ne jamais déduire capacités/coût d’un nom commercial.
- **Double routeur** : OpenClaw et DW transportent, Loop Engine décide.

## Décision

Ouvrir un cycle V55 en trois lots larges :

1. V55.0 — restaurer et fiabiliser le pipeline de preuve AUTO multi-provider ;
2. V55.1 — ajouter ChatGPT comme route interactive gouvernée dans la continuation AUTO ;
3. V55.2 — raccorder `Continuer` de bout en bout et qualifier les trois chemins par burn-in réel, puis audit de clôture.

Aucun autre chantier n’est ouvert par défaut.