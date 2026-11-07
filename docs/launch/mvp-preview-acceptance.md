# MVP — recette de prévisualisation

Utiliser cette recette uniquement sur l’URL Vercel **Preview** reliée au projet
Firebase `elitecuts-2fb0a`, avec des comptes et coordonnées fictifs. Toutes les
cases sont des vérifications à effectuer, pas une preuve de recette déjà faite.
Le [scénario d’expérience freelance](freelancer-user-experience-scenario.md)
est le parcours humain de référence. Toute anomalie de sécurité ou étape
bloquante empêche l’ouverture de la Preview au public. La production exige une
décision distincte après la recette.

Ce document ne déploie rien et n’autorise pas à lui seul un déploiement Firebase
ou Vercel, une modification de console ou un paiement. Les étapes de
configuration ci-dessous sont des prérequis pour l’opérateur autorisé.

## Préconditions

- [ ] Consigner l’URL Preview exacte, le SHA testé et le projet Firebase.
  Vérifier la configuration publique de l’application Web Firebase : API key,
  auth domain, project ID, storage bucket, messaging sender ID et app ID ;
  measurement ID est facultatif. Ne jamais consigner de secret ou jeton.
- [ ] Cloud Firestore est en multi-région `eur3` ; les Functions de cette
  révision sont disponibles dans `europe-west1`. Les règles et index requis
  sont appliqués au projet Firebase testé.
- [ ] Dans Firebase Authentication, activer **Anonyme (Anonymous)** pour la
  réservation sans inscription visible, en plus d’e-mail/mot de passe pour
  le freelance. Vérifier les domaines autorisés d’Authentication pour la Preview.
- [ ] Enregistrer l’application Web dans Firebase App Check avec le fournisseur
  **reCAPTCHA v3**. Le domaine autorisé reCAPTCHA doit contenir le **hostname
  Preview exact** testé, sans protocole ni chemin ; un domaine de production ou
  une autre Preview ne suffit pas. Vérifier à nouveau lors d’un changement d’URL.
- [ ] Dans les variables Vercel, sélectionner **Preview uniquement** et définir
  `VITE_FIREBASE_APPCHECK_ENABLED=true` ainsi que
  `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY=<clé publique du site reCAPTCHA v3>`.
  Reconstruire la Preview : Vite lit ces valeurs à la compilation. Ne pas activer
  ces valeurs dans Development ou Production pour cette recette. Les valeurs
  locales par défaut restent `false` et une clé vide, comme dans `.env.example`.
- [ ] Aucun jeton debug App Check ni contournement n’est actif sur cette Preview.
  La clé de site reCAPTCHA est publique ; aucune clé secrète reCAPTCHA, clé de
  compte de service ou autre secret ne doit apparaître dans les variables
  `VITE_*`, les captures réseau conservées ou les preuves de recette.
- [ ] Vérifier les protections de la callable `requestPublicFreelancerBooking` :
  App Check obligatoire, consommation du jeton et rejet d’un jeton déjà consommé.
  Ne pas désactiver ces protections pour faire passer un test.

## Barrière App Check et session invitée

Exécuter sur l’hôte Preview exact, avec le réseau du navigateur ouvert et des
créneaux fictifs distincts. Utiliser une session anonyme Firebase valide ; cela
isole le rejet App Check d’un simple échec d’authentification.

1. Ouvrir `/b/:slug` en navigation privée sans compte connecté. Soumettre une
   demande valide : une session anonyme se crée sans écran d’inscription, la
   callable régionale reçoit un jeton App Check et retourne une seule demande
   `pending`. Garder cette session pour le suivi et l’avis ; effacer les données
   du navigateur ne garantit pas de retrouver une identité anonyme.
2. Avec les outils réseau, reproduire un appel de test valide vers
   `https://europe-west1-elitecuts-2fb0a.cloudfunctions.net/requestPublicFreelancerBooking`
   en gardant le jeton Authentication et le corps callable `{ "data": ... }`,
   mais en retirant `X-Firebase-AppCheck`. Utiliser un nouvel identifiant de
   requête. Attendre un rejet de sécurité (`UNAUTHENTICATED` ou refus App Check),
   aucune demande créée et aucun créneau réservé. Une réponse CORS, réseau ou
   de validation métier seule n’est pas une preuve suffisante.
3. Répéter avec `X-Firebase-AppCheck: invalid-token` : même rejet et aucune
   écriture. Réutiliser ensuite le jeton App Check déjà consommé lors d’un appel
   réussi : il doit être refusé lui aussi. Le test de double soumission métier
   utilise, lui, un nouveau jeton valide et le même identifiant de requête.
4. Rétablir le flux normal avec un jeton frais : une demande valide doit réussir.
   Vérifier les rejets et l’absence d’écriture avec les journaux/lectures
   d’administration autorisés. Ne pas ouvrir les collections au navigateur.
   Consigner seulement les résultats et des références de test non sensibles.

Si Anonymous Auth, la configuration reCAPTCHA, l’émission du jeton ou son rejet
ne sont pas vérifiés, la réservation publique reste bloquée pour le lancement.

## Isolation Firestore : preuve locale obligatoire

Exécuter avant la recette distante :

```bash
npm run test:rules
node --experimental-strip-types --test src/app/lib/firebaseEnvironment.test.mjs
npx jest rules-tests/function-region.test.cjs --runInBand
npm --prefix functions run build
npm run build
```

Conserver les sorties et codes de retour. Un test bloqué ou une compilation en
échec ne vaut pas validation ; toute dérogation doit être consignée avant un
accord de lancement. Les tests de règles doivent utiliser le vrai Emulator
Firestore local. Si le lanceur habituel est indisponible, démarrer l’Emulator
local puis exécuter les mêmes tests REST :

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 node --test rules-tests/freelancer-public-security.test.cjs rules-tests/freelancer-reviews.rules.test.cjs
```

Ce repli prouve les règles uniquement ; il ne remplace pas les autres tests ou
les builds. `FREELANCER_RULES_MUTATION` doit être absent d’une exécution de
validation : ce contrôle négatif charge volontairement des règles non sûres
uniquement en mémoire de l’Emulator et doit échouer.

Les preuves doivent couvrir les visiteurs non connectés, invités anonymes,
clients, freelances propriétaires et tiers, ainsi que les revendications admin :
seul le freelance lit son propre avis et sa requête filtrée d’inbox. Aucun
navigateur ne lit/écrit `publicProfileSlugs`, `publicProfiles` ou
`bookingRequestPrivate`, ni ne crée/modifie/supprime `freelancerReviews` ou
`bookingRequests`. Le client et le freelance concernés peuvent lire la demande
minimisée. Les pages publiques passent par les callables ; les collections non
autorisées restent refusées par défaut.

## Recette freelance de bout en bout

| Parcours | Résultat attendu | État |
| --- | --- | --- |
| Configuration | Amine configure ses services, tarifs, durées, modes, lieu professionnel et créneaux ; les états vides ne prétendent pas que le profil est publié. | ☐ |
| Lien direct | `/b/:slug` s’ouvre et se recharge en navigation privée, sans administration ni connexion visible. Un slug inconnu ou un profil caché ne révèle aucune donnée. | ☐ |
| Modes domicile / fauteuil / mixte | Tester chaque configuration. Seuls les modes activés et leurs créneaux libres sont proposés ; prix, durée, lieu professionnel et annulation sont lisibles avant confirmation. | ☐ |
| Au fauteuil | Nom, e-mail et téléphone suffisent ; aucune adresse personnelle client n’est demandée, transmise ou stockée. La demande conserve le lieu professionnel au moment de la réservation. | ☐ |
| À domicile et confidentialité | La zone approximative est visible avant acceptation ; l’adresse exacte reste hors des projections, listes et réponses publiques. Seul le freelance concerné peut l’obtenir via la callable après acceptation. Un autre client/freelance et un accès Firestore direct sont refusés. | ☐ |
| Double envoi / incident réseau | Deux clics ne créent qu’une demande. Après réponse réseau incertaine, réessayer les mêmes données conserve l’identifiant et retourne la même demande avec un jeton frais ; changer les données produit un nouvel identifiant. Ne pas attendre de persistance des données après fermeture/effacement de la session. | ☐ |
| Créneau concurrent | Deux visiteurs demandent le même créneau : une seule demande réussit ; l’autre reçoit une erreur compréhensible et choisit un autre créneau. | ☐ |
| Traitement | Le freelance accepte/refuse et termine la demande ; les listes se mettent à jour. Refus/annulation ne rouvre un créneau que s’il est toujours configuré pour le même mode. | ☐ |
| Avis vérifié | Dans la même session client, un rendez-vous freelance terminé permet une note de 1 à 5 et un texte facultatif ; un seul avis par rendez-vous. Un autre client, un rendez-vous non terminé ou salon sont refusés. Le freelance lit uniquement son inbox et ne peut modifier, masquer ou supprimer l’avis. | ☐ |
| Confidentialité des avis | Le profil public présente un prénom minimisé sans e-mail/téléphone/adresse ni document source. Zéro avis affiche « Nouveau sur Barberboard », sans note inventée. | ☐ |
| Partage et QR | Depuis Marketing, copier le lien et ouvrir le profil ; le QR est affiché à côté de ces actions. Le scanner avec un second appareil ouvre exactement le lien Preview prévu. Aucun export/téléchargement du QR n’est requis pour ce MVP. | ☐ |
| Desktop | La sidebar mène aux sept vues : Accueil, Calendrier, Réservations, Services, Marketing, Analytiques, Paramètres. Vérifier focus clavier, libellés et filtres de mode/statut. | ☐ |
| Mobile | La navigation du bas donne accès aux mêmes sept vues ; tester un écran étroit, le formulaire, les messages d’erreur et la confirmation sans débordement ni action cachée. | ☐ |
| Sans paiement | Accueil/Analytiques parlent de « Prévision de CA » ; aucun écran ne présente ce montant comme encaissé, ni ne demande carte, paiement ou Stripe. | ☐ |

## Parcours existants à vérifier sans régression

| Parcours | Résultat attendu | État |
| --- | --- | --- |
| Freelance | Créer un compte freelance, compléter son profil, ajouter un service et publier son lien de réservation. | ☐ |
| Client | Ouvrir le lien public, choisir une prestation et envoyer une demande de créneau. | ☐ |
| Salon | Créer un salon, définir les prestations et disponibilités, accepter ou refuser une réservation. | ☐ |
| Multi-salon | Créer une marque, ajouter une localisation et vérifier que les données de chaque salon restent séparées. | ☐ |
| Parrainage | Créer un code, ouvrir le lien public, puis vérifier qu’une visite est comptabilisée sans exposer de données privées. | ☐ |
| Autorisations | Essayer un accès avec un client, un membre d’équipe et un propriétaire ; chaque rôle ne voit que son périmètre. | ☐ |
| Fonctions publiques | Vérifier les listes/profils publics, les demandes de réservation et l’absence d’erreur de région dans le navigateur. | ☐ |

## Décision de lancement

- URL Preview testée :
- Hostname reCAPTCHA v3 enregistré :
- Application Web / projet Firebase vérifiés :
- SHA Vercel testé :
- Date et testeur :
- Références des preuves Emulator, tests, builds et App Check (sans jeton) :
- Scénario freelance effectué, appareils/navigateurs et résultats :
- Anomalies bloquantes :
- Vérifications non exécutées / dérogations explicites :
- Décision d’ouverture de la Preview :
- Accord explicite de passage en production :
