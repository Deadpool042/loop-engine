# JSON Consumers

## Objectif

Loop Engine expose des sorties JSON pour permettre à des outils externes de lire l'état du workspace sans exécuter d'action autonome.

Consommateurs visés :

- scripts locaux ;
- OpenClaw ;
- n8n ;
- dashboard web futur.

---

## Commandes JSON disponibles

```bash
pnpm loop summary --json
pnpm loop context <project> --json
pnpm loop next <project> --json
pnpm loop prompt <project> --json
pnpm loop review <project> --json

Chaque sortie expose :

{
  "schemaVersion": 1
}

⸻

Règles d’intégration

Les consommateurs JSON peuvent :

* lire l’état du workspace ;
* afficher un dashboard ;
* détecter un projet dirty ;
* afficher le candidat roadmap sélectionné ;
* préparer un prompt ;
* signaler qu’une validation est nécessaire.

Les consommateurs JSON ne doivent pas :

* modifier un dépôt ;
* lancer un commit ;
* lancer un push ;
* supprimer des fichiers ;
* déclencher une IA automatiquement ;
* exécuter une commande sans validation humaine explicite.

⸻

OpenClaw

Usage recommandé :

1. lire pnpm loop summary --json ;
2. laisser l’utilisateur choisir un projet ;
3. lire pnpm loop next <project> --json ;
4. lire pnpm loop prompt <project> --json ;
5. demander confirmation avant toute action.

OpenClaw doit rester un consommateur contrôlé par l’utilisateur.

⸻

n8n

Usage recommandé :

1. exécuter pnpm loop summary --json à intervalle raisonnable ;
2. afficher ou notifier les projets dirty ;
3. ne pas lancer de correction automatique ;
4. ne pas appeler d’IA sans action explicite.

n8n peut servir de tableau de bord ou de système d’alerte, pas d’agent autonome en V1.

⸻

Dashboard futur

Le dashboard pourra consommer :

* summary --json pour la vue workspace ;
* context --json pour la fiche projet ;
* next --json pour la prochaine action ;
* review --json pour l’état Git ;
* prompt --json pour préparer une session IA.

⸻

Garde-fous

* Lecture seule par défaut.
* Zéro IA automatique.
* Zéro token consommé par défaut.
* Zéro commit automatique.
* Zéro push automatique.
* Actions destructrices interdites sans confirmation humaine.
    EOF

pnpm run validate
git status –short
OEF
