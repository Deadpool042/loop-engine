# GUI Cockpit — cadrage V1 (MVP)

## Statut

Le cockpit livré affiche le `summary --json` dans un split-view et charge les détails `context --json` et `review --json` du projet sélectionné. Il reste un consommateur read-only avec des API preload explicites et un cwd résolu uniquement par le process principal.

## Objectif

Piloter visuellement Loop Engine sans modifier son architecture. La GUI est un
**consommateur JSON externe** du CLI, au même titre qu'OpenClaw ou n8n
(voir [`json-consumers.md`](../integrations/json-consumers.md)) — pas une
nouvelle couche du moteur.

Voir [ADR-0006](adr/0006-gui-cockpit-external-json-consumer.md) pour la
décision structurante (spawn CLI vs couplage in-process vs serveur HTTP).

## Décisions actées (non renégociables pour le MVP)

| #   | Décision                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application desktop locale, sans réseau                                                                                                      |
| 2   | Intégration par spawn du CLI (`pnpm loop <cmd> --json`), aucun import de la composition layer                                                |
| 3   | MVP = lecture seule stricte, `run --mode execute` hors scope                                                                                 |
| 4   | Rafraîchissement strictement manuel, aucune tâche de fond                                                                                    |
| 5   | Dashboard multi-projets basé sur `summary --json`                                                                                            |
| 6   | Commandes MVP : `summary`, `status`, `context`, `next`, `prompt`, `review`, `run --mode plan`                                                |
| 7   | Stack technique MVP : Electron Forge 7 + Webpack + React + TypeScript ; renderer sandboxé, `contextIsolation` actif, IPC minimal via preload |
| 8   | Persona unique : opérateur solo                                                                                                              |
| 9   | `context`/`prompt` : affichage brut + copier, aucune édition ni rendu markdown                                                               |
| 10  | Erreurs JSON du CLI : affichage brut et neutre, aucune traduction de code métier                                                             |
| 11  | Appels CLI parallèles autorisés par écran, jamais de doublon sur une action en cours                                                         |
| 12  | Page unique par projet, sections repliables ; `status` + `next` chargés à l'ouverture                                                        |
| 13  | Rafraîchissement par section, bouton dédié à chacune                                                                                         |
| 14  | Section "Plan" traitée comme les autres sections à la demande                                                                                |
| 15  | Chemin du repo configuré une fois, auto-détection au 1er lancement, reconfigurable                                                           |
| 16  | Config GUI stockée hors repo (répertoire de données utilisateur de l'OS)                                                                     |
| 17  | Échec de spawn : message générique + détails bruts + copier + lien Réglages                                                                  |

---

## 1. Personas

Un seul persona pour le MVP (décision 8).

### Persona unique — l'Opérateur

- **Qui** : vous-même, développeur solo utilisant Loop Engine pour piloter
  plusieurs projets locaux (`creatyss`, `lp-infra`, `n8n`, `loop-engine`
  lui-même, etc.).
- **Contexte d'usage** : poste de travail local, plusieurs projets Git
  ouverts en parallèle, bascule fréquente entre eux.
- **Besoin principal** : voir en un coup d'œil l'état de chaque projet
  (propre/dirty, candidat roadmap, prochaine action sûre) sans taper de
  commandes CLI à répétition ni se souvenir de la syntaxe exacte.
- **Non-besoin** : pas de collaboration, pas de rôles, pas d'historique
  partagé — un seul poste, une seule session à la fois.
- **Relation au moteur** : consommateur passif des contrats JSON existants.
  L'opérateur ne modifie rien depuis la GUI en V1 ; toute action de
  modification (`execute`, `commit`, `publish`) reste faite depuis le CLI.

---

## 2. Cas d'usage

| ID                | Cas d'usage                                                                                         | Commande CLI sous-jacente          | Priorité                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| UC-1              | Voir l'état de tous mes projets en un coup d'œil                                                    | `summary --json`                   | MVP                                                             |
| UC-2              | Consulter le statut détaillé d'un projet (branche, dirty, docs manquants, santé)                    | `status --json`                    | MVP                                                             |
| UC-3              | Savoir quelle est la prochaine action sûre sur un projet                                            | `next <project> --json`            | MVP                                                             |
| UC-4              | Récupérer le contexte préparé pour coller dans Claude/Codex/ChatGPT                                 | `context <project> --json`         | MVP                                                             |
| UC-5              | Récupérer le prompt prêt à l'emploi pour un agent externe                                           | `prompt <project> --json`          | MVP                                                             |
| UC-6              | Consulter le rapport de review d'un projet                                                          | `review <project> --json`          | MVP                                                             |
| UC-7              | Visualiser une planification prévisionnelle (agent envisagé, budget de contexte) sans rien exécuter | `run <project> --mode plan --json` | MVP                                                             |
| UC-8              | Reconfigurer le chemin vers le repo Loop Engine si déplacé/introuvable                              | — (config GUI locale)              | MVP                                                             |
| UC-9              | Comprendre pourquoi un appel a échoué et copier le détail technique                                 | — (gestion d'erreur GUI)           | MVP                                                             |
| UC-10 (évolution) | Lancer un audit (`audit --json`) et visualiser les violations                                       | `audit --json`                     | Post-MVP                                                        |
| UC-11 (évolution) | Vérifier la santé de l'environnement (`doctor`)                                                     | `doctor`                           | Post-MVP                                                        |
| UC-12 (évolution) | Rechercher dans le RAG local                                                                        | `rag-search`                       | Post-MVP                                                        |
| UC-13 (évolution) | Déclencher `run --mode execute` avec confirmation                                                   | `run --mode execute --json`        | Post-MVP, bloqué tant qu'aucun executor concret n'est configuré |

`status --json` est désormais disponible avec une enveloppe versionnée (`schemaVersion: 1`) et la liste des rapports projet. La GUI peut donc consommer ce contrat directement sans dupliquer la logique de statut.

---

## 3. Parcours utilisateur

### Parcours A — Vue d'ensemble et sélection d'un projet

1. Lancement de l'app → écran **Dashboard**.
2. Si aucun chemin de repo configuré : bandeau/écran **Réglages** demandé
   avant tout (auto-détection tentée en premier).
3. Dashboard exécute `summary --json` (déclenché par l'utilisateur via
   bouton "Actualiser" — pas d'auto-chargement caché, cohérent avec la
   décision 4 appliquée aussi à l'ouverture initiale : premier chargement =
   action implicite d'ouverture, actualisations suivantes = explicites).
4. Liste des projets avec statut résumé (nom, type, dirty/clean, santé).
5. Clic sur un projet → écran **Détail projet**.

### Parcours B — Comprendre l'état et la prochaine action

1. Depuis Détail projet, `status` et `next` sont chargés automatiquement à
   l'ouverture (décision 12bis).
2. L'opérateur lit l'état (branche, propreté, docs manquants, santé) et la
   recommandation de prochaine action (candidat roadmap, risque associé).
3. Chaque section a son bouton "Actualiser" local (décision 13).

### Parcours C — Préparer un contexte pour un agent externe

1. Depuis Détail projet, l'opérateur déplie la section **Contexte**.
2. Premier dépliage → appel `context <project> --json`, résultat mis en
   cache pour la session.
3. Texte affiché brut, bouton **Copier**.
4. L'opérateur colle le texte dans Claude/Codex/ChatGPT (hors GUI).
5. Idem pour la section **Prompt**.

### Parcours D — Consulter une review

1. Déplie la section **Review** → `review <project> --json` (premier
   dépliage, mise en cache).
2. Lecture du rapport brut.

### Parcours E — Visualiser une planification prévisionnelle

1. Déplie la section **Plan** → `run <project> --mode plan --json`.
2. Affichage de l'`agentPolicy` prévisionnel et du `contextPackage` borné,
   sans qu'aucune action réelle n'ait été effectuée.

### Parcours F — Gérer une erreur

1. Un appel CLI échoue à un moment quelconque des parcours ci-dessus,
   dans l'une des deux formes :
   - **Erreur applicative (JSON valide, `ok:false` ou `failure`)** →
     affichage brut du contenu JSON dans la section concernée
     (décision 10).
   - **Échec de spawn (pas de JSON)** → message générique
     "Impossible d'exécuter la commande" + stderr/exception brut +
     bouton "Copier les détails" + bouton "Ouvrir les Réglages"
     (décision 17).
2. L'opérateur peut retenter (bouton refresh de la section) ou aller
   reconfigurer le chemin du repo.

### Parcours G — Reconfigurer le repo

1. Écran **Réglages** → champ chemin du repo, bouton "Parcourir",
   bouton "Auto-détecter", bouton "Enregistrer".
2. À l'enregistrement, la GUI ne valide pas activement le chemin
   (pas de logique métier) ; la validité se révèle au prochain appel CLI
   (Parcours F si invalide).

---

## 4. Architecture des écrans

```
┌─────────────────────────────────────────────┐
│ Réglages (Settings)                          │
│  - Chemin du repo Loop Engine                │
│  - Auto-détection / Parcourir / Enregistrer  │
│  - (extensible : futures préférences GUI)    │
└─────────────────────────────────────────────┘
                     ▲
                     │ (lien depuis erreurs de spawn,
                     │  ou accès direct depuis Dashboard)
                     │
┌─────────────────────────────────────────────┐
│ Dashboard                                    │
│  - Liste des projets (summary --json)        │
│  - Bouton Actualiser (global, un seul appel) │
│  - Etat vide : "Aucun repo configuré"        │
│    → renvoie vers Réglages                   │
└─────────────────────────────────────────────┘
                     │ clic sur un projet
                     ▼
┌─────────────────────────────────────────────┐
│ Détail projet (page unique, sections)        │
│                                               │
│  ▣ Statut (eager, refresh dédié)              │
│  ▣ Prochaine action / Next (eager, refresh)   │
│  ▢ Contexte (lazy, cache, refresh dédié)      │
│  ▢ Prompt (lazy, cache, refresh dédié)        │
│  ▢ Review (lazy, cache, refresh dédié)        │
│  ▢ Plan (lazy, cache, refresh dédié)          │
│                                               │
│  Chaque section : état {vide, en chargement,  │
│  chargée, en erreur}                          │
└─────────────────────────────────────────────┘
```

3 écrans au total pour le MVP : **Réglages**, **Dashboard**, **Détail
projet**. Pas d'écran dédié pour les erreurs de spawn (traitées en overlay
local à la section/action concernée, cf. décision 17), pas d'onglets
(décision 12).

---

## 5. Composants principaux

Organisation en composants "purs" (présentation) + un unique point
d'accès au moteur, pour respecter "aucune logique métier dans l'UI".

### Couche transport (process principal / main process)

- **`CliInvoker`** — unique composant qui sait spawn `pnpm loop <cmd>
--json [args]`, capture stdout/stderr/code de sortie, retourne soit
  `{ ok: true, json }`, soit `{ ok: false, kind: "spawn-error", raw }`.
  Ne parse ni n'interprète le contenu JSON métier au-delà de
  `JSON.parse`. Aucune connaissance des codes de domaine
  (`failure.code`, etc.).
- **`RepoPathResolver`** — auto-détection (heuristique : cwd de lancement,
  ou emplacement connu) + lecture/écriture de la config GUI persistée.
- **`GuiConfigStore`** — lecture/écriture du fichier de config GUI dans le
  répertoire de données utilisateur de l'OS (décision 16). Ne connaît que
  la structure de la config GUI, jamais `projects.yaml`.

### Couche présentation (renderer / UI)

- **`DashboardView`** — liste des projets, consomme `summary --json` via
  `CliInvoker`, affiche l'état résumé, bouton Actualiser global.
- **`ProjectDetailView`** — orchestrateur de page, gère l'identité du
  projet sélectionné, contient les 6 sections.
- **`Section` (composant générique réutilisable)** — un composant
  paramétré par : nom de commande CLI, arguments, mode d'affichage
  (JSON structuré vs texte brut). Gère lui-même son cycle
  {repliée → en chargement → chargée/en cache → en erreur} et son bouton
  refresh local. `StatusSection` et `NextSection` l'instancient en mode
  eager (chargement au montage) ; `ContextSection`, `PromptSection`,
  `ReviewSection`, `PlanSection` en mode lazy (chargement au premier
  dépliage).
- **`TextOutputPanel`** — affichage brut + bouton copier, utilisé par les
  sections texte (`Contexte`, `Prompt`).
- **`JsonOutputPanel`** — affichage structuré minimal (pas de formatage
  métier) pour les sections à sortie JSON complexe (`Statut`, `Next`,
  `Review`, `Plan`).
- **`SpawnErrorPanel`** — composant partagé pour l'échec de spawn
  (décision 17) : message générique, détails bruts, copier, lien Réglages.
- **`SettingsView`** — formulaire chemin repo, auto-détection, save.

### Cache

- **`SectionCache`** — cache en mémoire (process renderer), scope = session
  d'ouverture de l'app, clé = `(projectId, sectionName)`. Vidé uniquement
  par redémarrage de l'app ou refresh explicite de la section
  correspondante. Pas de persistance disque (pas de besoin exprimé, évite
  d'inventer une politique d'invalidation entre sessions).

Aucun composant n'implémente de règle métier (pas de détection de risque,
pas d'interprétation de `failure.code`, pas de reformulation de statut) —
ce savoir reste entièrement dans le CLI/Core.

---

## 6. Flux de données

```
┌──────────┐  1. clic / dépliage    ┌────────────────┐
│  Section  │ ───────────────────► │   CliInvoker    │
│  (renderer)│                      │  (main process) │
└──────────┘                       └────────┬────────┘
     ▲                                       │ 2. spawn
     │ 6. render JSON/texte brut             │  pnpm loop <cmd> --json
     │    ou erreur                          ▼
     │                              ┌─────────────────┐
     │                              │   CLI Loop      │
     │                              │  (process enfant)│
     │                              └────────┬────────┘
     │                                       │ 3. stdout JSON
     │                                       │    (ou stderr/exit≠0)
     │              5. écrit en cache        ▼
┌──────────┐   4. résultat brut     ┌─────────────────┐
│SectionCache│ ◄──────────────────  │   CliInvoker    │
└──────────┘                       └─────────────────┘
```

- **Aucune transformation métier** entre 3 et 6 : le JSON reçu du CLI est
  affiché tel quel (ou routé vers `TextOutputPanel` si c'est un champ texte
  comme `context`/`prompt`).
- **Sens unique** : GUI → CLI (arguments d'invocation) → GUI (résultat).
  Aucun flux retour du GUI vers le repo (MVP lecture seule).
- **Config GUI** : flux séparé, local, entre `SettingsView` ↔
  `GuiConfigStore` ↔ `RepoPathResolver` ↔ `CliInvoker` (fournit le `cwd`
  du spawn). Ne transite jamais par le repo Loop Engine.
- **Dashboard** : flux identique, un seul appel `summary --json` sans
  argument de projet.

---

## 7. Ports / API nécessaires

Principe directeur (décision 2) : **aucun nouveau port côté moteur**. La
GUI consomme exclusivement les contrats CLI/JSON déjà stabilisés et
audités.

### Côté moteur Loop Engine (existant, non modifié)

| Port consommé                                | Contrat                                      | Statut           |
| -------------------------------------------- | -------------------------------------------- | ---------------- |
| `pnpm loop summary --json`                   | `schemaVersion: 1`, liste de projets         | Existant, stable |
| `pnpm loop status --json`                    | `schemaVersion: 1`, liste de rapports projet | Existant, stable |
| `pnpm loop context <project> --json`         | `schemaVersion: 1`, texte de contexte borné  | Existant, stable |
| `pnpm loop next <project> --json`            | `schemaVersion: 1`, candidat roadmap         | Existant, stable |
| `pnpm loop prompt <project> --json`          | `schemaVersion: 1`, texte prompt             | Existant, stable |
| `pnpm loop review <project> --json`          | `schemaVersion: 1`, rapport review           | Existant, stable |
| `pnpm loop run <project> --mode plan --json` | `LoopRunResult` (forecast)                   | Existant, stable |
| Enveloppe d'erreur                           | `{ schemaVersion, ok: false, error }`        | Existant, stable |

La seule évolution additive du moteur requise par le Lot 1 est le contrat `status --json`, implémenté dans l'adaptateur de commande existant sans modifier le Core ni la composition. Les autres contrats consommés par la GUI restent inchangés.

### Côté GUI (nouveau, local, hors moteur)

| "Port" interne GUI                  | Rôle                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CliInvoker.invoke(cmd, args, cwd)` | Frontière process principal ↔ CLI, seule porte de sortie vers le système                                                                                    |
| `GuiConfigStore.read()/write()`     | Frontière vers le fichier de config GUI local                                                                                                               |
| IPC main ↔ renderer (si Electron)   | Frontière entre le composant UI et `CliInvoker`/`GuiConfigStore`, qui vivent côté process principal pour des raisons de sécurité (accès filesystem/process) |

Ces "ports" sont strictement internes à l'application GUI ; ils ne sont pas
des contrats du moteur Loop Engine et n'ont donc pas vocation à être
documentés dans `docs/integrations/json-consumers.md` autrement que par
une ligne mentionnant la GUI comme consommateur (déjà présente :
"dashboard web futur" — à corriger en "GUI desktop" lors de
l'implémentation).

---

## 8. Risques d'architecture

| #   | Risque                                                                                                                                                                     | Impact                                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | Dérive de logique métier dans l'UI (ex: un développeur futur ajoute une interprétation de `failure.code` "juste pour l'UX")                                                | Rompt le principe "aucune logique métier dans l'UI", crée une seconde source de vérité qui peut diverger du moteur                                                                                      | Revue de code systématique sur ce point ; `CliInvoker` et les `Panel` restent volontairement "bêtes" (pas de `switch` sur des codes métier)                                                                                                                                                |
| R-2 | Couplage implicite au format de sortie CLI (parsing fragile si un champ JSON change de forme)                                                                              | Rupture silencieuse de la GUI sans que le moteur ait rien cassé côté CLI (le contrat `schemaVersion` protège les consommateurs _conformes_, mais un accès direct à un champ non documenté ne l'est pas) | La GUI ne doit lire que des champs documentés dans `docs/integrations/json-consumers.md` / `commands.md` ; tout champ supplémentaire nécessaire à la GUI doit être demandé comme évolution additive du contrat JSON (jamais lu "en douce")                                                 |
| R-3 | `status --json` était absent au démarrage du Lot 1                                                                                                                         | Risque levé : la section "Statut" dispose désormais d'un contrat JSON versionné sans contournement GUI                                                                                                  | Résolu par une évolution additive de l'adaptateur `status`, couverte par les tests JSON                                                                                                                                                                                                    |
| R-4 | Process CLI zombie ou qui ne se termine jamais (ex: commande qui attend un input)                                                                                          | GUI bloquée en "chargement infini" sur une section                                                                                                                                                      | Timeout explicite sur chaque spawn (valeur à définir en implémentation), section passe en erreur de spawn au-delà                                                                                                                                                                          |
| R-5 | Chemin du repo mal configuré pointant vers un autre repo Git valide mais qui n'est pas Loop Engine (`pnpm loop` échoue silencieusement ou exécute un autre `loop` du PATH) | Résultats trompeurs si le spawn "réussit" mais sur le mauvais programme                                                                                                                                 | Le spawn utilise le chemin configuré comme `cwd` avec une commande explicite (`pnpm loop`, pas un `loop` du PATH global) ; à défaut de validation active du contenu (décision : pas de logique métier), une erreur de spawn ou un JSON inattendu tombera de toute façon dans le Parcours F |
| R-6 | Multiplication de process `pnpm` (démarrage lent car `pnpm` résout l'espace de travail à chaque appel)                                                                     | Latence perçue élevée sur chaque section, dégrade l'expérience malgré la parallélisation actée (décision 11)                                                                                            | À mesurer en prototype ; option de repli (hors scope de ce cadrage) : invoquer `tsx src/cli.ts` directement plutôt que `pnpm loop` pour éviter l'overhead de résolution pnpm — reste un détail d'implémentation, pas un changement de contrat                                              |
| R-7 | Cache en mémoire par section masque un changement réel survenu entre deux ouvertures d'un projet dans la même session                                                      | L'opérateur agit sur une information périmée sans le savoir                                                                                                                                             | Acceptable par design (décision 4 : rafraîchissement explicite uniquement) ; documenté ici pour que ce ne soit pas (re)découvert comme un "bug" en implémentation                                                                                                                          |
| R-8 | Répertoire de données utilisateur de l'OS non accessible en écriture (permissions, environnement restreint)                                                                | Impossible de persister la config GUI, retour à la reconfiguration à chaque lancement                                                                                                                   | Traité comme un cas du Parcours F (échec technique, message brut) plutôt que par une logique de repli spécifique                                                                                                                                                                           |

---

## 9. Plan d'implémentation — lots

Chaque lot est vertical et vérifiable indépendamment, conformément à la
méthode de travail du repo (lots cohérents et réversibles).

### Lot 1 — Vérification de contrat et squelette du process principal

- Vérifier le contrat réel de `status` (R-3) ; ajuster le cadrage si besoin.
- Stack technique tranchée : Electron Forge + Webpack + React + TypeScript ;
  renderer sandboxé avec `contextIsolation`, accès système limité au preload.
- Implémenter `CliInvoker` (spawn, capture stdout/stderr/code, timeout,
  parsing JSON minimal) avec tests unitaires sur : succès, erreur JSON
  applicative, échec de spawn, timeout.
- Implémenter `GuiConfigStore` + `RepoPathResolver` (auto-détection,
  lecture/écriture) avec tests unitaires.
- **Vérifiable** : appeler `CliInvoker` en ligne de commande de test contre
  le vrai repo `loop-engine` et obtenir un JSON `summary` correct.

### Lot 2 — Écran Réglages

- `SettingsView` : champ chemin, auto-détection, parcourir, enregistrer.
- État vide au premier lancement → redirection vers Réglages.
- Reconfiguration si repo introuvable (branché sur les erreurs de
  `CliInvoker`/`RepoPathResolver`).
- **Vérifiable** : premier lancement sans config → Réglages ; config
  valide → accès au Dashboard ; suppression manuelle du repo → message de
  reconfiguration au prochain appel.

### Lot 3 — Dashboard

- `DashboardView` consommant `summary --json` via `CliInvoker`.
- Bouton Actualiser global (un seul appel).
- État vide / état d'erreur de spawn (`SpawnErrorPanel`).
- **Vérifiable** : lancer l'app contre `projects.yaml` réel, voir la
  liste des projets déclarés avec leur statut résumé.

### Lot 4 — Détail projet : sections eager (Statut, Next)

- `ProjectDetailView` + composant `Section` générique (mode eager).
- `StatusSection`, `NextSection`.
- `JsonOutputPanel`, `SpawnErrorPanel` réutilisé, refresh par section.
- **Vérifiable** : ouvrir un projet, voir statut + prochaine action se
  charger automatiquement, refresh individuel fonctionnel.

### Lot 5 — Détail projet : sections lazy texte (Contexte, Prompt)

- `Section` en mode lazy + `TextOutputPanel` (affichage brut, copier).
- `ContextSection`, `PromptSection`, `SectionCache`.
- **Vérifiable** : dépliage → appel unique → cache (redéplier ne relance
  pas d'appel) → refresh local relance et invalide le cache de cette
  section seule.

### Lot 6 — Détail projet : sections lazy JSON (Review, Plan)

- `ReviewSection`, `PlanSection` (mode lazy, `JsonOutputPanel`).
- **Vérifiable** : idem lot 5 pour ces deux sections ; `PlanSection`
  affiche l'`agentPolicy` prévisionnel sans déclencher d'action réelle
  (vérification manuelle qu'aucun fichier n'est modifié par l'appel).

### Lot 7 — Durcissement et parcours d'erreur

- Couverture complète du Parcours F (erreur applicative JSON vs échec de
  spawn) sur toutes les sections.
- Vérification des risques R-4 (timeout), R-6 (mesure de latence pnpm).
- Revue croisée : aucune section ne contient de logique d'interprétation
  de code métier (R-1), aucun champ JSON non documenté n'est lu (R-2).
- **Vérifiable** : scénarios manuels — repo déplacé en cours de session,
  `pnpm` renommé temporairement, projet avec commande de validation
  cassée dans `projects.yaml`.

### Lots suivants (hors MVP, évolutions déjà actées comme reportées)

- Lot 8 — `audit --json` (section dédiée ou écran séparé, à recadrer).
- Lot 9 — `doctor`.
- Lot 10 — `validate`, `handoff`.
- Lot 11 — `rag-search`.
- Lot 12 (sous réserve d'une nouvelle session de cadrage) — `run --mode
execute` avec confirmation explicite, uniquement quand un executor
  concret existera.

---

## 10. Verdict du prototype — layout retenu

Trois variantes structurellement différentes ont été prototypées (données
mockées, aucun appel CLI réel) pour répondre à la question "à quoi doivent
ressembler les écrans Dashboard et Détail projet ?" :

- **A — Split view** : liste de projets toujours visible à gauche, panneau
  de détail à droite, aucune navigation en pleine page.
- **B — Dashboard cartes + page dédiée** : grille de cartes, clic → page
  séparée avec retour explicite.
- **C — Table dense, expansion inline** : chaque projet est une ligne de
  table qui s'étend sur place pour révéler ses sections.

### Décision : variante A retenue

**Raisons :**

1. **Coût de navigation nul entre projets.** Le persona unique (décision 8)
   bascule fréquemment d'un projet à l'autre pour comparer leur état
   (`creatyss` vs `loop-engine` par exemple). A garde la liste visible en
   permanence : changer de projet est un clic, sans quitter le contexte
   visuel du détail. B impose un aller-retour complet (retour dashboard →
   nouvelle carte → nouvelle page) ; C oblige à refermer une ligne pour en
   ouvrir une autre dans une table qui grandit verticalement à mesure que
   plusieurs projets sont dépliés.
2. **Cohérence avec le cache par section (décisions 12bis/13).** Le cache
   vit en mémoire pour la session ; un modèle de navigation qui détruit et
   recrée la vue de détail à chaque clic (B) rend moins visible que le
   cache persiste réellement d'un aller-retour à l'autre — l'opérateur
   pourrait croire qu'il "recharge" alors que non. A, en gardant le panneau
   de détail monté en continu, rend ce comportement immédiatement lisible.
3. **Densité d'information adaptée au nombre réel de projets.** `projects.yaml`
   déclare une poignée de projets (4 à l'heure du cadrage). Une grille de
   cartes façon portfolio (B) ou une table façon monitoring dense (C) sont
   des formes pensées pour des dizaines/centaines d'entités ; elles
   ajoutent de la mise en scène (cartes, colonnes fixes) sans bénéfice à
   cette échelle. Une liste simple suffit.
4. **Un seul écran à raisonner, pas deux.** Le cadrage (§4) avait déjà acté
   3 écrans (Réglages, Dashboard, Détail projet) comme décomposition
   logique des responsabilités — mais rien n'imposait que Dashboard et
   Détail soient deux vues plein écran distinctes. A fusionne
   Dashboard + Détail en une seule vue à deux zones, ce qui réduit le
   nombre d'états de navigation à gérer (pas de "retour", pas d'historique
   de navigation à maintenir) sans violer aucune décision actée.

### Enseignements archivés de B (Dashboard cartes + page dédiée)

- Le motif "carte projet avec badges de statut" (nom, type, branche,
  propreté, santé) reste un bon résumé visuel pour la **liste** de la
  variante A — il a été repris tel quel comme gabarit de ligne dans le
  panneau gauche, seulement rétréci en largeur.
- La navigation en pleine page avec bouton "Retour" a mis en évidence un
  besoin réel non trivial : **un historique de navigation** (précédent/
  suivant) devient nécessaire dès qu'on a plusieurs pages. A l'évite
  structurellement en n'ayant qu'une seule page — à garder en tête si une
  évolution future réintroduit des pages plein écran (ex: un écran Audit
  séparé, cf. Lot 8) : prévoir alors une navigation explicite plutôt que de
  supposer qu'elle n'est pas nécessaire.
- Le header "titre de page + actions globales" de B (bouton Actualiser en
  haut à droite) est un motif réutilisable pour l'écran Réglages, qui reste
  lui une page à part entière.

### Enseignements archivés de C (Table dense, expansion inline)

- L'expansion inline est efficace pour une **densité d'information**, mais
  elle a révélé un problème d'échelle : dès que deux projets sont dépliés
  simultanément, la page grandit verticalement et l'opérateur perd le
  repère visuel du projet en cours d'examen (pas de zone fixe). C'est un
  argument de plus, indépendant des raisons ci-dessus, en faveur d'un
  panneau de détail à emplacement fixe (A).
- Le format de ligne compacte (colonnes alignées : nom / branche / propreté
  / santé) est plus scannable en un coup d'œil que les cartes de B pour
  une **vue d'ensemble** — ce motif de colonnes alignées a été retenu pour
  les lignes de la liste de gauche dans A, au lieu du gabarit "carte".
- Rien d'autre n'est repris de C : le principe même (pas de panneau séparé,
  tout se passe dans la table) est structurellement incompatible avec la
  persistance de sélection souhaitée pour A.

### Traçabilité

L'exploration complète (les trois variantes, code inclus) est préservée
comme source primaire sur la branche `prototype/gui-cockpit-variants`
(non fusionnée dans `main`). `main` ne conserve que le prototype de
référence — variante A seule, sans switcher de variantes — sous
`prototype/gui-cockpit/index.html`, servi par
`pnpm run prototype:gui-cockpit`. C'est ce prototype trimmé qui sert de
base directe à l'implémentation (Lot 1 et suivants, §9) ; il reste du
code jetable au sens du skill `/prototype` (pas de tests, données
mockées), à réécrire proprement lors du Lot correspondant, mais sa
structure DOM/CSS (panneau gauche = liste, panneau droit = sections
repliables) fait foi comme référence de layout.
