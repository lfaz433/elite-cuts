# MVP — recette de prévisualisation

Utiliser cette recette uniquement sur l’URL Vercel de prévisualisation reliée
au projet Firebase `elitecuts-2fb0a`. Ne pas valider la production tant que les
sept scénarios ci-dessous ne sont pas terminés avec des comptes de test.

## Préconditions

- Le fichier Vercel Preview contient les sept variables publiques `VITE_FIREBASE_*`.
- Cloud Firestore est créé en multi-région `eur3` et l’authentification
  e-mail/mot de passe est activée.
- Les Functions sont déployées dans `europe-west1`.
- App Check reste désactivé sauf si une clé reCAPTCHA v3 valide est configurée.

## Scénarios à valider

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
- SHA Vercel testé :
- Date et testeur :
- Anomalies bloquantes :
- Accord explicite de passage en production :
