# Plan d’exécution transverse — Stabilisation de l’écosystème

Date de cadrage : 2026-09-11

## Rôle de ce document

Ce document est un **index d’orchestration transverse**. Il fixe l’ordre global d’exécution entre plusieurs projets, les gates de passage et les preuves attendues.

Il **ne remplace aucune roadmap projet** et ne redéfinit aucun lot. Les sources canoniques restent :

- Development Workspace : `roadmap/workflow-roadmap.md` ;
- OpenClaw Control : `docs/roadmap/README.md` et `docs/roadmap/oc13-ci-terminal-cockpit.md` ;
- Creatyss : `docs/roadmap/README.md`, `docs/roadmap/cycle-stabilisation-post-audit-vnext4.md` et `docs/roadmap/vnext4-s6a-admin-creator-ux.md` ;
- recette UX Creatyss : `docs/testing/2026-09-11-vnext4-s6a-admin-creator-ux-matrix.md`.

En cas d’écart entre ce document et une roadmap projet, la roadmap projet gouvernée par Loop Engine prévaut. Ce document doit alors être réconcilié, pas l’inverse.

## Objectif global

Fermer les défauts d’outillage et les P0/P1 internes démontrés, harmoniser l’admin Creatyss, rejouer une recette complète puis seulement décider si l’écosystème est suffisamment mature pour préparer la production et les intégrations externes.

Le but n’est pas d’ajouter des fonctionnalités. Le but est de **réduire le risque, la complexité et la charge cognitive** avant d’ouvrir un nouveau cycle produit.

## Règles de pilotage

### WIP

- un seul chantier principal actif à la fois ;
- un chantier transverse secondaire n’est admis que s’il débloque directement le chantier principal ;
- une seule PR fonctionnelle Creatyss active à la fois ;
- aucune nouvelle feature Creatyss avant la clôture de VNEXT4-S8 ;
- aucun refactor opportuniste hors périmètre du lot courant.

### Classification d’un nouveau défaut

Tout défaut découvert pendant un lot est classé immédiatement :

1. **bloquant du lot courant** : corrigé dans le lot ou dans un micro-correctif directement nécessaire ;
2. **nouveau P0/P1 transverse démontré** : inséré avant la recette finale S8, avec justification ;
3. **P2/P3 ou amélioration** : différé après VNext-4 ;
4. **dépendance externe** : gate documentée, jamais simulée pour fermer artificiellement le lot.

### Cycle de clôture obligatoire

Chaque lot suit la même séquence :

`main propre → candidat canonique Loop Engine → implémentation bornée → validations ciblées → PR → CI verte → review → merge → sync main → déploiement staging si nécessaire → recette réelle → preuve consignée → roadmap mise à jour → lot suivant`

Le lot suivant ne démarre pas tant que la preuve de clôture du lot précédent n’est pas suffisante.

---

# Séquence canonique transverse

## Phase 0 — Fiabiliser l’outillage de recette

### 0.1 — DW-V6.1 — Fiabilité du tunnel Playwright

**Projet :** `development-workspace`

**Statut initial :** TODO, candidat canonique actuel.

**Objectif :** diagnostiquer puis corriger le crash réel du tunnel/service Playwright observé après restart, sans changer l’architecture à tunnel dédié.

**Livrables attendus :**

- cause exacte établie par statut/logs ou reproduction ;
- correction minimale du lifecycle/configuration responsable ;
- `@playwright/mcp --isolated` conservé ;
- smoke post-restart déterministe avec navigation + snapshot ;
- absence de `Session terminated` dans le scénario de qualification ;
- procédure de diagnostic mise à jour si nécessaire.

**Preuve de clôture :**

- validations Development Workspace vertes ;
- PR mergée ;
- restart réel suivi d’un smoke concluant ;
- aucun nouvel outil générique, proxy MCP ou stockage de session persistant.

**Gate vers 0.2 :** Playwright redémarre proprement au moins une fois avec smoke concluant.

### 0.2 — DW-V6.2 — Burn-in Playwright

**Projet :** `development-workspace`

**Statut initial :** TODO, séquencé après DW-V6.1.

**Objectif :** prouver que la correction ne tient pas seulement sur un restart isolé.

**Livrables attendus :**

- plusieurs redémarrages successifs qualifiés ;
- recette `example.com → Creatyss staging → Cockpit OpenClaw` ;
- snapshots ;
- lecture console/réseau sur les surfaces réelles ;
- rollback/documentation explicite si le launcher ne redémarre pas proprement.

**Preuve de clôture :**

- aucune rechute `Session terminated` ;
- aucune rechute `transport error` imputable au tunnel Playwright ;
- procédure de diagnostic reproductible.

**Gate vers 0.3 :** Playwright qualifié suffisamment stable pour devenir l’outil de recette standard des phases suivantes.

### 0.3 — OC-13 — CI terminal dans le Cockpit

**Projet :** `openclaw-control`

**Statut initial :** TODO, candidat canonique actuel ; code principal déjà livré, qualification runtime restante.

**Objectif :** fermer la qualification réelle des événements `ci.failed` / `ci.green` dans le Cockpit sans second poller ni nouvelle autorité.

**Livrables attendus :**

- overlay généré depuis le `main` courant ;
- installation bornée et réversible ;
- événement CI terminal corrélé au HEAD courant observé réellement ;
- `ci.failed` visible comme priorité critique ;
- `ci.green` de branche visible comme résultat validé ;
- `ci.green` de `main` ne masque pas un prochain lot admissible ;
- « Continuer avec ChatGPT » reste gouverné ;
- aucune lecture n’entraîne provider, merge ou déploiement.

**Preuve de clôture :**

- tests OpenClaw Control verts ;
- overlay/smoke qualifié ;
- recette Playwright desktop/mobile sans erreur console ;
- OC-13 coché dans sa roadmap avec SHA/overlay de preuve.

**Gate vers Phase 1 :** Cockpit et Playwright sont suffisamment fiables pour accompagner le cycle Creatyss sans requalification permanente de l’outillage.

---

# Phase 1 — Sécurité métier Creatyss

## 1.1 — VNEXT4-S1 — Invariant commande/paiement

**Projet :** `creatyss`

**Statut initial :** TODO, candidat canonique actuel Creatyss.

**Objectif :** rendre impossible toute réactivation d’une commande annulée ou terminale par capture d’un paiement admin.

**Livrables attendus :**

- garde métier sur le statut de commande dans la frontière de capture ;
- UI n’exposant pas l’action interdite ;
- cohérence du paiement manuel `PENDING` lorsqu’une commande est annulée ;
- couverture unitaire du cas `Order=CANCELLED` ;
- non-régression des captures autorisées.

**Preuve de clôture :**

- tests ciblés + typecheck/lint pertinents verts ;
- CI PR verte ;
- merge puis staging ;
- recette réelle prouvant qu’une commande annulée reste annulée ;
- aucune transaction bancaire externe réelle nécessaire.

**Gate vers S2 :** aucun chemin UI/service connu ne peut remettre une commande annulée en `CONFIRMED` par capture admin.

## 1.2 — VNEXT4-S2 — Surfaces légales publiques

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** éliminer les 404 sur CGV, Mentions légales et Politique de confidentialité tout en conservant Politique de retour.

**Livrables attendus :**

- quatre URLs légales canoniques répondant 200 ;
- navigation footer cohérente ;
- tests E2E dédiés ;
- aucune donnée juridique inventée pour contourner une information manquante.

**Preuve de clôture :**

- quatre liens publics testés sur staging ;
- aucune 404 ;
- contenu et état de publication cohérents ;
- toute donnée d’identité légale manquante reste une gate de configuration explicite.

**Gate vers Phase 2 :** plus aucun P0 interne connu issu de l’audit fonctionnel du 10 septembre.

---

# Phase 2 — Réconcilier runtime, données et gouvernance

## 2.1 — VNEXT4-S3 — Staging/main et hydratation admin

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** repartir du `main` réel et supprimer les écarts de runtime prouvés.

**Livrables attendus :**

- staging explicitement déployé sur le `main` qualifié ;
- disparition des libellés Analytics `(MOCK)` si le code courant les a déjà supprimés ;
- reproduction puis correction de React #418 sur Marketing → Automations si l’erreur subsiste après redeploy ;
- console propre sur les surfaces critiques.

**Preuve de clôture :**

- SHA staging consigné ;
- Analytics affiche les données réelles sans libellé mock ;
- Automations ne reproduit plus React #418 ;
- recette navigateur sans erreur critique nouvelle.

**Gate vers S4 :** les défauts à corriger sont désormais des défauts source/données réels, plus un simple drift de runtime.

## 2.2 — VNEXT4-S4 — Cohérence médias catalogue

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** supprimer les associations médias inter-produits observées sur Cabas Atelier et vérifier les produits publiés.

**Livrables attendus :**

- médias Cabas Atelier appartenant réellement au produit ;
- textes alternatifs cohérents ;
- audit borné des quatre produits publiés ;
- ordre des variantes, variante par défaut et stocks inchangés.

**Preuve de clôture :**

- admin + storefront + panier/favoris ne montrent plus de média d’un autre produit ;
- recette des produits publiés ;
- aucune modification de stock induite.

**Gate vers S5 :** catalogue visuel cohérent sur les produits publiés.

## 2.3 — VNEXT4-S5 — Gouvernance feature/runtime

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** aligner le catalogue de capacités avec le runtime effectivement livré.

**Livrables attendus :**

- `insights.storeHealthRead` matérialisé selon la convention existante ;
- cible 38/38 flags créés, ou exception volontaire explicitement documentée ;
- descriptions de gouvernance obsolètes corrigées, notamment `commerce.documents` ;
- aucun changement implicite de feature level ;
- Social, Reviews et Digital Resources restent dans leur état volontaire actuel.

**Preuve de clôture :**

- gouvernance admin cohérente avec la DB/runtime ;
- pas d’activation opportuniste ;
- tests/CI verts ;
- recette de la page Avancés.

**Gate vers Phase 3 :** l’UX admin peut être harmonisée sur un runtime et une gouvernance stabilisés.

---

# Phase 3 — Admin Creator UX

## 3.1 — VNEXT4-S6A.1 — Baseline de cohérence

**Projet :** `creatyss`

**Statut initial :** TODO dans le lot parent S6A.

**Objectif :** exécuter la matrice S6A sur l’état réel et établir la baseline des écarts.

**Livrables attendus :**

- matrice `pattern attendu | écart | correction locale | composant existant` ;
- parcours P1→P10 évalués ;
- distinction entre défaut commun de composant et défaut local de page ;
- aucun correctif massif mélangé à l’audit initial.

**Preuve de clôture :** baseline datée sur staging, desktop et mobile.

## 3.2 — VNEXT4-S6A.2 — Navigation et hiérarchie

**Objectif :** harmoniser shell, titres, contexte, navigation locale, actions principales et menu « Plus ».

**Livrables attendus :**

- cohérence sidebar/mobile ;
- navigation produit/commande/réglages stable ;
- état actif visible ;
- aucun CTA primaire concurrent ;
- pas de destination importante cachée de façon ambiguë.

**Preuve de clôture :** contrôles navigation/hiérarchie de la matrice au vert sur desktop + 390×844.

## 3.3 — VNEXT4-S6A.3 — Actions, formulaires et feedback

**Objectif :** rendre les actions récurrentes prévisibles.

**Livrables attendus :**

- vocabulaire commun `Créer/Enregistrer/Publier/Annuler/Supprimer/Archiver` ;
- actions destructives séparées ;
- raisons de disabled explicites ;
- feedback succès/erreur cohérent ;
- réutilisation des composants `components/admin/forms/**`.

**Preuve de clôture :** parcours produit, commande, contenu, newsletter et réglages conformes à la matrice sans régression métier.

## 3.4 — VNEXT4-S6A.4 — Listes, détails et états de capacité

**Objectif :** harmoniser recherche, filtres, tables, feeds, états vides et features indisponibles.

**Livrables attendus :**

- patterns communs pour search/filter/sort/pagination ;
- retour liste/détail prévisible ;
- distinction vide / désactivé / non configuré / erreur / à venir ;
- statuts métier cohérents.

**Preuve de clôture :** P1, P3, P7, P8, P10 + contrôles mobiles concernés au vert.

## 3.5 — VNEXT4-S6A.5 — Aide contextuelle et langage

**Objectif :** réduire la charge cognitive sans masquer les capacités avancées.

**Livrables attendus :**

- chemin principal orienté métier ;
- jargon technique déplacé vers Avancé/diagnostic ;
- textes d’aide cohérents ;
- admin compréhensible sans devoir ouvrir l’assistant IA.

**Preuve de clôture :** contrôles de langage/aide de la matrice au vert dans Catalogue, Commerce, Contenu, Marketing, Insights et Réglages.

## 3.6 — VNEXT4-S6A.6 — Recette UX complète

**Objectif :** qualifier l’admin harmonisé comme un ensemble cohérent.

**Livrables attendus :**

- P1→P10 rejoués ;
- desktop 1440×900 ;
- mobile 390×844 ;
- console ;
- navigation clavier des actions principales ;
- absence de scroll horizontal parasite ;
- validation visuelle finale.

**Preuve de clôture :**

- aucun FAIL P0/P1 dans la matrice S6A ;
- aucune erreur console critique nouvelle ;
- aucune navigation cassée ;
- S6A coché dans la roadmap.

**Gate vers Phase 4 :** l’admin est cohérent et suffisamment stable pour que le nettoyage final ne réintroduise pas de dette UX transverse.

---

# Phase 4 — Nettoyage et qualité résiduelle

## 4.1 — VNEXT4-S6 — Store Health interne

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** réduire les alertes internes qui sont réellement actionnables.

**Livrables attendus :**

- catégories publiées vides traitées ;
- SEO produit exploitable ;
- commandes anciennes réellement obsolètes traitées ;
- identité légale uniquement si les données validées sont disponibles.

**Preuve de clôture :** Store Health ne contient plus de dette interne P0/P1 évitable ; les gates de données externes restent explicites.

## 4.2 — VNEXT4-S7 — Assistant boutique

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** améliorer la compréhension des formulations naturelles de disponibilité sans second moteur ni provider distant obligatoire.

**Livrables attendus :**

- « Quels sacs sont disponibles actuellement ? » et variantes pertinentes résolues via Search V2/catalogue réel ;
- résultats vendables réellement disponibles ;
- fallback humain conservé quand la réponse n’est pas fiable.

**Preuve de clôture :** recette d’un jeu borné de formulations naturelles avec réponses correctes/sourcées et aucune invention de disponibilité.

---

# Phase 5 — Qualification finale VNext-4

## 5.1 — VNEXT4-S8 — Recette fonctionnelle complète

**Projet :** `creatyss`

**Statut initial :** TODO.

**Objectif :** décider si le cycle interne de stabilisation est réellement terminé.

**Périmètre de recette :**

- paiement/commande ;
- quatre pages légales ;
- catalogue et médias ;
- panier/checkout ;
- Gifting ;
- Wishlist ;
- recherche ;
- contenus ;
- newsletter ;
- automations ;
- analytics ;
- IA locale ;
- assistant boutique ;
- Store Health ;
- matrice Admin Creator UX ;
- console/réseau ;
- nettoyage des données de recette.

**Preuve de clôture :**

- aucun P0/P1 interne connu ;
- aucune donnée de recette résiduelle ;
- dépôt propre ;
- staging qualifié sur un SHA de `main` consigné ;
- rapport de recette daté ;
- VNext-4 clôturé dans la roadmap.

**Gate de sortie :** passage obligatoire à une décision de pilotage, pas à une nouvelle feature automatique.

---

# Phase 6 — Décision après VNext-4

Une fois S8 fermé, suspendre l’implémentation et choisir explicitement une seule direction.

## Option A — Préparation production

À retenir si aucun défaut interne significatif ne reste et si les données/accès nécessaires sont disponibles.

Peut inclure, après décision explicite :

- identité légale définitive ;
- Stripe live ;
- domaine `creatyss.com` ;
- DNS/TLS production ;
- recette de lancement.

## Option B — Petit cycle de finition

Uniquement si S8 révèle des défauts mesurables qui ne justifient pas encore la production.

Règle : lot court, borné, sans rouvrir un programme général d’amélioration.

## Option C — Intégrations externes

Seulement lorsque les gates sont réellement disponibles :

- Meta staging readiness puis VNEXT3-G1B3B ;
- Google Merchant réel ;
- autres providers déjà documentés.

Aucune simulation de gate externe n’est admise pour déclarer un chantier terminé.

---

# Travaux explicitement gelés pendant ce plan

Jusqu’à S8 :

- aucune nouvelle grosse feature Creatyss ;
- aucun redesign storefront général ;
- aucun nouveau design system admin ;
- aucun nouveau provider IA distant requis ;
- aucun nouveau système de ticketing/tableur de suivi ;
- aucune réécriture de Loop Engine, n8n ou OpenClaw sans gap démontré ;
- aucun chantier Meta/Google/Stripe live sans accès réels ;
- aucune optimisation prématurée.

## Projets sans nouveau chantier dans ce plan

- `loop-engine` : pas de nouveau lot produit ; ce document est uniquement un index d’orchestration ;
- `n8n` : maintenance, aucune évolution sans défaut démontré ;
- `lp-infra` : gates externes existantes, pas de contournement ;
- `openclaw-control` : uniquement OC-13 ;
- `development-workspace` : uniquement V6.1/V6.2.

---

# Tableau de statut initial

| Ordre | Projet | Lot | Priorité | Statut initial | Preuve de sortie minimale |
| ---: | --- | --- | --- | --- | --- |
| 1 | development-workspace | DW-V6.1 | P1 | TODO | restart + smoke sans `Session terminated` |
| 2 | development-workspace | DW-V6.2 | P1 | TODO | burn-in multi-restart + recette réelle |
| 3 | openclaw-control | OC-13 | P0 | TODO | CI terminal visible + overlay/Playwright qualifiés |
| 4 | creatyss | VNEXT4-S1 | P0 | TODO | commande annulée impossible à réactiver par paiement |
| 5 | creatyss | VNEXT4-S2 | P0 | TODO | 4 pages légales HTTP 200 |
| 6 | creatyss | VNEXT4-S3 | P1 | TODO | staging=`main`, plus de `(MOCK)`/React #418 |
| 7 | creatyss | VNEXT4-S4 | P1 | TODO | médias catalogue cohérents |
| 8 | creatyss | VNEXT4-S5 | P1 | TODO | gouvernance feature/runtime alignée |
| 9 | creatyss | VNEXT4-S6A.1 | P1 | TODO | baseline UX datée |
| 10 | creatyss | VNEXT4-S6A.2 | P1 | TODO | navigation/hiérarchie cohérentes |
| 11 | creatyss | VNEXT4-S6A.3 | P1 | TODO | actions/formulaires cohérents |
| 12 | creatyss | VNEXT4-S6A.4 | P1 | TODO | listes/états cohérents |
| 13 | creatyss | VNEXT4-S6A.5 | P1 | TODO | aide/jargon maîtrisés |
| 14 | creatyss | VNEXT4-S6A.6 | P1 | TODO | matrice UX P1→P10 verte |
| 15 | creatyss | VNEXT4-S6 | P2 | TODO | Store Health interne assaini |
| 16 | creatyss | VNEXT4-S7 | P2 | TODO | requêtes naturelles disponibilité correctes |
| 17 | creatyss | VNEXT4-S8 | P1 | TODO | aucune dette interne P0/P1 + recette finale |
| 18 | portefeuille | Décision post-VNext-4 | Gate | BLOQUÉ PAR S8 | choisir A, B ou C explicitement |

## Prochain travail autorisé au moment du cadrage

**DW-V6.1 uniquement.**

Toute autre implémentation doit attendre sa place dans la séquence, sauf défaut bloquant démontré du lot courant.
