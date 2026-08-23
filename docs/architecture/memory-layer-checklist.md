# Memory Layer Checklist

## Avant implémentation

- [ ] Confirmer que la mémoire reste read-only.
- [ ] Confirmer qu'aucun appel IA automatique n'est déclenché.
- [ ] Confirmer qu'aucune écriture automatique n'est effectuée.
- [ ] Confirmer que l'index est reconstructible.
- [ ] Confirmer que les sources restent la vérité.

## Sources autorisées

- [ ] `README.md`
- [ ] `CHANGELOG.md`
- [ ] `CLAUDE.md`
- [ ] `docs/architecture/`
- [ ] `docs/audits/`
- [ ] `docs/roadmap/`
- [ ] `docs/integrations/`
- [ ] `docs/releases/`

Cette liste est désormais vérifiée automatiquement par une règle d'audit de catégorie `rag`
(`RAG_SOURCE_PATHS` vs `docs/architecture/local-rag-index.md` et `memory-layer.md`), en plus
de la vérification manuelle ci-dessus.

## Sources exclues

- [ ] `.env*`
- [ ] secrets
- [ ] clés
- [ ] dumps
- [ ] données personnelles
- [ ] `node_modules/`
- [ ] artefacts de build

## Sorties attendues

- [ ] Résultats citables.
- [ ] Chemin source affiché.
- [ ] Section ou fragment identifiable.
- [ ] Index supprimable sans perte critique.

## Interdits

- [ ] Aucun commit automatique.
- [ ] Aucun push automatique.
- [ ] Aucune correction automatique.
- [ ] Aucun agent autonome.
- [ ] Aucune mémoire opaque.
