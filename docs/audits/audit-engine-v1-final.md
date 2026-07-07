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

Le rapport humain affiche également une section `Recommendations` lorsque des findings exposent une recommandation corrective.

## Rapport JSON

Le rapport JSON contient :

`summary.status` expose le statut global dérivé des findings : `pass`, `warning` ou `fail`.

- `schemaVersion` ;
- `generatedAt` ;
- `summary.status` ;
- `summary.status` ;
- `summary.total` ;
- `summary.pass` ;
- `summary.warning` ;
- `summary.fail` ;
- `summary.skipped` ;
- `summary.score` ;
- `summary.byCategory` ;
- `summary.byPriority` ;

`summary.byCategory` regroupe les findings par catégorie et permet de vérifier la distribution des règles entre `json`, `cli`, `docs` et `architecture`.

`summary.byPriority` regroupe les findings par priorité et permet de vérifier la distribution opérationnelle entre `low`, `medium` et `high`.

Le champ top-level `recommendations` expose les recommandations actionnables dérivées des findings en échec.
- `findings` ;
- `recommendations`.

Chaque finding contient :

- `ruleId` ;
- `category` ;
- `severity` ;
- `status` ;
- `priority` ;
- `message` ;
- `recommendation`, lorsque le finding échoue et qu'une action corrective est disponible ;
- `details`, lorsque la règle expose des éléments vérifiés ou manquants.

## Règles actives

Le moteur contient 14 règles exécutables :

- `JSON-001` — vérifie que les sorties JSON publiques exposent `schemaVersion` ;
- `JSON-005` — vérifie que les commandes JSON publiques sont couvertes par `json-check` ;
- `JSON-006` — vérifie que le rapport JSON d'audit expose les champs stables attendus ;
- `CLI-001` — vérifie que les commandes publiques sont accessibles depuis le routeur CLI ;
- `DOCS-001` — vérifie que la documentation couvre les rapports humain et JSON ;
- `AUDIT-001` — vérifie que le score d'audit est typé, calculé et affiché ;
- `AUDIT-002` — vérifie que la priorité des findings est typée et renseignée ;
- `AUDIT-003` — vérifie que les recommandations sont supportées par les findings ;
- `AUDIT-004` — vérifie que le résumé par catégorie est typé, calculé et affiché.
- `AUDIT-005` — vérifie que le rapport humain affiche les recommandations lorsqu'elles sont disponibles.
- `AUDIT-006` — vérifie que le résumé par priorité est typé, calculé et affiché.
- `AUDIT-007` — vérifie que le résumé top-level des recommandations est typé et calculé.
- `AUDIT-008` — vérifie que le statut global d'audit est typé, calculé et affiché.
- `AUDIT-009` — vérifie que le mode strict d'audit est câblé pour les sorties humaines et JSON.
- `AUDIT-008` — vérifie que le statut global d'audit est typé, calculé et affiché.
- `AUDIT-009` — vérifie que le mode strict d'audit est câblé pour les sorties humaines et JSON.

## Structure interne

Les règles sont découpées par domaine :

- `src/audit/rules/json.ts` ;
- `src/audit/rules/cli.ts` ;
- `src/audit/rules/docs.ts` ;
- `src/audit/rules/audit.ts`.

Le registre principal `src/audit/rules.ts` agrège les règles actives.

Les helpers de findings sont centralisés dans `src/audit/findings.ts`.

Les listes de commandes publiques sont centralisées dans `src/audit/public-commands.ts`.

## Critère de stabilité

L'état attendu du moteur est :

- 14 règles ;
- 14 règles en pass ;
- 0 warning runtime ;
- 0 fail ;
- score 100 ;
- une distribution par catégorie incluant `json`, `cli`, `docs` et `architecture`.



---

## Mode strict

Le mode strict permet d'utiliser l'audit dans un contexte CI.

Commandes supportées :

- `audit --strict`
- `audit --json --strict`

Lorsque `summary.status` vaut `pass`, le code de sortie reste `0`.

Lorsque `summary.status` vaut `warning` ou `fail`, le code de sortie devient non nul.
