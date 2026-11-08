# Démo interactive — dashboard du barbier indépendant

## Objectif

Transformer `/freelancer-preview` en démonstration interactive du véritable
espace de travail d'un barbier indépendant. Le parcours doit permettre à un
prospect de comprendre immédiatement comment il organise sa journée, règle ses
disponibilités, traite ses demandes et partage sa page de réservation, sans
connexion ni écriture vers Firebase.

Cette démo est un outil de vente et de recette UX. Elle ne remplace pas le
dashboard authentifié `/freelancer/*` et ne modifie aucune donnée de production.

## Utilisateur et réussite

Le premier utilisateur est un barber freelance qui possède déjà des clients.
En moins de trois minutes, il doit pouvoir :

1. voir les rendez-vous et demandes qui comptent aujourd'hui ;
2. ajouter un créneau en choisissant visuellement un jour, une plage horaire
   et un mode de rendez-vous ;
3. répondre à une demande et constater le changement d'état ;
4. retrouver ses services, son lien de réservation, son QR code, son portfolio
   et ses avis ;
5. comprendre ce qui reste accessible sur un écran de téléphone.

La réussite est une démo navigable, lisible et responsive, qui ne présente
jamais les données d'exemple comme des données réelles du compte.

## Périmètre et limites

- Données exclusivement locales en mémoire de navigateur, réinitialisées au
  rechargement de la page.
- Aucun appel Firebase, Cloud Function, paiement, email, notification push ou
  écriture réseau n'est déclenché par la démo.
- Les notifications sont des événements d'exemple manipulables dans l'interface.
- Les liens publics affichés dans la démo sont étiquetés comme exemples et ne
  doivent pas prétendre qu'un profil est réellement publié.
- Le dashboard authentifié existant, ses routes et ses protections de données
  restent inchangés.

## Navigation et responsive

### Ordinateur

Une sidebar fixe présente les groupes suivants :

| Groupe | Onglets |
| --- | --- |
| Gérer mon activité | Accueil, Planning, Réservations, Services & tarifs |
| Développer mon activité | Ma vitrine, Statistiques |
| Compte | Paramètres |

L'en-tête de contenu contient l'identité de démonstration, l'état du profil et
une cloche de notifications avec badge. La vue active est toujours visible.

### Téléphone

La navigation basse conserve les actions fréquentes : Accueil, Planning,
Réservations et Plus. Plus ouvre Services & tarifs, Ma vitrine, Statistiques et
Paramètres. La feuille se ferme après la navigation et avec Échap. Les boutons
restent atteignables au-dessus de la zone de sécurité mobile.

## Vues de la démo

### Accueil — Aujourd'hui

La première vue privilégie l'opérationnel :

- prochain rendez-vous et chronologie de la journée ;
- demandes en attente avec action de réponse ;
- disponibilité du jour ;
- indicateurs secondaires : nombre de rendez-vous, prévision de CA et taux de
  réponse ;
- actions rapides : ajouter une disponibilité, bloquer un créneau et ouvrir le
  lien de réservation.

Sans rendez-vous, une vue vide explique l'action utile au lieu d'afficher une
zone blanche.

### Planning et disponibilités

Le planning hebdomadaire remplace la saisie technique de dates par une
interaction visuelle :

1. choisir un ou plusieurs jours ;
2. choisir heure de début et heure de fin ;
3. choisir le mode `À domicile` ou `En salon` ;
4. ajouter la disponibilité ou bloquer un créneau personnel.

Les créneaux sont distingués visuellement : disponible, réservé, en attente et
bloqué. L'utilisateur peut supprimer une disponibilité de démo ou modifier une
plage avant de la confirmer. Les créneaux qui se chevauchent sont refusés avec
un message clair ; aucune donnée n'est perdue en cas de saisie invalide.

### Réservations

Les demandes en attente sont en tête de liste. Les actions Accepter, Refuser et
Terminer mettent immédiatement à jour l'état local, les cartes associées et le
badge de notifications. Un filtre de statut et un filtre de mode restent
utilisables sans masquer l'action suivante importante.

### Services & tarifs

Le barber peut ajouter, modifier ou retirer un service d'exemple avec son prix
et sa durée. Toute modification affecte immédiatement les cartes de synthèse
sans impliquer un catalogue réel.

### Ma vitrine

Cette vue contient un lien de réservation d'exemple, un QR code, le portfolio,
les réseaux sociaux et les avis. Les avis sont visibles par le barber, mais la
démo n'offre pas de modification d'avis. Les actions copier et ouvrir le lien
produisent un retour accessible et explicite.

### Statistiques et paramètres

Les statistiques montrent une prévision, jamais un encaissement : rendez-vous,
services demandés et activité récente. Les paramètres regroupent identité,
services proposés, modes de rendez-vous, règles d'annulation et préférences de
notifications de démonstration.

## Notifications de démonstration

La cloche affiche un badge uniquement pour les événements non lus. Le panneau
contient : nouvelle demande, rendez-vous à confirmer, annulation et rappel. Une
notification peut être ouverte, marquée comme lue ou toutes marquées comme
lues. Son appel à l'action bascule vers l'onglet pertinent. Aucune permission
du navigateur ni email réel n'est demandé dans cette démo.

## Architecture proposée

Un composant de démo isolé porte l'état local et fournit les données de profil,
planning, réservations, services et notifications à des sous-vues présentées
dans une coque de dashboard partagée. Les composants de démonstration ne
doivent pas importer Firebase, Auth, Tenant, Firestore ou Cloud Functions.

Les routes de prévisualisation existantes continuent de se charger sans
configuration Firebase. Le code réutilise les primitives visuelles du
workspace lorsque celles-ci n'impliquent pas de dépendance réseau ; les actions
de démo sont injectées par props et clairement séparées des mutations réelles.

## Accessibilité et erreurs

- La navigation active utilise `aria-current="page"`.
- La cloche, le panneau de notifications et Plus ont un libellé accessible,
  l'état étendu/replié et une fermeture clavier.
- Les actions qui modifient l'état de démo annoncent leur résultat par une zone
  de statut, sans recourir uniquement à la couleur.
- Les contrôles de disponibilité possèdent labels, valeurs minimales et message
  de chevauchement associé au champ.
- Les layouts étroits n'ont ni débordement horizontal ni action essentielle
  cachée derrière la navigation basse.

## Tests et recette

Les tests automatisés couvriront au minimum :

1. le chargement de `/freelancer-preview` sans importer Firebase ;
2. les groupes desktop et les quatre entrées mobile ;
3. l'ajout d'une disponibilité avec jour, début, fin et mode ;
4. le rejet d'un chevauchement ;
5. la réponse à une demande et la mise à jour de son statut ;
6. le badge et la lecture des notifications ;
7. l'absence d'appel réseau ou d'écriture Firebase depuis la démo.

La recette manuelle couvrira largeur mobile et desktop, navigation par clavier,
états vides, actions rapides, disponibilité, demande, vitrine et statistiques.

## Hors périmètre de cette itération

- Envoi d'email réel vers `aimenmazouz@gmail.com`.
- Demande de permission de notification navigateur.
- Synchronisation avec Google Calendar, SMS, email ou paiement.
- Modification des règles Firestore, Functions, comptes Firebase ou Vercel.
- Changement des comportements de production du dashboard authentifié.
