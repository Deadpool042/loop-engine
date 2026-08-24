# TEMP — Agent decision observability & routing truth (V26)

> Roadmap de travail temporaire. Ce fichier doit être supprimé à la fin du chantier V26 ; seules les décisions architecturales durables doivent être reportées dans les documents existants.

## Point de départ vérifié sur `main`

- V7.3 fournit déjà `AgentProfile`, `AgentRegistry`, `selectAgentProfile` et l'escalade locale déterministe.
- V7.4 fournit déjà le Policy Engine, les contraintes d'effort, les budgets, les permissions et la résolution explicable.
- `createLoopExecutionPlan` utilise `agentPolicy.requirements.minimumEffort` comme effort d'invocation ; l'effort du profil sert au classement du sélecteur.
- La sortie humaine de `loop run` n'exposait que l'identifiant du profil sélectionné et `profile.effort`, ce qui masquait provider/runtime/model et pouvait faire croire que l'effort du profil était l'effort réellement demandé à l'invocation.
- Le JSON contenait déjà les données nécessaires ; aucune évolution de `schemaVersion` n'était requise pour V26.0.

## Principes du chantier

- Ne pas recréer registry, selector, budget engine ou policy engine.
- Réutiliser les contrats existants et préserver leur sens de dépendance.
- Ne pas introduire de catalogue de modèles figé dans les types.
- Ne modifier le routage réel que si un écart fonctionnel est démontré par le code ou un scénario exécuté.
- Toute projection GUI doit consommer la même décision que le CLI, sans logique de sélection parallèle.

## Lots

- [x] V26.0a — Audit de baseline : confirmer les capacités existantes et identifier l'écart d'observabilité entre `AgentPolicyResolution`, `LoopExecutionPlan` et la sortie humaine `run`.
- [x] V26.0b — Agent decision observability : aligner la sortie humaine `loop run` sur la décision réellement exécutable. Afficher statut, catégorie, profil, runtime, provider, modèle, effort d'invocation, effort de classement du profil, plafond de budget, fallback éventuel et raisons de résolution. Aucun changement de sélection, aucun appel supplémentaire, aucun changement JSON.
- [x] V26.1a — Registry truth audit : le chemin de production exécutable dépendait bien de profils illustratifs. `src/composition/provider-registry.ts` dérivait `configured.codex` et `configured.claude_code` de `defaultAgentRegistry`, alors que `DEFAULT_AGENT_PROFILES` est explicitement documenté comme configuration illustrative. Le gap était donc démontré.
- [x] V26.1b — Provider-bound registry truth : l'assemblage exécutable ne dépend plus de `defaultAgentRegistry`. Chaque provider concret produit un profil lié à sa configuration avec runtime/provider/model exacts, une enveloppe conservatrice `code_edit`/`shell_exec`/`test_execution`, les seules permissions du worktree isolé, aucun faux plafond token/coût, le timeout uniquement lorsqu'il est explicitement configuré, et `maxCalls/maxRepairs` bornés. Un modèle ou alias inconnu n'hérite jamais de capacités model-specific issues du registre illustratif. Selector et Policy Engine inchangés. CI complète verte.
- [x] V26.2a — Routing/budget gap audit : la matrice model/effort générique est déjà couverte par `tests/policy/model-effort-routing.test.ts` et ne doit pas être dupliquée. En revanche, `runLoopExecute` reçoit `maxRepairs` directement et l'utilise pour la boucle réelle sans transmettre cette demande à `resolvePolicy`; le budget de réparation annoncé par la policy peut donc diverger du nombre de réparations réellement autorisé par le runner. Gap démontré.
- [ ] V26.2b — Repair budget enforcement parity : faire de la résolution de policy le plafond effectif du nombre de réparations, sans élargissement implicite. Une demande CLI supérieure au plafond doit être bornée par la policy ; la valeur effective doit être celle transmise au `LoopRepairer` et utilisée par la boucle. Aucun changement du selector ni du contrat JSON si les champs existants suffisent.
- [ ] V26.3 — Cockpit parity : vérifier que le GUI peut projeter la même décision (provider/model/effort/reasons) à partir des contrats existants. Ajouter uniquement la projection manquante, jamais un second moteur de routage.
- [ ] V26.cleanup — Supprimer ce fichier temporaire une fois les lots terminés et mettre à jour uniquement les documents d'architecture existants qui portent une décision durable.

## Validation attendue par lot code

- tests ciblés du module modifié ;
- `pnpm run typecheck` ;
- `pnpm run validate` ;
- `pnpm run audit:strict` ;
- `pnpm run ci` avant fusion.

## Hors périmètre

- nouveau provider SDK ;
- appel réseau pour sélectionner un agent ;
- changement automatique de permissions ;
- commit/push/publish automatique ;
- nouveau framework interne de configuration ;
- réécriture des couches `src/agents/` ou `src/policy/` sans preuve qu'un contrat existant est insuffisant.
