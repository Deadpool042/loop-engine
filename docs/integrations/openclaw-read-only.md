# OpenClaw Read-only Integration

## Objectif

Permettre à OpenClaw de consommer la décision de roadmap gouvernée de Loop Engine sans déclencher d'action autonome ni de seconde source de décision.

OpenClaw doit aider à préparer une session humaine, pas piloter le dépôt seul.

## Contrat canonique actuel

Depuis PL2 / OpenClaw O4, OpenClaw n'invoque plus directement la CLI Loop Engine (`pnpm exec tsx src/cli.ts ...`). Le chemin réel est :

```text
OpenClaw Control UI
  ↓
Gateway OpenClaw
  ↓
node Mac
  ↓
mcp.tools.call.v1 (server: developmentWorkspace)
  ↓
roadmap_decision (Development Workspace / dw-mcp)
  ↓
pnpm loop roadmap decision <project> [--request-proposal --provider anthropic_api --provider-timeout-ms <t>] --json
  ↓
Loop Engine
```

Development Workspace expose l'unique outil MCP borné `roadmap_decision({ project, requestProposal?, timeoutMs? })` (voir `development-workspace/docs/connectors/README.md`), qui appelle ce contrat CLI. OpenClaw ne fournit jamais `cwd`, `packageManager`, `script`, `provider`, `provider-model`, `provider-effort` ni de credential : ces éléments restent fixés côté Development Workspace.

Le contrat CLI sous-jacent reste :

```bash
pnpm exec tsx src/cli.ts roadmap decision <project> --json
pnpm exec tsx src/cli.ts roadmap decision <project> --request-proposal --provider anthropic_api --provider-timeout-ms <t> --json
```

## Sortie gouvernée

`roadmap decision --json` retourne `schemaVersion: 1` et l'une de ces valeurs de `decision` :

- `existing_candidate` — un candidat admissible existe déjà (`candidate`) ;
- `proposal` — une proposition a été générée (`proposal`, et `providerCall` si un appel provider a eu lieu) ; une `proposal` n'est jamais un lot autorisé et nécessite une validation/matérialisation humaine avant de devenir une mission gouvernée ;
- `no_proposal` — aucun nouveau travail n'est justifié ;
- `unavailable` — aucune décision automatique n'est disponible (voir `reason`, par exemple `proposal_requires_explicit_request`).

Toute autre valeur de `schemaVersion` ou de `decision`, tout JSON invalide, ou toute indisponibilité de transport/MCP/outil doit être traitée en échec explicite (fail closed) par le consommateur, jamais interprétée ou transformée en décision fabriquée.

## Usage recommandé

1. L'utilisateur sélectionne un projet dans OpenClaw.
2. OpenClaw appelle `roadmap_decision({ project })` (déterministe, sans provider).
3. OpenClaw affiche `project` / `decision` / `reason`, et selon le cas `candidate`, `proposal` ou l'absence de travail.
4. Si `decision = unavailable` avec `reason = proposal_requires_explicit_request`, OpenClaw peut proposer une action utilisateur explicite (jamais automatique) qui appelle `roadmap_decision({ project, requestProposal: true, timeoutMs })`.
5. Une `proposal` reste affichée sans être matérialisée : aucun prompt de mission n'est généré depuis ce chemin.
6. Les décisions restent humaines.

## Garde-fous

- Aucun appel IA automatique : `requestProposal: true` exige toujours une action utilisateur explicite.
- Aucun commit automatique.
- Aucun push automatique.
- Aucune modification automatique.
- Aucun déploiement automatique.
- OpenClaw ne recalcule jamais la policy ni n'interprète une gate métier : il affiche la décision de Loop Engine telle quelle.
- Les décisions restent humaines.

## Données utiles

Le JSON `roadmap decision --json` expose :

- `schemaVersion`
- `project.name`
- `decision`
- `reason`
- `candidate` (si `existing_candidate`)
- `proposal` et `providerCall` (si `proposal`)

`providerCall`, lorsqu'il existe, n'expose que `provider`, `model`, `effort`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `actualCalculatedCostUsd` — jamais de secret.

## Historique

Les anciennes commandes `summary --json` / `context <project> --json` / `next <project> --json` / `prompt <project> --json` / `review <project> --json` restent des commandes CLI Loop Engine valides pour un usage interactif humain (ChatGPT, terminal), mais ne constituent plus le chemin d'intégration OpenClaw : ce rôle est désormais porté par `roadmap decision --json`, consommé via l'outil MCP borné `roadmap_decision` de Development Workspace.

## Checklist

Avant toute intégration réelle avec OpenClaw, utiliser :

- `docs/integrations/openclaw-read-only-checklist.md`
