# V57 — Clôture autonome bornée et économie de quota

## Objectif

Rendre AUTO capable de récupérer un lot techniquement valide mais encore ouvert dans la roadmap, sans transformer Loop Engine en nouvelle IA ni multiplier les appels modèles.

Le principe est : **preuve déterministe d'abord, modèle seulement si nécessaire, une tentative de clôture maximum, puis revalidation et relecture canonique**.

## Constat

Le runner possède déjà :

- sélection/routage gouverné ;
- workspace isolé ;
- scope d'écriture ;
- content policy ;
- validation technique ;
- réparation bornée après échec de validation ;
- escalade de modèle bornée ;
- budget `maxRepairs`.

Le gap observé sur Creatyss est postérieur à la validation : `candidate_not_completed` est actuellement terminal même si le budget de réparation n'a pas été utilisé.

## Flux cible

1. exécuter le lot ;
2. valider ;
3. si validation échoue, conserver la réparation historique ;
4. si validation passe, relire déterministement le candidat ;
5. s'il est fermé ou si le micro-lot a avancé : terminer ;
6. s'il reste ouvert, vérifier sans LLM :
   - exécution gouvernée ;
   - budget restant ;
   - aucune réparation de clôture déjà tentée ;
   - source roadmap dans le scope autorisé ;
7. seulement alors effectuer une réparation `repair_existing` bornée ;
8. repasser scope + content policy + validation complète ;
9. relire la roadmap ;
10. terminer uniquement si la clôture est réellement constatée ; sinon `candidate_not_completed`.

## Budget

Le compteur de réparation existant reste l'unique budget du run.

- validation repair = 1 unité ;
- completion repair = 1 unité ;
- `repairAttempts <= effectiveMaxRepairs` toujours ;
- `completionRepairAttempts <= 1` toujours.

Aucun retry supplémentaire n'est accordé sous prétexte que la réparation vise la roadmap.

## Modèles et quota

Le preflight et la décision d'éligibilité ne nécessitent aucun LLM.

Une réparation de clôture réutilise le runtime déjà admis pour le run ; V57 n'ajoute ni routeur, ni provider, ni benchmark obligatoire.

Un modèle local pourra ultérieurement être ajouté comme utility/advisory si un endpoint gouverné est réellement disponible. Tant qu'Ollama/DeepSeek ne sont pas découverts par le runtime, ils restent hors AUTO.

## Checklist

- [x] Relecture canonique factorisée après validation.
- [x] Candidat déjà fermé / micro-lot avancé => aucun appel modèle supplémentaire.
- [x] Réparation de clôture éligible seulement si la source canonique est dans le scope.
- [x] Une seule réparation de clôture maximum.
- [x] Budget partagé avec les réparations de validation.
- [x] Réparation exécutée en `repair_existing`, avec consigne explicite de ne jamais cocher aveuglément un lot.
- [x] Scope et content policy revérifiés après réparation.
- [x] Validation complète rejouée après réparation.
- [x] Nouvelle relecture roadmap obligatoire avant succès.
- [x] Candidat encore ouvert => `candidate_not_completed`.
- [x] Budget 0 => aucun appel de réparation.
- [x] Budget déjà consommé par validation => aucune réparation de clôture.
- [x] Tests ciblés couvrant succès, budget, scope, toujours-ouvert et absence de second repair.
- [x] Validation canonique complète verte : PR #331, `Quality` et `CI gate` réussis sur le SHA V57.

## Hors périmètre

- nouveau système d'agents ;
- nouveau scheduler ;
- nouveau ledger ;
- auto-approbation sémantique par le Core ;
- exposition hôte d'Ollama ;
- benchmark exhaustif de modèles ;
- changement du financement autorisé ;
- métriques tokens/coût synthétiques.
