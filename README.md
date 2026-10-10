# Petit Atelier 🎨

Un petit jeu de dessin en ligne pour deux amis : un thème surprise, 60 secondes, puis révélation des deux créations.

## Contenu
- `index.html` : structure du site
- `css/style.css` : design responsive
- `js/app.js` : dessin, rounds et multijoueur
- `assets/` : dossier prévu pour les futurs éléments graphiques

## Tester en local
Ouvre `index.html` dans un navigateur récent. Une connexion Internet est nécessaire pour charger PeerJS depuis son CDN et utiliser le serveur de signalisation public.

## Publier sur GitHub Pages
1. Décompresse l’archive.
2. Envoie **le contenu du dossier** `petit-atelier` dans la racine du dépôt GitHub (le fichier `index.html` doit être à la racine).
3. Dans GitHub : **Settings → Pages**, active le déploiement depuis la branche principale et le dossier `/ (root)`.
4. Ouvre l’adresse GitHub Pages en HTTPS. Envoie cette même adresse à ton ami.

## Créer et rejoindre une room
1. L’hôte crée une room avec un mot de passe et partage le code à 6 caractères + le mot de passe.
2. L’ami choisit « Rejoindre », entre le code et le mot de passe.
3. L’hôte lance chaque round. Le thème est commun et le compte à rebours dure 60 secondes.
4. À la fin, les dessins sont révélés et l’hôte peut passer au thème suivant.

## À savoir sur le multijoueur
Ce site est statique et peut être hébergé sur GitHub Pages sans serveur que tu dois créer toi-même. La connexion entre joueurs utilise PeerJS et son service public de signalisation, puis un canal WebRTC. **Il faut donc Internet et le service PeerJS doit être disponible.** L’hôte doit garder la page ouverte pendant la partie. Le mot de passe sert à autoriser l’entrée dans la room, mais ce prototype n’est pas un service de sécurité professionnel : évite d’y utiliser un mot de passe important.

Le mode de dessin est pensé pour que chacun dessine sur sa propre toile ; les traits sont synchronisés vers le navigateur adverse, et les images sont révélées à la fin du round. Les services gratuits publics peuvent avoir des limites de disponibilité. Pour un jeu public à grande échelle, un serveur de signalisation/backend dédié serait préférable.

## Outils inclus
- Pinceau et gomme
- Ligne, rectangle, cercle, rectangle plein
- Palette prédéfinie et couleur personnalisée
- Taille et opacité
- Trois calques (Croquis, Couleurs, Détails), masquables séparément
- Annuler / rétablir par calque, effacer un calque, télécharger en PNG
- Interface adaptée au téléphone et à l’ordinateur
