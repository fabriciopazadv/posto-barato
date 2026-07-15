-- Bootstrap do schema `collector` para DESENVOLVIMENTO E TESTES locais.
--
-- Em produção, este schema é criado e mantido pela Fase 1 (o coletor privado).
-- A Fase 2 NUNCA executa este arquivo contra o banco de produção; ele existe
-- apenas para que `docker compose up` e os testes de integração tenham as
-- tabelas do collector disponíveis para ler. O DDL abaixo é fiel à migration
-- 20260714000000_init da Fase 1.

CREATE SCHEMA IF NOT EXISTS collector;

DO $$ BEGIN
  CREATE TYPE collector."CollectionRunStatus" AS ENUM
    ('RUNNING','SUCCESS','PARTIAL_SUCCESS','FAILED','AUTH_REQUIRED','BLOCKED','CAPTCHA_DETECTED','SECURITY_CHALLENGE','PAGE_CHANGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS collector.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name text UNIQUE NOT NULL,
  public_name text NOT NULL,
  source_type text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status collector."CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
  municipality text NOT NULL,
  state text NOT NULL,
  products_requested jsonb NOT NULL,
  total_cards_found int NOT NULL DEFAULT 0,
  total_records_created int NOT NULL DEFAULT 0,
  total_duplicates int NOT NULL DEFAULT 0,
  total_invalid int NOT NULL DEFAULT 0,
  total_errors int NOT NULL DEFAULT 0,
  screenshot_path text,
  html_snapshot_path text,
  error_message text,
  browser_version text,
  collector_version text NOT NULL,
  host_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  normalized_address text NOT NULL,
  display_address text NOT NULL,
  neighborhood text,
  municipality text NOT NULL,
  state text NOT NULL,
  postal_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  fingerprint text UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_code text UNIQUE NOT NULL,
  canonical_name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.collection_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id uuid NOT NULL REFERENCES collector.collection_runs(id),
  evidence_type text NOT NULL,
  file_path text NOT NULL,
  sha256 text NOT NULL,
  contains_personal_header boolean NOT NULL DEFAULT false,
  collected_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES collector.stations(id),
  product_id uuid NOT NULL REFERENCES collector.products(id),
  data_source_id uuid NOT NULL REFERENCES collector.data_sources(id),
  collection_run_id uuid NOT NULL REFERENCES collector.collection_runs(id),
  original_product_name text NOT NULL,
  original_price_text text NOT NULL,
  price_decimal numeric(10,3) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  unit text NOT NULL DEFAULT 'L',
  relative_time_text text,
  estimated_observed_at timestamptz,
  estimated_time boolean NOT NULL DEFAULT false,
  collected_at timestamptz NOT NULL,
  source_position int NOT NULL,
  confidence_score numeric(3,2) NOT NULL DEFAULT 1,
  observation_fingerprint text UNIQUE NOT NULL,
  raw_visible_data jsonb NOT NULL,
  evidence_id uuid REFERENCES collector.collection_evidence(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector.collection_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id uuid NOT NULL REFERENCES collector.collection_runs(id),
  stage text NOT NULL,
  error_type text NOT NULL,
  message text NOT NULL,
  details jsonb,
  screenshot_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stations_municipality_state_idx ON collector.stations(municipality,state);
CREATE INDEX IF NOT EXISTS price_observations_station_id_idx ON collector.price_observations(station_id);
CREATE INDEX IF NOT EXISTS price_observations_product_id_idx ON collector.price_observations(product_id);
CREATE INDEX IF NOT EXISTS price_observations_collected_at_idx ON collector.price_observations(collected_at);
