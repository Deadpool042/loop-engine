# V55 — Routage AUTO ChatGPT / runtimes abonnement

Date : 2026-09-14 — révisé le 2026-09-15 après qualification OC-25.2

## Objectif

Rendre le choix `Continuer` réellement automatique entre les routes gouvernées qui sont **effectivement qualifiées au moment de la décision** :

- ChatGPT comme orchestrateur interactif ;
- OpenClaw natif comme runtime abonnement lorsqu’un binding précis a atteint la parité ;
- Codex CLI direct et Claude Code CLI comme executors abonnement conservés tant que leur retrait n’est pas justifié par une preuve de parité supérieure.

Aucune API payante implicite, aucun second routeur, aucun catalogue de modèles réinventé dans Loop Engine. Une qualification négative reste fail-closed ; une qualification positive doit être bornée au runtime/modèle réellement éprouvé.

Audit de départ : [`../audits/2026-09-14-auto-routing-chatgpt-codex-claude-audit.md`](../audits/2026-09-14-auto-routing-chatgpt-codex-claude-audit.md).

## V55.0 — Pipeline de preuve AUTO multi-provider

### Objectif

Restaurer le raccord réel Development Workspace → OpenClaw Control → Loop Engine et fournir une preuve runtime complète, fraîche et fail-closed pour Codex et Claude.

### Checklist

- [x] Corriger le drift `oc14:auto-route:evidence` → `auto-route:evidence` dans Development Workspace.
- [x] Ajouter une couverture qui échoue si le script de preuve réellement exposé par `openclaw-control/package.json` diverge du nom attendu par DW.
- [x] Étendre la preuve runtime OpenClaw Control pour exposer Codex **et** Claude uniquement depuis des sources observées/configurées.
- [x] Injecter les fenêtres Claude issues du bridge existant dans le snapshot quota AUTO lorsqu’elles sont fraîches ; sinon Claude reste `unknown/unavailable`.
- [x] Ne jamais inventer de pourcentage, modèle, disponibilité ou coût.
- [x] Conserver les executors directs Codex/Claude et les garde-fous abonnement existants.
- [x] Vérifier qu’un `project_handoff` réel ne retourne plus `auto_portfolio_unavailable` lorsque les preuves sont disponibles.
- [x] Supprimer les tests de suite standard qui dépendent de l’état courant du dépôt au lieu d’un invariant stable ; conserver les comportements via fixtures déterministes. Aucun test V55.0 dépendant de l’état courant n’a été conservé : les contrats concernés reposent sur fixtures/invariants déterministes.
- [x] Pendant l’implémentation, exécuter seulement les tests ciblés du contrat modifié ; réserver `pnpm run ci` complet à la gate PR/fin de lot.
- [x] Tests/validations DW + OpenClaw Control + Loop Engine verts.

### Validation V55.0

- cause racine corrigée : `dw-mcp` chargeait une copie `file:` périmée de `dw-shell` ; `worker_activate` rafraîchit désormais les dépendances locales de `dw-mcp` avant son build/restart ;
- le handoff canonique observe désormais le profil Codex `gpt-5.6-sol` depuis la preuve runtime OpenClaw ; une preuve quota périmée produit explicitement `no_executable_route` / `quota_stale_snapshot`, jamais `auto_portfolio_unavailable` ni une disponibilité inventée ;
- Claude reste absent/indisponible tant qu’aucun modèle et aucune fenêtre de quota fraîche ne sont prouvés par le bridge ;
- `project_handoff` et `project_publish_canonical` consomment le même `buildAutoRouteEnvironmentDelta` ;
- validations : `dw-shell` qualification 226/226, OpenClaw Control 46/46 + syntaxe, Loop Engine AUTO ciblé 12/12, suite complète 2486/2486 puis `json-check` vert séparément.

### Critère de fin

Le handoff canonique reçoit un portfolio AUTO multi-provider exploitable sans variable injectée manuellement par l’utilisateur, et toute source manquante produit un état explicite plutôt qu’un choix inventé.

## V55.1 — ChatGPT comme route interactive gouvernée

### Objectif

Faire de ChatGPT une option réelle du choix AUTO sans le transformer en executor CLI ou en runtime autonome fictif.

### Checklist

- [x] Ajouter un candidat de continuation `chatgpt`/`chatgpt_handoff` distinct des executors autonomes.
- [x] Réutiliser le selector/policy existant ; aucun LLM ne choisit le LLM.
- [x] Définir mécaniquement les catégories/situations où l’orchestration interactive est admissible : `review`/`architecture` sont interactifs par préférence gouvernée ; les autres catégories basculent sur ChatGPT uniquement lorsqu’aucune route autonome sûre ne survit aux hard gates.
- [x] Conserver Codex/Claude pour les modifications autonomes bornées quand une route directe admissible existe.
- [x] Exposer `runtime/provider/model/effort/executionPath` et les raisons `notSelected` sans inventer de quota ChatGPT séparé ; le modèle ChatGPT reste explicitement `null` faute de preuve runtime canonique.
- [x] Interdire à la route ChatGPT de déclencher `runDurableAutoSubscriptionPublish` comme si elle était un provider : `chatgpt_handoff` reste hors du portfolio provider/executor et ne possède aucun binding durable.
- [x] Conserver les routes natives OpenClaw Codex/Claude non exécutables tant que la parité reste négative.
- [x] Tests adversariaux : ChatGPT sélectionné, Codex sélectionné, Claude sélectionné, quota inconnu, aucun candidat sûr.

### Validation V55.1

- `chatgpt_handoff` est une route de continuation distincte, hors portfolio provider/executor ;
- `review` et `architecture` privilégient mécaniquement l’orchestration interactive ; les autres catégories conservent `direct_cli` lorsqu’une route Codex/Claude sûre existe et basculent sur ChatGPT uniquement si aucune route autonome sûre ne survit aux hard gates ;
- ChatGPT expose `runtime=chatgpt`, `provider=openai`, `model=null`, l’effort issu de la policy et `executionPath=chatgpt_handoff` sans quota inventé ;
- les bindings OpenClaw natifs restent non promus/non exécutables ;
- tests AUTO ciblés 14/14, `typecheck` vert, `json-check` vert ;
- burn-in réel `project_handoff(loop-engine)` : décision `interactive.chatgpt` / `chatgpt_handoff`, quota et impact explicitement `chatgpt_interactive_quota_not_modeled`.

### Critère de fin

Le handoff AUTO peut retourner soit `chatgpt_handoff`, soit un `direct_cli` Codex/Claude, avec décision déterministe et explicable.

## V55.2 / OC-25.2 — Continuer + runtime OpenClaw natif qualifié

### Objectif

Raccorder `Continuer` au runtime réellement sélectionné tout en réduisant le custom : Loop Engine conserve l’admission, le scope, la policy, la validation et le Run History ; OpenClaw fournit le runtime/model catalog/OAuth lorsqu’un binding natif est positivement qualifié. Codex CLI direct et Claude Code direct restent disponibles tant que leur suppression n’est pas justifiée.

### Faits de qualification au 15/09/2026

- `openclaw` est désormais un troisième binding distinct de `codex` et `claude_code` dans Loop Engine.
- Tests ciblés de promotion/config native : 38/38 verts ; typecheck vert.
- Config éphémère couverte : `memory.search.provider=none` et `agentRuntime.id=openclaw` sur le modèle exécuté.
- Burn-in réel Loop Engine → OpenClaw → Luna : succès dans un dépôt temporaire, un seul fichier autorisé modifié, ~40,4 s sur la première mesure.
- OpenClaw Control publie un profil `openclaw` natif depuis les surfaces réelles `models status/list`, avec version qualifiée et quota fail-closed ; aucun changement Development Workspace n’est requis pour transporter ce portfolio.
- OpenClaw 2026.9.4 observe Luna/Terra/Sol/Astra disponibles côté OpenAI ; seul le binding Luna utility est promu dans le portfolio natif à ce stade.
- `agent exec --fallback` a été qualifié avec primaire inexistant → Terra, puis primaire inexistant → Claude Sonnet 5 CLI. Cela prouve le failover, pas l’escalade de capacité d’une tâche saine.
- Claude ACPX code reste non qualifié sur 2026.9.4 ; `claude_code` direct reste le fallback code sûr.
- Les `agent exec` de qualification ne créent pas automatiquement de Task OpenClaw. Aucun TaskFlow miroir n’est ajouté : `project_publish_canonical` + durable execution/Run History Loop Engine restent le ledger canonique.
- Le CTA OpenClaw Control accepte `openclaw_native` et transporte uniquement projet + candidateId + SHA ; provider/modèle/effort restent décidés dans Loop Engine.
- Le Cockpit sait afficher explicitement `OpenClaw`.

### Mesures réelles et décision de préférence

Les runs V55.2 Codex/Luna historiques montrent que le dispatch Loop Engine atteint l’étape `executing` environ 0,11–0,14 s après le début du run, tandis que certains providers ont pris environ 203 s et 266 s et que d’autres runs ont atteint 360 s. Ces anciens runs prouvent que l’ack/dispatch n’est pas la source principale de latence, mais ils ne sont pas utilisés comme benchmark comparatif car les tâches différaient.

Un benchmark temporaire hors CI a ensuite exécuté exactement la même mission mono-fichier, avec Luna et les mêmes garde-fous, cinq fois par runtime :

- OpenClaw natif : 15 541 / 15 363 / 35 735 / 16 569 / 17 085 ms ; médiane 16 569 ms ; moyenne 20 059 ms ;
- Codex CLI direct : 16 486 / 14 930 / 13 528 / 35 132 / 10 082 ms ; médiane 14 930 ms ; moyenne 18 032 ms.

OpenClaw natif n’est donc pas plus rapide sur ce micro-benchmark : il est environ 10 % plus lent, avec une dispersion comparable. La promotion est néanmoins retenue **uniquement comme préférence de runtime sur un tie strict après les hard gates** parce qu’elle réduit la duplication runtime/catalogue/OAuth et prépare la suppression du chemin CLI custom. Funding, tier économique, effort, préférence provider et efficacité mesurée conservent la priorité. Codex/Claude directs restent des fallbacks.

Un `project_handoff(creatyss)` réel après promotion sélectionne `configured.openclaw.openclaw-native-utility` / Luna ; Codex/Luna est conservé comme alternative avec `less_preferred_runtime_than_selected`.

### Checklist

- [x] Promouvoir le binding `openclaw` séparément de `codex`/`claude_code` sans toucher à #319.
- [x] Corriger les assertions historiques et couvrir la config éphémère native.
- [x] Raccorder l’evidence native OpenClaw au portfolio AUTO, version/modèle/quota fail-closed.
- [x] Vérifier que Development Workspace transporte le nouveau binding sans logique de sélection supplémentaire.
- [x] Qualifier un burn-in réel OpenClaw/Luna sous les garde-fous Loop Engine.
- [x] Qualifier le mécanisme de fallback natif vers Terra et le fallback texte vers Claude CLI.
- [x] Maintenir distincts failover provider/modèle et `model-escalation` de capacité.
- [x] Raccorder `roadmap.continue` à `openclaw_native` sans laisser l’UI substituer provider/modèle/effort.
- [x] Afficher `OpenClaw` explicitement dans le Cockpit.
- [x] Évaluer Tasks/TaskFlow et refuser un ledger miroir qui ne lance pas l’exécution.
- [x] Conserver Claude Code direct tant qu’ACPX ne respecte pas les mêmes bornes de sécurité.
- [x] Obtenir au moins cinq mesures comparables du runtime natif avant de modifier le tie-break `codex` vs `openclaw`.
- [x] Comparer ces mesures à cinq runs Codex sur la même mission sans confondre temps de dispatch, temps provider et temps de validation.
- [x] Décider le tie-break AUTO sur preuves : préférence OpenClaw uniquement à égalité après hard gates, avec Codex/Claude directs conservés en fallback.
- [x] Nettoyer toutes les probes temporaires et conserver uniquement tests/evidence/docs durables.
- [ ] Rejouer les validations finales Loop Engine + OpenClaw Control.
- [ ] Décider le sort de V55.2 / #319 seulement après ces gates.

### Critère de fin

`Continuer` peut emprunter `chatgpt_handoff`, `direct_cli` ou `openclaw_native` selon la décision AUTO, sans bypass de gouvernance et sans second ledger. Le runtime OpenClaw n’est préféré à Codex sur un tie que si la qualification réelle le justifie ; les chemins directs restent disponibles tant que la parité/sécurité native n’est pas suffisante.

## Gates V55

- Loop Engine reste seule autorité de routage.
- Development Workspace transporte des preuves et exécute des contrats bornés ; il ne choisit pas le provider.
- OpenClaw Control collecte/projette les preuves runtime ; il ne maintient pas de second catalog de décision.
- Aucun provider API payant ni crédit additionnel implicite.
- Aucun quota inventé.
- Aucun changement des décisions négatives OC-15/OC-16 sur OpenClaw `2026.9.4`.
- Aucun nouveau scheduler, ledger ou stockage de progression.
- Aucun lot suivant avant clôture complète du lot courant.