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
3. publier son lien de réservation ;
4. connaître ses prochaines demandes et décider rapidement ;
5. distinguer ses visites à domicile de ses rendez-vous en salon ;
6. comprendre son activité sans confondre prévision et encaissement.

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
- **Analytiques** : périodes 7 et 30 jours, prévision de CA, réservations,
  clients uniques, annulations, répartition par service et par type de visite.
- **Paramètres** : identité publique, horaires, déplacements, politique
  d'annulation, lieu professionnel et modes de rendez-vous. La zone de
  domicile du client ne fait jamais partie de ce formulaire.

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
```

Les anciens documents freelancer sont lus comme `appointmentMode: 'home'`.
Une réservation `chair` doit contenir un `workplaceSnapshot`; une réservation
`home` garde les protections actuelles d'adresse privée. L'adresse complète du
client reste exclusivement dans le document privé existant et n'est chargée
qu'après confirmation par le freelancer.

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
- La réponse accepter/refuser est conservée côté fonction, afin qu'un client ne
  puisse jamais confirmer sa propre demande ou voir une adresse avant décision.
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

Le test manuel final couvre la création d'un profil mixte, l'ajout de deux
créneaux de types différents, une réservation par type, l'acceptation d'une
visite à domicile, puis la lecture du calendrier et des analytiques.

## Déploiement et limites

Le travail est d'abord validé sur une Preview Vercel protégée. Les règles et
les Functions sont déployées uniquement vers l'alias Firebase `launch`
(`elitecuts-2fb0a`, région `europe-west1`). La production Vercel reste
inchangée jusqu'à une approbation explicite après la recette complète.
