# V48 — Routage multi-modèles orienté coût, capacité et quota

## Objectif

Rendre réellement utilisables les executors Codex CLI et Claude Code déjà intégrés à Loop Engine, puis exploiter un portefeuille de modèles allant des modèles économiques aux modèles frontier sans créer de second orchestrateur ni de routeur heuristique parallèle.

La règle directrice reste :

> sélectionner le plus petit modèle réellement capable de satisfaire la tâche, valider le résultat, puis n'escalader qu'à partir d'un signal observable.

Le coût, le quota et la disponibilité servent à départager des options déjà admissibles ; ils ne permettent jamais de contourner les exigences de capacité, de permission, de scope ou de validation.

## État vérifié au 2026-09-05

### Faits locaux

- "codex" et "claude_code" sont déjà des providers concrets de Loop Engine.
- Le provider Codex utilise actuellement "gpt-5.6-luna" comme modèle par défaut lorsqu'aucun modèle explicite n'est fourni.
- Le provider Claude Code utilise actuellement Claude Haiku 4.5 par défaut lorsqu'aucun modèle explicite n'est fourni.
- Le Run History courant ne contient encore aucune exécution réelle gouvernée de Codex ou Claude Code sur "creatyss", "development-workspace", "openclaw-control", "lp-infra" ou "n8n".
- Les seuls runs récents observés sur "loop-engine" sont des runs "plan" bloqués faute de candidat.
- Le sélecteur existant sépare déjà runtime, provider, modèle, effort, capacités, permissions et budget.
- Le failover multi-provider existe déjà ; V48 ne doit pas créer un second mécanisme de fallback.

### Portefeuille fournisseur observé

Les familles actuelles utiles au projet sont, par ordre de coût/capacité attendu et sous réserve de disponibilité effective dans les runtimes :

OpenAI :

- GPT-5.6 Luna — volume / coût minimal ;
- GPT-5.6 Terra — équilibre coût / intelligence ;
- GPT-5.6 Sol — travail complexe ;
- GPT-6 Astra — tâches frontier, longues ou fortement agentiques.

Anthropic :

- Claude Haiku 4.5 — volume / coût minimal ;
- Claude Sonnet 5 — travail courant à complexe ;
- Claude Opus 5 — raisonnement et développement avancés ;
- Claude Fable 5.1 — long-horizon / frontier.

Ces noms ne doivent pas devenir une enum métier permanente. Les identifiants de modèles, tarifs, fenêtres de contexte, quotas et disponibilités évoluent ; la configuration et les preuves fournisseur restent réévaluables.

## Principes obligatoires

1. **Capacité avant coût** — un modèle non admissible ne devient jamais sélectionnable parce qu'il est moins cher.
2. **Smallest capable first** — parmi les profils admissibles, privilégier le niveau de capacité/coût minimal suffisant.
3. **Quota déjà payé avant crédit additionnel** — lorsqu'une information de quota fiable existe, préférer l'usage inclus à une dépense API/crédits supplémentaire à capacité comparable.
4. **Aucune estimation inventée** — ne jamais fabriquer un coût, un nombre de tokens ou un quota restant si le runtime ne l'expose pas de manière fiable.
5. **Escalade sur signal** — validation échouée, capability gap, runtime error, indisponibilité ou autre raison structurée ; pas d'escalade parce qu'une tâche "semble importante".
6. **Pas de cascade exhaustive** — ne pas essayer Luna, puis Terra, puis Sol, puis Astra, puis Haiku, Sonnet, Opus et Fable sur chaque échec.
7. **Configuration, pas hardcode** — les modèles et leur classement économique doivent pouvoir évoluer sans modifier les contrats fondamentaux de Loop Engine.
8. **Une seule gouvernance** — OpenClaw et n8n peuvent déclencher ou limiter ; Loop Engine reste l'autorité de policy, admission, sélection et validation.
9. **Preuve avant automatisation** — le routage économique automatique n'est activé qu'après burn-in représentatif sur les executors réels.
10. **Aucun push/merge implicite** — les premiers burn-ins restent bornés à "execute" et à la review des preuves.

## Roadmap

### V48.0 [P1] — Premier execute réel gouverné

Objectif : prouver que le chemin réel "Loop Engine -> provider CLI -> worktree isolé -> scope guard -> validation -> evidence" fonctionne avec un provider réellement installé et authentifié.

Travail :

- sélectionner un micro-lot sûr et représentatif avec dépôt source propre ;
- exécuter le lot via le chemin "execute" existant ;
- commencer par le modèle économique configuré du runtime retenu ;
- vérifier le delta worktree, les fichiers modifiés, les validations, le Run History et l'evidence ;
- ne pas publier, pousser ou merger pendant ce burn-in ;
- répéter avec l'autre runtime seulement après succès du premier chemin.

Critère de réussite : au moins une exécution Codex ou Claude Code réelle atteint un état terminal explicable avec preuves gouvernées, sans effet hors scope.

### V48.1 [P1] — Burn-in multi-provider minimal

Objectif : démontrer que Codex CLI et Claude Code sont tous deux réellement utilisables par la même boucle gouvernée.

Travail :

- exécuter un cas comparable via Codex ;
- exécuter un cas comparable via Claude Code ;
- comparer uniquement des mesures observables : réussite, reprises, durée, validations, fichiers hors scope, erreur runtime ;
- qualifier le failover existant sur un échec contrôlé ou une indisponibilité réelle/simulée ;
- conserver un seul executor principal par tentative.

Critère de réussite : les deux runtimes produisent des résultats gouvernés comparables et le failover existant reste l'unique mécanisme inter-provider.

Preuve du 2026-09-05 : Claude Code / Haiku 4.5 a été invoqué réellement sur V48.1. Le run `6777fa8c-d667-427d-99e7-bcfd38115c67` a terminé en `provider_timeout` à 120 s ; le run `07cdaca2-770b-4c5f-a7a9-c7978475ad99`, avec borne portée à 300 s, a atteint `provider_max_turns` après 20 tours. Dans les deux cas, les effets sont restés dans le worktree isolé et aucun delta n'a atteint le dépôt source. Le chemin public `loop run` expose désormais un fallback explicite mais délègue au mécanisme canonique `providers + maxProviderAttempts`, sans second router. Le run terminal `95e7560f-7e19-4515-995d-439ad2708b79` a qualifié ce chemin : première tentative Anthropic `provider_unavailable` récupérable, seconde tentative OpenAI / Codex / GPT-5.6 Luna `completed`, validation `pnpm run validate` exit 0, 0 réparation, 0 fichier modifié. Conclusion : Claude Code est bien exercé comme runtime gouverné mais Haiku 4.5 n'est pas qualifié comme executor autonome suffisant pour ce candidat générique ; le failover inter-provider est qualifié.

### V48.2 [P2] — Portefeuille de modèles configurable

Objectif : représenter plusieurs niveaux de modèles par provider sans figer la gamme actuelle dans le Core.

Travail :

- permettre plusieurs profils configurés pour un même runtime/provider lorsque l'intégration concrète le supporte ;
- déclarer explicitement les capacités prouvées de chaque profil ;
- ajouter une classification économique simple et ordonnée, indépendante du nom commercial du modèle ;
- conserver l'effort d'invocation distinct du niveau économique/capacité du profil ;
- rendre l'indisponibilité d'un modèle explicite plutôt que de la masquer par un alias silencieux ;
- documenter les modèles actuels comme configuration révisable, pas comme invariant produit.

Critère de réussite : Luna/Terra/Sol/Astra et Haiku/Sonnet/Opus/Fable peuvent être représentés comme profils configurables sans ajouter de logique métier dépendante de leurs noms.

Preuve V48.2 : `AgentProfile` porte désormais les métadonnées optionnelles `economicTier` et `availability`, avec un ordre économique centralisé indépendant de `AgentEffort`. `provider-registry` accepte un portefeuille `profiles` pour un même executable et construit des profils `configured.<provider>.<id>` sans verrouiller l'executor sur un seul modèle. Les capacités enrichies proviennent exclusivement de la configuration explicite ; l'ancienne inférence codée en dur sur `claude-sonnet-5` a été supprimée. Un profil `unavailable` est un hard gate du selector et n'est jamais pris comme fallback. Les tests de registre démontrent que les quatre niveaux OpenAI et les quatre niveaux Anthropic peuvent être décrits comme données révisables, y compris un profil frontier explicitement indisponible. V48.2 n'utilise pas encore `economicTier` pour classer les candidats : ce choix appartient à V48.3.

### V48.3 [P2] — Sélection coût/capacité déterministe

Objectif : choisir le plus petit profil admissible sans faire exploser le nombre de tentatives.

Ordre de décision :

1. exigences de capacité ;
2. permissions et contraintes de policy ;
3. runtime/provider autorisés ;
4. disponibilité effective ;
5. plafond d'effort et de budget ;
6. niveau économique minimal parmi les candidats restants ;
7. tie-break déterministe existant.

Le coût n'est donc qu'un critère après admission fonctionnelle.

Critère de réussite : deux configurations sémantiquement identiques produisent la même décision ; supprimer ou rendre indisponible un modèle entraîne un fallback explicable vers le prochain profil admissible, jamais vers un modèle arbitraire.

Preuve V48.3 : `selectAgentProfile` reste l'unique selector. `evaluateAgentProfile` conserve l'admission dure sur disponibilité, allow-lists, capacités, permissions, plafond d'effort et budget. Le ranking des profils déjà admissibles utilise ensuite l'ordre économique central `economy < standard < advanced < frontier`, puis seulement `effort` et `id` comme tie-breaks. Un profil legacy sans `economicTier` n'est jamais assimilé à un coût bas : il reste admissible mais est classé après les tiers explicites ; si tous les profils sont legacy, le comportement historique `effort -> id` est préservé. Les tests couvrent l'indépendance à l'ordre de déclaration, le rejet d'un profil economy incapable, le fallback `economy unavailable -> standard`, les tiers inconnus et l'evidence des alternatives non retenues. Une intégration sur un portefeuille Codex configurable démontre qu'un même ensemble sérialisé dans un ordre différent choisit toujours le même modèle économique admissible.

### V48.4 [P2] — Evidence d'efficacité par modèle

Objectif : accumuler suffisamment de données locales pour éviter un routage fondé uniquement sur les benchmarks fournisseurs.

Enregistrer ou projeter, lorsqu'ils sont réellement disponibles :

- provider ;
- runtime ;
- modèle ;
- effort ;
- catégorie de tâche ;
- statut terminal ;
- raison d'échec ;
- nombre de réparations ;
- durée ;
- validations ;
- fichiers modifiés / hors scope ;
- tokens, crédits ou coût uniquement si la donnée provient d'une source fiable.

Ne pas construire de système analytics séparé : réutiliser Run History / evidence existants et n'ajouter que les champs nécessaires à une décision future.

Critère de réussite : on peut comparer des exécutions réelles sans journal parallèle ni métrique inventée.

Preuve V48.4 : le même Run History alimente désormais `runs --models` en texte ou JSON. La projection conserve l'identité provider/runtime/modèle/profil, l'effort uniquement lorsqu'il est prouvé pour le modèle terminal, la catégorie de tâche issue de `agentPolicy.requirements.category`, les statuts, validations, réparations, durées, fichiers modifiés/hors scope et toutes les tentatives de failover avec codes d'échec. Les données malformées ou historiques non attribuables sont comptées comme telles au lieu de casser le rapport. Sur le journal réel observé lors du lot, la fenêtre contenait 5 entrées dont 3 runs d'exécution ; 1 run était attribuable à Codex / GPT-5.6 Luna avec catégorie `validation`, échec `provider_limit_exceeded` et durée observée d'environ 120 s, tandis que 2 runs d'exécution ne disposaient pas d'evidence modèle suffisante. Ce faible échantillon ne permet aucune conclusion de supériorité entre modèles. La télémétrie tokens/coût/quota est explicitement `unavailable` avec la raison `no_reliable_provider_usage_or_quota_source`. Cette vue read-only constitue désormais le contrat à projeter dans OpenClaw plutôt que de recalculer l'usage côté cockpit.

### V48.5 [P3] — Escalade intra-provider bornée

Objectif : permettre une escalade Luna -> Terra -> Sol -> Astra ou Haiku -> Sonnet -> Opus -> Fable lorsque la cause de l'échec le justifie, sans essayer systématiquement tous les niveaux.

Règles :

- escalade uniquement après raison structurée ;
- choisir directement le prochain profil qui comble le gap identifié ;
- ne pas escalader sur une erreur qui doit plutôt changer de runtime/provider ;
- limiter le nombre total de tentatives par policy ;
- conserver le même scope, les mêmes permissions et les mêmes validations ;
- aucun passage automatique à un modèle payant hors abonnement sans budget/autorisation explicite.

Critère de réussite : une tentative supplémentaire est toujours justifiable par la raison d'échec précédente et reste bornée par la policy.

Preuve V48.5 : `src/loop/model-escalation.ts` centralise la décision pure de montée de profil. Le défaut global autorise au plus deux appels top-level en mode exécutable — tentative initiale + une seule escalade — et une requête restrictive peut ramener ce plafond à 1. Le runner ne déclenche cette seconde tentative que sur `provider_max_turns` ou sur un `validation_failed` arrivé au bout du budget de réparation. La sélection reste sur le même provider/runtime, réapplique les hard requirements et choisit le plus petit profil strictement supérieur admissible ; aucune erreur de timeout, rate-limit, disponibilité ou runtime n'est transformée en achat de capacité. L'ancien helper `escalateAgentProfile` a été aligné sur la même frontière. L'evidence `modelEscalationEvidence` enregistre le trigger et la transition de profil. Qualification locale : TypeScript vert, `json-check` vert, `git diff --check` vert, audit strict 635/635 et audit profiles vert ; la CI de PR reste le gate de livraison finale.

### V48.6 [P3] — Stratégie abonnement / crédits / API

Objectif : optimiser le coût total réel plutôt que le seul tarif API nominal.

Travail :

- distinguer usage inclus dans un abonnement, crédits additionnels et appels API facturés ;
- utiliser un état "unknown" lorsque le quota restant n'est pas accessible de manière fiable ;
- ne jamais déduire un quota restant à partir du seul temps écoulé ;
- permettre à la policy de réduire l'usage de crédits payants ;
- conserver une décision manuelle simple si les runtimes n'exposent pas de télémétrie suffisamment fiable.

Critère de réussite : l'absence de télémétrie quota ne bloque pas le workflow et ne produit jamais un faux chiffre.

Preuve V48.6 : `AgentProfile` porte désormais deux métadonnées optionnelles et révisables : `fundingMode` (`included_subscription | additional_credits | metered_api | unknown`) et `quota` (`state + source`, sans pourcentage inventé). Un quota explicitement `exhausted` est rejeté ; `unknown` reste admissible et ne déclenche aucune estimation. Le selector unique refuse `additional_credits` et `metered_api` sans autorisation explicite, puis privilégie `included_subscription` avant le tier économique parmi les profils admissibles. `AgentPolicy.allowedFundingModes` constitue l'autorité d'opt-in payante ; `AgentPolicyRequest.requestedFundingModes` ne peut que restreindre cet ensemble et ne peut jamais créer une autorisation absente. Les profils configurés propagent l'evidence telle quelle sans déduire de financement ou de quota lorsqu'elle manque. Le failover inter-provider réutilise `selectAgentProfile` au lieu de choisir directement le premier profil compatible, et l'escalade intra-provider réapplique la même requête de sélection : ni fallback ni escalation ne peuvent donc contourner la règle de financement. `LoopExecutionPlan.policy.allowedFundingModes` conserve l'autorisation explicite pour les fallbacks. Aucun scraping, aucun appel réseau de décision et aucun calcul de quota 5h/semaine n'est ajouté ; ces pourcentages restent une future donnée d'observation externe uniquement si Codex/Claude/OpenClaw l'exposent de manière fiable. Qualification locale : 121/121 tests ciblés V48.6, TypeScript, `json-check`, `git diff --check`, audit strict 635/635 et audit profiles verts. Le `validate` complet dépasse la fenêtre de retour de l'outil local ; la CI GitHub complète reste donc le gate final de livraison.

## Gates V48

- aucun nouveau scheduler d'agents ;
- aucun second sélecteur parallèle ;
- aucun appel fournisseur pour décider quel fournisseur appeler ;
- aucun prix, quota ou capacité fabriqué ;
- aucun nom de modèle commercial utilisé comme invariant métier durable ;
- aucun routage automatique tant que les executors réels ne sont pas qualifiés ;
- aucun élargissement de permission lors d'une escalade ;
- aucun push, PR ou merge ajouté au burn-in V48.0/V48.1 ;
- le Run History et l'evidence existants restent la source d'observabilité ;
- les validations gouvernées restent l'autorité de réussite, jamais l'auto-évaluation du modèle.

## Améliorations futures possibles

Ces pistes ne deviennent pas automatiquement des lots. Elles ne doivent être promues que lorsqu'un besoin mesuré apparaît.

### F1 — Score de coût par lot réussi

Comparer le coût total d'une réussite, pas seulement le prix au token :

- coût de la première tentative ;
- coût des réparations ;
- coût des escalades ;
- temps d'exécution ;
- taux de validation du premier coup.

Un modèle plus cher par token peut être moins cher par lot réussi s'il évite plusieurs reprises. À implémenter uniquement lorsque des données réelles suffisantes existent.

### F2 — Routage empirique par catégorie de tâche

Exploiter l'historique local pour savoir quels profils réussissent réellement sur :

- documentation ;
- tests ;
- bugfix ciblé ;
- refactor multi-fichiers ;
- architecture ;
- review ;
- long-context.

Le résultat doit rester une préférence révisable, jamais un apprentissage opaque qui contourne les contraintes hard.

### F3 — Quota-aware scheduling

Lorsque Codex/Claude exposent une télémétrie fiable :

- éviter de vider un quota hebdomadaire haut de gamme sur du travail trivial ;
- reporter un travail non urgent ou choisir un profil alternatif admissible ;
- privilégier les quotas déjà inclus avant l'API payante.

Aucun scraping fragile de UI ni estimation probabiliste du quota.

### F4 — Circuit breaker de dépense

Si des appels API payants deviennent courants :

- plafond par run ;
- plafond journalier/hebdomadaire ;
- arrêt après répétition d'un même échec ;
- alerte plutôt qu'escalade infinie.

À ne pas construire tant que la dépense payante réelle ne le justifie pas.

### F5 — Catalogue de modèles versionné

Maintenir un snapshot local révisable des capacités vérifiées :

- identifiant exact ;
- contexte ;
- effort supporté ;
- capacités nécessaires au projet ;
- disponibilité runtime ;
- statut actif/déprécié.

La mise à jour du catalogue doit être reviewable et déterministe ; le sélecteur ne doit pas dépendre d'un appel réseau temps réel pour fonctionner.

### F6 — Dépréciation et remplacement automatique borné

Détecter qu'un modèle configuré n'est plus disponible et produire une recommandation de migration vers un profil explicitement déclaré compatible.

Pas de remplacement silencieux par un alias fournisseur.

### F7 — Optimisation cache / batch

Pour les workflows API qui le justifient :

- maximiser le prompt caching sur les instructions et contextes stables ;
- utiliser le Batch API pour les tâches asynchrones non interactives ;
- mesurer l'économie réelle avant généralisation.

Cette optimisation ne concerne pas automatiquement les CLI sur abonnement.

### F8 — Politique par projet

Autoriser un projet à restreindre le portefeuille :

- Creatyss : priorité au coût pour petites tâches, escalade sur refactors complexes ;
- infrastructure : exigences plus strictes de validation et permissions ;
- documentation : modèles économiques privilégiés.

Les projets ne peuvent que restreindre la policy globale, jamais l'élargir.

### F9 — Arbitrage latence / coût

Ajouter une préférence de latence uniquement si elle devient réellement importante :

- interactif ;
- batch ;
- long-running.

Ne pas complexifier la sélection tant que la durée n'est pas un problème mesuré.

### F10 — Qualification Astra / Fable sur nos propres lots

Lorsque l'accès est réellement disponible :

- sélectionner quelques lots difficiles déjà résolus ;
- rejouer dans des worktrees dédiés ou fixtures réalistes ;
- comparer Sol/Opus/Astra/Fable sur réussite, reprises, durée, tokens/coût observés et respect du scope ;
- ne pas promouvoir Astra ou Fable comme défaut sur la seule base des benchmarks publics.

### F11 — Distinction des causes de fallback

Différencier au minimum :

- capability gap ;
- validation failure ;
- runtime error ;
- rate limit / quota ;
- refus fournisseur ;
- indisponibilité modèle.

Chaque cause peut justifier une action différente : augmenter le modèle, changer de provider, attendre une ressource ou arrêter.

### F12 — Projection cockpit orientée décision

Une fois les données disponibles, afficher uniquement :

- modèle choisi ;
- raison ;
- niveau économique ;
- alternative admissible principale ;
- raison d'une éventuelle escalade ;
- coût/quota uniquement lorsqu'il est fiable.

Éviter un tableau technique de tous les modèles et toutes les métriques.

## Hors périmètre

- entraînement ou fine-tuning automatique d'un routeur ;
- LLM chargé de sélectionner un autre LLM ;
- marketplace dynamique de modèles ;
- benchmark synthétique massif avant premier usage réel ;
- duplication du Run History ;
- multi-agent graph propre à Loop Engine ;
- choix direct de modèle par OpenClaw ou n8n en contournant la policy ;
- optimisation prématurée des prix au centime sans données de production.

## Réévaluation

La roadmap V48 doit être réévaluée après V48.0 et V48.1.

Si les deux executors ne sont pas réellement utilisés ou si le volume reste très faible, V48.2+ peut rester différé : une sélection manuelle explicite restera alors moins coûteuse et plus simple qu'un routeur automatique.
