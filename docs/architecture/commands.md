# Commands architecture

## Objectif

Les commandes Loop Engine sont des cas d'usage CLI.

Elles ne doivent pas contenir la logique métier principale du projet.

Elles orchestrent :

- la configuration ;
- le moteur d'intelligence ;
- les validations ;
- l'affichage terminal.

---

## Rôle de `cli.ts`

`src/cli.ts` est uniquement le routeur CLI.

Il doit :

- lire la commande demandée ;
- résoudre le projet si nécessaire ;
- appeler la commande correspondante.

Il ne doit pas :

- lire directement Git ;
- lire directement les documents ;
- analyser la roadmap ;
- formater des sorties longues ;
- contenir de logique métier.

---

## Rôle de `commands/`

Chaque fichier dans `src/commands/` représente une commande utilisateur.

Exemples :

- `summary.ts`
- `status.ts`
- `doctor.ts`
- `context.ts`
- `validate.ts`
- `review.ts`
- `next.ts`
- `prompt.ts`
- `help.ts`

Une commande peut :

- charger un `ProjectSnapshot` ;
- afficher une sortie utilisateur ;
- lancer une validation explicitement demandée ;
- préparer un contexte déterministe.

Une commande ne doit pas :

- dupliquer une logique présente dans `intelligence/` ;
- modifier un projet sans demande explicite ;
- appeler une IA automatiquement ;
- faire un commit ou un push automatique.

---

## Rôle de `core/`

`core/index.ts` est le point d'entrée interne stable entre les adaptateurs et le moteur.

Les commandes CLI importent uniquement ce façcade pour déclencher les opérations
de domaine et obtenir les rapports : audit, planification LoopRunner, snapshots,
rapports JSON, RAG et validations configurées. Elles conservent seulement le
parsing des arguments, le rendu terminal et les codes de sortie.

Les implémentations restent réparties dans les couches spécialisées. `core/`
contient également les primitives bas niveau :

- lecture de configuration ;
- helpers Git ;
- helpers docs ;
- résolution de projet.

Ces modules restent petits et déterministes.

Les adaptateurs futurs doivent consommer `core/index.ts`, sans importer
directement `audit/`, `loop/`, `intelligence/`, `policy/` ou `context/`.

---

## Rôle de `intelligence/`

`intelligence/` construit les états calculés.

Le point d'entrée central est le `ProjectSnapshot`.

Les commandes doivent utiliser le snapshot plutôt que relire directement Git, les docs ou la roadmap.

---

## Rôle de `ui/`

`ui/` contient la présentation terminal.

Les commandes doivent utiliser `terminal.*` plutôt que disperser des styles ou symboles.

---

## Règle d'évolution

Avant d'ajouter une nouvelle commande :

1. vérifier si l'information existe déjà dans `ProjectSnapshot` ;
2. enrichir `intelligence/` si nécessaire ;
3. garder `cli.ts` comme routeur minimal ;
4. garder la commande courte et lisible ;
5. ajouter une validation ou un test si la commande influence une décision.

## Sorties JSON

Certaines commandes exposent une sortie JSON destinée aux scripts, OpenClaw, n8n ou un futur dashboard.

Commandes concernées :

- `pnpm loop summary --json`
- `pnpm loop next <project> --json`
- `pnpm loop prompt <project> --json`
- `pnpm loop review <project> --json`

Chaque sortie JSON doit inclure `schemaVersion: 1`.

`schemaVersion` permet de faire évoluer les contrats sans casser les intégrations existantes.

Règles :

- ne pas supprimer un champ JSON sans incrémenter `schemaVersion`
- préférer ajouter des champs optionnels
- documenter toute évolution de contrat
- tester les sorties JSON critiques avant intégration externe

## Tests des contrats JSON

Les sorties JSON critiques doivent être couvertes par des tests.

Tests actuels :

- `summary --json` expose `schemaVersion` et `projects`.
- `next <project> --json` expose `schemaVersion` et `roadmap.selectedCandidate`.
- `prompt <project> --json` expose `schemaVersion` et `instructions`.
- `review <project> --json` expose `schemaVersion` et `diffStat`.

Ces tests protègent les intégrations futures :

- scripts locaux ;
- OpenClaw ;
- n8n ;
- dashboard web.

Toute nouvelle sortie JSON publique doit être ajoutée aux tests de contrat.

## Roadmap JSON compact

Les sorties JSON publiques ne doivent pas exposer toute la liste `roadmap.candidates` par défaut.

Motifs :

- éviter des payloads trop volumineux
- permettre la redirection vers fichier
- garder les sorties consommables par Node, n8n, OpenClaw et dashboards
- limiter les données au nécessaire pour une décision

Structure publique recommandée :

- `roadmap.available`
- `roadmap.paths`
- `roadmap.selectedCandidate`
- `roadmap.stats.total`
- `roadmap.stats.todo`
- `roadmap.stats.inProgress`
- `roadmap.stats.done`
- `roadmap.stats.unknown`
- `roadmap.stats.safe`
- `roadmap.stats.warning`
- `roadmap.stats.blocked`

La liste complète `roadmap.candidates` peut rester disponible dans le `ProjectSnapshot` interne, mais elle ne doit pas être exposée dans les sorties JSON publiques sans option explicite dédiée.
