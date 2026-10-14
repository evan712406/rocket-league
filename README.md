# APEX / DRIVE

Un jeu original de football automobile en **3D**, jouable sur ordinateur dans Chrome. Modèles, textures, particules et sons sont créés procéduralement : aucune ressource du jeu Rocket League n’est utilisée.

## Ouvrir le jeu téléchargé

Le **`index.html` à la racine est maintenant autonome** : il contient le jeu, Three.js, Cannon ES et le style. Télécharger ce nouveau fichier depuis GitHub, puis l’ouvrir avec **Google Chrome** par un double-clic ou **Ouvrir avec → Google Chrome**. Aucun dossier de ressources, serveur local ou accès Internet n’est nécessaire. Ne pas utiliser un aperçu HTML du gestionnaire de fichiers.

Sur la page GitHub du fichier `index.html`, utiliser le bouton **Download raw file** (icône de téléchargement), plutôt qu’enregistrer la page GitHub elle-même. Conserver l’extension `.html`. Si vous avez téléchargé une ancienne version, la remplacer par celle-ci.

Le fichier `docs/index.html` est également autonome. Le fichier **`src/index.html`**, en revanche, est le point d’entrée des sources et doit être utilisé avec le serveur de développement décrit ci-dessous.

## Jouer directement avec GitHub Pages

Les fichiers prêts à jouer sont déjà dans **`docs/`**. Aucun téléchargement, installation, serveur applicatif ou clé API n’est nécessaire pour les joueurs.

1. Ouvrir le dépôt GitHub `evan712406/rocket-league`.
2. Ouvrir **Settings → Pages**.
3. Sous **Build and deployment**, choisir **Source : Deploy from a branch**.
4. Choisir **Branch : main**, puis le dossier **`/docs`**, et cliquer **Save**.
5. Attendre la fin de la publication GitHub Pages (le déploiement apparaît dans **Actions**). Cliquer **Visit site** dans **Settings → Pages**.

L’adresse attendue, une fois la publication terminée, est :

**https://evan712406.github.io/rocket-league/**

Ouvrir cette adresse dans Chrome sur un ordinateur avec l’accélération graphique activée. Le jeu contient ses dépendances dans le HTML, sans CDN. Le dossier `docs` contient la version publiée ; la racine contient également un HTML autonome prêt à jouer.

Si Pages affiche une erreur 404, vérifier `main` + `/docs`, puis attendre la fin de l’action `pages build and deployment`. Si le dépôt est privé, les possibilités de GitHub Pages dépendent de l’offre GitHub du propriétaire.

## Modes et mécaniques

- **Duel 1v1** : un match de cinq minutes contre une IA.
- **Équipe 2v2** : un coéquipier et deux adversaires contrôlés par l’IA.
- **Libre** : entraînement seul, sans limite de temps.
- Difficultés facile, normale et expert : anticipation, vitesse et boost différents.
- Compte à rebours, score, engagement après les buts, pause, victoire/défaite et prolongation au but en or.
- Voiture avec accélération, freinage, marche arrière, adhérence directionnelle, powerslide, saut, double saut et flips directionnels.
- Boost aérien, tangage/lacet/roulis, conduite sur les murs via des rampes courbes.
- Ballon physique, poteaux, barre transversale et cages avec profondeur ; un but exige que le ballon franchisse entièrement la ligne.
- Petits pads : +12, disponibles à nouveau après quatre secondes. Gros pads : 100, après dix secondes. Le boost consomme 27 unités par seconde.
- Caméras voiture/ballon, sons synthétisés, particules et options graphiques.

Cette première version utilise une physique de véhicule assistée pour privilégier le contrôle, avec collisions rigides Cannon ES à 120 Hz. Elle ne reproduit pas exactement les réglages du jeu commercial. L’IA est heuristique : elle cherche un angle de tir, défend et se répartit les rôles en 2v2 ; elle ne maîtrise pas les mécaniques aériennes complexes. Il n’y a pas de multijoueur réseau ni de prise en charge de manette dans cette version.

## Commandes par défaut

Les lettres correspondent aux touches indiquées, y compris sur un clavier AZERTY. Les commandes peuvent être modifiées depuis **Toutes les commandes** ou le menu pause, et sont mémorisées dans le navigateur.

| Action | Touche |
| --- | --- |
| Accélérer | Z |
| Freiner / reculer | S |
| Tourner | Q / D |
| Saut / double saut | Espace |
| Boost | Shift |
| Powerslide | Ctrl |
| Caméra ballon | C |
| Pause / reprendre | Échap |
| Tangage en l’air | Z / S |
| Lacet en l’air | Q / D |
| Roulis en l’air | A / E |
| Orienter la caméra | Déplacer la souris après un clic sur le terrain, ou clic maintenu |

Pour un **flip**, sauter, puis appuyer une deuxième fois sur Espace en maintenant une direction, dans les 1,5 secondes suivant le premier saut. Pour un double saut vertical, ne maintenir aucune direction lors de la seconde pression. Pour un aerial, sauter, relever le nez avec S, puis utiliser Shift. Pour quitter un mur, sauter et réorienter la voiture en l’air. Appuyer sur Échap permet aussi de libérer le pointeur.

## Développer et tester

Prérequis : Node.js 22.12 ou ultérieur (Node 24 utilisé pour la validation).

```sh
npm ci
npm run dev
```

Ouvrir l’adresse donnée par Vite. Pour produire et servir localement une version de production :

```sh
npm run build
npm run preview
```

Après une modification des sources, **mettre à jour les fichiers publiables** avant de les enregistrer dans Git :

```sh
npm run build:pages
git add docs src index.html scripts vite.config.js package.json package-lock.json
git commit -m "Update APEX DRIVE"
git push origin main
```

Tests comportementaux de la physique et des matchs :

```sh
npm test
```

Tests d’intégration Chrome avec Python et Playwright installés, Chromium présent sur le système, et le serveur Vite lancé :

```sh
python3 tests/browser_smoke.py
```

La validation comprend **27 tests de physique et de match**, **13 contrôles d’intégration dans Chromium**, un test de la version compilée sous le chemin `/rocket-league/` et un test du contenu HTML autonome hors ligne, également après copie dans un dossier vide. Pour tester le HTML téléchargé :

```sh
python3 tests/offline_smoke.py
```

La machine de validation impose une politique Chromium qui interdit les adresses `file://`. Le contenu exact des deux fichiers a donc été exécuté avec `python3 tests/offline_smoke.py --content-only`, sans réseau ni chargement d’autres fichiers. Ce test valide le jeu hors connexion ; il ne remplace pas le test d’une navigation `file://` sur un poste qui l’autorise.

Pour tester le site après publication :

```sh
python3 tests/pages_smoke.py https://evan712406.github.io/rocket-league/
```

## Organisation

- `src/main.js` : boucle de jeu et intégration.
- `src/physics.js` : arène physique, conduite, ballon, pads et décisions des bots.
- `src/match.js` : matchs, compte à rebours, buts et prolongation.
- `src/scene.js` : rendu Three.js, modèles, éclairage, particules et caméras.
- `src/input.js` : commandes, souris et préférences.
- `src/ui.js`, `src/style.css`, `src/index.html` : sources de l’interface et des menus.
- `src/audio.js` : audio original Web Audio.
- `tests/` : tests de physique, de match et d’intégration navigateur.
- `docs/` : version statique publiée sur GitHub Pages.
- `index.html` : jeu autonome généré par `npm run build:pages`. Modifier les sources dans `src`, puis reconstruire ce fichier plutôt que le modifier manuellement.

Dans les réglages, choisir **Performance** sur une machine modeste. L’objectif est 60 FPS sur un ordinateur doté d’un GPU ; la fréquence réelle dépend du matériel, de la résolution et des options graphiques. Toute la logique du match est locale ; aucun compte utilisateur ni service externe n’est utilisé.
