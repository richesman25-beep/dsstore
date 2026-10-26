# DS STORE — prise en main du front-end

La boutique est conçue pour les habitants du Grand Sud d’Haïti : interface en français et en créole haïtien, prix en gourdes, panier, adresse descriptive avec point de repère, téléphone haïtien, livraison ou retrait et suivi de commande.

## Mode de démonstration

Sans configuration Supabase, l’application utilise un catalogue d’illustration. Les opérations disponibles dans ce mode sont des **simulations locales**, enregistrées dans le navigateur utilisé. Elles ne transmettent aucune commande à la boutique, ne réservent aucun stock réel et n’effectuent aucun paiement.

Les prix, produits et visuels du catalogue de démonstration servent à présenter l’interface. Ils ne constituent pas une offre commerciale réelle. Les illustrations SVG sont intégrées au projet, sans téléchargement de police ni bibliothèque d’images distante.

Les essais réalisés dans un navigateur ne sont pas partagés avec un autre appareil. Effacer les données du navigateur ou réinitialiser la démonstration efface ces essais. Éviter de saisir des coordonnées personnelles réelles pendant les tests.

## Modifier les informations de la boutique

Ouvrir l’administration de démonstration, puis les paramètres de la boutique. Les champs permettent de renseigner et de modifier :

- le numéro WhatsApp haïtien de la boutique ;
- l’adresse exacte du point de retrait aux Cayes ;
- les horaires de retrait ;
- l’activation du retrait.

Aucun numéro WhatsApp réel ni aucune adresse précise n’est inventé. Le contact ne devient disponible qu’après la saisie d’un numéro valide. L’adresse et les horaires doivent être renseignés avant de proposer le retrait.

## Tester la livraison

Les neuf communes initiales sont prévues dans les données : Les Cayes, Torbeck, Port-Salut, Camp-Perrin, Chantal, Maniche, Aquin, Saint-Louis-du-Sud et Cavaillon.

Les zones démarrent **inactives**. Dans l’administration, renseigner une zone, ses frais en gourdes, son délai estimé, son minimum éventuel et ses conditions, puis l’activer. Une zone inactive ne doit jamais être présentée au client comme une destination desservie.

En mode de démonstration, l’activation sert uniquement aux essais dans le navigateur. Elle n’engage pas DS STORE à livrer réellement une commune.

## Tester un parcours de commande

1. Dans l’administration de démonstration, configurer un retrait ou activer une zone de test et un mode de paiement manuel ou à la livraison.
2. Retourner à la boutique, choisir un produit et l’ajouter au panier.
3. Renseigner les informations de test demandées et vérifier les frais affichés.
4. Lancer la simulation et conserver sa référence et son code de suivi.
5. Ouvrir l’administration pour faire évoluer la commande de test et consulter son historique.

MonCash et NatCash restent désactivés tant qu’une véritable intégration serveur n’a pas été configurée et validée. Une animation de paiement ou un bouton actif ne remplace pas cette validation.

## Branchement de Supabase ultérieur

Le fichier `.env.example` indique les deux variables publiques nécessaires au front-end : l’URL Supabase et la clé publique `anon` ou `publishable`. La clé `service_role` et les autres secrets ne doivent jamais être placés dans le code du navigateur.

La mise en service réelle nécessite aussi l’application des migrations, la création du compte administrateur, la vérification des règles d’accès et des parcours de commande, puis la configuration des produits, stocks, zones, coordonnées et paiements réels. Les données locales de démonstration ne sont pas importées automatiquement dans la boutique réelle.

Le passage en production doit être vérifié avec la base Supabase réellement utilisée ; les seuls tests du front-end ne prouvent pas qu’un paiement externe ou une livraison physique fonctionne.
