# Espace indépendant : dashboard MVP opérationnel

## Objectif

Donner à un barbier indépendant un espace unique, clair et mobile, pour publier
son activité, recevoir des réservations à domicile ou en salon, organiser son
planning et comprendre son activité. Le MVP doit rester utilisable sans Stripe
ni nouveau projet Firebase.

## Décisions validées

- Le freelancer peut proposer **à domicile**, **en salon / fauteuil loué**, ou
  les deux.
- Le dashboard affiche à la fois les volumes (rendez-vous, clients,
  annulations) et une **prévision de chiffre d'affaires**.
- Aucune somme ne sera présentée comme encaissée tant que le paiement réel n'est
  pas activé.
- L'espace s'appuie sur le projet Firebase existant `elitecuts-2fb0a`, Firestore
  et les Cloud Functions existantes en `europe-west1`. Aucun nouveau projet ou
  prestataire backend n'est créé.
- Les paiements restent désactivés. Aucun lien Checkout ni collecte de carte ne
  doit être disponible dans ce parcours.

## Utilisateur et réussite

Le premier utilisateur est un barbier indépendant qui a déjà des clients. En
moins de dix minutes, il doit pouvoir :

1. compléter son profil et ses services ;
2. activer un ou deux modes de rendez-vous ;
3. publier et partager son lien de réservation ;
4. connaître ses prochaines demandes et décider rapidement ;
5. distinguer ses visites à domicile de ses rendez-vous en salon ;
6. voir ses avis vérifiés et comprendre son activité sans confondre prévision
   et encaissement.

La réussite du MVP est mesurée par la possibilité de faire le parcours complet
sans demander de formation ni révéler une adresse privée avant l'acceptation
d'une visite à domicile.

## Navigation et expérience

### Routes

Le dashboard freelance utilise des routes partageables :

- `/freelancer/overview`
- `/freelancer/calendar`
- `/freelancer/bookings`
- `/freelancer/services`
- `/freelancer/marketing`
- `/freelancer/analytics`
- `/freelancer/settings`
- `/b/:publicSlug` (page publique, sans authentification visible)

`/freelancer` redirige vers `/freelancer/overview`. Une route inconnue redirige
vers cette vue plutôt que d'afficher une page vide.

### Menu

Sur écran large, une sidebar fixe contient les sept entrées ci-dessus, le nom
du profil, l'état de publication et l'action « Voir mon profil public ». La
vue active est visible. Sur mobile, une barre basse donne accès à Accueil,
Calendrier, Réservations et Plus ; Plus affiche Services, Marketing,
Analytiques et Paramètres sans cacher les actions essentielles.

Chaque vue possède une seule action principale :

| Vue | Action principale |
| --- | --- |
| Vue d'ensemble | Ajouter un créneau |
| Calendrier | Ajouter une disponibilité |
| Réservations | Ouvrir la prochaine demande |
| Services | Ajouter un service |
| Marketing | Copier le lien de réservation |
| Analytiques | Changer la période |
| Paramètres | Enregistrer les modifications |

### Vues MVP

- **Vue d'ensemble** : prochaines réservations, demandes qui attendent une
  réponse, état du profil et trois indicateurs : prévision de CA, réservations
  confirmées et nouveaux clients.
- **Calendrier** : semaine lisible, bascule À domicile / En salon / Tous. Il
  affiche les créneaux ouverts et les réservations ; un créneau porte toujours
  son type.
- **Réservations** : filtres par type et statut. Une demande à domicile montre
  seulement la zone approximative avant acceptation. Un rendez-vous en salon
  montre le lieu professionnel. Les actions accept/refuse restent réservées au
  propriétaire du profil.
- **Services** : réutilise le catalogue actuel avec prix et ajoute une durée
  optionnelle par service pour le calendrier.
- **Marketing** : profil public, portfolio, liens sociaux, lien de réservation,
  QR code et carte de parrainage. Le portfolio garde sa modération existante.
  Le lien est généré depuis le domaine actuellement ouvert afin de rester juste
  sur une Preview puis sur le domaine de production.
- **Analytiques** : périodes 7 et 30 jours, prévision de CA, réservations,
  clients uniques, annulations, répartition par service et par type de visite.
- **Paramètres** : identité publique, horaires, déplacements, politique
  d'annulation, lieu professionnel et modes de rendez-vous. La zone de
  domicile du client ne fait jamais partie de ce formulaire.

### Page publique et réservation invitée

La page `/b/:publicSlug` est la destination du lien partagé dans une bio, un
message WhatsApp ou un QR code. Elle n'affiche que des informations que le
freelancer a publiées ou qui ont été approuvées par la plateforme : photo,
nom, ville, spécialités, portfolio, services avec prix et durée, modes de
rendez-vous, créneaux, liens sociaux et politique d'annulation.

Le visiteur sélectionne un service, le type `home` ou `chair`, puis un créneau.
Il saisit son nom, son e-mail et son téléphone ; l'adresse complète est demandée
seulement pour `home`. Il ne voit aucune étape de création de compte. Le client
obtient au dernier moment une session Firebase anonyme sécurisée, puis la
Function crée une demande de réservation. Cette identité temporaire est
utilisée pour les droits de lecture et d'annulation de cette demande ; elle ne
doit jamais être présentée comme un compte utilisateur au visiteur.

Les avis sont publics lorsqu'ils sont vérifiés et approuvés. Le freelancer voit
tous les avis associés à son profil dans Marketing, y compris leur état de
modération, mais ne peut ni les modifier ni les supprimer. Un visiteur ne voit
que la note moyenne, le nombre d'avis et les avis publics ; s'il n'y en a pas,
la page affiche « Nouveau sur Barberboard » sans inventer de note.

## Modèle de données compatible

Le modèle actuel traite les réservations d'un freelancer comme des visites à
domicile. Le changement doit rester rétrocompatible : les anciens documents
freelancer sans nouveau champ sont interprétés comme `home`.

### Profil freelance

`freelancerProfiles/{uid}` conserve les champs existants et ajoute de manière
optionnelle :

```ts
type FreelancerWorkModes = {
  home: boolean;
  chair: boolean;
};

type FreelancerWorkplace = {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
};

// Champs optionnels et rétrocompatibles
workModes?: FreelancerWorkModes;
availabilityByMode?: {
  home?: string[];
  chair?: string[];
};
workplace?: FreelancerWorkplace;
```

`availability` reste lu comme disponibilité `home` pour les profils déjà
créés. Les nouveaux créneaux sont enregistrés dans `availabilityByMode`; la
compatibilité avec `availability` est maintenue tant que des anciens profils
existent. Un profil ne peut être publié que s'il a au moins un service, un mode
activé, un créneau dans ce mode et, pour `chair`, un lieu professionnel complet.

### Réservation

`bookingRequests/{bookingId}` ajoute :

```ts
type AppointmentMode = 'home' | 'chair';

appointmentMode?: AppointmentMode;
serviceDurationMinutes?: number;
workplaceSnapshot?: FreelancerWorkplace;
guestBooking?: boolean;
```

Les anciens documents freelancer sont lus comme `appointmentMode: 'home'`.
Une réservation `chair` doit contenir un `workplaceSnapshot`; une réservation
`home` garde les protections actuelles d'adresse privée. L'adresse complète du
client reste exclusivement dans le document privé existant et n'est chargée
qu'après confirmation par le freelancer.

### Projection publique, avis et lien

La projection `publicProfiles/freelancer__{uid}` ajoute les champs publics
strictement nécessaires à la page bio : `publicSlug`, les éléments de service
avec leur nom, prix et durée, les deux modes de visite, le lieu professionnel
pour `chair`, les liens sociaux autorisés et un résumé d'avis. L'adresse du
domicile du freelancer, les coordonnées exactes, les données des clients et les
adresses de visite ne sont jamais projetées.

Les avis sont stockés côté serveur dans `freelancerReviews/{reviewId}`. Chaque
avis contient un `bookingId`, le `freelancerId`, une note de 1 à 5, un texte
facultatif, un nom public minimisé (prénom et initiale) et un état de
modération. La Function accepte un avis uniquement pour le client associé à une
réservation `completed`, une fois par réservation. La projection publique ne
contient que les avis `approved` et une moyenne calculée à partir d'eux.

### Analytiques

Les métriques du MVP sont dérivées côté client à partir des réservations que le
freelancer a déjà l'autorisation de lire. La prévision additionne
`totalPriceMinor` des réservations `confirmed` et `completed` sur la période
sélectionnée. Les demandes en attente, refusées, annulées et en erreur de
paiement sont exclues. Le libellé est toujours « Prévision de CA ».

Cette approche évite une nouvelle collection d'agrégats et reste suffisante
pour le pilote. Des agrégats côté serveur ne seront ajoutés qu'après validation
de l'usage réel.

## Sécurité et règles

- Les règles Firestore continuent d'isoler un profil, ses réalisations et ses
  réservations par `ownerId` et `ownerType`.
- Les règles valident les nouveaux champs : seuls `home` et `chair` sont
  acceptés ; un snapshot de lieu est obligatoire pour `chair` ; aucun champ
  d'adresse client privée ne peut être écrit dans une réservation publique.
- La Cloud Function de création de réservation vérifie le mode demandé, le
  créneau disponible, le profil publié et le prix du service côté serveur.
- La création invitée exige une session Firebase anonyme ; la Function limite
  les champs, crée une demande serveur et marque celle-ci `guestBooking: true`.
  L'authentification anonyme doit être activée dans Firebase Authentication.
- Avant de distribuer le lien publiquement, App Check avec reCAPTCHA doit être
  configuré et activé pour les appels publics. Sans cette mesure anti-robots,
  le flux invité reste limité aux tests et au pilote accompagné.
- La réponse accepter/refuser est conservée côté fonction, afin qu'un client ne
  puisse jamais confirmer sa propre demande ou voir une adresse avant décision.
- La création, publication, modification et modération des avis est
  exclusivement côté Function ; le navigateur ne peut pas écrire directement
  dans `freelancerReviews`.
- Aucun rôle administrateur, paiement ou accès cross-tenant n'est ajouté.

## États, erreurs et texte utilisateur

- Sans créneau ou sans service, l'interface propose une action directe pour
  terminer la configuration ; elle ne dit pas que le profil est publié.
- Sans réservation, chaque vue affiche un état vide avec l'action utile
  correspondante, jamais une page blanche.
- Un échec Firestore ou Function conserve les modifications locales et montre
  un message explicite avec une action Réessayer.
- Les réservations ne sont jamais dupliquées lors d'un double clic ou d'une
  reconnexion : l'identifiant de requête et la vérification serveur restent la
  source de vérité.

## Hors périmètre MVP

- Stripe, remboursements, acompte collecté et caisse.
- CRM complet avec notes privées détaillées et campagnes clients.
- Chat interne, rappels SMS payants, réservations récurrentes et synchronisation
  Google Calendar.
- Plusieurs lieux professionnels pour un même freelancer.
- Analytique financière d'encaissement, marge ou fiscalité.

## Plan de tests attendu

Les tests automatisés doivent vérifier au minimum :

1. le parseur lit un ancien profil et une ancienne réservation comme `home` ;
2. une réservation `chair` sans lieu professionnel est rejetée ;
3. une réservation `home` ne révèle pas l'adresse client avant confirmation ;
4. la prévision de CA inclut seulement `confirmed` et `completed` ;
5. le calcul de clients uniques ne compte pas deux fois le même client ;
6. la navigation accepte uniquement les sept vues freelance ;
7. une règle Firestore bloque l'accès d'un autre utilisateur aux données du
   freelancer.
8. un lien public ne renvoie jamais une adresse privée ni un contact client ;
9. une réservation invitée reçoit une session anonyme et ne peut pas réserver
   deux fois le même créneau ;
10. un avis est refusé sans réservation terminée, ou si un avis existe déjà
    pour la même réservation.

Le test manuel final couvre la création d'un profil mixte, l'ajout de deux
créneaux de types différents, la copie du lien public, une réservation invitée
par type, l'acceptation d'une visite à domicile, puis la lecture du calendrier,
des analytiques et des avis vérifiés.

## Déploiement et limites

Le travail est d'abord validé sur une Preview Vercel protégée. Les règles et
les Functions sont déployées uniquement vers l'alias Firebase `launch`
(`elitecuts-2fb0a`, région `europe-west1`). La production Vercel reste
inchangée jusqu'à une approbation explicite après la recette complète.
