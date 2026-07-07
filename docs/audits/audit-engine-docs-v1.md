# Audit Engine — Documentation V1

## Objectif

Analyser la documentation du dépôt afin d'identifier les forces, les risques et les règles automatisables.

## Constats mesurés

Le dépôt contient plus de fichiers Markdown que de fichiers TypeScript.

La documentation couvre plusieurs familles :

- `docs/architecture/`
- `docs/audits/`
- `docs/roadmap/`
- `docs/integrations/`
- `docs/releases/`

## Points forts

La documentation n'est pas seulement illustrative.

Elle définit :

- les contrats JSON ;
- le modèle roadmap ;
- le RAG local ;
- le handoff humain ;
- les intégrations read-only ;
- les plans de consolidation.

Le projet possède une vraie mémoire documentaire.

## Fragilités

### Risque d'obsolescence

Les décisions changent vite.

Exemples de zones à surveiller :

- contrats JSON ;
- erreurs JSON ;
- RAG ;
- handoff ;
- règles roadmap.

Risque :

- une documentation peut rester correcte historiquement mais fausse comme source d'architecture actuelle.

### Multiplication des audits

Les audits successifs sont utiles, mais ils peuvent devenir difficiles à naviguer.

Risque :

- plusieurs audits recommandent des choses différentes ;
- un ancien audit peut contredire une décision plus récente.

### Absence d'index global d'audit

Il n'existe pas encore d'index unique des audits produits.

Cela rend la lecture chronologique moins évidente.

## Recommandations

### Priorité 1

Créer un index des audits :

- `docs/audits/README.md`

Il doit distinguer :

- audits actifs ;
- audits historiques ;
- audits remplacés ou dépassés.

### Priorité 2

Identifier les documents de doctrine actuels.

Exemples :

- `docs/architecture/json-contracts.md`
- `docs/architecture/local-rag-index.md`
- `docs/architecture/human-handoff.md`

### Priorité 3

Ajouter une règle simple :

tout document d'audit doit être daté ou rattaché à une version.

## Règles candidates Audit Engine

### DOC-001

Tout dossier documentaire important doit posséder un `README.md`.

### DOC-002

Tout document d'audit doit être référencé depuis `docs/audits/README.md`.

### DOC-003

Un audit ancien ne doit pas être considéré comme doctrine active sans indication explicite.

### DOC-004

Les documents d'architecture ont priorité sur les audits historiques.

### DOC-005

Le changelog doit référencer toute évolution de contrat public.

## Conclusion

La documentation est une force du projet, mais elle doit être indexée pour éviter de devenir une dette.

Le meilleur prochain micro-lot documentaire est un index des audits.
