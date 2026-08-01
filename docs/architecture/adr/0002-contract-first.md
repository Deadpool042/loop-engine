# ADR-0002 — Contract First

## Statut

Accepté.

## Contexte

L'évolution de Loop Engine repose sur des contrats explicites afin de limiter
les régressions, faciliter les revues et préserver la stabilité des interfaces
publiques.

L'expérience acquise montre que les implémentations réalisées avant la
formalisation des contrats entraînent davantage de refactorings et rendent les
évolutions plus difficiles à auditer.

## Décision

Toute évolution importante suit l'ordre suivant :

1. Documentation ;
2. RFC ;
3. Contrats publics ;
4. Implémentation ;
5. Tests ;
6. Audits ;
7. Intégration continue.

Les interfaces publiques sont définies avant toute implémentation.

Les contrats constituent la référence des implémentations.

## Conséquences

Les responsabilités sont clarifiées avant le développement.

Les interfaces deviennent plus stables.

Les audits peuvent vérifier la conformité des implémentations avec les
contrats.

Les évolutions sont plus faciles à relire, tester et maintenir.
