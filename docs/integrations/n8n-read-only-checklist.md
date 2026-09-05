# n8n — checklist avant création ou modification d'un workflow

## 1. Besoin

- [ ] Le besoin d'automatisation est concret et documenté.
- [ ] Le propriétaire du processus est identifié.
- [ ] La source de vérité de chaque donnée est identifiée.
- [ ] Le bénéfice attendu justifie un workflow supplémentaire.
- [ ] Une solution déterministe plus simple n'existe pas déjà dans le produit, Loop Engine ou Development Workspace.

## 2. Frontières d'architecture

- [ ] n8n ne sélectionne pas les lots à la place de Loop Engine.
- [ ] n8n ne reproduit pas les gates ou le parsing de roadmap.
- [ ] n8n ne devient pas le moteur d'exécution Git/PR/déploiement.
- [ ] n8n ne devient pas une dépendance du coeur métier de Creatyss.
- [ ] Une panne n8n ne corrompt pas la source de vérité.
- [ ] Le workflow peut être supprimé sans refonte structurante.

## 3. Runtime existant

- [ ] Les workflows actifs concernés ont été inventoriés depuis le runtime réel.
- [ ] Le déclencheur et la fréquence sont connus.
- [ ] Les systèmes source et destination sont connus.
- [ ] Les credentials nécessaires sont identifiés sans exposer leur valeur.
- [ ] La stratégie d'export/sauvegarde est connue.
- [ ] La procédure de restauration est connue.
- [ ] Les logs et la supervision sont identifiés.

Si le runtime réel n'est pas accessible, arrêter ici : ne pas supposer l'état des workflows existants.

## 4. Robustesse

- [ ] Le traitement est idempotent ou protégé contre les doublons.
- [ ] Les retries sont bornés.
- [ ] Les erreurs sont observables.
- [ ] Les timeouts sont définis lorsque nécessaire.
- [ ] Les appels externes ont un comportement de dégradation explicite.
- [ ] Le workflow ne contient aucun secret en clair dans un export versionné.

## 5. Consommation de Loop Engine

Pour un workflow read-only :

- [ ] utiliser uniquement des sorties JSON publiques et stables ;
- [ ] `summary --json` est autorisé ;
- [ ] `next <project> --json` est autorisé ;
- [ ] `context <project> --json` est autorisé ;
- [ ] `review <project> --json` est autorisé ;
- [ ] `prompt <project> --json` sert seulement à préparer une action humaine.

## 6. Interdits par défaut

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucun merge automatique.
- [ ] Aucun déploiement automatique.
- [ ] Aucune correction arbitraire de dépôt.
- [ ] Aucun agent IA déclenché implicitement.
- [ ] Aucun provider IA payant utilisé implicitement.
- [ ] Aucune publication automatique de contenu généré.

## 7. Validation

- [ ] Le workflow est testé manuellement avec des données non destructives.
- [ ] Le cas nominal est vérifié.
- [ ] Au moins un cas d'erreur est vérifié.
- [ ] Les doublons/retries sont vérifiés lorsque pertinents.
- [ ] Les sorties et effets attendus sont documentés.
- [ ] Les garde-fous sont documentés.
- [ ] L'export sauvegardable du workflow est disponible avant mise en service.

## 8. Retour en maintenance

Après livraison :

- [ ] aucun lot n8n permanent n'est laissé ouvert sans besoin concret ;
- [ ] la documentation reflète le workflow réellement déployé ;
- [ ] le projet reste en `planning.mode: maintenance` sauf décision explicite contraire.
