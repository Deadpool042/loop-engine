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
