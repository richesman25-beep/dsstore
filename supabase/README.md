# Préparation Supabase

Ces fichiers préparent le futur branchement du backend. **La migration et les tests SQL n’ont pas été exécutés sur une instance Supabase dans cette étape front-end.** Les valider dans un projet de test avant toute ouverture commerciale.

## Installation ultérieure

1. Créer un projet Supabase et conserver ses secrets côté serveur.
2. Appliquer `migrations/202610250001_dsstore.sql` avec le rôle de migration, via Supabase CLI ou le SQL Editor. La migration suppose la présence des rôles Supabase `anon`, `authenticated` et du schéma `auth`.
3. Créer un utilisateur administrateur dans Supabase Auth.
4. Depuis le SQL Editor, attribuer son rôle avec son véritable identifiant UUID :

```sql
insert into public.admin_users(user_id)
values ('UUID_REEL_DE_L_UTILISATEUR_AUTH');
```

Cette attribution doit rester une opération de confiance ; aucun utilisateur ne peut se déclarer administrateur depuis le navigateur.

5. Renseigner `VITE_SUPABASE_URL` et la clé **publique** `VITE_SUPABASE_ANON_KEY` dans l’environnement de compilation et reconstruire le front-end.
6. Ajouter les vrais produits puis configurer les coordonnées, zones, procédures de paiement et livreurs depuis l’administration.

La migration initialise les catégories et les neuf communes du département du Sud, toutes **inactives**, sans inventer de catalogue, de contact ou de point de retrait en production. MonCash et NatCash sont bloqués par une contrainte de base jusqu’à l’ajout d’une intégration serveur techniquement validée.

## Fonctions utilisées par le front-end

- `get_catalog()` : catalogue public, sans coûts d’achat.
- `place_order(p_payload jsonb)` : validation transactionnelle, prix et frais recalculés, verrouillage des stocks et idempotence.
- `track_order(p_reference text, p_token text)` : suivi avec référence et clé privée, sans coordonnées client ni coûts.
- `is_admin()` et `admin_get_data()` : vérification du rôle et chargement de l’administration.
- `admin_save_product(p_payload jsonb)` et `admin_update_order(p_order_id uuid, p_payload jsonb)` : mutations protégées avec historique.

Les autres réglages utilisent des tables protégées par des politiques RLS. Les coûts d’achat sont séparés des produits publics. Les commandes et l’historique n’ont pas d’accès public direct. Les clés de suivi sont vérifiées par empreinte cryptographique.

## Tests SQL à exécuter

`tests/commerce.sql` utilise une transaction avec annulation et une instance de test comportant cette migration. L’exécuter avec un rôle disposant des permissions nécessaires ; ne pas le lancer sur une boutique en exploitation. Il vérifie notamment les restrictions publiques, la validation des commandes, l’idempotence, les stocks et les opérations administratives.

Avant ouverture réelle, vérifier aussi la concurrence de commande, les politiques RLS avec les rôles anonymes et authentifiés, le suivi, la sauvegarde et la restauration, et les paiements dans un environnement marchand de test. Le mode de démonstration du front-end reste distinct de ces vérifications.
