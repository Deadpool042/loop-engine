# Contrat d’admission AUTO — lots autonomes

## Objectif

Éviter qu’un lot destiné à une exécution autonome arrive jusqu’au durable worker avec un périmètre insuffisamment documenté.

Loop Engine reste l’autorité d’admission. OpenClaw, Development Workspace et les providers ne doivent jamais compléter implicitement un contrat d’écriture incomplet au moment du lancement durable.

## Contrat canonique recommandé pour tout nouveau lot autonome

Le détail du lot doit contenir explicitement les quatre sections suivantes :

1. `Objectif`
2. `Livrables`
3. `Hors périmètre`
4. `Périmètre d’écriture`

Le `Périmètre d’écriture` doit se résoudre vers des chemins déterministes, bornés et non protégés. Il ne doit pas inclure `.git`, `.governance`, `.loop-engine` ni le fichier de décision d’exécution lui-même.

## Comportement attendu

Avant tout lancement autonome :

- le candidat doit être canonique, admissible et lié au SHA Git exact ;
- une décision d’exécution gouvernée doit pouvoir être réutilisée ou renouvelée ;
- l’absence de détail canonique est un refus fail-closed ;
- l’absence de scope déterministe est un refus fail-closed ;
- les erreurs doivent nommer le contrat manquant au lieu de remonter un échec durable opaque ;
- aucun provider ne doit être appelé lorsqu’un prérequis documentaire ou de scope manque.

## Compatibilité historique

Les anciens lots peuvent encore utiliser le fallback borné de génération de brief lorsque leur détail canonique existe mais ne suit pas encore parfaitement ce format. Ce fallback est conservé pour compatibilité et ne constitue pas le format cible des nouveaux lots.

Pour les nouveaux lots, les quatre sections ci-dessus sont la convention obligatoire de rédaction.

## Origine de la règle

Cette règle formalise le retour d’expérience du burn-in OC-28.4 : un lot sans contrat suffisamment explicite a provoqué des échecs `durable_execution_failed` avant Run History. Une fois le détail gouverné complété avec objectif, livrables, hors périmètre et scope d’écriture, la chaîne a franchi normalement `planning -> ready -> executing -> validating`.

## Invariant

Un lot autonome doit être compréhensible et borné avant l’exécution. Le provider exécute une mission gouvernée ; il ne définit ni son périmètre d’écriture ni ses limites au dernier moment.
