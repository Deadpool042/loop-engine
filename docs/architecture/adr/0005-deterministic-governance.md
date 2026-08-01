# ADR-0005 — Deterministic Governance

## Statut

Accepté.

## Contexte

Loop Platform peut s'appuyer sur des systèmes externes afin d'assister le
développement, notamment des fournisseurs d'intelligence artificielle, des
forges Git ou des services d'automatisation.

Ces systèmes sont susceptibles d'évoluer, d'être remplacés ou de produire des
résultats variables.

Le projet doit conserver une gouvernance stable, reproductible et vérifiable.

## Décision

L'autorité architecturale demeure déterministe.

Les contrats publics, le code, les politiques, les audits et la validation
continue constituent les mécanismes faisant autorité.

Les systèmes externes apportent une analyse, une recommandation ou une aide à
la décision, mais ne disposent jamais d'une autorité autonome sur
l'architecture ou le dépôt.

Toute décision automatisée doit rester explicable, vérifiable et compatible
avec les règles définies par le projet.

## Conséquences

Le projet reste indépendant des fournisseurs externes.

Les décisions critiques demeurent reproductibles.

Les plateformes peuvent évoluer sans transférer leur gouvernance à des outils
tiers.

Les audits et la CI conservent leur rôle d'autorité de validation.
