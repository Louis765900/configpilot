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

Version actuelle : **1.2.0** · Auteur : **Louis**

Site Vercel : _à compléter après le déploiement_.

## Fonctionnalités

- Catalogue local structuré de plus de 1 100 références couvrant processeurs, GPU, cartes mères, RAM, alimentations, boîtiers, stockage, refroidissement et cartes d’extension.
- Import documentaire reproductible depuis le catalogue Word et l’inventaire PDF, avec données inconnues explicitement laissées à vérifier.
- Bots gratuits de découverte Wikidata et PCI IDs, registre de sources, dédoublonnage, quarantaine, preuves constructeur et décisions locales de vérification/rejet.
- Recherche automatique hebdomadaire avec GitHub Actions, sans clé API, service payant ni publication aveugle.
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
npm run catalog:discover # actualiser la file depuis les sources ouvertes
npm run catalog:triage # reclasser les résultats existants hors ligne
npm run catalog:test # tester les règles de triage
npm run catalog:promote -- --ids candidate-… # publier une sélection vérifiée
npm run catalog:validate # contrôler les catalogues et les sources
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

Aucune variable d’environnement n’est requise pour la version 1.6.0. La navigation est fondée sur le fragment d’URL (`#`) : aucune règle de réécriture Vercel n’est nécessaire.

## Structure du projet

```text
public/                 favicon, manifeste et image Open Graph
src/App.tsx             écrans et interactions React
src/data.ts             catalogue local typé
src/catalog/            catalogue documentaire généré
src/catalog/manufacturer-registry.json domaines constructeurs autorisés
src/engine.ts           recherche, compatibilité et estimation
src/engine.test.ts      tests des règles critiques
src/styles.css          identité visuelle et responsive
src/types.ts            modèles TypeScript
scripts/                import et normalisation des documents sources
index.html              métadonnées et point d’entrée
```

## Actualiser le catalogue documentaire

L’importeur exige Python 3 et `pypdf` :

```bash
python -m pip install pypdf
python scripts/build-documentary-catalog.py --docx chemin/catalogue.docx --pdf chemin/inventaire.pdf --out src/catalog/documentary.generated.json
```

Le fichier généré ne remplace pas les fiches détaillées. Il ajoute des références documentaires avec prix et caractéristiques inconnus laissés à `null`.

## Automatisation gratuite du catalogue

La découverte fonctionne sans modèle d’IA payant :

1. `src/catalog/source-registry.json` déclare chaque source, sa licence et 89 recherches couvrant 55 marques dans les 9 catégories.
2. `scripts/discover-open-catalog.py` interroge poliment Wikidata, jusqu’à deux pages de 50 résultats par recherche, lit cinq index constructeurs explicitement autorisés, puis télécharge le snapshot public PCI IDs. Les budgets de 180 pages Wikidata et 30 pages constructeur, le délai de 1,1 seconde, `maxlag` et les nouvelles tentatives progressives protègent les services gratuits.
3. `scripts/catalog_triage.py` classe chaque résultat comme produit précis, famille, composant intégré, identifiant matériel, faux positif ou cas à revoir.
4. Les résultats sont séparés dans `discovery.generated.json`, `hardware-identifiers.generated.json` et `rejected.generated.json` au lieu de mélanger produits et identifiants techniques.
5. Le bot vérifie le `robots.txt` disponible avant chaque index constructeur. `scripts/validate-catalog.py` bloque les catégories inconnues, domaines non autorisés, identifiants dupliqués, chemins locaux, URL non sécurisées, incohérences de triage et toute publication automatique.
6. `.github/workflows/catalog-discovery.yml` exécute ce processus chaque dimanche à 03:17, teste les règles, puis enregistre les files et le rapport de couverture s’ils ont changé.
7. L’écran **Bots** affiche séparément les produits candidats, identifiants PCI et faux positifs, ainsi que la couverture réelle par catégorie. Une validation locale ne publie pas encore de fiche.
8. `candidate-verification.generated.json` conserve la correspondance constructeur, le lien officiel et les caractéristiques confirmées ; `manufacturer-registry.json` limite les preuves aux domaines autorisés.
9. `npm run catalog:promote -- --ids candidate-…` accepte seulement une référence commerciale précise, non dupliquée et marquée `verified`, puis la transforme en fiche documentaire dans `promoted.generated.json`.
10. `discovery-report.generated.json` rend visibles le nombre de marques suivies, les catégories déjà observées, les pages demandées, les erreurs et un éventuel épuisement du budget.

État du premier triage des 340 résultats :

| Classe | Nombre | Publication automatique |
| --- | ---: | --- |
| Références commerciales précises | 19, dont 17 non dupliquées | Non ; promotion manuelle possible pour les 17 |
| Familles ou séries | 28 | Bloquée |
| Composants intégrés | 2 | Bloquée |
| Identifiants matériels PCI | 290 | Bloquée |
| Faux positifs | 1 | Bloquée |

État du chantier de validation constructeur :

- 16 références ont été reliées à une fiche officielle AMD, Intel, NVIDIA, MSI ou Lian Li puis intégrées au catalogue ;
- toutes conservent des prix `null` et une source constructeur cliquable ;
- l’Intel Arc A770 reste en quarantaine, car le nom seul ne permet pas de distinguer les versions 8 Go et 16 Go ;
- la file active était passée de 49 à 33 candidats après retrait des références intégrées.

État du premier balayage élargi du chantier 3 :

- les 89 recherches sur 55 marques ont été exécutées sans erreur en 93 pages, bien sous le budget de 180 ;
- 616 observations ont été traitées et la quarantaine contient maintenant 308 candidats produits, 290 identifiants PCI et 2 faux positifs ;
- 158 résultats ont la forme d’une référence commerciale précise, mais restent bloqués jusqu’à leur validation constructeur ;
- 4 catégories sur 9 ont produit des observations exploitables. Le rapport rend les 5 lacunes visibles : Wikidata contient peu de fiches détaillées pour les cartes mères, la RAM, les alimentations, les boîtiers et le refroidissement ;
- cette absence n’est jamais compensée par une fiche inventée. Elle indique les prochaines sources officielles à intégrer.

État du chantier 4 — index constructeurs ouverts :

- cinq connecteurs bornés couvrent ASUS (cartes mères), Patriot (RAM), Seasonic (alimentations), Fractal Design (boîtiers) et DeepCool (refroidissement) ;
- le connecteur sait lire des index HTML et des sitemaps XML, suit uniquement les domaines et chemins autorisés, et purge les observations d’une source retirée ;
- G.Skill a été écarté parce que son `robots.txt` interdit l’exploration automatisée ; Patriot le remplace avec une politique qui autorise la collecte ;
- le passage complet a terminé 89/89 recherches Wikidata et 5/5 index constructeurs, sans erreur : 222 candidats officiels parmi 530 candidats produits, plus 290 identifiants PCI et 2 faux positifs ;
- les 9 catégories sur 9 contiennent désormais des observations. Les 222 candidats officiels sont eux aussi en quarantaine jusqu’au contrôle de leur référence exacte et de leurs caractéristiques.

Sources activées :

| Source | Usage | Licence déclarée | Secret requis |
| --- | --- | --- | --- |
| Wikidata | Familles et références candidates | CC0 1.0 | Non |
| PCI ID Repository | Identifiants de puces et cartes PCI | BSD-3-Clause ou GPL-2.0+ | Non |
| ASUS | Index officiel de cartes mères | Métadonnées constructeur de référence | Non |
| Patriot | Sitemap officiel, filtré sur la RAM | Métadonnées constructeur de référence | Non |
| Seasonic | Index officiel d’alimentations | Métadonnées constructeur de référence | Non |
| Fractal Design | Index officiel de boîtiers | Métadonnées constructeur de référence | Non |
| DeepCool | Index officiel de refroidissement | Métadonnées constructeur de référence | Non |

Le workflow GitHub Actions reste gratuit avec les runners standards tant que le dépôt est public. GitHub peut désactiver les tâches planifiées d’un dépôt public resté sans activité pendant 60 jours ; elles peuvent alors être réactivées depuis l’onglet Actions.

## Méthode d’estimation

L’estimateur combine le prix indicatif du catalogue avec l’âge, la catégorie, l’état déclaré, la garantie, la facture, les tests, les accessoires, le type de vendeur et les frais obligatoires. Les risques propres aux GPU, CPU, alimentations, cartes mères et supports de stockage sont affichés séparément.

> **Les prix affichés sont des estimations indicatives et ne constituent pas des relevés marketplace en temps réel.**

Le résultat doit toujours être confronté à des annonces réelles avant un achat.

## Limites et avertissements

- Aucun catalogue ne peut garantir « tous les composants au monde ». La couverture est évolutive et dépend des documents et sources ouvertes disponibles.
- Les résultats des bots sont des candidats non validés : une fiche constructeur officielle doit être contrôlée avant intégration au catalogue fiable.
- Une validation de modèle générique de GPU ne remplace pas la vérification de la carte partenaire exacte, dont les dimensions, fréquences et connecteurs peuvent varier.
- Les identifiants PCI décrivent souvent une puce ou un sous-système et non une référence commerciale vendue en magasin.
- Open Icecat n’est pas activé automatiquement, car son accès gratuit exige la création personnelle d’un compte et l’acceptation de sa licence.
- Une fiche documentaire ou une information inconnue est indiquée par « À vérifier » au lieu d’être remplacée par une valeur inventée.
- Les contrôles de compatibilité sont une aide à la décision. La référence exacte de la carte mère, la version du BIOS, les dimensions du boîtier et les manuels constructeurs doivent être vérifiés avant montage.
- Aucun scraping de marketplace ni contournement de CAPTCHA n’est réalisé.

## Licence

Tous droits réservés à Louis. Aucune licence open source n’est accordée tant qu’un fichier `LICENSE` distinct n’a pas été ajouté.
