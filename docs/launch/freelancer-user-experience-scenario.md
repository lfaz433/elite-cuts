# Scénario d'expérience utilisateur — barbier indépendant

Ce scénario sert de recette humaine ; ses objectifs de temps et ses étapes
restent à vérifier sur une Preview configurée. Suivre les prérequis et consigner
les résultats dans la [recette de prévisualisation](mvp-preview-acceptance.md).
Il ne constitue pas une preuve de recette ni une autorisation de déploiement.

## Personnage pilote

**Amine** est un barbier indépendant. Il a déjà des clients, travaille certains
jours à domicile et certains jours dans un fauteuil loué. Il veut un lien
simple à mettre dans sa bio Instagram, sans devoir expliquer le système à ses
clients et sans exposer son adresse personnelle.

## Le résultat attendu

En moins de dix minutes, Amine doit pouvoir créer une offre claire, publier
son lien et recevoir une première demande. Un client doit pouvoir réserver en
moins de deux minutes, sans voir de création de compte ni de paiement.

## Parcours 1 — Amine configure son activité

1. Amine se connecte et arrive sur **Accueil**.
   - Il voit une courte checklist : ajouter ses services, choisir ses modes de
     rendez-vous, ajouter des créneaux, puis partager son lien.
   - L'écran vide ne prétend jamais que son profil est déjà public.

2. Il ouvre **Services**.
   - Il ajoute « Coupe classique — 25 € — 30 min » puis « Coupe + barbe —
     35 € — 45 min ».
   - Chaque ligne montre le prix et la durée ; il peut modifier ou supprimer
     uniquement son propre service.

3. Il ouvre **Paramètres**.
   - Il choisit son identifiant public, par exemple `amine-fade`, et ajoute
     l'URL de sa photo ainsi que ses réseaux sociaux.
   - Il active « À domicile » et « En salon / fauteuil loué ».
   - Pour le fauteuil, il renseigne seulement le nom et l'adresse commerciale
     du lieu. Son adresse personnelle n'est jamais demandée ni affichée.
   - Il choisit une politique d'annulation et enregistre.

4. Il ouvre **Calendrier**.
   - Il ajoute un créneau à domicile mardi à 10 h et un créneau au fauteuil à
     14 h.
   - Chaque créneau a un badge visible : `À domicile` ou `Au fauteuil`.
   - Les filtres Tous / Domicile / Fauteuil permettent de comprendre la
     semaine immédiatement.

5. Il ouvre **Marketing**.
   - Il retrouve sa photo et ses réseaux sociaux, puis ajoute son portfolio.
   - Il peut revenir aux Paramètres pour modifier son identité publique.
   - Une fois le profil visible, il peut copier un lien tel que
     `/b/amine-fade` et l'ouvrir ; un QR code est affiché à côté pour être
     scanné directement. Le MVP ne propose pas de téléchargement/export du QR.
   - Les avis vérifiés apparaissent ici, mais il ne peut pas les modifier ou
     les supprimer.

**Moment de réussite :** Amine copie son lien et le colle dans sa bio
Instagram/WhatsApp. Il sait ce que verra le client car l'action « Ouvrir le
lien » ouvre exactement la même page.

## Parcours 2 — Un nouveau client réserve depuis Instagram

**Samira** voit le lien dans la bio d'Amine et l'ouvre sur son téléphone.

1. Elle arrive sur une page nette, sans menu d'administration ni écran de
   connexion.
   - Elle voit la photo, la ville, les services avec prix/durée, le portfolio,
     les avis vérifiés, les réseaux sociaux et les conditions d'annulation.
   - S'il n'y a pas d'avis, elle lit « Nouveau sur Barberboard », jamais une
     note inventée.

2. Elle appuie sur **Réserver**.
   - Elle choisit une prestation, puis le type de rendez-vous : domicile ou
     fauteuil.
   - Elle ne voit que les créneaux correspondant au type choisi.

3. Si elle choisit **au fauteuil** :
   - La page montre le lieu professionnel.
   - Elle indique son nom, e-mail et téléphone.
   - Aucune adresse personnelle ne lui est demandée.

4. Si elle choisit **à domicile** :
   - Elle indique les mêmes coordonnées, une zone approximative puis son
     adresse complète.
   - L'interface précise que l'adresse sera transmise à Amine seulement après
     son acceptation.

5. Elle confirme.
   - L'application crée silencieusement une session technique temporaire ;
     Samira ne voit aucun « créer un compte ».
   - Elle reçoit une confirmation : « Demande envoyée — Amine doit la
     valider. »
   - Un double-clic ou un nouvel essai après une réponse réseau incertaine,
     avec les mêmes données et sans quitter le formulaire, ne crée pas deux
     demandes. Fermer la page ou effacer sa session ne garantit pas ce suivi.

**Moment de confiance :** Samira comprend le prix, la durée et le lieu avant
de demander le rendez-vous ; elle sait qu'il s'agit d'une demande à confirmer,
pas d'un paiement ni d'une réservation déjà encaissée.

## Parcours 3 — Amine traite la demande

1. Amine ouvre **Réservations** et voit une demande en attente en premier.
   - Le filtre par statut et par type lui permet de distinguer domicile et
     fauteuil.
   - Avant son acceptation, une demande à domicile montre la zone
     approximative, pas l'adresse complète.

2. Il accepte ou refuse.
   - S'il accepte une visite à domicile, l'adresse complète devient disponible
     uniquement pour lui.
   - Pour un fauteuil, il revoit le lieu professionnel qui a été enregistré
     avec le rendez-vous.
   - Un refus ou une annulation libère le créneau seulement s'il est encore
     configuré pour ce même type de rendez-vous.

3. Il termine le rendez-vous.
   - Son tableau **Accueil** et ses **Analytiques** actualisent les volumes.
   - Le montant est toujours écrit **Prévision de CA** ; il n'est jamais
     présenté comme de l'argent encaissé.

## Parcours 4 — Le client laisse un avis vérifié

1. Après un rendez-vous freelance marqué terminé, Samira voit l'action
   **Laisser un avis** dans son historique.
2. Elle choisit de 1 à 5 étoiles et peut ajouter un court texte.
3. Après envoi, le formulaire devient une confirmation ; un même rendez-vous
   ne peut donner qu'un seul avis.
4. Le profil public d'Amine affiche cet avis vérifié avec un prénom minimisé,
   jamais les coordonnées de Samira.

## États utiles à tester

| Situation | Ce que l'utilisateur doit voir | Action utile |
| --- | --- | --- |
| Profil sans service | Explication courte, pas de faux statut public | Ajouter un service |
| Profil sans créneau | Explication courte, pas de lien de réservation actif | Ajouter un créneau |
| Lien public caché/invalide | Page introuvable simple, sans données privées | Retour à l'accueil |
| Créneau pris | Message clair, choix d'un autre créneau | Réessayer |
| App Check non configuré | Le test ne doit pas être ouvert publiquement | Configurer la Preview avec reCAPTCHA |
| Erreur réseau | Les informations saisies restent visibles | Réessayer |
| Aucun avis | « Nouveau sur Barberboard » | Continuer la réservation |

## Checklist de recette humaine

- Le lien `/b/:slug` s'ouvre sans connexion visible.
- Un profil domicile, fauteuil, puis mixte peut être configuré.
- Les prix et durées sont visibles avant la demande.
- Une demande fauteuil ne demande ni ne stocke d'adresse client.
- Une demande domicile garde l'adresse privée jusqu'à acceptation.
- Deux clics de confirmation produisent une seule demande.
- La sidebar desktop et la barre mobile mènent aux sept vues : Accueil,
  Calendrier, Réservations, Services, Marketing, Analytiques, Paramètres.
- Les analytiques disent uniquement « Prévision de CA ».
- Un avis ne peut être envoyé qu'après un rendez-vous freelance terminé et ne
  peut être modifié par le barbier.
- Aucun écran du parcours ne propose un paiement, une carte ou Stripe.
