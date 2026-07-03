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

`core/` contient les primitives bas niveau :

- lecture de configuration ;
- helpers Git ;
- helpers docs ;
- résolution de projet.

Ces modules restent petits et déterministes.

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
