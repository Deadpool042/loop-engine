# OpenClaw Read-only Checklist

## Avant intégration

- [ ] Confirmer qu'OpenClaw reste en lecture seule.
- [ ] Confirmer qu'aucun agent IA n'est lancé automatiquement.
- [ ] Confirmer qu'aucune commande de modification n'est appelée.
- [ ] Confirmer que les commandes JSON utilisent `pnpm exec tsx src/cli.ts`.
- [ ] Confirmer que `pnpm run validate` passe.

## Commandes autorisées

- [ ] `summary --json`
- [ ] `context <project> --json`
- [ ] `next <project> --json`
- [ ] `prompt <project> --json`
- [ ] `review <project> --json`

## Données autorisées

- [ ] État Git.
- [ ] Docs requises.
- [ ] Validations configurées.
- [ ] Candidat roadmap sélectionné.
- [ ] Roadmap summary.
- [ ] Roadmap stats.
- [ ] Health.

## Interdits

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucun déploiement automatique.
- [ ] Aucune suppression automatique.
- [ ] Aucune correction automatique.
- [ ] Aucun agent autonome.

## Validation finale

- [ ] Intégration testée manuellement.
- [ ] Aucune écriture effectuée.
- [ ] Sorties JSON parsées correctement.
- [ ] Confirmation humaine requise avant toute action.
