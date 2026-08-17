CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  subcategory text,
  brand text NOT NULL,
  manufacturer text,
  model text,
  series text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  mpn text,
  manufacturer_part_numbers text[] NOT NULL DEFAULT '{}',
  gtin text,
  ean text,
  upc text,
  description text,
  short_description text,
  release_date date,
  discontinued boolean NOT NULL DEFAULT false,
  specifications jsonb NOT NULL DEFAULT '{}',
  media jsonb NOT NULL DEFAULT '{"main":null,"gallery":[]}',
  primary_source text NOT NULL,
  field_provenance jsonb NOT NULL DEFAULT '{}',
  identity_hash text NOT NULL,
  completeness_score smallint NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  confidence_score smallint NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  missing_image boolean NOT NULL DEFAULT true,
  missing_mpn boolean NOT NULL DEFAULT true,
  missing_specs boolean NOT NULL DEFAULT true,
  needs_review boolean NOT NULL DEFAULT true,
  search_document text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS components_category_idx ON components (category);
CREATE INDEX IF NOT EXISTS components_brand_idx ON components (lower(brand));
CREATE INDEX IF NOT EXISTS components_model_idx ON components (lower(model));
CREATE INDEX IF NOT EXISTS components_mpn_idx ON components (upper(mpn)) WHERE mpn IS NOT NULL;
CREATE INDEX IF NOT EXISTS components_gtin_idx ON components (gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS components_identity_hash_idx ON components (identity_hash);
CREATE INDEX IF NOT EXISTS components_quality_idx ON components (needs_review, completeness_score);
CREATE INDEX IF NOT EXISTS components_specs_gin_idx ON components USING gin (specifications jsonb_path_ops);
CREATE INDEX IF NOT EXISTS components_search_fts_idx ON components USING gin (to_tsvector('simple', search_document));
CREATE INDEX IF NOT EXISTS components_search_trgm_idx ON components USING gin (search_document gin_trgm_ops);

CREATE TABLE IF NOT EXISTS component_sources (
  id bigserial PRIMARY KEY,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_record_id text NOT NULL,
  source_url text,
  source_license text,
  source_priority smallint NOT NULL,
  source_confidence smallint NOT NULL CHECK (source_confidence BETWEEN 0 AND 100),
  raw_data jsonb NOT NULL DEFAULT '{}',
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, source_record_id)
);
CREATE INDEX IF NOT EXISTS component_sources_component_idx ON component_sources (component_id);
CREATE INDEX IF NOT EXISTS component_sources_source_idx ON component_sources (source_key);

CREATE TABLE IF NOT EXISTS component_identifiers (
  id bigserial PRIMARY KEY,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  identifier_type text NOT NULL CHECK (identifier_type IN ('mpn', 'gtin', 'ean', 'upc')),
  normalized_value text NOT NULL,
  brand_scope text NOT NULL DEFAULT '',
  source_id bigint REFERENCES component_sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (component_id, identifier_type, normalized_value, brand_scope)
);
CREATE INDEX IF NOT EXISTS component_identifiers_lookup_idx
  ON component_identifiers (identifier_type, normalized_value, brand_scope);

CREATE TABLE IF NOT EXISTS component_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  merchant text NOT NULL,
  merchant_offer_id text,
  url text NOT NULL,
  price numeric(12,2) CHECK (price IS NULL OR price >= 0),
  shipping numeric(12,2) CHECK (shipping IS NULL OR shipping >= 0),
  condition text,
  availability text,
  currency char(3) NOT NULL DEFAULT 'EUR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant, merchant_offer_id)
);
CREATE INDEX IF NOT EXISTS component_offers_component_idx ON component_offers (component_id);

CREATE TABLE IF NOT EXISTS component_duplicate_candidates (
  id bigserial PRIMARY KEY,
  left_component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  right_component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  reason text NOT NULL,
  score numeric(5,4),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'distinct', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (left_component_id, right_component_id, reason),
  CHECK (left_component_id <> right_component_id)
);

CREATE TABLE IF NOT EXISTS component_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  source_revision text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  read_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS component_import_runs_source_idx ON component_import_runs (source_key, started_at DESC);

CREATE TABLE IF NOT EXISTS component_import_checkpoints (
  source_key text PRIMARY KEY,
  source_revision text,
  cursor text,
  processed_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS component_import_errors (
  id bigserial PRIMARY KEY,
  run_id uuid REFERENCES component_import_runs(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_record_id text,
  error_code text,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS component_import_errors_run_idx ON component_import_errors (run_id);

COMMENT ON TABLE components IS 'Catalogue canonique ConfigPilot. Les données externes sont importées, jamais interrogées lors de l’affichage utilisateur.';
COMMENT ON TABLE component_sources IS 'Traçabilité et données brutes assainies de chaque source.';
COMMENT ON TABLE component_duplicate_candidates IS 'Rapprochements incertains à contrôler humainement; aucun fuzzy merge automatique.';
