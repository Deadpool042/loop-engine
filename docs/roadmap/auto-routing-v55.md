# V55 — Routage AUTO ChatGPT / Codex / Claude

Date : 2026-09-14

## Objectif

Rendre le choix `Continuer` réellement automatique entre :

- ChatGPT comme orchestrateur interactif principal ;
- Codex CLI comme executor autonome abonnement ;
- Claude Code CLI comme executor autonome abonnement ;

sans API payante implicite, sans second routeur et sans promouvoir les runtimes natifs OpenClaw Codex/Claude qui n’ont pas atteint la parité.

Audit de départ : [`../audits/2026-09-14-auto-routing-chatgpt-codex-claude-audit.md`](../audits/2026-09-14-auto-routing-chatgpt-codex-claude-audit.md).

## V55.0 — Pipeline de preuve AUTO multi-provider

### Objectif

Restaurer le raccord réel Development Workspace → OpenClaw Control → Loop Engine et fournir une preuve runtime complète, fraîche et fail-closed pour Codex et Claude.

### Checklist

- [ ] Corriger le drift `oc14:auto-route:evidence` → `auto-route:evidence` dans Development Workspace.
- [ ] Ajouter une couverture qui échoue si le script de preuve réellement exposé par `openclaw-control/package.json` diverge du nom attendu par DW.
- [ ] Étendre la preuve runtime OpenClaw Control pour exposer Codex **et** Claude uniquement depuis des sources observées/configurées.
- [ ] Injecter les fenêtres Claude issues du bridge existant dans le snapshot quota AUTO lorsqu’elles sont fraîches ; sinon Claude reste `unknown/unavailable`.
- [ ] Ne jamais inventer de pourcentage, modèle, disponibilité ou coût.
- [ ] Conserver les executors directs Codex/Claude et les garde-fous abonnement existants.
- [ ] Vérifier qu’un `project_handoff` réel ne retourne plus `auto_portfolio_unavailable` lorsque les preuves sont disponibles.
- [ ] Supprimer les tests de suite standard qui dépendent de l’état courant du dépôt au lieu d’un invariant stable ; conserver les comportements via fixtures déterministes.
- [ ] Pendant l’implémentation, exécuter seulement les tests ciblés du contrat modifié ; réserver `pnpm run ci` complet à la gate PR/fin de lot.
- [ ] Tests/validations DW + OpenClaw Control + Loop Engine verts.

### Critère de fin

Le handoff canonique reçoit un portfolio AUTO multi-provider exploitable sans variable injectée manuellement par l’utilisateur, et toute source manquante produit un état explicite plutôt qu’un choix inventé.

## V55.1 — ChatGPT comme route interactive gouvernée

### Objectif

Faire de ChatGPT une option réelle du choix AUTO sans le transformer en executor CLI ou en runtime autonome fictif.

### Checklist

- [ ] Ajouter un candidat de continuation `chatgpt`/`chatgpt_handoff` distinct des executors autonomes.
- [ ] Réutiliser le selector/policy existant ; aucun LLM ne choisit le LLM.
- [ ] Définir mécaniquement les catégories/situations où l’orchestration interactive est admissible (audit, review, gouvernance/coordination, ou absence de route autonome sûre).
- [ ] Conserver Codex/Claude pour les modifications autonomes bornées quand une route directe admissible existe.
- [ ] Exposer `runtime/provider/model/effort/executionPath` et les raisons `notSelected` sans inventer de quota ChatGPT séparé.
- [ ] Interdire à la route ChatGPT de déclencher `runDurableAutoSubscriptionPublish` comme si elle était un provider.
- [ ] Conserver les routes natives OpenClaw Codex/Claude non exécutables tant que la parité reste négative.
- [ ] Tests adversariaux : ChatGPT sélectionné, Codex sélectionné, Claude sélectionné, quota inconnu, aucun candidat sûr.

### Critère de fin

Le handoff AUTO peut retourner soit `chatgpt_handoff`, soit un `direct_cli` Codex/Claude, avec décision déterministe et explicable.

## V55.2 — Continuer de bout en bout + burn-in

### Objectif

Raccorder le choix au CTA `Continuer` et démontrer en conditions réelles que l’orchestrateur utilise la route sélectionnée sans bypass de gouvernance.

### Checklist

- [ ] Adapter `roadmap.continue` pour transporter la nouvelle route sans choisir localement le provider.
- [ ] Pour `chatgpt_handoff`, retourner un handoff canonique consommable par la session ChatGPT, sans exécution provider implicite.
- [ ] Pour `direct_cli`, conserver projet + candidat + SHA + route exacte et utiliser l’exécution durable Loop Engine existante.
- [ ] Vérifier que le caller ne peut pas substituer provider/modèle/effort après la décision.
- [ ] Burn-in réel ChatGPT : lot d’audit/revue traité via DW/Loop Engine avec route interactive.
- [ ] Burn-in réel Codex : sélection + exécution abonnement bornée + validation/evidence.
- [ ] Burn-in réel Claude : sélection + exécution abonnement bornée + validation/evidence, seulement si quota frais ; sinon preuve fail-closed explicite.
- [ ] Vérifier les quotas avant/après lorsqu’ils sont réellement disponibles ; aucune estimation fictive.
- [ ] Vérifier notification/Run History/candidate ref sans nouveau stockage de progression.
- [ ] Mettre à jour Cockpit pour afficher clairement `ChatGPT`, `Codex` ou `Claude` sélectionné et pourquoi.
- [ ] Audit final : aucune API payante implicite, aucun second router, aucun shell libre, aucun runtime natif non qualifié promu.
- [ ] Validation/CI vertes dans chaque dépôt touché et worktrees `main` propres.

### Critère de fin

Un clic/une action `Continuer` obtient une décision AUTO fiable entre ChatGPT, Codex et Claude, puis emprunte le chemin correspondant sans que l’utilisateur choisisse manuellement le provider. Les limites de la route ChatGPT interactive sont affichées honnêtement.

## Gates V55

- Loop Engine reste seule autorité de routage.
- Development Workspace transporte des preuves et exécute des contrats bornés ; il ne choisit pas le provider.
- OpenClaw Control collecte/projette les preuves runtime ; il ne maintient pas de second catalog de décision.
- Aucun provider API payant ni crédit additionnel implicite.
- Aucun quota inventé.
- Aucun changement des décisions négatives OC-15/OC-16 sur OpenClaw `2026.9.4`.
- Aucun nouveau scheduler, ledger ou stockage de progression.
- Aucun lot suivant avant clôture complète du lot courant.