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
consommateurs ; ils ne sont pas intégrés au cockpit actuel.

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

Le CLI direct est le choix par défaut : n8n peut exécuter
`pnpm exec tsx src/cli.ts summary --json` à intervalle raisonnable pour
afficher ou notifier les projets dirty. Dans Docker, le nœud Execute Command
requiert un environnement Node/pnpm et un montage du dépôt adaptés.

`pnpm loop serve-summary` est une option strictement spécifique à n8n Docker
lorsqu'on veut éviter d'exposer ce dépôt et l'environnement CLI au conteneur.
Le bridge n'expose que `GET /healthz` et `GET /summary`, ce dernier retournant
le même contrat que `summary --json`.

```bash
LOOP_SUMMARY_HOST=0.0.0.0 \
LOOP_SUMMARY_PORT=4174 \
LOOP_SUMMARY_TOKEN='<secret hors Git>' \
pnpm loop serve-summary
```

Par défaut, il écoute sur `127.0.0.1:4174`. Un bind hors loopback requiert
`LOOP_SUMMARY_TOKEN`, transmis avec `Authorization: Bearer <token>` pour les
deux routes. Depuis Docker Desktop, n8n peut joindre le service hôte avec
`http://host.docker.internal:4174`; sous Linux, configurer
`host.docker.internal` avec `host-gateway` ou l'équivalent de l'environnement
Docker utilisé.

Le bridge ne constitue pas une API HTTP générale : aucune route d'écriture,
aucun dispatcher de commande, aucun appel IA, commit ou push n'est exposé.

## Garde-fous

- Lecture seule par défaut.
- Zéro IA automatique et zéro token consommé par défaut.
- Zéro commit ou push automatique.
- Toute action destructive requiert une confirmation humaine.
