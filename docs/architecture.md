# Architecture Loop Engine

Loop Engine est un orchestrateur local, sobre et déterministe.

## Principes

- Pas d'IA automatique en V0.
- Pas de modification des projets pilotés.
- Pas de commit automatique.
- Pas de push automatique.
- Les appels IA doivent être explicites.
- Les validations locales passent avant toute revue IA.

## Responsabilités

Loop Engine peut :
- scanner les projets configurés ;
- détecter l'état Git ;
- vérifier la présence des documents importants ;
- afficher les commandes de validation ;
- préparer un contexte court pour un modèle IA.

Loop Engine ne doit pas :
- modifier Creatyss, lp-infra ou n8n sans commande explicite ;
- lancer des agents en boucle ;
- consommer des tokens en continu ;
- contourner la validation humaine.

## Philosophie

Automatiser le déterministe.
Limiter l'IA au jugement.
Garder l'humain sur les décisions.
