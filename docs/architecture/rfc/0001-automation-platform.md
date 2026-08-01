# RFC-0001 — Automation Platform

## Métadonnées

- Type : RFC
- Statut : Brouillon
- Portée : Contrats et frontières de la plateforme d'automatisation d'ingénierie
- Prédécesseur : Aucun
- Successeur : Aucun
- Décision associée : [ADR-0001 — Platform Foundation](../adr/0001-platform-foundation.md)

## 1. Status

Cette RFC est un `Brouillon` V18.1. Elle définit une orientation et des
frontières documentaires ; elle ne constitue pas une implémentation, une
configuration de fournisseur ou une autorisation opérationnelle.

Son cycle de vie est régi par le
[cycle de vie des documents](../document-lifecycle.md).

## 2. Summary

L'Automation Platform est la plateforme responsable des capacités réutilisables
d'automatisation d'ingénierie : revues, validation, préparation de releases,
documentation et coordination.

Elle expose des contrats publics et consomme, par des ports explicites, les
services externes nécessaires. Elle reste distincte de la Runtime Platform, de
l'Audit Platform et de la CI Platform, conformément à la
[cartographie des plateformes](../platform-map.md).

L'Automation Platform peut préparer, coordonner et publier des résultats
d'automatisation sous politiques explicites. Elle ne devient jamais l'autorité
unique qui approuve une modification, une fusion, une publication ou un accès.

## 3. Motivation

Les automatisations de développement traversent souvent des frontières
instables : fournisseurs d'intelligence artificielle, forges, services de
validation, systèmes de documentation et outils de coordination. Les intégrer
directement à des cas d'usage rendrait les politiques, les preuves et les
frontières de sécurité difficiles à maintenir.

La Platform Foundation prévoit une plateforme dédiée à ces capacités afin de
les rendre remplaçables et gouvernées sans transférer l'autorité du dépôt à un
outil externe. Cette intention est établie par la
[vision](../vision.md), l'[ADR-0001](../adr/0001-platform-foundation.md) et
l'[ADR-0005](../adr/0005-deterministic-governance.md).

## 4. Goals

- Définir l'Automation Platform comme propriétaire des contrats d'automatisation
  d'ingénierie réutilisables.
- Séparer les décisions de politique, les contrats publics et les adaptateurs
  concrets de fournisseur ou de forge.
- Permettre les cas d'usage de revue, validation, release, documentation et
  coordination sans les lier à une forge ou un fournisseur particulier.
- Rendre les décisions d'automatisation explicables, déterministes lorsque la
  décision est locale, et bornées lorsqu'une intégration externe est utilisée.
- Prévoir l'intégration avec l'Audit Platform et la CI Platform uniquement au
  travers de leurs contrats ou commandes publiques.
- Préserver l'autorité humaine, les contrôles de politique et les garde-fous
  fail-closed décrits dans les [principes](../principles.md).

## 5. Non-goals

Cette RFC ne définit pas :

- d'implémentation, de module source, de schéma TypeScript, d'adaptateur ou de
  configuration d'exécutable ;
- de fournisseur d'intelligence artificielle, de forge, de moteur de workflow
  ou de système documentaire imposé ;
- d'appel réseau, d'accès à des secrets, de découverte d'environnement ou de
  gestion de credentials ;
- de permission implicite de modifier un dépôt, fusionner, publier, créer une
  release ou modifier une documentation ;
- de règle de validation, de profil d'audit ou de pipeline CI concret ;
- de remplacement des contrats existants de Runtime, Audit ou CI.

Les mécanismes d'exécution de Loop Engine restent régis par leurs documents
d'architecture existants ; cette RFC ne les étend pas.

## 6. Architectural Overview

L'Automation Platform possède les capacités d'automatisation. Les autres
plateformes conservent leur responsabilité propre : la Runtime Platform possède
les capacités métier exécutables, l'Audit Platform vérifie les invariants, et
la CI Platform orchestre les validations.

```text
Automation caller
  -> Automation public contract
  -> deterministic policy decision
  -> provider and/or forge port
  -> external adapter

Automation public contract
  -> Audit Platform public contract or command
  -> CI Platform public command
```

Les flèches décrivent des dépendances autorisées, non des implémentations à
créer. L'Automation Platform ne dépend que des API publiques de Runtime et
d'Audit ; la CI Platform orchestre les commandes publiques sans dépendre d'une
implémentation interne. Ces règles sont définies dans les
[règles de dépendance](../dependency-rules.md).

## 7. Public Contracts

Les contrats publics de l'Automation Platform doivent être stables, explicites
et indépendants d'un adaptateur concret. Cette RFC définit les familles de
contrats suivantes, sans fixer leurs formes d'implémentation :

| Contrat public         | Responsabilité                                                             | Ne doit pas contenir                                 |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Automation Request     | Décrire une demande d'automatisation, sa portée et son objectif            | Client fournisseur, secret ou détail de processus    |
| Automation Decision    | Exposer la décision de politique, les limites et la justification          | Autorité implicite ou résultat externe non vérifié   |
| Automation Result      | Rapporter un résultat borné, stable et traçable                            | Sorties brutes, credentials ou diagnostics sensibles |
| Review Contract        | Décrire une revue, son périmètre et son état                               | Permission de fusion implicite                       |
| Validation Contract    | Référencer les validations demandées et leurs résultats                    | Règles internes de l'Audit ou de la CI Platform      |
| Release Contract       | Décrire une proposition ou une décision de release sous contrôle explicite | Publication automatique ou signature implicite       |
| Documentation Contract | Décrire une demande ou une proposition documentaire                        | Modification non autorisée de la documentation       |
| Coordination Contract  | Décrire la transmission d'état entre acteurs ou systèmes                   | Décision d'autorité déduite d'un message externe     |

Chaque contrat doit déclarer son entrée, sa sortie, ses invariants, ses erreurs
stables et ses limites d'autorité avant toute implémentation, conformément à
l'[ADR-0002](../adr/0002-contract-first.md).

V18.2 expose les contrats canoniques de base depuis
`src/automation/index.ts`. Ce package ne contient que des types publics ; les
ports, adaptateurs et comportements restent hors de son périmètre.

## 8. Platform Responsibilities

L'Automation Platform est responsable de :

- l'orchestration des demandes d'automatisation d'ingénierie ;
- l'évaluation et la restitution de décisions de politique ;
- la sélection d'un port externe admis par la politique ;
- la production de résultats redacted et traçables ;
- la coordination de revues, validations, releases et mises à jour
  documentaires comme activités distinctes ;
- l'exposition d'états et d'événements nécessaires à son observabilité.

Elle n'est pas responsable de :

- l'exécution des capacités métier de Runtime ;
- la définition ou la décision finale des règles d'audit ;
- l'orchestration interne d'un pipeline CI ;
- l'autorité humaine de fusion, de publication ou d'octroi d'accès.

Une capacité qui relève de plusieurs plateformes doit être séparée par contrat
public, conformément à l'[ADR-0001](../adr/0001-platform-foundation.md).

## 9. Integration Boundaries

### Provider ports

Un provider port représente une capacité externe spécialisée, par exemple une
analyse ou une génération assistée. L'Automation Platform dépend du port, jamais
du SDK ou du client concret d'un fournisseur.

Un provider port doit recevoir une demande déjà bornée et admise par politique,
et retourner un résultat compatible avec le contrat public. Il ne peut ni
élargir les permissions, ni décider seul d'une fusion, publication ou mutation.

Les contrats canoniques de provider sont exposés depuis
`src/automation/provider/index.ts`. Ils définissent seulement les ports
provider, factory, registry et selector ; ils ne fournissent aucun provider,
aucune inscription ni aucun algorithme de sélection.

#### AI Provider Adapter

src/automation/adapters/ai-provider/ fournit un provider AI générique derrière
AutomationProvider. Son transport public reste abstrait et reçoit seulement une
demande immuable, JSON-safe et indépendante de tout fournisseur. L'adaptateur
ne référence aucun SDK, modèle, format de prompt, compteur de tokens ou détail
de protocole fournisseur ; il n'appelle aucune API, aucun réseau ou variable
d'environnement. Son assemblage reste hors du barrel public
src/automation/index.ts.

### Forge ports

Un forge port représente les interactions externes de collaboration : lecture
d'état de change, publication d'une revue, proposition de release ou
coordination de pull request. Il isole les particularités d'une forge derrière
un contrat public stable.

Une forge ne devient pas la source d'autorité architecturale. Les actions qui
modifient un état externe exigent une demande explicite, une décision de
politique compatible et les contrôles propres au contexte concerné.

Les contrats canoniques de forge sont exposés depuis
`src/automation/forge/index.ts`. Ils définissent seulement les ports forge,
factory, registry et selector ; ils ne fournissent aucune forge, aucune
inscription ni aucun algorithme de sélection.

#### GitHub Adapter

src/automation/adapters/github/ fournit l'adaptateur GitHub isolé derrière
AutomationForge. Il reçoit une configuration immuable et un transport abstrait
interne ; il traduit les capacités Forge vers des opérations GitHub sans
exposer ces types hors de son package. Il n'appelle aucune API GitHub, ne
réalise aucun accès réseau et ne décide aucune politique. Son assemblage reste
hors du barrel public src/automation/index.ts.

### Policy boundaries

Les politiques décident les variables : fournisseurs/runtimes autorisés,
plafonds de coût ou de durée, permissions, conditions de publication et modes
d'automatisation. Elles restent déterministes, explicables et séparées de la
logique d'adaptateur, conformément à l'[ADR-0004](../adr/0004-policy-driven.md).

Un port, un adaptateur ou un résultat externe ne peut jamais élargir une
décision de politique. En cas d'information manquante, invalide ou ambiguë,
l'admission échoue fermée selon les [principes](../principles.md).

Les contrats canoniques de politique sont exposés depuis
`src/automation/policy/index.ts`. Ils définissent seulement les valeurs de
politique, contexte, demande, décision, résultat, erreur et evaluator ; ils ne
fournissent aucune implémentation d'évaluation ni moteur de règles.

### Application Assembly

L'assemblage applicatif rend explicites la configuration, les dépendances, les
registres, la politique et la sélection déjà fournie. Il ne découvre aucun
adaptateur, ne sélectionne rien et ne crée aucune dépendance implicite.

Les contrats canoniques d'assemblage sont exposés depuis
`src/automation/assembly/index.ts`. Ils décrivent uniquement la composition
publique ; ils ne fournissent aucun assembleur, implémentation concrète,
registre global ou comportement runtime.

### Audit integration

L'Automation Platform peut demander ou consommer un constat via un contrat
public ou une commande publique de l'Audit Platform. Elle ne contourne pas ses
règles, ne modifie pas ses résultats et ne transforme pas un avis externe en
conformité.

Les règles et profils restent détenus par l'Audit Platform ; voir
[Audit Engine](../audit-engine.md).

#### Deterministic audit enforcement

La famille `AUDIT-503` à `AUDIT-512` vérifie structurellement les contrats
Automation : fichiers requis, exports publics, barrel canonique, absence de
fournisseur ou forge concrète, neutralité des politiques, dépendances
d'assemblage explicites, absence de composition runtime, pureté des contrats et
direction des imports. Les contrôles inspectent les déclarations et imports des
sources `src/automation/`; ils échouent fermés lorsqu'un invariant est absent
ou interdit.

Les contrats d'orchestration déclaratifs partagent aussi des invariants de
cohérence : noms publics préfixés par Automation, formes Readonly et JSON-safe,
statuts fermés, barrel canonique unique, dépendances autorisées et indicateurs
opérationnels littéraux à false. Une absence d'évidence requise demeure un
échec fermé ; aucun de ces invariants n'autorise une exécution.

Les règles d'architecture (`AUDIT-503` à `AUDIT-511`) sont incluses dans les
profils `architecture` et `strict`. La règle documentaire `AUDIT-512` est
incluse dans les profils `docs` et `strict`.

### CI integration

L'Automation Platform peut préparer des demandes de validation et consommer des
résultats de commandes publiques. La CI Platform conserve l'orchestration de
validation, l'agrégation et la décision de gate.

Le job canonique `automation-audit` de
[CI GitHub Actions](../github-actions-ci-contract.md) exécute exactement :

- `pnpm exec tsx --test tests/audit/automation-contracts.test.ts` ;
- `pnpm exec tsx src/cli.ts audit --json --strict`, puis vérifie que
  `AUDIT-503` à `AUDIT-512` sont tous en succès ;
- `pnpm exec tsx src/cli.ts audit --json --profile architecture` ;
- `pnpm exec tsx src/cli.ts audit --json --profile docs`.

Le gate final `ci-gate` dépend de ce job et rejette tout résultat autre que
`success`. `AUDIT-513` inspecte la structure réelle du workflow, ses commandes,
la vérification de la plage de règles et cette agrégation. L'absence du job,
d'une commande requise, d'une règle de la plage ou de la dépendance du gate
échoue fermée.

L'Automation Platform ne dépend d'aucun détail interne du pipeline. Cette
frontière suit la [cartographie](../platform-map.md) et les
[règles de dépendance](../dependency-rules.md).

## 10. Migration Strategy

Cette RFC n'impose aucune migration de document, de contrat ni d'implémentation.

Les évolutions futures qui introduisent une capacité d'automatisation doivent :

1. identifier le contrat public et la plateforme propriétaire ;
2. documenter les ports provider ou forge nécessaires ;
3. définir les limites de politique et les non-objectifs ;
4. référencer les intégrations Audit et CI sans dupliquer leurs responsabilités ;
5. créer ou mettre à jour un contrat courant seulement après décision
   architecturale explicite ;
6. conserver un Delivery Record séparé lorsqu'un lot est livré.

Cette séquence applique la convention de
[cycle de vie documentaire](../document-lifecycle.md) et ne requalifie aucun
document existant.

## 11. Open Questions

- Quels contrats transverses d'identité, de provenance et d'autorisation sont
  nécessaires avant toute action externe de forge ?
- Quel niveau minimal de preuve distingue une proposition de release d'une
  release effectivement publiée ?
- Quels événements d'observabilité doivent être publics tout en restant
  redacted et indépendants des fournisseurs ?
- Comment décrire un résultat assisté par fournisseur sans en faire une source
  d'autorité architecturale ?
- Quelles capacités d'automatisation doivent devenir des contrats de plateforme
  avant les premiers cas d'usage de revue ?

Ces questions restent ouvertes. Elles ne constituent ni un mandat
d'implémentation ni une autorisation de modifier les frontières existantes.

## 12. References

- [Vision de Loop Platform](../vision.md)
- [Principes architecturaux](../principles.md)
- [Cartographie des plateformes](../platform-map.md)
- [Règles de dépendance](../dependency-rules.md)
- [Gouvernance de l'architecture](../governance.md)
- [Cycle de vie des documents](../document-lifecycle.md)
- [ADR-0001 — Platform Foundation](../adr/0001-platform-foundation.md)
- [ADR-0002 — Contract First](../adr/0002-contract-first.md)
- [ADR-0003 — Ports & Adapters](../adr/0003-ports-and-adapters.md)
- [ADR-0004 — Policy Driven](../adr/0004-policy-driven.md)
- [ADR-0005 — Deterministic Governance](../adr/0005-deterministic-governance.md)
- [Audit Engine](../audit-engine.md)
