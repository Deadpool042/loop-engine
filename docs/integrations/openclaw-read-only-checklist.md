# OpenClaw Read-only Checklist

## Avant intégration

- [ ] Confirmer qu'OpenClaw reste en lecture seule par défaut.
- [ ] Confirmer qu'aucun agent IA n'est lancé automatiquement.
- [ ] Confirmer qu'aucune commande de modification n'est appelée.
- [ ] Confirmer que le chemin réel est `roadmap decision <project> [--json]`, consommé via l'outil MCP borné `roadmap_decision` de Development Workspace (`mcp.tools.call.v1`, server `developmentWorkspace`) — pas d'invocation directe de la CLI Loop Engine par OpenClaw.
- [ ] Confirmer que `pnpm run validate` passe.

## Commande autorisée

- [ ] `roadmap decision <project> --json` (déterministe, sans provider)
- [ ] `roadmap decision <project> --request-proposal --provider anthropic_api --provider-timeout-ms <t> --json` uniquement suite à une action utilisateur explicite côté OpenClaw, jamais automatique

## Données autorisées

- [ ] `schemaVersion`
- [ ] `project.name`
- [ ] `decision` (`existing_candidate` | `proposal` | `no_proposal` | `unavailable`)
- [ ] `reason`
- [ ] `candidate` (si `existing_candidate`)
- [ ] `proposal` (si `proposal`) — jamais matérialisée en mission
- [ ] `providerCall` limité à `provider`, `model`, `effort`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `actualCalculatedCostUsd`

## Interdits

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucun déploiement automatique.
- [ ] Aucune suppression automatique.
- [ ] Aucune correction automatique.
- [ ] Aucun agent autonome.
- [ ] Aucune matérialisation automatique d'une `proposal` en mission/prompt.
- [ ] Aucun `schemaVersion` ou `decision` inconnu interprété comme une décision valide (fail closed obligatoire).
- [ ] Aucun credential, provider, cwd, package manager, script ou argument libre fourni par OpenClaw.

## Validation finale

- [ ] Intégration testée manuellement via le chemin MCP réel (Gateway → node → `mcp.tools.call.v1` → `roadmap_decision`).
- [ ] Aucune écriture effectuée.
- [ ] Sorties JSON parsées correctement, avec échec explicite sur JSON invalide, `schemaVersion` ou `decision` inconnus, ou transport/MCP indisponible.
- [ ] Confirmation humaine requise avant toute action de matérialisation.
