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

ConfigPilot est un outil public de configuration de PC. Il tient sur deux promesses :

1. **Un configurateur qui vérifie vraiment.** On compose sa machine dans le navigateur et une vingtaine de règles croisent socket, chipset, version de BIOS, mémoire, dimensions, connecteurs, refroidissement et stockage. Chaque verdict affiche les champs de fiche sur lesquels il se prononce, et une donnée manquante n'est jamais interprétée en faveur de la compatibilité.
2. **Une fiche technique avec sa trajectoire de prix.** Pour chaque référence : le tarif public conseillé au lancement, la décote depuis la sortie, le rapport performance/prix face à sa catégorie, l'ensemble des caractéristiques publiées, et un verdict d'achat argumenté facteur par facteur.

L'interface reste lisible pour un débutant tout en exposant les détails attendus par un utilisateur expérimenté.

Version actuelle : **2.1.1**

Site Vercel : [configpilot-flax.vercel.app](https://configpilot-flax.vercel.app/).

## Fonctionnalités

### Configurateur

- Neuf emplacements à remplir, du processeur à la carte d'extension, avec illustration de chaque type de composant.
- Une vingtaine de contrôles croisés répartis en six familles : plateforme, mémoire, refroidissement, alimentation, intégration physique, stockage.
- Table de compatibilité chipset ↔ génération de processeur qui distingue la prise en charge native de celle qui exige une mise à jour du BIOS, et signale si la carte dispose du flash sans processeur.
- Contrôles dimensionnels réels : longueur de carte graphique, hauteur de ventirad, emplacement de radiateur, format de carte mère et format d'alimentation acceptés par le boîtier.
- Contrôles électriques : puissance face à la consommation estimée, recommandation du fabricant du GPU, comptage des connecteurs PCIe, présence d'un 12V-2x6, conformité ATX 3.x.
- Chaque contrôle affiche la ligne « Champs lus » qui énumère les caractéristiques consultées, pour que le verdict soit contestable.
- Cinq états distincts : validé, à confirmer, conflit, information manquante, à savoir. L'absence de donnée ne devient jamais un verdict favorable.

### Fiches et trajectoire de prix

- Tarif public conseillé au lancement, prix indicatifs neuf et occasion, décote cumulée et rythme annuel.
- Courbe de prix tracée entre les ancres documentées, avec les segments modélisés en pointillés et la méthode de calcul affichée.
- Verdict d'achat argumenté : décote déjà réalisée, rapport performance/prix face à la médiane de la catégorie, âge par rapport à l'horizon de la catégorie, et état de la plateforme (socket encore alimenté, mature ou fermé).
- Caractéristiques regroupées par thème, avec « À vérifier » affiché tel quel pour tout champ absent.
- Structure de relevés manuels prête à recevoir de vraies observations de prix, vide par défaut.

### Le reste

- Catalogue de plus de 1 100 références sur neuf catégories, filtres par catégorie, marque et socket, affichage en cartes ou en liste.
- Illustrations vectorielles dessinées pour chaque type de composant, adaptées à la fiche (nombre de barrettes, type de refroidissement, longueur de carte graphique, format de boîtier et de stockage).
- Comparateur de quatre références d'une même catégorie, incluant tarif de lancement, décote et verdict d'achat.
- Estimateur d'annonce d'occasion : état, âge, preuves du vendeur, frais obligatoires et risque propre à la catégorie.
- Assistant qui propose une base publique déjà passée au configurateur, selon le budget, la résolution et la contrainte d'encombrement.
- Bots gratuits de découverte Wikidata, PCI IDs et index constructeurs, avec quarantaine, preuves constructeur et caractéristiques normalisées en attente de relecture humaine.
- Thème sombre et thème clair, navigation clavier, focus visible, tableaux défilants et absence de débordement horizontal vérifiée par les tests sur huit écrans.

## Technologies

- React
- TypeScript
- Vite
- CSS moderne sans framework d’exécution
- Inter et JetBrains Mono auto-hébergées via `@fontsource`, sans requête vers un CDN
- Lucide React pour les pictogrammes, illustrations de composants dessinées en SVG inline
- Vitest et ESLint pour la qualité
- PostgreSQL pour le catalogue centralisé et les imports idempotents
- Vercel Functions pour l’API paginée

## Catalogue PostgreSQL et API

La version 2.1 ajoute l’infrastructure destinée aux dizaines de milliers de références : migration PostgreSQL, provenance par champ, MPN/GTIN/EAN/UPC normalisés, déduplication conservatrice, import BuildCores par lots, enrichissement Icecat désactivable, API paginée et recherche serveur. Le catalogue local historique reste disponible tant que la base n’est pas configurée.

La documentation complète se trouve dans [`docs/component-catalog.md`](docs/component-catalog.md). Les attributions et limites de licences sont détaillées dans [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md).

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
npm run catalog:evidence # collecter un lot borné de métadonnées constructeur
npm run catalog:specs # normaliser un lot borné de caractéristiques constructeur
npm run catalog:specs:offline # renormaliser les valeurs brutes déjà stockées, sans réseau
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

Aucune variable d’environnement n’est requise pour la version 2.0.0. La navigation est fondée sur le fragment d’URL (`#`) : aucune règle de réécriture Vercel n’est nécessaire.

## Structure du projet

```text
public/                 favicon, manifeste et image Open Graph
src/App.tsx             coquille applicative, navigation et état partagé
src/screens/            un fichier par écran
src/compatibility.ts    moteur de compatibilité et synthèse du diagnostic
src/pricing.ts          trajectoire de prix et verdict d'achat
src/illustrations.tsx   schémas SVG des composants
src/launch-prices.ts    tarifs publics conseillés au lancement
src/ui.tsx              primitives d'interface partagées
src/data.ts             catalogue local typé
src/catalog/            catalogue documentaire généré
src/catalog/manufacturer-registry.json domaines constructeurs autorisés
src/catalog/manufacturer-evidence.generated.json preuves automatiques à relire
src/catalog/manufacturer-specs.generated.json caractéristiques brutes et normalisées à relire
scripts/spec_normalization.py couche de normalisation par catégorie
scripts/fixtures/specs/  pages HTML minimales des tests déterministes
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
6. `.github/workflows/catalog-discovery.yml` exécute ce processus chaque dimanche à 03:17, collecte au plus 20 nouvelles fiches constructeur, teste les règles, puis enregistre les files et les rapports s’ils ont changé.
7. L’écran **Bots** affiche séparément les produits candidats, identifiants PCI et faux positifs, ainsi que la couverture réelle par catégorie. Une validation locale ne publie pas encore de fiche.
8. `candidate-verification.generated.json` conserve la correspondance constructeur, le lien officiel et les caractéristiques confirmées ; `manufacturer-registry.json` limite les preuves aux domaines autorisés.
9. `npm run catalog:promote -- --ids candidate-…` accepte seulement une référence commerciale précise, non dupliquée et marquée `verified`, puis la transforme en fiche documentaire dans `promoted.generated.json`.
10. `discovery-report.generated.json` rend visibles le nombre de marques suivies, les catégories déjà observées, les pages demandées, les erreurs et un éventuel épuisement du budget.
11. `manufacturer-evidence.generated.json` conserve séparément les objets Schema.org `Product`, les métadonnées de page et les échecs à réessayer. Chaque preuve automatique reste marquée `pending`.
12. `scripts/collect-manufacturer-specs.py` relit les fiches déjà qualifiées par l’étape précédente, conserve chaque ligne publiée telle quelle, puis ajoute une valeur normalisée par catégorie dans `manufacturer-specs.generated.json`. Les deux niveaux restent visibles côte à côte et la promotion reste bloquée.

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

État du chantier 5 — preuves constructeur structurées :

- `scripts/collect-manufacturer-evidence.py` visite les fiches officielles par lots équitablement répartis entre les sources, sous un budget maximal de 20 pages par passage ;
- l’extracteur reconnaît les objets Schema.org `Product` et `ProductModel`, les identifiants `model`, `sku`, `mpn`, `gtin`, les propriétés additionnelles, puis utilise les métadonnées Open Graph ou le titre comme niveau de preuve inférieur ;
- le rapprochement lexical produit seulement des signaux de relecture. Il ne crée jamais le statut `verified`, ne modifie pas `candidate-verification.generated.json` et ne déclenche aucune promotion ;
- les échecs conservent leur nombre de tentatives et sont dépriorisés pour que les autres références continuent d’avancer ;
- le premier lot réel a collecté 20 fiches sur 20 sans erreur : 8 objets produit structurés et 12 preuves par métadonnées de page. Il reste 202 fiches, qui avanceront lors des passages hebdomadaires suivants.

État du chantier 6 — normalisation des caractéristiques constructeur :

- `scripts/spec_normalization.py` déclare les champs suivis par catégorie et ne dépend d’aucun réseau : cartes mères (socket, chipset, format, type et nombre d’emplacements mémoire, PCIe, Wi-Fi, Ethernet), RAM (DDR3/4/5, capacité, nombre de modules, fréquence, latence, XMP, EXPO, ECC), alimentations (puissance, certification 80 PLUS, norme ATX, modularité, connecteurs PCIe, connecteur 12V-2x6, garantie publiée), boîtiers (format, cartes mères acceptées, longueur GPU, hauteur ventirad, radiateurs, dimensions) et refroidissement (type air/AIO, sockets, taille de radiateur, hauteur, nombre et taille des ventilateurs, dimensions) ;
- chaque valeur enregistre l’URL constructeur, la date de collecte, le champ brut, la valeur brute exacte, la valeur normalisée, la méthode d’extraction et un niveau de confiance `high`, `medium` ou `low` ;
- l’extraction lit dans l’ordre le JSON-LD, les tableaux de caractéristiques, les listes de définitions HTML et les listes étiquetées `label` / `value`. Les métadonnées de page ne peuvent alimenter qu’une courte liste de champs sans ambiguïté, toujours au niveau de confiance le plus bas ;
- un tableau qui décrit plusieurs références à la fois n’est jamais réduit à l’une d’elles : il est ignoré. Une taille de radiateur cachée dans une dimension longueur × largeur × épaisseur est écartée, et la hauteur d’un ventirad n’est lue que si le constructeur publie lui-même l’ordre des axes ;
- une caractéristique absente de la fiche est listée dans `missingFields` et reste inconnue. Elle n’est jamais convertie en réponse négative : seul un refus explicite du constructeur (`N/A`, `Non-ECC`…) produit la valeur `false` ;
- la normalisation ne crée jamais le statut `verified`, n’écrit jamais dans `candidate-verification.generated.json` et ne promeut aucun candidat. `npm run catalog:specs:offline` rejoue la normalisation sur les valeurs brutes déjà stockées, sans aucune requête ;
- 19 tests déterministes couvrent les cinq catégories à partir de pages HTML minimales dans `scripts/fixtures/specs/`, plus le respect de `robots.txt`, la file de reprise et le mode hors ligne ;
- le premier lot réel a lu 20 fiches sur 20 sans erreur, sous le budget de 20 pages : 272 valeurs brutes relevées et 49 valeurs normalisées, dont 16 à confiance élevée, 21 moyenne et 12 faible.

Résultat par catégorie du premier lot réel :

| Catégorie | Fiches lues | Valeurs normalisées | Observation |
| --- | ---: | ---: | --- |
| Cartes mères (ASUS) | 5 | 9 | Les tableaux sont rendus côté navigateur ; seules les métadonnées de page sont lisibles, donc toutes les valeurs restent en confiance faible |
| Mémoire RAM (Patriot) | 4 | 0 | Les pages regroupent plusieurs SKU dans un même tableau ; aucune valeur n’est retenue plutôt qu’inventée |
| Alimentations (Seasonic) | 4 | 12 | Certification, norme et garantie relevées ; la puissance dépend du modèle exact et n’est pas publiée sur la page de série |
| Boîtiers (Fractal Design) | 3 | 16 | Listes étiquetées complètes : cartes mères acceptées, longueur GPU, hauteur ventirad, radiateurs et dimensions |
| Refroidissement (DeepCool) | 4 | 12 | Tableaux détaillés : hauteur, taille de ventilateur et dimensions ; les sockets ne figurent pas dans le HTML statique |

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

## Direction visuelle

L'identité « Technical Precision » a été produite par Google Stitch à partir d'un brief laissant la direction
artistique entièrement libre, puis portée à la main dans le CSS du projet. Les jetons Stitch sont repris tels quels
pour le thème sombre ; le thème clair, absent de la maquette, a été dérivé en conservant le rôle de chaque couleur.

- Fond sombre par défaut, couches tonales plutôt qu'ombres portées, bordure de 1 px pour délimiter les surfaces.
- Accent émeraude réservé aux états validés et aux actions principales, ambre pour « à confirmer », rouge pour les conflits.
- Inter pour l'interface, JetBrains Mono pour toute valeur technique : fréquences, watts, sockets, identifiants, prix.
- Rayons de 4 px, badges d'état quasi carrés, grille de 4 px pour les espacements.

Aucune ressource n'est chargée depuis un CDN : les deux polices sont auto-hébergées par `@fontsource` et les
illustrations de composants sont des SVG dessinés dans le dépôt, ce qui évite de republier une image constructeur.

## Méthode de trajectoire de prix

ConfigPilot n'interroge aucune marketplace, aucune API payante et ne pratique aucun scraping de prix. La trajectoire
affichée sur une fiche est donc construite à partir de trois sources explicites :

1. `src/launch-prices.ts` conserve le tarif public conseillé au lancement, en euros, référence par référence. Une
   référence absente de cette table affiche « À vérifier » : aucune valeur n'est déduite pour combler un trou.
2. Les prix indicatifs du catalogue local servent d'ancre pour l'année courante.
3. `observations` accueille des relevés saisis à la main, avec date et source. Le tableau est vide par défaut.

Entre deux ancres, la valeur est interpolée géométriquement, ce qui fait passer la courbe exactement par les points
documentés. Sans prix actuel, une décote annuelle moyenne par catégorie prend le relais. Tous les points calculés
sont tracés en pointillés et signalés comme modélisés ; seules les ancres sont pleines.

Le verdict d'achat combine quatre facteurs, tous énoncés à l'écran : la décote déjà réalisée, le rapport
performance/prix face à la médiane de la catégorie, l'âge par rapport à l'horizon retenu pour la catégorie, et
l'état de la plateforme pour un processeur ou une carte mère. Aucun facteur n'est agrégé en silence.

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
- Une caractéristique normalisée reste une preuve automatique à relire. Elle ne devient jamais `verified` et ne peut pas déclencher une promotion.
- La normalisation ne lit que le HTML servi directement. Une fiche dont les caractéristiques sont rendues par JavaScript, comme les pages ASUS, ne fournit que ses métadonnées de page.
- Une page qui décrit une série entière plutôt qu’une référence précise, comme les pages Patriot ou les séries d’alimentations, ne produit volontairement aucune valeur normalisée.
- Les contrôles de compatibilité sont une aide à la décision. La référence exacte de la carte mère, la version du BIOS, les dimensions du boîtier et les manuels constructeurs doivent être vérifiés avant montage.
- Aucun scraping de marketplace ni contournement de CAPTCHA n’est réalisé. Aucun prix marchand n’est donc affiché en direct : « prix actuel » signifie toujours « repère calculé localement ».
- Les tarifs de lancement sont des repères indicatifs. Un prix public varie selon le pays, la date exacte de mise en vente et les remises constructeur.
- Le moteur de compatibilité ne conclut que sur les champs présents dans les fiches. Il ne remplace pas la liste de compatibilité officielle du fabricant de la carte mère, ni la vérification des dimensions réelles avant montage.

## Licence

Tous droits réservés à Louis. Aucune licence open source n’est accordée tant qu’un fichier `LICENSE` distinct n’a pas été ajouté.
