# OpenClaw Provider Protocol

## Statut V10.4

V10.4 définit un contrat interne de planification OpenClaw. Ce contrat est une
version de schéma Loop Engine (`loop-engine-openclaw-planning/v1`), et non une
version officielle ou une revendication de compatibilité avec un protocole
OpenClaw externe.

L’unique opération abstraite est `plan`. Elle correspond au mode `plan` déjà
présent dans le LoopRunner : lecture et préparation déterministe, sans appel
agent ni effet de bord. Elle requiert seulement `read_only` et n’est jamais
exécutable dans ce lot.

## Dépendances

```text
ProviderRequest
  -> OpenClaw protocol normalization and validation
  -> OpenClawProtocolPlan (valid_non_executable)
  -> ExecutableMapping (V10.5, disabled and not configured)
  -> ProviderExecutionPlan (not_implemented)

ProviderExecutionPlan (future ready plan only)
  -> TransportAdapter
  -> LocalProcessTransport
```

Le module `src/providers/openclaw/` est sous la couche Provider. Il n’est pas
importé par Runtime, Transport, CLI, LoopRunner ni les générateurs de rapports.
L’adaptateur OpenClaw l’utilise seulement pour enrichir son diagnostic et reste
inerte : il ne résout ni n’appelle un transport.

## Validité de protocole et exécutabilité

La validité de protocole vérifie l’enveloppe interne : version, opération,
identités Provider/Runtime, référence de contexte, capacités, permissions et
capacités Transport abstraites. Elle n’accorde aucune autorisation de politique.

Un plan peut être valide et pourtant non exécutable. V10.4 produit alors
`valid_non_executable` avec `openclaw_executable_mapping_missing`; l’adaptateur
retourne toujours un `ProviderExecutionPlan` `not_implemented`, sans
`transportIntent`. Un plan invalide reste `unsupported`. Aucun de ces états ne
peut atteindre la résolution Transport.

V10.5 enregistre séparément une déclaration de compatibilité OpenClaw,
`OpenClawExecutableMapping`, mais celle-ci est désactivée et non configurée.
Elle ne change pas le contrat V10.4 : le protocole ne dispose toujours d'aucun
mapping exécutable configuré. Voir `executable-mapping.md`.

## Requête et diagnostics

La normalisation dérive seulement des contrats existants : identité de projet,
identifiant de tâche (`path:line`), métriques de contexte, capacités et
permissions déjà résolues, ainsi qu’un identifiant de corrélation fourni. Elle
ne copie ni texte de tâche, contenu de fichier, prompt, environnement parent,
commande, credential ou secret. Elle est pure, déterministe et ne génère ni
horodatage ni identifiant aléatoire.

Les erreurs et diagnostics sont structurés et non sensibles. Ils couvrent les
versions et opérations absentes ou non supportées, les incohérences de contexte,
les incompatibilités de capacité/permission/Runtime/Transport et l’absence de
mapping exécutable. `executionStarted` est toujours `false`.

## Évidence et limites

L’évidence locale examinée est limitée à
`docs/integrations/openclaw-read-only.md` et à sa checklist : elles documentent
un consommateur JSON read-only et indiquent explicitement qu’aucun connecteur
OpenClaw réel ni exécution d’action n’existent. Le dépôt ne contient aucune
documentation officielle d’exécutable OpenClaw, de commande, flag, format
d’entrée/sortie ou négociation de version.

En conséquence, V10.4 n’invente aucun binaire, chemin, commande ou flag. Aucun
mapping vers `local-process` n’est configuré. Avant un mapping futur, il faudra
une source officielle acceptée par le projet, un mapper structuré audité, une
allow-list fermée, les politiques Runtime/Provider/Transport explicites et les
garanties V10.1–V10.3 inchangées.

## Exclusions

V10.4 n’implémente pas OpenClaw réel, discovery de binaire, credentials,
réseau, HTTP, SDK, MCP, streaming, retries, mode public `execute`, exécution
CLI/LoopRunner, ni protocole Claude Code ou Codex.
