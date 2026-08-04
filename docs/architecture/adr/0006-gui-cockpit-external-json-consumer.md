# ADR-0006 — La GUI Cockpit est un consommateur JSON externe, jamais un module du moteur

## Statut

Acceptée.

## Contexte

Loop Engine est un cockpit CLI local, déterministe et read-only par défaut
(voir `final-objective.md`). Une interface graphique de pilotage est
demandée. Trois options d'intégration ont été envisagées :

1. **Import in-process** de la composition layer
   (`createLoopApplicationAssembly(...)`) directement dans le process de
   la GUI.
2. **Serveur HTTP local** exposant les commandes, consommé par un
   frontend web (même en loopback).
3. **Spawn du CLI en sous-processus** (`pnpm loop <cmd> --json`), la GUI
   parsant stdout au même titre qu'un consommateur externe.

## Décision

La GUI communique avec le moteur **exclusivement** en spawnant le CLI et en
consommant sa sortie `--json` déjà stabilisée et auditée
(`schemaVersion: 1`). Aucun import de `src/composition/`, `src/core/` ou
tout module interne du moteur depuis le code de la GUI. Aucun serveur HTTP
n'est introduit.

## Alternatives rejetées

- **Import in-process (option 1)** : court-circuiterait `cli.ts` et
  `commands/`, qui sont explicitement les seules couches autorisées à
  orchestrer le moteur pour un cas d'usage utilisateur
  (`docs/architecture/commands.md`). Couplerait la GUI au cycle de vie
  interne de `LoopApplicationAssembly`, rendant toute évolution interne du
  moteur potentiellement bloquante pour la GUI.
- **Serveur HTTP local (option 2)** : réintroduirait une surface réseau
  que V14.5 exclut explicitement ("Aucun serveur HTTP... ne fait partie de
  V14.5"), et rouvrirait tout le sujet identité/ACL/replay de
  `src/inbound-security/` pour un besoin strictement mono-poste.

## Conséquences

- La GUI reste, du point de vue du moteur, indiscernable d'OpenClaw ou
  n8n : un consommateur JSON parmi d'autres (`docs/integrations/json-consumers.md`).
- Toute évolution du moteur qui respecte le contrat `--json` existant
  (additive, `schemaVersion` stable) est automatiquement compatible avec
  la GUI, sans coordination de version.
- En contrepartie, la GUI hérite de la latence de démarrage d'un process
  CLI par appel (overhead `pnpm`/`tsx`) — accepté comme risque connu
  (voir `docs/architecture/gui-cockpit.md`, risque R-6) plutôt que comme
  blocage de la décision.
- Si un besoin futur exige un flux temps réel (push serveur → GUI) plutôt
  que des appels ponctuels, cette ADR devra être révisée explicitement —
  elle ne couvre que le besoin de pilotage synchrone actuel.
