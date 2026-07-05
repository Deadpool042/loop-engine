# n8n Read-only Checklist

## Avant création du workflow

- [ ] Confirmer que n8n reste en lecture seule.
- [ ] Confirmer qu'aucune commande de modification n'est appelée.
- [ ] Confirmer qu'aucun appel IA automatique n'est déclenché.
- [ ] Confirmer que les commandes JSON utilisent `pnpm exec tsx src/cli.ts`.
- [ ] Confirmer que `pnpm run validate` passe.

## Commandes autorisées

- [ ] `summary --json`
- [ ] `next <project> --json`
- [ ] `context <project> --json`
- [ ] `review <project> --json`
- [ ] `prompt <project> --json` uniquement pour préparer une action humaine.

## Notifications autorisées

- [ ] Projet dirty.
- [ ] Candidat `blocked`.
- [ ] Candidat `p1`.
- [ ] Validation absente.
- [ ] Documentation requise absente.

## Interdits

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucun déploiement automatique.
- [ ] Aucune suppression automatique.
- [ ] Aucune correction automatique.
- [ ] Aucun agent IA autonome.

## Validation finale

- [ ] Workflow testé manuellement.
- [ ] Aucune écriture effectuée.
- [ ] Sorties JSON parsées correctement.
- [ ] Garde-fous documentés.
