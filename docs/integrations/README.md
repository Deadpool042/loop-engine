# Integrations

## Objectif

Centraliser les contrats d'intégration de Loop Engine sans créer de second moteur de décision ou d'exécution.

Les consommateurs externes doivent privilégier les projections JSON stables et les opérations read-only. Une mutation reste gouvernée par la surface responsable du système concerné.

## Documents

- `json-consumers.md` — contrat général des consommateurs JSON.
- `n8n-read-only.md` — rôle de n8n, état vérifié, frontières et contrat de maintenance.
- `n8n-read-only-checklist.md` — qualification obligatoire avant création ou modification d'un workflow n8n.
- `openclaw-read-only.md` — usage OpenClaw en lecture seule.
- `openclaw-read-only-checklist.md` — checklist avant intégration OpenClaw.

## Répartition des responsabilités

- **Loop Engine** : gouvernance, roadmaps, gates, sélection et projections déterministes.
- **Development Workspace** : opérations bornées sur dépôts et infrastructures.
- **OpenClaw** : façade distante/mobile.
- **n8n** : automatisations et intégrations périphériques explicitement justifiées.

Un consommateur ne doit pas dupliquer la logique de la source canonique.

## Garde-fous communs

- Aucun commit automatique implicite.
- Aucun push automatique implicite.
- Aucun déploiement automatique implicite.
- Aucune suppression automatique arbitraire.
- Aucun appel IA payant implicite.
- Les décisions structurantes ou irréversibles restent soumises à une validation explicite.
