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

Exemples :

```md
- [ ] Lot 12 — Ajouter une page admin
- [x] Lot 11 — Terminé
## Prochain lot
### H2-L3 — Stabilisation catalogue
⏳ En cours

États détectables

V1.2 peut détecter :

* candidat non commencé ;
* candidat en cours ;
* candidat terminé ;
* candidat sensible ;
* candidat bloqué.

V1.2 ne doit pas encore essayer de résoudre toutes les dépendances entre lots.

⸻

Classification

Les candidats restent classés en :

* safe
* warning
* blocked

safe signifie : candidat potentiellement compatible avec un micro-lot.

warning signifie : candidat sensible, à cadrer avant implémentation.

blocked signifie : candidat trop risqué pour être démarré directement.

Chaque candidat doit exposer une reason.

⸻

Sélection

La sélection doit rester prudente :

1. préférer un candidat safe ;
2. sinon préférer un candidat warning ;
3. sinon afficher le candidat blocked sans le recommander directement ;
4. si aucun candidat n’est trouvé, inviter à ouvrir la roadmap.

⸻

Limites V1.2

Le Roadmap Reader ne doit pas :

* modifier la roadmap ;
* marquer un lot terminé ;
* créer une tâche ;
* appeler une IA ;
* deviner une priorité métier non écrite ;
* interpréter des dépendances complexes.

⸻

Évolutions futures

Évolutions possibles :

* sections normalisées ;
* frontmatter YAML ;
* identifiants de lots ;
* liens entre lots ;
* priorités explicites ;
* lecture de plusieurs roadmaps ;
* export JSON plus riche ;
* dashboard roadmap.
    EOF

pnpm run validate
git status –short


## Sélection V1.2

La sélection ignore les candidats dont le `status` est `done`.

Parmi les candidats restants, l'ordre de préférence est :

1. premier candidat `safe` ;
2. sinon premier candidat `warning` ;
3. sinon premier candidat `blocked` ;
4. sinon aucun candidat sélectionné.

Un candidat `blocked` peut être affiché pour information, mais il ne doit pas être présenté comme un micro-lot sûr.

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


## Priorité roadmap

Chaque candidat roadmap expose une `priority`.

Valeurs V1.6 :

- `p1`
- `p2`
- `p3`
- `default`

La priorité est détectée depuis les marqueurs Markdown `[P1]`, `[P2]` et `[P3]`.

Elle sert uniquement à départager des candidats de même `kind`.

Elle ne remplace pas :

- `kind` pour le risque ;
- `status` pour la progression ;
- `reason` pour l'explication.

Les commandes `next` et `prompt` affichent la priorité du candidat sélectionné.

