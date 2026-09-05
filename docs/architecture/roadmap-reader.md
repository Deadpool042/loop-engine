# Roadmap Reader

## Objectif

Le Roadmap Reader permet à Loop Engine de lire des roadmaps locales sans IA.

Il ne doit pas comprendre toute la sémantique métier d'un projet.

Il doit extraire des indices déterministes permettant de proposer une prochaine action raisonnable.

---

## Principes

- déterministe ;
- sans appel IA ;
- sans consommation de tokens ;
- tolérant aux formats Markdown simples ;
- prudent par défaut ;
- explicable via `kind` et `reason`.

---

## Formats supportés V1.2

Le format prioritaire est Markdown.

Les lignes candidates peuvent être détectées via :

- cases à cocher Markdown ;
- titres de lot ;
- marqueurs de statut ;
- sections explicites.
- lignes de tableau structurées `| H<n>-L<n><suffixe?> | livrable | état |`.

Exemples :

```md
- [ ] Lot 12 — Ajouter une page admin
- [x] Lot 11 — Terminé

## Prochain lot

### H2-L3 — Stabilisation catalogue

⏳ En cours

États détectables

V1.2 peut détecter :

- candidat non commencé ;
- candidat en cours ;
- candidat terminé ;
- candidat sensible ;
- candidat bloqué.

Dans une ligne de tableau structurée, `✅` ou `Terminé` signifie `done` et
`⬜` ou `À faire` signifie `todo`. Les autres états restent `unknown`.
Lorsqu'une roadmap contient de telles lignes, ses puces descriptives non
explicites ne sont pas ajoutées à l'inventaire des lots.

Les lots de tableau structurés exposent leur première cellule `H<n>-L<n>`
(suffixe alphabétique optionnel) comme identifiant stable `candidate.id`.

Les lignes Markdown explicites peuvent aussi exposer un identifiant stable
lorsque le libellé commence, après les marqueurs de statut/priorité, par un
token borné de type `VNEXT3-G1`, `OC-8` ou `V48.0`. Les formats historiques
sans identifiant restent lisibles, mais ne sont pas adressables explicitement.

### Gates de phase opt-in

Une roadmap peut fermer explicitement une phase structurée au moyen d'un
commentaire Markdown sur une ligne :

```md
<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->
```

Les seules formes valides sont :

```md
<!-- loop-engine:phase-gate phase=H1 state=open -->
<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->
```

`phase` est un identifiant d'horizon (`H<n>`), `state` vaut `open` ou
`closed`, et une phase fermée exige un identifiant de gate stable dans
`blockedBy`. Cette déclaration est opt-in : une roadmap sans gate conserve
strictement son comportement historique.

L'état documentaire d'un lot et son admissibilité sont distincts. Ainsi,
`H1-L4` marqué `todo` reste présent dans l'inventaire, mais devient
`not_admissible` si la phase `H1` est fermée. Les candidats non admissibles ne
sont pas sélectionnés par `next`, et un `run --candidate` les refuse sans
substituer un autre lot.

Une déclaration de gate invalide, ou deux déclarations pour la même phase,
ferme l'admissibilité de la phase concernée. Loop Engine ne déduit jamais une
ouverture depuis une phrase de documentation ou une dépendance Markdown libre.

Ce contrat ne résout pas un graphe générique de dépendances entre lots et
n'utilise aucun NLP.

⸻

Classification

Les candidats restent classés en :

- safe
- warning
- blocked

safe signifie : candidat potentiellement compatible avec un micro-lot.

warning signifie : candidat sensible, à cadrer avant implémentation.

blocked signifie : candidat trop risqué pour être démarré directement.

Chaque candidat doit exposer une reason.

⸻

Sélection

La sélection doit rester prudente et séquentielle :

1. ignorer uniquement les candidats terminés ;
2. examiner le premier candidat restant dans l'ordre canonique des roadmaps configurées ;
3. ne jamais le dépasser parce qu'un lot ultérieur est `safe`, plus prioritaire ou plus facile ;
4. s'il est non admissible, ne sélectionner aucun lot ultérieur ;
5. s'il est `blocked`, le conserver comme candidat courant pour information, sans le présenter comme un micro-lot sûr.

⸻

Limites V1.2

Le Roadmap Reader ne doit pas :

- modifier la roadmap ;
- marquer un lot terminé ;
- créer une tâche ;
- appeler une IA ;
- deviner une priorité métier non écrite ;
- interpréter des dépendances complexes.

⸻

Évolutions futures

Évolutions possibles :

- sections normalisées ;
- frontmatter YAML ;
- identifiants de lots ;
- liens entre lots ;
- priorités explicites ;
- lecture de plusieurs roadmaps ;
- export JSON plus riche ;
- dashboard roadmap.
  EOF

pnpm run validate
git status –short

## Sélection séquentielle

La sélection ignore les candidats dont le `status` est `done`, puis conserve strictement l'ordre de déclaration.

Le premier candidat restant constitue la frontière de séquence :

1. s'il est admissible, il est le seul candidat sélectionnable, indépendamment de `kind` ou `priority` ;
2. s'il est non admissible, aucun candidat ultérieur n'est sélectionné ;
3. un candidat `blocked` reste visible comme frontière courante mais ne doit pas être présenté comme un micro-lot sûr ;
4. le résumé `roadmap.summary.selectable` vaut donc au plus `1`.

Cette règle empêche un consommateur, un agent ou un cockpit de prendre de l'avance sur la roadmap en choisissant un travail ultérieur plus simple.

---

## Raffinement des mots-clés sensibles

La classification doit éviter les faux positifs trop larges.

Règles appliquées :

- `prod` n'est pas un mot-clé bloquant, car il peut apparaître dans `produit`.
- `production finale` reste bloquant.
- `mise en production` est bloquant.
- `paiement`, `migration`, `delete` et `supprimer` sont bloquants.
- `déploiement`, `deploiement`, `VPS`, `DNS`, `bascule`, `sécurité` et `securite` restent sensibles (`warning`).

Objectif : détecter les vrais risques sans bloquer des lots ordinaires comme une fiche produit.

## Candidat sélectionné

Le candidat roadmap sélectionné est exposé dans le `ProjectSnapshot` via :

- `snapshot.roadmap.selectedCandidate`

Ce champ est calculé une seule fois lors de la construction du snapshot.

Les commandes doivent consommer ce champ plutôt que rappeler directement `selectRoadmapCandidate`.

Objectif :

- garder `ProjectSnapshot` comme source de vérité ;
- éviter les duplications entre `next`, `prompt` et futures commandes ;
- faciliter les sorties JSON et intégrations externes.

`selectedCandidate` peut être `null` si aucun candidat actif n'est disponible.

## Synthèse roadmap

Le `ProjectSnapshot` expose une synthèse roadmap via :

- `snapshot.roadmap.summary.active`
- `snapshot.roadmap.summary.done`
- `snapshot.roadmap.summary.selectable`
- `snapshot.roadmap.summary.hasBlocked`

Définitions :

- `active` : nombre total de candidats non terminés.
- `done` : nombre de candidats terminés.
- `selectable` : nombre de candidats disponibles pour la sélection, hors `done`.
- `hasBlocked` : indique si au moins un candidat `blocked` existe dans la roadmap.

Cette synthèse est calculée dans `intelligence/`, pas dans les commandes.

Elle sert aux sorties JSON compactes, aux futurs dashboards et aux intégrations read-only.

## Renouvellement déterministe V40

Quand aucun candidat admissible n'est sélectionné, le snapshot conserve des états distincts plutôt que de réduire toutes les situations à `no_admissible_candidate` :

- `roadmap_exhausted_objective_available` : plus aucun travail ouvert et un objectif canonique est disponible ; une proposition de renouvellement peut être demandée explicitement ;
- `objective_required` : roadmap épuisée mais aucun objectif canonique n'est disponible ; aucune proposition n'est admissible ;
- `gated_no_work` : du travail ouvert existe encore mais toutes les phases concernées sont fermées par des phase-gates ; ce blocage n'est pas une absence volontaire de travail ;
- `maintenance_no_work` et `deferred_no_work` : absence volontaire ou différée selon le mode de planning ;
- `no_admissible_candidate` : fallback prudent lorsqu'aucun état plus précis n'est démontré.

Ces états sont calculés une fois dans le snapshot puis projetés par `handoff`, `context`, `summary` et les commandes roadmap. Leur affichage ne déclenche aucun provider et ne crée aucun candidat.

Une proposition de renouvellement est un artefact borné et reviewable : elle part uniquement de l'objectif canonique et de l'état projeté, distingue gaps observés et hypothèses, et contient au plus trois lots. Elle n'écrit jamais la roadmap. Toute matérialisation reste une mutation Development Workspace séparée, après validation humaine explicite.

## Priorité roadmap

Chaque candidat roadmap expose une `priority`.

Valeurs V1.6 :

- `p1`
- `p2`
- `p3`
- `default`

La priorité est détectée depuis les marqueurs Markdown `[P1]`, `[P2]` et `[P3]`.

Elle reste une métadonnée de pilotage et d'affichage. Elle ne réordonne jamais les candidats dans le séquencement canonique.

Elle ne remplace pas :

- `kind` pour le risque ;
- `status` pour la progression ;
- `reason` pour l'explication.

Les commandes `next` et `prompt` affichent la priorité du candidat sélectionné.

## Détail borné d'un candidat — V1.7

La projection `roadmap overview` expose pour chaque candidat une `detailKey`
opaque, stable tant que `path + line + text` ne changent pas. Cette clé permet
à une façade externe de demander le détail d'un lot sans fournir de chemin
arbitraire.

La commande :

`pnpm loop roadmap detail <project> --candidate-key <key> --json`

résout d'abord le candidat canonique dans le snapshot courant, puis cherche son
détail selon un ordre déterministe :

1. lien Markdown explicite porté par la ligne du candidat ;
2. document Markdown du même répertoire contenant un titre correspondant
   exactement à `candidate.id`.

La recherche de repli est bornée en nombre de fichiers et chaque fichier est
lu avec des limites fixes de taille, sections et caractères. Les chemins
résolus doivent rester sous la racine réelle du projet, y compris après
résolution des symlinks.

Le détail projeté conserve les titres et contenus documentaires existants et
ajoute seulement une catégorie déterministe de section parmi :
`status`, `objective`, `context`, `scope`, `out_of_scope`,
`acceptance`, `dependencies`, `evidence`, `next_check`, `future`,
`other`.

Aucun texte métier n'est généré. Un lot sans détail documenté retourne
`not_documented`; une clé invalide ou inconnue retourne `not_found`.
Aucun provider n'est appelé.

Cette surface est destinée notamment aux cockpits read-only : le résumé reste
léger et le détail peut être chargé à la demande.
```
