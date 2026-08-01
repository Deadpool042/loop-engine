# ADR-0003 — Ports & Adapters

## Statut

Accepté.

## Contexte

Loop Platform interagit avec des systèmes externes tels que des forges Git,
des fournisseurs d'intelligence artificielle, des systèmes de stockage ou des
services réseau.

Coupler directement le cœur d'une plateforme à ces systèmes rendrait
l'architecture difficile à faire évoluer et compliquerait les tests.

## Décision

Toute dépendance externe est représentée par un port.

Les implémentations concrètes de ces ports sont fournies par des adaptateurs.

Le cœur d'une plateforme dépend exclusivement des contrats publics des ports.

Les adaptateurs peuvent évoluer, être remplacés ou être multipliés sans
modifier les composants centraux.

## Conséquences

Les plateformes restent indépendantes des technologies externes.

Les tests peuvent utiliser des implémentations de test des ports.

L'ajout d'un nouveau fournisseur ou d'une nouvelle forge ne nécessite pas de
modifier le cœur de la plateforme.

Les intégrations externes deviennent remplaçables tout en conservant des
contrats stables.
