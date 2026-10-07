# AGENTS.md

## Statut et objectif

Ce fichier guide tout assistant ou runtime travaillant dans ce dépôt. Pour chaque tâche, appliquer aussi `/Users/laurent/Projects/AGENTS.md`.

La source de vérité produit est `docs/architecture/final-objective.md`. La lire avant toute évolution structurante.

## Rôle de Loop Engine

Loop Engine est un moteur local, déterministe, de gouvernance et d’orchestration des projets déclarés dans `projects.yaml`.

Il :
- calcule l’état projet et les candidats de roadmap ;
- produit contexte, handoff et prompts bornés ;
- valide et audite ;
- expose des chemins d’exécution explicitement gouvernés.

Les chemins read/plan restent non destructifs par défaut. Les mutations n’existent que derrière des modes explicites, des garde-fous de scope et des validations.

Aucun runtime IA n’est primaire par statut. Provider, modèle et effort sont des dimensions gouvernées. Aucun fallback silencieux ni runtime payant implicite.

## Invariants non négociables

- aucun appel IA automatique par défaut ;
- `plan` reste déterministe et sans appel agent ;
- aucune écriture générale sur les projets surveillés ;
- aucun commit/push implicite ;
- les validations locales précèdent toute review IA, commit ou publication ;
- l’humain reste maître des décisions ;
- la roadmap est volontairement conservatrice ;
- ne pas contourner les contrats d’admission, de scope ou d’evidence.

Si une tâche semble exiger de violer un invariant, signaler le conflit au lieu de le contourner.

## Exécution par défaut

Appliquer le fast-path global :
1. vérifier l’état Git et le HEAD ;
2. lire les fichiers exacts concernés ;
3. faire le plus petit changement fiable ;
4. exécuter les validations ciblées ;
5. élargir vers audit, sous-agent ou suite complète seulement si le risque ou un échec le justifie.

Pour les tâches spécialisées, utiliser les skills disponibles dans `.agents/skills/` quand ils apportent une vraie valeur, notamment `diagnosing-bugs`, `code-review`, `tdd`, `domain-modeling` ou `prototype`.

## Commandes utiles

Commandes de base :
```bash
pnpm loop <command>
pnpm run typecheck
pnpm run test
pnpm run validate
pnpm run ci
```

`pnpm run ci` est la validation de référence complète. Ne pas la lancer par défaut pour un micro-lot si des validations ciblées suffisent ; elle doit en revanche passer avant une release ou quand le contrat du lot l’exige.

Pour la liste exacte des commandes et options, lire `src/cli.ts` et `package.json` plutôt que maintenir ici une copie exhaustive.

## Architecture

Dépendances strictement orientées :

```text
cli.ts
  → commands/
  → composition/
  → services applicatifs / domaine
```

Invariants :
- `src/cli.ts` route les arguments, sans logique métier ;
- `src/commands/` consomme uniquement l’assembly injecté ;
- `src/composition/` est l’unique couche d’assemblage concrète ;
- `src/loop/` porte les contrats d’exécution, validations/réparations et transitions d’état ;
- `src/intelligence/project-snapshot.ts` construit le `ProjectSnapshot`, source de vérité des commandes pour l’état projet ;
- `src/core/` contient des primitives déterministes de bas niveau ;
- `src/ui/terminal.ts` centralise le rendu terminal.

Avant d’ajouter une commande ou de recalculer un état, vérifier si la donnée appartient déjà à `ProjectSnapshot`. Ne pas relire Git/docs/roadmap ad hoc depuis une commande.

Pour les changements structurels, lire les documents ciblés de `docs/architecture/**` au lieu de charger toute l’architecture.

## Roadmap reader

Le reader est volontairement déterministe et naïf. Il classe les lignes candidates et respecte l’ordre canonique de déclaration.

Règle essentielle : ne jamais sauter le premier candidat encore ouvert pour sélectionner un lot ultérieur jugé plus simple ou plus sûr. `kind` et `priority` décrivent le risque/priorité ; ils ne donnent pas le droit de réordonner la roadmap.

Tout changement de classification doit privilégier la précision et être couvert par des tests dans `tests/intelligence/roadmap.test.ts`.

## JSON

Les sorties JSON publiques conservent `schemaVersion: 1`.

Ne jamais supprimer ou changer sémantiquement un champ existant sans évolution explicite du contrat ; préférer les champs optionnels compatibles et couvrir les changements dans les tests JSON.

Les consommateurs JSON restent read-only par contrat et ne doivent pas déclencher commit, push, suppression ou appel IA automatique.

## Validation et méthode

Travailler en petits lots réversibles.

Avant un changement significatif :
- lire les sources ciblées ;
- identifier les invariants et contrats touchés ;
- préférer un audit/design seulement quand l’architecture est réellement incertaine.

Après modification :
- exécuter les validations proportionnées ;
- pour un changement de code standard, au minimum les tests/typecheck ciblés pertinents ;
- utiliser `pnpm run validate` ou `pnpm run ci` lorsque le scope ou le risque le justifie ;
- résumer fichiers modifiés, validations exécutées et points non vérifiés.

Ne jamais annoncer PASS sur la seule base d’une compilation ou d’une hypothèse.

## Sources structurantes

Consulter seulement quand pertinent :
- `docs/architecture/final-objective.md` — objectif produit ;
- `docs/architecture/application-assembly-contract.md` — assembly et dépendances ;
- `docs/architecture/project-intelligence.md` — `ProjectSnapshot` ;
- `docs/architecture/roadmap-reader.md` — roadmap ;
- `docs/architecture/looprunner-execute-validation-repair.md` — exécution actuelle ;
- `docs/architecture/audit-engine.md` — audit ;
- `docs/integrations/json-consumers.md` — contrats JSON.

Éviter de lire toute cette liste pour une tâche localisée.

## Git / worktrees

La source canonique est `/Users/laurent/Projects/project-factory/CONTRACT.md` §3.9 et `task-policy.yaml` (`git.worktree`).

En bref : le checkout canonique reste sur `main`, une tâche utilise au plus un worktree temporaire, et le cleanup complet est une condition de DONE. Ne jamais forcer la suppression d’un worktree dirty, actif ou lié à une PR ouverte.
