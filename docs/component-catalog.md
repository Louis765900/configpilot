# Catalogue de composants ConfigPilot

## Architecture

ConfigPilot sépare désormais la collecte de l'affichage :

```text
BuildCores / catalogue local / Icecat autorisé
  -> importeurs idempotents
  -> normalisation et déduplication conservatrice
  -> PostgreSQL ConfigPilot
  -> API Vercel paginée
  -> frontend React
```

Le navigateur n'interroge jamais BuildCores ou Icecat. La disponibilité d'une source externe ne peut donc pas interrompre le catalogue public. Le catalogue historique demeure le repli par défaut tant que `VITE_COMPONENT_API_ENABLED` n'est pas activé.

## Modèle PostgreSQL

La migration `migrations/001_component_catalog.sql` crée :

- `components` : fiche canonique, caractéristiques JSONB, médias, scores de qualité et document de recherche ;
- `component_sources` : correspondances de chaque source et données brutes assainies ;
- `component_identifiers` : MPN, GTIN, EAN et UPC normalisés ;
- `component_offers` : structure vide prête pour de futures offres marchandes réelles ;
- `component_duplicate_candidates` : rapprochements incertains à revoir ;
- `component_import_runs`, `component_import_checkpoints`, `component_import_errors` : journal, reprise et diagnostic ;
- `schema_migrations` : migrations appliquées et somme de contrôle.

Les index couvrent catégories, marques, modèles, MPN, GTIN, JSONB, recherche plein texte et trigrammes. Une migration appliquée ne doit jamais être modifiée : il faut en créer une nouvelle.

## Déduplication

Ordre des rapprochements automatiques :

1. identifiant source déjà connu ;
2. MPN exact normalisé dans le périmètre de la même marque ;
3. GTIN, EAN ou UPC exact ;
4. identité stricte marque + nom + catégorie + caractéristiques discriminantes.

Le rapprochement approximatif n'effectue jamais de fusion. Il peut seulement alimenter `component_duplicate_candidates`. Des capacités ou MPN différents restent des références distinctes.

Chaque champ canonique conserve sa provenance et sa priorité dans `field_provenance`. Une source moins prioritaire ne remplace pas une donnée plus fiable. Priorités initiales : catalogue ConfigPilot contrôlé `90`, BuildCores `70`, Icecat `60`. Icecat sert surtout à compléter descriptions, codes et médias autorisés.

## BuildCores OpenDB

La source est sous **Open Data Commons Attribution License 1.0**. L'attribution est visible sur l'écran « Bots & sources » et détaillée dans `THIRD_PARTY_DATA.md`.

Commande de contrôle sans base :

```bash
npm run components:import:buildcores -- --dry-run --source-dir /chemin/buildcores-open-db
```

Sans `--source-dir`, le script clone ou actualise le dépôt dans `.cache/components/buildcores`. Seules les catégories PC explicitement listées dans `server/catalog/normalize.ts` sont lues. Les références sans nom ou fabricant sont rejetées et journalisées ; aucun champ n'est inventé.

## Icecat

L'importeur ne devine aucun endpoint. Il attend un export JSON ou JSONL dont l'utilisation et la syndication sont autorisées par l'abonnement du propriétaire du projet. Chaque ligne suit ce contrat :

```json
{
  "icecat_id": "123",
  "category": "storage",
  "brand": "Samsung",
  "mpn": "MZ-V9P2T0BW",
  "name": "Samsung 990 PRO 2TB",
  "gtin": "...",
  "description": "...",
  "short_description": "...",
  "specifications": {},
  "images": { "main": "https://...", "gallery": [] },
  "source_url": "https://...",
  "license": "libellé exact fourni par Icecat"
}
```

Les champs optionnels peuvent être omis. Sans configuration, la commande affiche `ICECAT NOT CONFIGURED` et le reste de la synchronisation continue.

## PC Part Dataset

L'intégration automatique est volontairement désactivée. Le dépôt est sous MIT mais annonce que ses données sont extraites de PCPartPicker et conseille un VPN pour le scraper. La licence du programme ne suffit pas à établir un droit de redistribution des données tierces. `PCPART_DATASET_ENABLED` reste donc faux tant que cette provenance n'est pas juridiquement clarifiée.

## Commandes

```bash
cp .env.example .env
npm run components:migrate
npm run components:import:local
npm run components:import:buildcores
npm run components:import:icecat
npm run components:sync
npm run components:stats
```

`components:sync` applique les migrations, importe le catalogue historique, synchronise BuildCores, enrichit via Icecat uniquement s'il est configuré, puis produit les statistiques. Les correspondances uniques et les `upsert` rendent les imports relançables. Un checkpoint est écrit tous les `COMPONENT_IMPORT_BATCH_SIZE` enregistrements.

## API

Endpoints :

- `GET /api/components?q=990+pro&category=storage&page=1&limit=24`
- `GET /api/components/search?q=CMK32GX4M2E3200C16`
- `GET /api/components/:uuid`
- `GET /api/components/slug/:slug`
- `GET /api/components/mpn/:mpn`

Filtres disponibles : `category`, `brand`, `socket`, `capacity`. Tris : `relevance`, `name`, `newest`, `completeness`. La limite maximale est de 100 résultats par page. Les erreurs suivent `{ "error": { "code", "message", "details" } }`.

## Exploitation

`npm run components:stats` affiche total, catégories, principales marques, fiches sans image/MPN/caractéristiques, besoins de revue, sources, imports récents et doublons potentiels. Les erreurs complètes sont conservées dans `component_import_errors`.
