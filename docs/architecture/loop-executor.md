# Loop Executor (V8)

Statut : Draft

## Objectif

Le Loop Executor est la première brique qui transforme un plan validé
(`LoopRunResult`) en une demande d'exécution structurée.

Il ne réalise aucune action destructive.

Il ne contacte aucun agent.

Il ne modifie jamais le worktree.

Il prépare uniquement une session d'exécution.

---

# Position dans l'architecture

LoopRunner
↓
AgentPolicy
↓
MinimalContextBuilder
↓
LoopExecutor
↓
(futurs composants)
Validator
Repairer
Committer
Publisher

---

# Responsabilités

Le LoopExecutor :

- valide qu'un plan est exécutable ;
- vérifie les préconditions ;
- construit une ExecutionSession ;
- prépare les entrées nécessaires à un agent futur ;
- ne lance jamais cet agent.

---

# Garanties

Toujours :

- déterministe ;
- local ;
- reproductible ;
- sans réseau ;
- sans SDK IA ;
- sans processus externe ;
- sans git commit ;
- sans git push.

---

# Dépendances autorisées

Le LoopExecutor peut dépendre de :

- loop/
- policy/
- context/
- intelligence/

Il ne dépend jamais de :

- commands/
- cli.ts

Les couches supérieures consommeront LoopExecutor.

Jamais l'inverse.

---

# Contrat : ExecutionSession

Le LoopExecutor produit une structure immuable :

ExecutionSession

- sessionId
- createdAt
- project
- roadmapCandidate
- agentPolicy
- contextPackage
- executionMode
- executionState
- artifacts
- metadata

---

## executionState

Valeurs autorisées :

- created
- prepared
- running
- completed
- failed
- cancelled

Le lot V8.0 ne pourra produire que :

- created
- prepared

Aucun autre état ne doit être atteignable.

---

## Invariants

Une ExecutionSession :

- référence exactement un candidat de roadmap ;
- possède exactement une AgentPolicy ;
- possède exactement un ContextPackage ;
- est immuable après création ;
- ne modifie jamais le dépôt Git ;
- ne contacte jamais un agent.

---

# Machine à états

L'ExecutionSession suit une machine à états stricte.

created
│
▼
prepared
│
├──────────────► running
│ │
│ ├────────► completed
│ │
│ ├────────► failed
│ │
│ └────────► cancelled
│
└─────────────────────────────┘

Transitions interdites :

completed -> *
failed -> *
cancelled -> *

running -> created
running -> prepared

prepared -> completed

created -> running

---

# Responsabilité des futurs lots

V8.0

Autorisé :

created
prepared

V8.1

Ajoute :

running

V8.2

Ajoute :

completed

V8.3

Ajoute :

failed

V8.4

Ajoute :

cancelled

Chaque lot n'ajoute que les transitions nécessaires.

---

# Règles d'architecture

Le LoopExecutor est une couche d'orchestration.

Il consomme :

- ProjectSnapshot
- RoadmapCandidate
- AgentPolicy
- MinimalContextPackage

Il produit :

- ExecutionSession

Il ne produit rien d'autre.

---

# Dépendances

Autorisées

intelligence/
│
▼
policy/
│
▼
context/
│
▼
executor/

Interdites

executor -> commands

executor -> cli

executor -> audit

executor -> ui

executor -> git

---

# Règle fondamentale

Le LoopExecutor ne connaît jamais :

- Claude
- ChatGPT
- Codex
- Gemini
- OpenAI
- Anthropic

Il manipule uniquement des contrats métier.

Les futurs adaptateurs IA dépendront de executor/.

Jamais l'inverse.

---

# Tests attendus

Chaque invariant devra être testé.

Au minimum :

- aucune dépendance interdite
- aucune écriture disque
- aucun réseau
- aucun process externe
- aucune mutation du ProjectSnapshot
- aucune mutation du ContextPackage
- ExecutionSession immuable
- reproductibilité complète

---

# Périmètre du lot V8.0

Le lot V8.0 introduit uniquement le contrat d'exécution.

Il ne réalise aucune exécution réelle.

Livrables :

- src/executor/
- types.ts
- session.ts
- invariants.ts

Le résultat attendu est une ExecutionSession valide.

Aucune interaction avec un agent.

Aucune écriture disque.

Aucune modification Git.

Aucun subprocess.

Aucun appel réseau.

---

# Hors périmètre

Les éléments suivants seront réalisés dans des lots ultérieurs :

- Prompt Builder
- Session persistence
- Agent adapters
- Validator
- Repairer
- Committer
- Publisher
- Execute mode
- Commit mode
- Publish mode

Tout ajout dépassant ce périmètre devra faire l'objet d'un nouveau lot de roadmap.

---

# Structure du module

src/executor/

types.ts
Types publics.

session.ts
Construction d'une ExecutionSession.

state-machine.ts
Validation des transitions d'état.

planner.ts
Préparation de l'exécution.

validator.ts
Vérification des préconditions.

index.ts
API publique.

---

# API publique

Le module n'expose que :

createExecutionSession()

prepareExecution()

isExecutionTransitionAllowed()

Les autres fonctions restent privées au module.

---

# Évolution prévue

V8.0

- types
- session
- state machine

V8.1

- planner

V8.2

- prompt builder

V8.3

- validator

V8.4

- repairer

V8.5

- committer

V8.6

- publisher

Chaque lot enrichit le module sans casser l'API publique.
