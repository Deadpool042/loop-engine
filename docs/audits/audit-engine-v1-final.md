# Audit Engine — Rapport final V1

## Objet

Ce document synthétise les audits V1 réalisés sur Loop Engine.

Il constitue le point de départ du futur moteur d'audit.

---

# Verdict global

## Architecture

🟢 Solide

Les couches sont clairement séparées :

CLI
→ commands
→ intelligence
→ core

La dépendance principale est :

ProjectSnapshot

Les commandes restent essentiellement des vues.

Aucune violation majeure de couche n'a été observée.

---

## Dette technique

### Bloquante

Aucune.

---

### Importante

1. Payloads JSON reconstruits dans plusieurs commandes.

ROI : ⭐⭐⭐⭐⭐

2. Dispatcher CLI encore basé sur une succession de branches.

ROI : ⭐⭐⭐⭐☆

3. Couverture limitée des sorties humaines.

ROI : ⭐⭐⭐⭐☆

---

### Mineure

- duplication de quelques blocs terminal ;
- indexation documentaire encore récente ;
- quelques helpers pouvant être factorisés.

---

# État des domaines

| Domaine | État |
|----------|------|
| Architecture | 🟢 |
| Snapshot | 🟢 |
| CLI | 🟢 |
| JSON | 🟢 |
| Documentation | 🟢 |
| Tests | 🟡 |
| Audit | 🟡 |

---

# Forces du projet

- architecture simple ;
- cœur métier bien identifié ;
- RAG volontairement sobre ;
- contrats JSON publics ;
- documentation importante ;
- micro-lots disciplinés.

---

# Faiblesses

Les principales fragilités concernent :

- duplication JSON ;
- couverture des sorties terminal ;
- absence d'un moteur d'audit automatisé.

---

# Priorités ROI

## ROI 1

Builder JSON partagé.

Gain :

★★★★★

Risque :

★☆☆☆☆

---

## ROI 2

Audit Engine.

Gain :

★★★★★

Risque :

★★☆☆☆

---

## ROI 3

Tests des sorties humaines.

Gain :

★★★★☆

Risque :

★☆☆☆☆

---

## ROI 4

Dispatcher CLI par table.

Gain :

★★★☆☆

Risque :

★★☆☆☆

---

# Ce qu'il ne faut pas faire

Ne pas introduire :

- Commander
- yargs
- plugins
- embeddings
- dashboard
- automatisation autonome
- IA embarquée

Le projet gagne à rester un moteur CLI simple.

---

# Vision V2.6

Objectif :

Consolider.

Le prochain cycle doit transformer les règles documentées en règles exécutables.

---

# Vision V3

Créer un véritable Audit Engine.

Il devra être capable de produire :

- un rapport humain ;
- un rapport JSON ;
- des scores ;
- des recommandations ;
- une priorisation.

Sans modifier les projets audités.

---

# Conclusion

Loop Engine possède aujourd'hui un socle suffisamment stable pour accueillir un moteur d'audit.

Le meilleur investissement n'est plus un nouveau module fonctionnel.

C'est l'automatisation des audits déjà réalisés manuellement.

---

# Couverture des sorties d'audit

La commande `audit` doit produire un rapport humain lisible dans le terminal.

La commande `audit --json` doit produire un rapport JSON stable, incluant `schemaVersion`, un résumé et la liste des findings.

---

# État du moteur après consolidation V3 minimale

Le moteur d'audit expose désormais un rapport humain et un rapport JSON stable.

Le rapport humain affiche :

- un statut global ;
- un score ;
- les compteurs par statut ;
- une distribution par catégorie ;
- une distribution par priorité ;
- une section `Recommendations` lorsque des findings exposent une recommandation corrective ;
- la liste détaillée des findings.

## Rapport JSON

Le rapport JSON contient :

- `schemaVersion` ;
- `generatedAt` ;
- `summary.status` ;
- `summary.total` ;
- `summary.pass` ;
- `summary.warning` ;
- `summary.fail` ;
- `summary.skipped` ;
- `summary.score` ;
- `summary.byCategory` ;
- `summary.byPriority` ;
- `findings` ;
- `recommendations`.

`summary.status` expose le statut global dérivé des findings : `pass`, `warning` ou `fail`.

`summary.byCategory` regroupe les findings par catégorie et permet de vérifier la distribution des règles entre `json`, `cli`, `docs` et `architecture`.

`summary.byPriority` regroupe les findings par priorité et permet de vérifier la distribution opérationnelle entre `low`, `medium` et `high`.

Le champ top-level `recommendations` expose les recommandations actionnables dérivées des findings en échec.

Chaque finding contient :

- `ruleId` ;
- `category` ;
- `severity` ;
- `status` ;
- `priority` ;
- `message` ;
- `recommendation`, lorsque le finding échoue et qu'une action corrective est disponible ;
- `details`, lorsque la règle expose des éléments vérifiés.

## Règles exécutables

Le moteur contient 84 règles exécutables :

- `JSON-001` : présence de `schemaVersion` dans les sorties JSON publiques.
- `JSON-005` : couverture des commandes JSON publiques par `json-check`.
- `JSON-006` : contrat stable du rapport JSON d'audit.
- `JSON-007` : parsing effectif des sorties JSON publiques par `json-check`.
- `JSON-008` : validation de l'objet racine JSON et de `schemaVersion: 1`.
- `CLI-001` : couverture des commandes publiques par le routeur CLI.
- `DOCS-001` : couverture documentaire du rapport humain et JSON.
- `DOCS-002` : couverture README des commandes audit et CI.
- `DOCS-003` : unicité des liens de la section `Voir aussi` du README.
- `AUDIT-001` : score typé, calculé et affiché.
- `AUDIT-002` : priorité typée et renseignée.
- `AUDIT-003` : recommandations typées et supportées par les findings.
- `AUDIT-004` : résumé par catégorie typé, calculé et affiché.
- `AUDIT-005` : recommandations affichées dans le rapport humain.
- `AUDIT-006` : résumé par priorité typé, calculé et affiché.
- `AUDIT-007` : résumé des recommandations typé et calculé.
- `AUDIT-008` : statut global typé, calculé et affiché.
- `AUDIT-009` : mode strict câblé pour les sorties humaine et JSON.
- `AUDIT-010` : script `audit:strict` disponible.
- `AUDIT-011` : script `ci` exécutant `validate` puis `audit:strict`.
- `AUDIT-012` : workflow GitHub Actions exécutant `pnpm run ci`.
- `AUDIT-013` : ordre logique des règles critiques d'audit.
- `AUDIT-014` : routage CLI du mode strict d'audit.
- `AUDIT-015` : unicité des identifiants déclarés des règles d'audit.
- `AUDIT-016` : complétude du registre `AUDIT_RULES`.
- `AUDIT-017` : complétude des métadonnées `title` et `description` des règles d'audit.
- `AUDIT-018` : validité des catégories déclarées par les règles d'audit.
- `AUDIT-019` : validité des sévérités déclarées par les règles d'audit.
- `AUDIT-020` : validité des priorités produites par les helpers de findings.
- `AUDIT-021` : validité des statuts produits par les helpers de findings.
- `AUDIT-022` : préservation des champs d'identité `ruleId`, `category` et `severity` dans les findings.
- `AUDIT-023` : préservation des champs diagnostiques `message`, `details` et `recommendation` dans les findings.
- `AUDIT-024` : cohérence entre les préfixes d'identifiants et les catégories des règles d'audit.
- `AUDIT-025` : unicité des titres de règles pour éviter les rapports humains ambigus.
- `AUDIT-026` : unicité des descriptions de règles pour éviter une documentation interne ambiguë.
- `AUDIT-027` : convention de nommage des exports de règles en `UPPER_SNAKE_CASE` avec suffixe `_RULE`.
- `AUDIT-028` : unicité des noms d'exports de règles entre les fichiers de règles.

## Couverture README

Le README expose désormais les commandes publiques du moteur d'audit :

- `pnpm loop audit` ;
- `pnpm loop audit --json` ;
- `pnpm loop audit --strict` ;
- `pnpm loop audit --json --strict` ;
- `pnpm run audit:strict` ;
- `pnpm run ci`.

Cette couverture est vérifiée par `DOCS-002`.

La section `Voir aussi` est également vérifiée pour éviter les liens documentaires dupliqués. Cette règle est portée par `DOCS-003`.

## Résultat final

État validé :

- 84 règles ;
- 84 règles en pass ;
- 0 warning ;
- 0 fail ;
- score 100 ;
- rapport JSON stable ;
- mode strict compatible CI ;
- workflow GitHub Actions actif ;
- README utilisateur aligné.

## Conclusion V3

Loop Engine possède désormais un moteur d'audit opérationnel.

Le moteur ne modifie pas les projets audités.

Il produit un rapport humain, un rapport JSON, un score, des priorités, des recommandations et des contrôles auto-référentiels.

Le prochain investissement utile n'est plus la création du moteur, mais l'élargissement progressif de ses règles.

