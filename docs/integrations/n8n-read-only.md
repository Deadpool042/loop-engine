# n8n Read-only Integration

## Objectif

Permettre à n8n de consommer Loop Engine sans modifier les dépôts.

Cette intégration sert à observer, notifier et afficher.

Elle ne doit pas automatiser de correction.

## Commandes autorisées

- `pnpm exec tsx src/cli.ts summary --json`
- `pnpm exec tsx src/cli.ts next <project> --json`
- `pnpm exec tsx src/cli.ts context <project> --json`
- `pnpm exec tsx src/cli.ts review <project> --json`

`prompt --json` peut être lu uniquement pour préparer une action humaine.

## Commandes interdites en automatique

n8n ne doit jamais lancer automatiquement :

- `git commit`
- `git push`
- suppression de fichier
- modification de fichier
- assistant IA
- commande de correction
- commande de déploiement

## Fréquence recommandée

V1.7 recommande une fréquence faible :

- toutes les 30 minutes
- déclenchement manuel
- exécution au démarrage d'une session de travail

Éviter les boucles trop fréquentes.

## Données utiles

Depuis `summary --json` :

- projet
- état Git
- état docs
- validations configurées
- roadmap summary
- selected candidate

Depuis `next <project> --json` :

- candidat sélectionné
- `kind`
- `status`
- `priority`
- `reason`
- roadmap summary

Depuis `review <project> --json` :

- état Git court
- diff stat
- validations configurées

## Règles de notification

n8n peut notifier si :

- un projet devient dirty
- un candidat `blocked` existe
- un candidat `p1` existe
- une validation est absente
- un projet n'a pas les docs requises

Les notifications doivent rester informatives.

## Garde-fous

- Lecture seule par défaut
- Aucune modification automatique
- Aucun commit automatique
- Aucun push automatique
- Aucun appel IA automatique
- Toute action doit être confirmée par l'humain

## Limites V1.7

Cette intégration ne définit pas encore :

- un workflow n8n exporté
- un dashboard n8n complet
- une persistance historique
- des alertes avancées
- un système d'acquittement
