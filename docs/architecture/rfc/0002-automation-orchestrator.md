# RFC-0002 — Automation Orchestrator

## Métadonnées

- Type : RFC
- Statut : Brouillon
- Portée : Modèle d'orchestration déterministe de l'Automation Platform
- Prédécesseur : [RFC-0001 — Automation Platform](0001-automation-platform.md)
- Successeur : Aucun
- Décision associée : [ADR-0002 — Contract First](../adr/0002-contract-first.md) et [ADR-0003 — Ports & Adapters](../adr/0003-ports-and-adapters.md)

## 1. Motivation

L'Automation Platform possède déjà des contrats distincts pour les demandes,
les providers, les forges, les politiques et l'assemblage applicatif. Sans un
modèle explicite, une évolution future pourrait confondre la coordination de
ces contrats avec l'exécution du travail externe ou l'autorisation de ce
travail.

Cette RFC définit l'Automation Orchestrator comme un rôle architectural proposé
qui coordonne ces frontières. Elle ne crée ni API, ni contrat TypeScript, ni
implémentation. Son objectif est de préserver les décisions de
[RFC-0001](0001-automation-platform.md) lorsque l'orchestration deviendra une
capacité à livrer.

## 2. Responsibilities

L'orchestrateur possède l'orchestration seulement :

- il reçoit une demande d'automatisation et une composition explicite ;
- il ordonne l'évaluation de politique, la sélection déjà fournie et les
  délégations autorisées ;
- il conserve une frontière explicable entre les décisions et leurs résultats ;
- il rapporte un résultat borné ou un échec fermé.

Il ne possède pas le travail AI, le travail de forge, l'autorisation de
politique, la découverte de dépendances ni la création implicite d'une
composition. Les providers exécutent le travail AI ; les forges exécutent le
travail de forge ; les politiques autorisent ou refusent les décisions.

## 3. High-level architecture

Flux logique :

    Automation request and explicit application assembly
      -> policy evaluation
      -> declared selection
      -> provider port and/or forge port
      -> adapter-owned transport boundary
      -> bounded provider or forge result
      -> orchestration result

Les adaptateurs ne se parlent jamais directement. Un provider ne sélectionne
pas une forge, une forge n'évalue pas une politique, et un adaptateur ne
contourne pas l'assemblage. Toute relation passe par le rôle d'orchestration et
par les contrats publics décrits par RFC-0001.

## 4. Public orchestration contracts

Cette RFC ne propose aucun nouveau contrat public. Le modèle s'appuie seulement
sur les contrats existants :

- AutomationRequest, AutomationContext, AutomationJob, AutomationExecution et
  AutomationResult pour la demande et le résultat publics ;
- AutomationApplicationAssembly et ses dépendances explicites pour la
  composition ;
- AutomationPolicy, AutomationPolicyEvaluator et AutomationPolicyResult pour
  l'autorisation ;
- AutomationProvider et AutomationForge pour les délégations externes.

Les contrats canoniques de l'orchestrateur sont exposés depuis
`src/automation/orchestrator/index.ts`, puis réexportés par
`src/automation/index.ts`. Ils décrivent uniquement la demande, le contexte,
l'état, les étapes, la décision, le résultat et l'échec d'orchestration ; ils
ne fournissent aucun algorithme, implémentation ou comportement runtime.

Les contrats canoniques d'évaluation sont exposés depuis
`src/automation/orchestrator/evaluation/index.ts` et réexportés par le barrel
de l'orchestrateur. Ils décrivent uniquement les entrées, contexte, constats,
preuves, décisions, résultats et échecs d'une évaluation déterministe ; ils ne
fournissent aucun evaluator ni comportement runtime.

Les contrats canoniques de planification sont exposés depuis
`src/automation/orchestrator/planning/index.ts` et réexportés par le barrel de
l'orchestrateur. Ils décrivent uniquement les entrées, contexte, étapes,
dépendances, contraintes, résultats et échecs d'un plan déterministe ; ils ne
fournissent aucun planner, scheduler, logique d'exécution ou comportement
runtime.

Les contrats canoniques de délégation sont exposés depuis
`src/automation/orchestrator/delegation/index.ts` et réexportés par le barrel
de l'orchestrateur. Ils décrivent uniquement les entrées, contexte, cible,
résultat et échec d'une délégation déjà admise ; ils ne fournissent aucun
delegator, appel de provider ou de forge, scheduler, logique d'exécution ou
comportement runtime.

Les contrats canoniques d'évaluation de délégation sont exposés depuis
`src/automation/orchestrator/delegation-evaluation/index.ts` et réexportés par
les barrels de l'orchestrateur et de l'Automation Platform. Ils décrivent
uniquement l'éligibilité d'une délégation déjà déclarée : `eligible`, `denied`
ou `indeterminate`. Une preuve absente reste `indeterminate`, donc fermée ; une
évaluation `eligible` ne constitue ni une sélection de provider ou de forge,
ni une délégation, ni une exécution.

L'implémentation pure
`evaluateAutomationOrchestratorDelegation` est exportée par ce même package.
Elle évalue seulement l'éligibilité déclarative : une preuve manquante produit
`indeterminate` avec `evidence_missing`, et un refus explicite de politique
produit `denied`. Tous ses résultats conservent `delegationOccurred`,
`providerInvoked`, `forgeInvoked` et `executionStarted` à `false`. Aucun port
externe, aucune sélection, aucun dispatch, aucune délégation ni exécution ne
sont franchis ou déclenchés.

Les contrats canoniques de sélection de délégation sont exposés depuis
`src/automation/orchestrator/delegation-selection/index.ts` et réexportés par
les barrels de l'orchestrateur et de l'Automation Platform. Ils décrivent une
sélection déterministe d'un candidat déjà déclaré : `selected`, `rejected` ou
`indeterminate`. Toute décision conserve explicitement `delegationOccurred`,
`providerInvoked`, `forgeInvoked` et `executionStarted` à `false` ; une
sélection ne délègue, n'invoque aucun port et ne démarre aucune exécution.

L'implémentation pure
`evaluateAutomationOrchestratorDelegationSelection` consomme une évaluation de
délégation `eligible` et des candidats explicites. Elle classe les candidats
valides de façon stable par `candidateId`, identifiant de délégation, type de
cible puis identifiant de cible ; ce tie-break ne constitue ni scoring ni
sélection de provider ou de forge. Un résultat `selected` reste descriptif :
il ne prépare ni n'effectue un dispatch, une délégation, une invocation ou une
exécution. `dispatchOccurred` n'appartient volontairement pas au contrat de
sélection ; il relève du contrat distinct de Delegation Dispatch.

Les contrats canoniques de dispatch de délégation sont exposés depuis
`src/automation/orchestrator/delegation-dispatch/index.ts` et réexportés par
les barrels de l'orchestrateur et de l'Automation Platform. La préparation du
dispatch suit la sélection, mais reste un handoff descriptif : `prepared`,
`rejected` ou `indeterminate`. Elle ne franchit aucune frontière de provider,
forge, transport ou runtime et n'implique ni livraison réussie, ni délégation
acceptée, ni autorisation ou démarrage d'exécution.

L'implémentation pure
`prepareAutomationOrchestratorDelegationDispatch` consomme un candidat
explicitement `selected`, une cible et les preuves de dispatch. Elle normalise
les preuves de manière déterministe ; toute cible, candidat ou preuve absent(e)
ou incohérent(e) reste fermé(e). `prepared` signifie seulement qu'une
description de dispatch déclarative existe pour un adaptateur futur : aucun
provider, forge, transport, délégation ou runtime n'est franchi. Les cinq
indicateurs `dispatchOccurred`, `delegationOccurred`, `providerInvoked`,
`forgeInvoked` et `executionStarted` restent tous à `false`.

La composition pure `evaluateAutomationOrchestratorPipeline` enchaîne les
trois implémentations existantes — évaluation, sélection puis préparation —
sans ajouter de règle de décision. Elle conserve chaque résultat de stage tel
quel et s'arrête explicitement dès qu'un stage n'est pas admissible ; les
stages ultérieurs sont alors `null`, jamais implicitement réussis. Même une
pipeline entièrement `eligible` → `selected` → `prepared` reste non
opérationnelle et ne traverse aucune frontière externe.

La validation pure `validateAutomationOrchestratorPipeline` inspecte un
résultat de pipeline déjà composé sans réexécuter ni réparer aucun stage. Elle
vérifie de façon déterministe la progression, la nullabilité, les identités et
les indicateurs opérationnels ; `valid` signifie seulement que la structure et
la sémantique déclaratives sont cohérentes. Une validation valide ne signifie
jamais qu'un dispatch, une délégation, une invocation ou une exécution a eu
lieu.

Les formes auparavant privées de résultat de pipeline et de validation sont
désormais les contrats publics canoniques
`AutomationOrchestratorPipelineResult` et
`AutomationOrchestratorPipelineValidationResult`, accompagnés de leurs unions
fermées de progression, statut et diagnostic. Cette promotion ne change aucun
comportement : elle stabilise uniquement les entrées de futures projections
publiques. `valid` reste une cohérence structurelle et sémantique, sans
franchir de frontière opérationnelle.

Chaque résultat de validation porte désormais un
`AutomationOrchestratorPipelineValidationSubject` lié au pipeline validé. Il
utilise exclusivement la progression et les identifiants publics déjà déclarés
de requête, délégation, candidat et cible. Aucun identifiant généré, temps,
aléa ni registre global n'est utilisé ; un pipeline malformé produit un sujet
`incomplete` fermé. Cette liaison ne change pas le sens de la validation, mais
permet aux futures projections de refuser une validation issue d'un autre
pipeline sans franchir de frontière externe.

La projection pure `summarizeAutomationOrchestratorPipeline` consomme seulement
les contrats publics de résultat de pipeline et de validation. Avant toute
projection `valid`, elle vérifie que le sujet complet de validation correspond
exactement à la progression et aux identifiants stables du pipeline ; une
validation incomplète ou issue d'un autre pipeline reste `invalid`. Elle ne
réexécute ni ne répare aucun stage. Son résultat compact expose des statuts,
identifiants, compteurs et indicateurs non opérationnels uniquement : les
résultats de stage complets, preuves, constats, échecs et métadonnées bruts
sont omis, et les stages absents restent explicitement `null`. `valid`,
`eligible`, `selected` et `prepared` gardent leur sens déclaratif : aucune
frontière de provider, forge, transport ou runtime n'est franchie.

La décision pure `decideAutomationOrchestratorPipelineAdmission` suit cette
projection : `pipeline result → validation → summary → admission decision →
worker handoff → worker command → dispatch request → dispatch port → future
adapter → future worker execution`. Le
summary reste descriptif ; l'admission
est seulement une autorisation déclarative de remise future. Même `admitted`
ne réalise aucun dispatch, appel de provider, forge, runtime ou worker, ne
franchit aucun transport et ne persiste aucun état. Les identifiants sont
conservés exactement et toute incohérence est rejetée fail-closed ; les cinq
indicateurs opérationnels restent `false`.

La construction pure
`prepareAutomationOrchestratorPipelineWorkerHandoff` consomme exclusivement
une décision publique d'admission. Un handoff `prepared` est une enveloppe
minimale, immuable et déclarative pour une future remise : il ne sélectionne
aucun worker, ne crée aucune commande, ne réalise aucun dispatch, et ne
franchit aucune frontière de provider, forge, runtime, transport ou
persistance. Les identifiants restent exacts, sans normalisation. Les sept
indicateurs de handoff et d'opération restent littéralement `false`; une
admission incohérente produit un handoff `rejected` fail-closed. L'exécution
reste un effet externe futur et distinct.

La construction pure `prepareAutomationOrchestratorWorkerCommand` transforme
uniquement un handoff public cohérent en instruction déclarative fermée. Son
seul `kind`, `execute_delegated_task`, ne constitue ni un payload exécutable
ni une sélection de worker. Une commande `prepared` n'envoie rien : le dispatch
reste un futur franchissement d'adaptateur, puis l'exécution un effet externe
ultérieur. Aucun worker concret, provider, forge, runtime, transport ou état
persisté n'est impliqué ; tous les indicateurs restent littéralement `false`.

La construction pure `prepareAutomationOrchestratorWorkerDispatchRequest`
transforme seulement une Worker Command publique en enveloppe déclarative prête
pour le Dispatch Port. Ce port est un contrat abstrait pour un futur adaptateur
et sa méthode `dispatch` n'est jamais appelée ici. La préparation ne traverse
donc aucun port, provider, worker, transport ou runtime. Le résultat de port
est un compte rendu fermé du futur adaptateur : ses booléens dynamiques ne sont
pas produits par la préparation pure et restent distincts de l'exécution.

`invokeAutomationOrchestratorWorkerDispatch` est l'unique frontière
applicative autorisée à appeler une méthode de Dispatch Port injectée. Elle
valide d'abord une dispatch request préparée, appelle le port au plus une fois,
et normalise son outcome. Aucun fournisseur, adaptateur concret ou retry n'est
choisi par le cœur : les erreurs d'adaptateur deviennent `port_failed` et tout
résultat incohérent devient `invalid_port_result`. L'exécution du worker reste
un cycle externe ultérieur.

Le Dispatch Application Service compose ces deux frontières sans effet direct :
il reçoit une Worker Command et un Dispatch Port injecté, délègue la validation
et projection à `prepareAutomationOrchestratorWorkerDispatchRequest`, puis
délègue l'effet contrôlé unique à
`invokeAutomationOrchestratorWorkerDispatch` seulement si la requête est
préparée. Le service ne connaît aucun adaptateur concret et n'appelle jamais le
port directement ; V20.7 et V20.8 restent les seules autorités de préparation
et d'invocation. Il n'ajoute ni logique dupliquée, ni retry, ni sélection de
provider, forge, worker ou runtime.

La chaîne reste donc : Worker Command = instruction déclarative ; Dispatch
Request Preparation = validation et projection pure ; Dispatch Invocation
Boundary = effet contrôlé unique ; Dispatch Application Service = composition
applicative sans effet direct ; Dispatch Adapter = infrastructure injectée ;
Execution Lifecycle = cycle ultérieur.

V21.0 ajoute seulement Execution Lifecycle Initialization après le Dispatch
Application Service. Un `execution_pending` signifie uniquement qu'un futur
Execution Start Boundary pourra tenter un démarrage ; il ne signifie ni worker
démarré, ni runtime appelé, ni traitement en cours. `executionStarted` reste
toujours `false` et aucune infrastructure concrète n'est introduite : dispatch
et exécution restent deux phases séparées.

V21.1 ajoute Execution Start Request Preparation : elle propage uniquement
`requestId`, `delegationId`, `candidateId` et `targetId` dans une requête
déclarative. Elle ne crée ni ne renomme aucun identifiant, ne sélectionne aucun
runtime, ne démarre aucun worker et ne produit aucun effet. L'identité d'une
tentative future reste à la frontière qui possédera cette autorité.

## 5. Execution lifecycle

1. Une demande et son contexte sont fournis avec un assemblage applicatif
   explicite.
2. L'orchestrateur vérifie que l'assemblage et sa sélection déclarée ne sont
   pas rejetés.
3. Le policy evaluator évalue la demande contre la politique de l'assemblage.
4. Une décision denied, failed, absente ou ambiguë termine le cycle fermé.
5. Pour une décision allowed, l'orchestrateur délègue uniquement au provider
   et/ou à la forge déjà sélectionnés et admis.
6. Il traduit les résultats portés par les contrats publics en résultat
   d'orchestration borné.

Chaque transition dépend seulement des entrées et sorties explicites de ce
cycle. Ce texte ne prescrit ni algorithme de sélection ni ordre supplémentaire
entre provider et forge lorsqu'aucun contrat courant ne le définit.

## 6. Provider interaction

Le provider est le seul responsable de l'exécution du travail AI. Il reçoit une
demande déjà bornée et déjà admise ; il retourne un AutomationProviderResult.
L'orchestrateur ne choisit pas un SDK, un modèle, un format de prompt ou un
transport fournisseur. Il demeure provider-neutral et ne traite aucun détail
propre à un fournisseur.

## 7. Forge interaction

La forge est le seul responsable du travail de forge. Elle reçoit une demande
déjà bornée et déjà admise ; elle retourne un AutomationForgeResult.
L'orchestrateur ne connaît ni API de forge, ni format de pull request, ni
protocole de publication. Il demeure forge-neutral et ne donne à une forge
aucune autorité d'autoriser une action.

## 8. Policy evaluation

La politique autorise les décisions ; elle n'exécute aucune délégation.
L'orchestrateur appelle seulement le port AutomationPolicyEvaluator déclaré par
l'assemblage. Une décision allowed est nécessaire mais ne rend pas un résultat
externe vrai, final ou autoritaire. Une décision denied ou un résultat failed
interrompt le cycle sans délégation ultérieure.

## 9. Failure model

Le modèle est fail-closed. Toute absence, erreur, incompatibilité de capacité,
sélection rejetée, décision non allowed ou résultat non conforme mène à un
résultat rejeté ou failed selon le contrat public applicable.

L'orchestrateur ne réessaie pas, ne remplace pas silencieusement une dépendance
et ne transforme pas une erreur de provider ou de forge en succès. Il ne
révèle pas de détail interne d'adaptateur dans une frontière publique.

## 10. Deterministic execution guarantees

L'orchestration est déterministe : avec les mêmes contrats immuables, la même
demande, le même assemblage, les mêmes décisions et les mêmes résultats de
port, elle produit la même séquence de décisions et le même résultat contractuel.

Elle ne possède aucun état global mutable, singleton, découverte implicite,
injection de dépendance cachée, horloge implicite ou aléa. Les dépendances sont
portées explicitement par AutomationApplicationAssembly.

Chaque étape déclarative conserve les mêmes indicateurs non opérationnels :
delegationOccurred, providerInvoked, forgeInvoked et executionStarted restent
littéralement false. Une information d'évidence manquante ne peut donc être
interprétée comme une décision réussie, une délégation ou une exécution.

## 11. Extension model

Une extension ajoute un provider, une forge, une politique ou un adaptateur
derrière son port public ; elle ne crée pas de lien direct entre adaptateurs.
Une nouvelle capacité nécessite une demande, une politique et une sélection
explicites avant toute délégation.

L'extension d'un adaptateur ne modifie pas les contrats publics d'orchestration
sans RFC, décision et contrat courant distincts.

## 12. Future transport adapters

Les transports futurs restent la responsabilité des adaptateurs, derrière leurs
frontières propres. Ils ne sont ni sélectionnés ni appelés par le rôle
d'orchestration. Cette RFC n'autorise aucun transport réseau, fournisseur,
forge, processus local ou gestion de credentials.

## 13. Security considerations

L'orchestrateur ne confère aucune permission. Il respecte les limites de
politique, ne lit pas de secret et n'augmente pas les autorisations d'une
demande. Les adaptateurs ne contournent jamais cette frontière et ne
communiquent pas entre eux.

Une entrée incomplète, invalide ou ambiguë est rejetée. Les résultats externes
restent des résultats de port ; ils ne deviennent pas une décision humaine, une
autorisation de fusion, une publication ou une conformité d'audit.

## 14. Audit strategy

Les audits Automation existants vérifient les contrats, les dépendances,
l'absence d'effets indésirables et le CI gate : AUDIT-503 à AUDIT-513. Une
implémentation future de l'orchestrateur devra ajouter des invariants
structurels et des tests déterministes avant toute intégration de runtime.

Les audits ne remplacent ni la politique ni le contrôle humain. Ils confirment
que les frontières documentées restent explicitement présentes.

## 15. Non-goals

Cette RFC ne définit pas :

- une implémentation d'orchestrateur, une commande, un runtime ou une API ;
- un nouveau contrat public ou une modification des contrats existants ;
- un algorithme de sélection, un registre global ou un conteneur d'injection ;
- un SDK, un réseau, un transport concret, des credentials ou une variable
  d'environnement ;
- un provider, une forge, un moteur de politique ou un adaptateur additionnel ;
- une exécution automatique, une fusion, une publication, un commit ou un
  contournement du contrôle humain.
