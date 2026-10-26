# DS STORE

Boutique locale aux Cayes pour le Grand Sud d’Haïti. **Tout sa w bezwen, pi pre w.**

Front-end React, TypeScript et Tailwind CSS, disponible en français et en créole haïtien. Interface responsive, illustrations SVG locales légères, administration et génération de factures PDF chargées à la demande.

## Démarrer

Node.js 22.12 ou supérieur (Node.js 24 recommandé).

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
```

La compilation génère `dist/`. L’application peut être hébergée sur un serveur statique HTTPS. Les vues d’administration et de suivi utilisent des fragments d’URL, sans routage serveur supplémentaire.

## Essayer le front-end

Sans configuration Supabase, un **mode de démonstration explicite** est activé. Les modifications et les commandes de test restent dans le stockage de ce navigateur. Aucun achat, paiement ou engagement de livraison réel n’est effectué. Utiliser des coordonnées fictives et ne pas saisir de données sensibles dans la démonstration.

- Catalogue : recherche bilingue, catégories, tri, nouveautés, promotions, petits prix et fiches partageables.
- Panier : quantités, stocks, suppression et commande sans compte.
- Administration : bouton « Configurer la démo » ou `/#admin`. Produits, stocks, coûts, zones, paiements, promotions, livreurs et coordonnées modifiables.
- Commandes de test : statuts, affectation, confirmation de paiement, preuve de remise, historique, facture PDF et rapports CSV.
- Suivi : référence et clé privée fournies après la simulation. Le suivi de test fonctionne dans le navigateur d’origine.

Les neuf communes sont **inactives au départ**. Pour tester une commande, configurer une zone (délai, frais, conditions) ou activer un point de retrait avec adresse et horaires, puis activer et valider une procédure de paiement à la remise ou manuelle. Le numéro WhatsApp, l’adresse et les horaires sont modifiables dans **Administration → Paramètres**. MonCash et NatCash restent verrouillés.

Le bouton de réinitialisation dans les paramètres restaure les données de démonstration ; il ne touche pas à une base Supabase.

Guide détaillé : [docs/FRONTEND.md](docs/FRONTEND.md).

## Brancher Supabase ultérieurement

Le front-end peut appeler Supabase via le client centralisé `src/lib/api.ts`. Les migrations et tests SQL sont fournis dans `supabase/`, avec leur procédure dans [supabase/README.md](supabase/README.md).

1. Créer un projet Supabase et appliquer la migration après vérification dans un environnement de test.
2. Créer le compte administrateur Supabase Auth et lui attribuer les droits depuis un accès de confiance à la base.
3. Copier `.env.example` vers `.env` et renseigner `VITE_SUPABASE_URL` et la clé **publique** `VITE_SUPABASE_ANON_KEY`.
4. Recompiler, vérifier les politiques d’accès et les parcours de commande avant ouverture réelle.

Ne jamais placer de clé `service_role`, clé secrète ou identifiant marchand dans une variable `VITE_*` : ces variables sont publiques. Les erreurs du backend configuré ne basculent jamais silencieusement vers une fausse commande locale. Aucun catalogue de démonstration n’est injecté en production.

Les prix, stocks et frais d’une commande réelle sont recalculés par les fonctions SQL transactionnelles ; les données de l’acheteur et les coûts ne sont pas exposés dans le catalogue public. Les intégrations MonCash et NatCash nécessitent de vrais adaptateurs serveur, identifiants marchands et essais techniques avant activation. Aucune intégration électronique active n’est livrée dans cette étape front-end.

## Vérifications

Les tests couvrent les règles de commande, les stocks, l’idempotence, les zones inactives, les promotions, les paiements, le suivi privé et les interactions principales de l’interface. Les tests SQL nécessitent une instance Supabase de test et sont distincts des tests du front-end. Aucun branchement Supabase ni paiement marchand n’a été validé dans cet environnement.
