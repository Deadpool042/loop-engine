# JSON Consumers

## Objectif

Loop Engine expose des sorties JSON versionnées pour permettre à des
consommateurs externes de lire l'état des projets sans action autonome.

Consommateurs actuels :

- scripts locaux ;
- OpenClaw ;
- n8n ;
- cockpit desktop Electron local.

Le cockpit desktop consomme les contrats via son process principal. Son
renderer reste sandboxé et n'accède ni au système ni au `cwd` du CLI.

## Contrats disponibles

Les commandes suivantes existent sur le CLI :

```bash
pnpm loop summary --json
pnpm loop context <project> --json
pnpm loop next <project> --json
pnpm loop prompt <project> --json
pnpm loop review <project> --json
```

Chaque sortie expose au minimum :

```json
{
  "schemaVersion": 1
}
```

Le cockpit livré utilise uniquement :

- `summary --json` pour la liste et le résumé des projets ;
- `context <project> --json` pour la section Context ;
- `review <project> --json` pour la section Review.

`next` et `prompt` restent des contrats CLI disponibles pour d'autres
consommateurs ; ils ne sont pas intégrés au cockpit actuel. Aucun contrat
`serve-summary` n'est présent sur cette branche.

## Règles d'intégration

Les consommateurs JSON peuvent :

- lire l'état du workspace ;
- afficher un cockpit ou un tableau de bord ;
- détecter un projet dirty ;
- afficher un candidat roadmap ou préparer un prompt lorsque le contrat
  concerné est consommé ;
- signaler qu'une validation est nécessaire.

Les consommateurs JSON ne doivent pas :

- modifier un dépôt ;
- lancer un commit ou un push ;
- supprimer des fichiers ;
- déclencher une IA automatiquement ;
- exécuter une commande d'écriture sans validation humaine explicite.

## OpenClaw

Usage recommandé : lire `summary --json`, laisser l'utilisateur choisir un
projet, puis lire `next` ou `prompt` si nécessaire. OpenClaw reste contrôlé
par l'utilisateur.

## n8n

n8n peut lire `summary --json` à intervalle raisonnable pour afficher ou
notifier les projets dirty. Il ne lance ni correction automatique ni appel IA
sans action explicite.

## Garde-fous

- Lecture seule par défaut.
- Zéro IA automatique et zéro token consommé par défaut.
- Zéro commit ou push automatique.
- Toute action destructive requiert une confirmation humaine.
