<div align="center">
  <img src="public/favicon.svg" width="72" height="72" alt="Logo ConfigPilot">
  <h1>ConfigPilot</h1>
  <p><strong>Ta configuration. Les bons composants. Le juste prix.</strong></p>
  <p>Comparateur, configurateur et estimateur intelligent de composants PC.</p>
</div>

![Aperçu ConfigPilot](public/configpilot-og.png)

<details>
  <summary>Captures de l’interface</summary>

  ![Accueil ConfigPilot sur ordinateur](docs/screenshots/home-desktop.png)

  ![Accueil ConfigPilot sur mobile](docs/screenshots/home-mobile.png)
</details>

## Présentation

ConfigPilot aide à comparer des composants, vérifier leur compatibilité, construire une configuration et évaluer le prix d’une annonce d’occasion. L’interface reste accessible aux débutants tout en exposant les informations utiles aux utilisateurs expérimentés.

Version actuelle : **1.0.0** · Auteur : **Louis**

Site Vercel : _à compléter après le déploiement_.

## Fonctionnalités

- Catalogue local structuré couvrant processeurs, GPU, cartes mères, RAM, alimentations, boîtiers, stockage, refroidissement et cartes d’extension.
- Recherche instantanée tolérante à la casse et aux accents, filtres par catégorie, marque, prix et socket, tris par prix, performance et valeur.
- Fiches détaillées avec caractéristiques, indices, prix indicatifs, confiance, points forts, points faibles et recherches marketplace encodées.
- Comparaison de quatre produits d’une même catégorie avec alignement des caractéristiques et mise en évidence des meilleurs indices.
- Configurateur avec contrôle du socket, BIOS, RAM, formats, dimensions, refroidissement, alimentation, connecteurs, M.2 et VRM.
- Configuration personnelle de Louis préchargée, avec diagnostic du Core i9-9900KF sur MSI Z370.
- Estimation d’annonces tenant compte de l’état, de l’âge, des preuves, des frais et du risque propre à chaque catégorie.
- Recommandations locales par budget et résolution, intégrant le coût global de plateforme.
- Favoris, comparaisons et configurations sauvegardés avec `localStorage`, export texte, thème sombre et partage par URL.
- Interface responsive avec navigation clavier, focus visible et tableaux défilants sur petits écrans.

## Technologies

- React
- TypeScript
- Vite
- CSS moderne sans framework d’exécution
- Lucide React pour les pictogrammes
- Vitest et ESLint pour la qualité

## Installation locale

Prérequis : Node.js récent et npm.

```bash
git clone https://github.com/Louis765900/configpilot.git
cd configpilot
npm install
npm run dev
```

L’application est alors accessible sur l’adresse affichée par Vite, généralement `http://localhost:4173`.

## Commandes disponibles

```bash
npm run dev       # serveur de développement
npm run test      # tests unitaires
npm run lint      # analyse ESLint
npm run build     # build TypeScript et Vite
npm run preview   # prévisualisation du build
```

Le build de production est généré dans `dist/`.

## Déploiement sur Vercel

Connecter ce dépôt à un projet Vercel existant avec les réglages suivants :

| Réglage | Valeur |
| --- | --- |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Root Directory | `./` |

Aucune variable d’environnement n’est requise pour la version 1.0.0. La navigation est fondée sur le fragment d’URL (`#`) : aucune règle de réécriture Vercel n’est nécessaire.

## Structure du projet

```text
public/                 favicon, manifeste et image Open Graph
src/App.tsx             écrans et interactions React
src/data.ts             catalogue local typé
src/engine.ts           recherche, compatibilité et estimation
src/engine.test.ts      tests des règles critiques
src/styles.css          identité visuelle et responsive
src/types.ts            modèles TypeScript
index.html              métadonnées et point d’entrée
```

## Méthode d’estimation

L’estimateur combine le prix indicatif du catalogue avec l’âge, la catégorie, l’état déclaré, la garantie, la facture, les tests, les accessoires, le type de vendeur et les frais obligatoires. Les risques propres aux GPU, CPU, alimentations, cartes mères et supports de stockage sont affichés séparément.

> **Les prix affichés sont des estimations indicatives et ne constituent pas des relevés marketplace en temps réel.**

Le résultat doit toujours être confronté à des annonces réelles avant un achat.

## Limites et avertissements

- Le catalogue est une sélection évolutive, pas une liste exhaustive de tous les composants commercialisés.
- Une fiche documentaire ou une information inconnue est indiquée par « À vérifier » au lieu d’être remplacée par une valeur inventée.
- Les contrôles de compatibilité sont une aide à la décision. La référence exacte de la carte mère, la version du BIOS, les dimensions du boîtier et les manuels constructeurs doivent être vérifiés avant montage.
- Aucun scraping de marketplace ni contournement de CAPTCHA n’est réalisé.

## Licence

Tous droits réservés à Louis. Aucune licence open source n’est accordée tant qu’un fichier `LICENSE` distinct n’a pas été ajouté.
