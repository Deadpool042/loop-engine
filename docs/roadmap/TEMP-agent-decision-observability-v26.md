# TEMP — Agent decision observability & routing truth (V26)

> Roadmap de travail temporaire. Ce fichier doit être supprimé à la fin du chantier V26 ; seules les décisions architecturales durables doivent être reportées dans les documents existants.

## Point de départ vérifié sur `main`

- V7.3 fournit déjà `AgentProfile`, `AgentRegistry`, `selectAgentProfile` et l'escalade locale déterministe.
- V7.4 fournit déjà le Policy Engine, les contraintes d'effort, les budgets, les permissions et la résolution explicable.
- `createLoopExecutionPlan` utilise `agentPolicy.requirements.minimumEffort` comme effort d'invocation ; l'effort du profil sert au classement du sélecteur.
- La sortie humaine de `loop run` n'expose actuellement que l'identifiant du profil sélectionné et `profile.effort`, ce qui masque provider/runtime/model et peut faire croire que l'effort du profil est l'effort réellement demandé à l'invocation.
- Le JSON contient déjà les données nécessaires ; aucune évolution de `schemaVersion` n'est requise pour le premier lot.

## Principes du chantier

- Ne pas recréer registry, selector, budget engine ou policy engine.
- Réutiliser les contrats existants et préserver leur sens de dépendance.
- Ne pas introduire de catalogue de modèles figé dans les types.
- Ne modifier le routage réel que si un écart fonctionnel est démontré par le code ou un scénario exécuté.
- Toute projection GUI doit consommer la même décision que le CLI, sans logique de sélection parallèle.

## Lots

- [x] V26.0a — Audit de baseline : confirmer les capacités existantes et identifier l'écart d'observabilité entre `AgentPolicyResolution`, `LoopExecutionPlan` et la sortie humaine `run`.
- [ ] V26.0b — Agent decision observability : aligner la sortie humaine `loop run` sur la décision réellement exécutable. Afficher statut, catégorie, profil, runtime, provider, modèle, effort d'invocation, effort de classement du profil, plafond de budget, fallback éventuel et raisons de résolution. Aucun changement de sélection, aucun appel supplémentaire, aucun changement JSON.
- [ ] V26.1 — Registry truth audit : vérifier si le chemin de production exécutable dépend encore de profils illustratifs de `DEFAULT_AGENT_PROFILES`. Ne changer l'assemblage que si un usage réel de données placeholder est démontré ; sinon documenter le no-op.
- [ ] V26.2 — Routing policy gap audit : comparer la politique de coût/capacité actuelle aux contrats existants. N'ajouter une préférence provider/model/effort que si le selector/policy ne peut pas exprimer un besoin démontré ; conserver une politique provider-agnostic et une liste de modèles libre.
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
