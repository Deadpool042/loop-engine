# OpenClaw Read-only Checklist

## Avant intégration

- [ ] Confirmer qu'OpenClaw reste une façade de lecture/pilotage et non une seconde source de gouvernance.
- [ ] Confirmer qu'aucun LLM ni provider IA n'est appelé pour afficher le Project Cockpit.
- [ ] Confirmer qu'aucune commande de modification n'est appelée.
- [ ] Confirmer que le chemin portefeuille passe par le node `VPS Main`, le serveur MCP `developmentWorkspace`, puis les outils bornés `project_list` et `project_handoff`.
- [ ] Confirmer que `workspace_info` du worker visé retourne `vps-main` avant de conclure sur l'état des repos du VPS.
- [ ] Confirmer que `pnpm run validate` passe dans Loop Engine.

## Capacités Cockpit autorisées

- [ ] `project_list()` pour la liste canonique des projets.
- [ ] `project_handoff({ project })` pour la projection d'état, roadmap, objectif, gates et validations.
- [ ] `workspace_info()` pour vérifier l'identité logique du worker.
- [ ] `roadmap_decision({ project })` uniquement comme lecture gouvernée spécialisée, sans provider par défaut.

`roadmap.propose` / `roadmap_decision({ requestProposal: true })` ne font pas partie du Project Cockpit V1 et ne doivent ni être affichés ni être déclenchés par son chargement ou son rafraîchissement.

## Données attendues

- [ ] `project.name` et `project.type`.
- [ ] `health`.
- [ ] `git.branch` et `git.clean`.
- [ ] `planning`.
- [ ] `roadmap.summary`.
- [ ] `roadmap.selectedCandidate` et sa priorité lorsqu'un candidat existe.
- [ ] `objective` et sa source lorsqu'un objectif canonique existe.
- [ ] `gates`.
- [ ] `validation.commands`.

## Interdits

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucun déploiement automatique.
- [ ] Aucune suppression ou correction automatique.
- [ ] Aucun agent autonome déclenché par l'affichage.
- [ ] Aucun credential, provider, cwd, package manager, script ou argument libre fourni par OpenClaw.
- [ ] Aucun fallback silencieux du worker VPS vers le Mac pour le Cockpit portefeuille.
- [ ] Aucune interprétation locale d'une gate ou fabrication d'un prochain lot.
- [ ] Aucun schéma inconnu interprété comme un état valide : échec fermé obligatoire.

## Validation finale

- [ ] Le node OpenClaw `VPS Main` est appairé, connecté et expose la capacité MCP.
- [ ] Son serveur `developmentWorkspace` expose uniquement les outils explicitement filtrés.
- [ ] Le plugin Roadmap pointe vers le `nodeId` de `VPS Main`; Continuity peut rester sur son node Mac distinct.
- [ ] Le sélecteur du Cockpit liste les projets retournés par `project_list`.
- [ ] Le changement de projet recharge `project_handoff` sans appel provider.
- [ ] Le test Creatyss affiche `Search storefront V2 [P1]` depuis `/home/ubuntu/Projects/CREATYSS`.
- [ ] L'objectif canonique, l'état et les gates affichés proviennent du même handoff.
- [ ] Aucune écriture projet n'est effectuée pendant cette validation.
